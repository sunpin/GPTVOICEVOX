// オフスクリーンドキュメントの作成（存在しない場合）
async function setupOffscreen() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) return;
  } catch (e) {
    // getContexts がサポートされていない古い環境のフォールバック
  }

  try {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'VOICEVOX audio playback bypass autoplay policy'
    });
  } catch (err) {
    if (!err.message.includes('already exists')) {
      throw err;
    }
  }
}

// content.js からのリクエストを待機
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // オフスクリーンでの再生命令
  if (request.action === 'play_offscreen') {
    handlePlayOffscreen(request.base64Wav, request.gapTime)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // 非同期応答を有効にする
  }

  // 音声再生の停止命令
  if (request.action === 'stop_offscreen') {
    handleStopOffscreen()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // 音声合成単体のリクエスト (content.js での先行合成プリフェッチ用)
  if (request.action === 'synthesize') {
    synthesizeSpeech(request)
      .then(base64Wav => {
        sendResponse({ success: true, base64Wav: base64Wav });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // 話者リストの取得リクエスト
  if (request.action === 'get_speakers') {
    getSpeakers(request)
      .then(speakers => {
        sendResponse({ success: true, speakers: speakers });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});
// オフスクリーンでの再生指示
async function handlePlayOffscreen(base64Wav, gapTime) {
  await setupOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'play',
    base64Wav: base64Wav,
    gapTime: gapTime
  });
  if (!response || !response.success) {
    throw new Error(response ? response.error : 'Playback failed in offscreen');
  }
}

// オフスクリーンでの停止指示
async function handleStopOffscreen() {
  await setupOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stop'
  });
  if (!response || !response.success) {
    throw new Error(response ? response.error : 'Stop failed in offscreen');
  }
}

async function synthesizeSpeech(request) {
  const { engine, text, speakerId, speedScale, coeiroinkSpeakerUuid, coeiroinkStyleId, voicevoxAddr, coeiroinkAddr } = request;

  if (engine === 'coeiroink') {
    const userUrl = coeiroinkAddr ? coeiroinkAddr.replace(/\/$/, '') : 'http://localhost:50032';
    const urls = [userUrl];
    if (userUrl !== 'http://localhost:50032') urls.push('http://localhost:50032');
    if (userUrl !== 'http://127.0.0.1:50032') urls.push('http://127.0.0.1:50032');
    
    let synthRes;
    let lastError = null;

    for (const baseUrl of urls) {
      try {
        const synthUrl = `${baseUrl}/v1/synthesis`;
        synthRes = await fetch(synthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            speakerUuid: coeiroinkSpeakerUuid,
            styleId: coeiroinkStyleId,
            speedScale: speedScale,
            volumeScale: 1.0,
            pitchScale: 0.0,
            intonationScale: 1.0,
            prePhonemeLength: 0.1,
            postPhonemeLength: 0.1,
            outputSamplingRate: 24000
          })
        });
        if (synthRes.ok) {
          lastError = null;
          break;
        } else {
          let errorDetail = '';
          try {
            const errJson = await synthRes.json();
            errorDetail = ` - ${JSON.stringify(errJson.detail || errJson)}`;
          } catch (e) {
            try {
              errorDetail = ` - ${await synthRes.text()}`;
            } catch (e2) {}
          }
          lastError = new Error(`COEIROINK synthesis failed (${synthRes.status})${errorDetail}`);
        }
      } catch (fetchErr) {
        lastError = fetchErr;
      }
    }

    if (lastError) {
      throw new Error(`COEIROINK connection failed: ${lastError.message}`);
    }

    const arrayBuffer = await synthRes.arrayBuffer();
    return bufferToBase64(arrayBuffer);
  } else {
    // VOICEVOX の処理
    const userUrl = voicevoxAddr ? voicevoxAddr.replace(/\/$/, '') : 'http://localhost:50021';
    const urls = [userUrl];
    if (userUrl !== 'http://localhost:50021') urls.push('http://localhost:50021');
    if (userUrl !== 'http://127.0.0.1:50021') urls.push('http://127.0.0.1:50021');
    
    let synthRes;
    let lastError = null;

    for (const baseUrl of urls) {
      try {
        const queryUrl = `${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
        const queryRes = await fetch(queryUrl, { method: 'POST' });
        if (!queryRes.ok) {
          lastError = new Error(`audio_query failed (${queryRes.status})`);
          continue;
        }
        const queryJson = await queryRes.json();
        queryJson.speedScale = speedScale;

        const synthUrl = `${baseUrl}/synthesis?speaker=${speakerId}`;
        synthRes = await fetch(synthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queryJson)
        });
        if (synthRes.ok) {
          lastError = null;
          break;
        } else {
          lastError = new Error(`synthesis failed (${synthRes.status})`);
        }
      } catch (fetchErr) {
        lastError = fetchErr;
      }
    }

    if (lastError) {
      throw new Error(`VOICEVOX connection failed: ${lastError.message}`);
    }

    const arrayBuffer = await synthRes.arrayBuffer();
    return bufferToBase64(arrayBuffer);
  }
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function getSpeakers(request) {
  const { engine, voicevoxAddr, coeiroinkAddr } = request;
  if (engine === 'coeiroink') {
    const userUrl = coeiroinkAddr ? coeiroinkAddr.replace(/\/$/, '') : 'http://localhost:50032';
    const urls = [userUrl];
    if (userUrl !== 'http://localhost:50032') urls.push('http://localhost:50032');
    if (userUrl !== 'http://127.0.0.1:50032') urls.push('http://127.0.0.1:50032');
    
    let lastError = null;
    for (const baseUrl of urls) {
      try {
        const res = await fetch(`${baseUrl}/v1/speakers`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`COEIROINK get_speakers failed: ${lastError ? lastError.message : 'Unknown error'}`);
  } else {
    const userUrl = voicevoxAddr ? voicevoxAddr.replace(/\/$/, '') : 'http://localhost:50021';
    const urls = [userUrl];
    if (userUrl !== 'http://localhost:50021') urls.push('http://localhost:50021');
    if (userUrl !== 'http://127.0.0.1:50021') urls.push('http://127.0.0.1:50021');
    
    let lastError = null;
    for (const baseUrl of urls) {
      try {
        const res = await fetch(`${baseUrl}/speakers`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`VOICEVOX get_speakers failed: ${lastError ? lastError.message : 'Unknown error'}`);
  }
}
