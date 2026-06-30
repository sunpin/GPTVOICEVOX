// オフスクリーンドキュメントの作成（存在しない場合）
async function setupOffscreen() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'VOICEVOX audio playback bypass autoplay policy'
  });
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

  // 音声合成単体のリクエスト (content.js での先行合成プリフェッチ用)
  if (request.action === 'synthesize') {
    synthesizeSpeech(request.text, request.speakerId, request.speedScale)
      .then(base64Wav => {
        sendResponse({ success: true, base64Wav: base64Wav });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

const VOICEVOX_URL = 'http://localhost:50021';

// オフスクリーンでの再生指示
async function handlePlayOffscreen(base64Wav, gapTime) {
  // 1. オフスクリーンの準備
  await setupOffscreen();
  
  // 2. オフスクリーンに音声再生をメッセージング
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

async function synthesizeSpeech(text, speakerId, speedScale) {
  // 1. audio_query の作成
  const queryUrl = `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
  const queryRes = await fetch(queryUrl, { method: 'POST' });
  if (!queryRes.ok) throw new Error(`audio_query failed (${queryRes.status})`);
  const queryJson = await queryRes.json();

  queryJson.speedScale = speedScale;

  // 2. 音声合成 (synthesis)
  const synthUrl = `${VOICEVOX_URL}/synthesis?speaker=${speakerId}`;
  const synthRes = await fetch(synthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryJson)
  });
  if (!synthRes.ok) throw new Error(`synthesis failed (${synthRes.status})`);
  const arrayBuffer = await synthRes.arrayBuffer();

  // 3. ArrayBuffer を Base64 文字列に変換して送信
  return bufferToBase64(arrayBuffer);
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
