// 設定の読み込み (localStorageで永続化)
let ENGINE = localStorage.getItem('vv_engine') || 'voicevox';
let SPEAKER_ID = parseInt(localStorage.getItem('vv_speaker_id') || '3', 10);
let COEIROINK_SPEAKER_UUID = localStorage.getItem('vv_coeiroink_speaker_uuid') || '3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd';
let COEIROINK_STYLE_ID = parseInt(localStorage.getItem('vv_coeiroink_style_id') || '0', 10);
let SPEED_SCALE = parseFloat(localStorage.getItem('vv_speed_scale') || '1.1', 10);
let GAP_TIME = parseInt(localStorage.getItem('vv_gap_time') || '10', 10);

// UIの作成
const configPanel = document.createElement('div');
configPanel.id = 'voicevox-config-panel';
configPanel.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  width: 220px;
  background: rgba(20, 20, 20, 0.95);
  color: #e0e0e0;
  font-family: sans-serif;
  font-size: 11px;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.6);
  z-index: 999999;
  border: 1px solid #444;
  text-align: left;
  user-select: none;
`;

const header = document.createElement('div');
header.style.cssText = 'font-weight: bold; border-bottom: 1px solid #444; padding-bottom: 4px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; color: #fff;';
header.innerHTML = '<span>⚙️ VOICEVOX 設定</span><span id="vv-toggle-btn">[閉じる]</span>';
configPanel.appendChild(header);

const body = document.createElement('div');
body.id = 'vv-config-body';
body.style.display = 'block';

// 音声エンジン設定
const engineDiv = document.createElement('div');
engineDiv.style.marginBottom = '8px';
engineDiv.innerHTML = `
  <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
    <span>音声エンジン:</span>
  </div>
  <select id="vv-engine-select" style="width:100%; background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:2px; font-size:10px; cursor:pointer;">
    <option value="voicevox">VOICEVOX (50021)</option>
    <option value="coeiroink">COEIROINK (50032)</option>
  </select>
`;
body.appendChild(engineDiv);

// 速度設定
const speedDiv = document.createElement('div');
speedDiv.style.styleFloat = 'none';
speedDiv.style.marginBottom = '8px';
speedDiv.innerHTML = `
  <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
    <span>再生速度:</span><div><span id="vv-speed-val" style="color:#70ff70; font-weight:bold;">${SPEED_SCALE}</span>倍</div>
  </div>
  <input type="range" id="vv-speed-range" min="0.5" max="2.0" step="0.1" value="${SPEED_SCALE}" style="width:100%; cursor:pointer; margin:0;">
`;
body.appendChild(speedDiv);

// 継ぎ目ウェイト設定
const gapDiv = document.createElement('div');
gapDiv.style.marginBottom = '8px';
gapDiv.innerHTML = `
  <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
    <span>段落間の待ち時間:</span><div><span id="vv-gap-val" style="color:#70ff70; font-weight:bold;">${GAP_TIME}</span>ms</div>
  </div>
  <input type="range" id="vv-gap-range" min="0" max="1000" step="10" value="${GAP_TIME}" style="width:100%; cursor:pointer; margin:0;">
`;
body.appendChild(gapDiv);

// 話者選択（ドロップダウン）設定
const speakerDiv = document.createElement('div');
speakerDiv.style.marginBottom = '8px';
speakerDiv.innerHTML = `
  <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
    <span>話者選択:</span>
  </div>
  <select id="vv-speaker-select" style="width:100%; background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:2px; font-size:10px; cursor:pointer;">
    <!-- 動的に切り替え -->
  </select>
`;
body.appendChild(speakerDiv);

configPanel.appendChild(body);
document.body.appendChild(configPanel);

// イベントハンドラ
const toggleBtn = document.getElementById('vv-toggle-btn');
header.onclick = () => {
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggleBtn.innerText = '[閉じる]';
    configPanel.style.width = '220px';
  } else {
    body.style.display = 'none';
    toggleBtn.innerText = '[開く]';
    configPanel.style.width = '100px';
  }
};

const voicevoxOptions = `
  <optgroup label="ずんだもん">
    <option value="3">ずんだもん（ノーマル）</option>
    <option value="1">ずんだもん（あまあま）</option>
    <option value="5">ずんだもん（セクシー）</option>
    <option value="7">ずんだもん（ツンツン）</option>
    <option value="22">ずんだもん（ささやき）</option>
    <option value="38">ずんだもん（ヒソヒソ）</option>
  </optgroup>
  <optgroup label="四国めたん">
    <option value="2">四国めたん（ノーマル）</option>
    <option value="0">四国めたん（あまあま）</option>
    <option value="4">四国めたん（セクシー）</option>
    <option value="6">四国めたん（ツンツン）</option>
  </optgroup>
  <optgroup label="春日部つむぎ">
    <option value="8">春日部つむぎ（ノーマル）</option>
  </optgroup>
  <optgroup label="雨晴はう">
    <option value="10">雨晴はう（ノーマル）</option>
  </optgroup>
  <optgroup label="波音リツ">
    <option value="9">波音リツ（ノーマル）</option>
  </optgroup>
  <optgroup label="冥鳴ひまり">
    <option value="14">冥鳴ひまり（ノーマル）</option>
  </optgroup>
  <optgroup label="玄野武宏">
    <option value="11">玄野武宏（ノーマル）</option>
  </optgroup>
  <optgroup label="青山龍星">
    <option value="13">青山龍星（ノーマル）</option>
  </optgroup>
`;

const coeiroinkOptions = `
  <optgroup label="つくよみちゃん">
    <option value="3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd:0">つくよみちゃん（ノーマル）</option>
    <option value="3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd:1">つくよみちゃん（あまあま）</option>
    <option value="3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd:2">つくよみちゃん（セクシー）</option>
    <option value="3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd:3">つくよみちゃん（ツンツン）</option>
    <option value="3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd:4">つくよみちゃん（ささやき）</option>
  </optgroup>
  <optgroup label="シロワニさん">
    <option value="dcfda1be-ca7e-40dc-bc0e-0d192131b7b6:0">シロワニさん（ノーマル）</option>
    <option value="dcfda1be-ca7e-40dc-bc0e-0d192131b7b6:1">シロワニさん（喜び）</option>
    <option value="dcfda1be-ca7e-40dc-bc0e-0d192131b7b6:5">シロワニさん（ささやき）</option>
  </optgroup>
`;

const engineSelect = document.getElementById('vv-engine-select');
const speakerSelect = document.getElementById('vv-speaker-select');

const updateSpeakerSelect = async () => {
  speakerSelect.innerHTML = '<option value="">読み込み中...</option>';
  
  try {
    const response = await new Promise((resolve) => {
      if (!chrome.runtime || !chrome.runtime.id) {
        resolve({ success: false, error: 'Context invalidated' });
        return;
      }
      chrome.runtime.sendMessage({ action: 'get_speakers', engine: ENGINE }, resolve);
    });

    if (!response || !response.success || !response.speakers) {
      throw new Error(response ? response.error : 'No speakers returned');
    }

    let html = '';
    if (ENGINE === 'coeiroink') {
      response.speakers.forEach(sp => {
        html += `<optgroup label="${sp.speakerName}">`;
        sp.styles.forEach(style => {
          html += `<option value="${sp.speakerUuid}:${style.styleId}">${sp.speakerName}（${style.styleName}）</option>`;
        });
        html += `</optgroup>`;
      });
      speakerSelect.innerHTML = html;
      
      speakerSelect.value = `${COEIROINK_SPEAKER_UUID}:${COEIROINK_STYLE_ID}`;
      if (!speakerSelect.value && speakerSelect.options.length > 0) {
        speakerSelect.selectedIndex = 0;
        const [uuid, style] = speakerSelect.value.split(':');
        COEIROINK_SPEAKER_UUID = uuid;
        COEIROINK_STYLE_ID = parseInt(style, 10);
        localStorage.setItem('vv_coeiroink_speaker_uuid', COEIROINK_SPEAKER_UUID);
        localStorage.setItem('vv_coeiroink_style_id', COEIROINK_STYLE_ID);
      }
    } else {
      response.speakers.forEach(sp => {
        html += `<optgroup label="${sp.name}">`;
        sp.styles.forEach(style => {
          html += `<option value="${style.id}">${sp.name}（${style.name}）</option>`;
        });
        html += `</optgroup>`;
      });
      speakerSelect.innerHTML = html;

      speakerSelect.value = SPEAKER_ID;
      if (!speakerSelect.value && speakerSelect.options.length > 0) {
        speakerSelect.selectedIndex = 0;
        SPEAKER_ID = parseInt(speakerSelect.value, 10);
        localStorage.setItem('vv_speaker_id', SPEAKER_ID);
      }
    }
  } catch (err) {
    log(`話者リストの動的取得に失敗したためフォールバックを使用します: ${err.message}`, 'warning');
    if (ENGINE === 'coeiroink') {
      speakerSelect.innerHTML = coeiroinkOptions;
      speakerSelect.value = `${COEIROINK_SPEAKER_UUID}:${COEIROINK_STYLE_ID}`;
      if (!speakerSelect.value && speakerSelect.options.length > 0) {
        speakerSelect.selectedIndex = 0;
        const [uuid, style] = speakerSelect.value.split(':');
        COEIROINK_SPEAKER_UUID = uuid;
        COEIROINK_STYLE_ID = parseInt(style, 10);
      }
    } else {
      speakerSelect.innerHTML = voicevoxOptions;
      speakerSelect.value = SPEAKER_ID;
      if (!speakerSelect.value && speakerSelect.options.length > 0) {
        speakerSelect.selectedIndex = 0;
        SPEAKER_ID = parseInt(speakerSelect.value, 10);
      }
    }
  }
};

engineSelect.value = ENGINE;
updateSpeakerSelect();

engineSelect.onchange = (e) => {
  ENGINE = e.target.value;
  localStorage.setItem('vv_engine', ENGINE);
  stopAllSpeech();
  updateSpeakerSelect();
};

const speedRange = document.getElementById('vv-speed-range');
const speedVal = document.getElementById('vv-speed-val');
speedRange.oninput = (e) => {
  SPEED_SCALE = parseFloat(e.target.value);
  speedVal.innerText = SPEED_SCALE;
  localStorage.setItem('vv_speed_scale', SPEED_SCALE);
};
speedRange.onchange = () => {
  stopAllSpeech();
};

const gapRange = document.getElementById('vv-gap-range');
const gapVal = document.getElementById('vv-gap-val');
gapRange.oninput = (e) => {
  GAP_TIME = parseInt(e.target.value, 10);
  gapVal.innerText = GAP_TIME;
  localStorage.setItem('vv_gap_time', GAP_TIME);
};

speakerSelect.onchange = (e) => {
  if (ENGINE === 'coeiroink') {
    const val = e.target.value;
    if (val && val.includes(':')) {
      const [uuid, style] = val.split(':');
      COEIROINK_SPEAKER_UUID = uuid;
      COEIROINK_STYLE_ID = parseInt(style, 10);
      localStorage.setItem('vv_coeiroink_speaker_uuid', COEIROINK_SPEAKER_UUID);
      localStorage.setItem('vv_coeiroink_style_id', COEIROINK_STYLE_ID);
    }
  } else {
    SPEAKER_ID = parseInt(e.target.value, 10);
    localStorage.setItem('vv_speaker_id', SPEAKER_ID);
  }
  stopAllSpeech();
};

function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  console.log(`[VOICEVOX][${time}][${type}] ${msg}`);
}

const CHECK_INTERVAL = 300; // 300ms間隔で超高速監視

let lastMessageId = '';
const speechQueue = [];
let isSpeaking = false;
const sentSentences = new Set();

log('拡張機能による監視を開始しました。');
log('【CORS/CSP完全回避・音声先行合成モード】');
log('ChatGPTのAI返答を待っています...');

// VOICEVOXに非同期で音声合成をリクエストしPromiseを返す関数
function requestVoicevoxBase64(text) {
  return new Promise((resolve) => {
    if (!chrome.runtime || !chrome.runtime.id) {
      log('拡張機能のコンテキストが無効になりました。ページをリロードしてください。', 'error');
      stopMonitoring();
      resolve(null);
      return;
    }

    log(`音声先行取得開始: "${text.substring(0, 15)}..."`, 'synth');
    try {
      chrome.runtime.sendMessage({
        action: 'synthesize',
        engine: ENGINE,
        text: text,
        speakerId: SPEAKER_ID,
        speedScale: SPEED_SCALE,
        coeiroinkSpeakerUuid: COEIROINK_SPEAKER_UUID,
        coeiroinkStyleId: COEIROINK_STYLE_ID
      }, (response) => {
        if (chrome.runtime.lastError) {
          log('通信エラー: 拡張機能がリロードされました。ページをリロードしてください。', 'error');
          stopMonitoring();
          resolve(null);
          return;
        }
        if (!response) {
          log('通信エラー: 応答なし。ブラウザをリロードしてください。', 'error');
          resolve(null);
          return;
        }
        if (!response.success) {
          log(`通信エラー: ${response.error}`, 'error');
          resolve(null);
          return;
        }
        resolve(response.base64Wav);
      });
    } catch (err) {
      log('通信エラー: 拡張機能コンテキストが無効です。リロードしてください。', 'error');
      stopMonitoring();
      resolve(null);
    }
  });
}

// 先読み（プリフェッチ）のトリガー関数 (最大1つの先読みのみ開始するバッファ1テキスト制限)
function triggerPrefetch() {
  if (speechQueue.length > 0) {
    const nextItem = speechQueue[0];
    if (!nextItem.promise) {
      nextItem.promise = requestVoicevoxBase64(nextItem.text);
    }
  }
}

// 再生キュー
async function processQueue() {
  if (isSpeaking || speechQueue.length === 0) return;
  isSpeaking = true;

  const item = speechQueue.shift();
  
  // もし何らかの理由で先読みがまだ走っていなければ、ここで走らせる
  if (!item.promise) {
    item.promise = requestVoicevoxBase64(item.text);
  }

  // キューの次の要素の先読みを開始 (バッファ1テキストの制御)
  triggerPrefetch();

  const base64Data = await item.promise;

  if (base64Data) {
    try {
      log(`再生中: "${item.text.substring(0, 15)}..."`, 'success');
      
      // バックグラウンドのオフスクリーンに再生を依頼する (自動再生制限の回避)
      const response = await new Promise((resolve) => {
        if (!chrome.runtime || !chrome.runtime.id) {
          resolve({ success: false, error: '拡張機能のコンテキストが無効です' });
          return;
        }
        try {
          chrome.runtime.sendMessage({
            action: 'play_offscreen',
            base64Wav: base64Data,
            gapTime: GAP_TIME
          }, (res) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(res || { success: false, error: '応答がありませんでした' });
            }
          });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
      
      if (!response || !response.success) {
        log(`再生失敗: ${response ? response.error : '応答なし'}`, 'error');
      }
    } catch (err) {
      log(`再生例外: ${err.message}`, 'error');
    }
  } else {
    log(`音声データが無いためスキップ: "${item.text.substring(0, 15)}..."`, 'error');
  }

  isSpeaking = false;
  
  // 再生が終わったので、さらに次の先読みをトリガー
  triggerPrefetch();
  setTimeout(processQueue, 10);
}

// クレンジング処理
function cleanseText(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('pre, code, style, script, .sr-only').forEach(el => el.remove());
  return clone.innerText.trim()
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/[^\s]+/g, '');
}

let hasStartedGenerating = false;

// 監視ループ
let watchInterval = setInterval(() => {
  const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (messages.length === 0) return;

  const latestMessage = messages[messages.length - 1];

  // 生成中（ストリーミング中）かどうかの判定
  const stopButton = document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]');
  const isGenerating = !!stopButton;

  if (isGenerating) {
    if (!hasStartedGenerating) {
      // 新しい回答のストリーミング開始を検知したタイミングで履歴をクリア
      sentSentences.clear();
      log('新しい返答の生成を検知したため、送信済み履歴をクリアしました。');
    }
    hasStartedGenerating = true;
  }

  // リロード直後などでAIの新たな発言（生成開始）を検知するまでは、過去ログなので一切読み上げない
  if (!hasStartedGenerating) {
    latestMessage.querySelectorAll('p').forEach(p => p.setAttribute('data-vv-spoken', 'true'));
    return;
  }

  // メッセージ内の p タグをすべて取得
  const pElements = latestMessage.querySelectorAll('p');
  
  // メッセージ全体で各テキストの出現回数を記録する Map (ダブりチェック用)
  const sentenceCounts = new Map();
  
  pElements.forEach((p, pIndex) => {
    // 完全に完了済みのpタグはスキップ
    if (p.getAttribute('data-vv-spoken') === 'true') return;

    const isLast = (pIndex === pElements.length - 1);
    const text = cleanseText(p);
    if (!text) return;

    // 全文から文末の区切り文字で分割して探す
    const match = text.match(/.*?[。！？\n]/g);
    let bytesUsed = 0;

    if (match) {
      match.forEach((sentence, sIndex) => {
        const trimmed = sentence.trim();
        if (trimmed.length > 0) {
          // 出現回数をカウント
          const count = (sentenceCounts.get(trimmed) || 0) + 1;
          sentenceCounts.set(trimmed, count);

          // 一意キーを「テキスト内容:出現回数」にする (DOMインデックスズレ対策)
          const key = `${trimmed}:${count}`;
          if (!sentSentences.has(key)) {
            log(`新規確定文を検知 (メモリ): "${trimmed.substring(0, 15)}..."`);
            sentSentences.add(key);
            speechQueue.push({
              text: trimmed,
              promise: null // バッファ1テキスト制限のため、ここでは開始せずnullで登録
            });
          }
        }
        bytesUsed += sentence.length;
      });
      triggerPrefetch();
      processQueue();
    }

    // 句読点マッチング後の残りテキストの取得
    const remainingText = text.substring(bytesUsed);
    const trimmedRemaining = remainingText.trim();

    if (trimmedRemaining.length > 0) {
      if (isLast && !isGenerating) {
        // 出現回数をカウント
        const count = (sentenceCounts.get(trimmedRemaining) || 0) + 1;
        sentenceCounts.set(trimmedRemaining, count);

        // 生成完了しているなら、残存テキストを最後の文として送信
        const key = `${trimmedRemaining}:${count}`;
        if (!sentSentences.has(key)) {
          log(`最終残余分を検知 (メモリ): "${trimmedRemaining.substring(0, 15)}..."`);
          sentSentences.add(key);
          speechQueue.push({
            text: trimmedRemaining,
            promise: null
          });
          triggerPrefetch();
          processQueue();
        }
        p.setAttribute('data-vv-spoken', 'true'); // 完了マーク
      } else if (!isLast) {
        // 出現回数をカウント
        const count = (sentenceCounts.get(trimmedRemaining) || 0) + 1;
        sentenceCounts.set(trimmedRemaining, count);

        // 次のPタグへ移っているなら、このPタグの残存テキストを送信して完了とする
        const key = `${trimmedRemaining}:${count}`;
        if (!sentSentences.has(key)) {
          log(`段落移動による残余分を検知 (メモリ): "${trimmedRemaining.substring(0, 15)}..."`);
          sentSentences.add(key);
          speechQueue.push({
            text: trimmedRemaining,
            promise: null
          });
          triggerPrefetch();
          processQueue();
        }
        p.setAttribute('data-vv-spoken', 'true'); // 完了マーク
      }
    } else {
      // 残存テキストがない場合、かつ生成完了している、または最後のPタグでない場合は完了マークを付与
      if ((isLast && !isGenerating) || !isLast) {
        p.setAttribute('data-vv-spoken', 'true');
      }
    }
  });
}, CHECK_INTERVAL);

// すべての音声再生を強制停止しキューをクリアする関数
function stopAllSpeech() {
  log('【送信検知】音声再生を強制停止し、待機キューをクリアしました。');
  
  // キューとステートのクリア
  speechQueue.length = 0;
  isSpeaking = false;
  sentSentences.clear();
  
  // バックグラウンドに音声の強制停止を要求 (コンテキスト有効時のみ)
  if (chrome.runtime && chrome.runtime.id) {
    try {
      chrome.runtime.sendMessage({ action: 'stop_offscreen' });
    } catch (e) {
      // 握りつぶす
    }
  }
}

// ユーザーの入力送信アクションの監視
// 1. Enterキーによる送信 (Shift+Enterは改行のため除外)
document.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'prompt-textarea') {
    if (e.key === 'Enter' && !e.shiftKey) {
      stopAllSpeech();
    }
  }
}, true); // キャプチャリングフェーズで優先的に検知

// 2. 送信ボタンクリックによる送信
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-testid="send-button"], button[aria-label="Send prompt"]');
  if (btn) {
    stopAllSpeech();
  }
}, true);

// 監視を停止する関数 (コンテキスト無効化時用)
function stopMonitoring() {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
    log('監視ループを停止しました。拡張機能がアップデートされたため、ページをリロードしてください。', 'error');
  }
}


