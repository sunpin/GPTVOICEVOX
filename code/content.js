// 設定の読み込み (localStorageで永続化)
let SPEAKER_ID = parseInt(localStorage.getItem('vv_speaker_id') || '3', 10);
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
speakerDiv.style.display = 'flex';
speakerDiv.style.justifyContent = 'space-between';
speakerDiv.style.alignItems = 'center';
speakerDiv.innerHTML = `
  <span>話者選択:</span>
  <select id="vv-speaker-select" style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:2px; font-size:10px; width:125px; cursor:pointer;">
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

const speedRange = document.getElementById('vv-speed-range');
const speedVal = document.getElementById('vv-speed-val');
speedRange.oninput = (e) => {
  SPEED_SCALE = parseFloat(e.target.value);
  speedVal.innerText = SPEED_SCALE;
  localStorage.setItem('vv_speed_scale', SPEED_SCALE);
};

const gapRange = document.getElementById('vv-gap-range');
const gapVal = document.getElementById('vv-gap-val');
gapRange.oninput = (e) => {
  GAP_TIME = parseInt(e.target.value, 10);
  gapVal.innerText = GAP_TIME;
  localStorage.setItem('vv_gap_time', GAP_TIME);
};

const speakerSelect = document.getElementById('vv-speaker-select');
speakerSelect.value = SPEAKER_ID; // 初期値の反映
speakerSelect.onchange = (e) => {
  SPEAKER_ID = parseInt(e.target.value, 10);
  localStorage.setItem('vv_speaker_id', SPEAKER_ID);
};

function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  console.log(`[VOICEVOX][${time}][${type}] ${msg}`);
}

const CHECK_INTERVAL = 300; // 300ms間隔で超高速監視

let lastMessageId = '';
const speechQueue = [];
let isSpeaking = false;

log('拡張機能による監視を開始しました。');
log('【CORS/CSP完全回避・音声先行合成モード】');
log('ChatGPTのAI返答を待っています...');

// VOICEVOXに非同期で音声合成をリクエストしPromiseを返す関数
function requestVoicevoxBase64(text) {
  return new Promise((resolve) => {
    log(`音声先行取得開始: "${text.substring(0, 15)}..."`, 'synth');
    chrome.runtime.sendMessage({
      action: 'synthesize',
      text: text,
      speakerId: SPEAKER_ID,
      speedScale: SPEED_SCALE
    }, (response) => {
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
  });
}

// 再生キュー
async function processQueue() {
  if (isSpeaking || speechQueue.length === 0) return;
  isSpeaking = true;

  const item = speechQueue.shift();
  
  // すでに裏で走っている音声合成（Promise）の完了を待つ
  const base64Data = await item.promise;

  if (base64Data) {
    try {
      log(`再生中: "${item.text.substring(0, 15)}..."`, 'success');
      
      // バックグラウンドのオフスクリーンに再生を依頼する (自動再生制限の回避)
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'play_offscreen',
          base64Wav: base64Data,
          gapTime: GAP_TIME
        }, resolve);
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
  // オフスクリーン側で待ち時間（GAP_TIME）が消化されてから返答が来るため、
  // ここでの再帰ウェイトは最小限（10ms）にする
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
const watchInterval = setInterval(() => {
  const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
  if (messages.length === 0) return;

  const latestMessage = messages[messages.length - 1];

  // 生成中（ストリーミング中）かどうかの判定
  const stopButton = document.querySelector('button[data-testid="stop-button"], button[aria-label="Stop generating"]');
  const isGenerating = !!stopButton;

  if (isGenerating) {
    hasStartedGenerating = true;
  }

  // リロード直後などでAIの新たな発言（生成開始）を検知するまでは、過去ログなので一切読み上げない
  if (!hasStartedGenerating) {
    latestMessage.querySelectorAll('p').forEach(p => p.setAttribute('data-vv-spoken', 'true'));
    return;
  }

  // メッセージ内の p タグをすべて取得
  const pElements = latestMessage.querySelectorAll('p');
  
  pElements.forEach((p, index) => {
    // 完全に完了済みのpタグはスキップ
    if (p.getAttribute('data-vv-spoken') === 'true') return;

    const isLast = (index === pElements.length - 1);
    const text = cleanseText(p);
    if (!text) return;

    // 既に読み上げ（送信）した文字数を取得
    const spokenLen = parseInt(p.getAttribute('data-vv-spoken-len') || '0', 10);
    const newText = text.substring(spokenLen);
    if (!newText) {
      // 生成完了しているなら、このpタグは完全に処理済みとしてマーク
      if (isLast && !isGenerating) {
        p.setAttribute('data-vv-spoken', 'true');
      }
      return;
    }

    let textToSpeak = '';
    let bytesUsed = 0;

    // 文末の区切り文字（。！？および改行）の最後の位置を探す
    const match = newText.match(/.*?[。！？\n]/g);
    
    if (match) {
      textToSpeak = match.join('');
      bytesUsed = textToSpeak.length;
    }

    // もし生成が完了しているなら、区切り文字が無くても残りの全テキストを送信
    if (isLast && !isGenerating) {
      textToSpeak = newText;
      bytesUsed = newText.length;
      p.setAttribute('data-vv-spoken', 'true'); // 完了マーク
    } else if (!isLast) {
      // 最後のpタグではない（次のpタグがある）なら、残りをすべて送信して完了にする
      textToSpeak = newText;
      bytesUsed = newText.length;
      p.setAttribute('data-vv-spoken', 'true'); // 完了マーク
    }

    const trimmed = textToSpeak.trim();
    if (trimmed.length > 0) {
      log(`新規確定文を検知: "${trimmed.substring(0, 15)}..."`);
      
      // テキストと、そのテキストに対する非同期取得Promiseのペアをキューに格納
      speechQueue.push({
        text: trimmed,
        promise: requestVoicevoxBase64(trimmed)
      });
      
      processQueue();
      
      // 送信済み文字数の更新
      p.setAttribute('data-vv-spoken-len', spokenLen + bytesUsed);
    }
  });
}, CHECK_INTERVAL);


