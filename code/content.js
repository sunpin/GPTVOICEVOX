// 設定の読み込み (localStorageで永続化)
let ENGINE = localStorage.getItem('vv_engine') || 'voicevox';
let SPEAKER_ID = parseInt(localStorage.getItem('vv_speaker_id') || '3', 10);
let COEIROINK_SPEAKER_UUID = localStorage.getItem('vv_coeiroink_speaker_uuid') || '3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd';
let COEIROINK_STYLE_ID = parseInt(localStorage.getItem('vv_coeiroink_style_id') || '0', 10);
let SPEED_SCALE = parseFloat(localStorage.getItem('vv_speed_scale') || '1.1', 10);
let GAP_TIME = parseInt(localStorage.getItem('vv_gap_time') || '10', 10);
let VOICEVOX_ADDR = localStorage.getItem('vv_voicevox_addr') || 'http://localhost:50021';
let COEIROINK_ADDR = localStorage.getItem('vv_coeiroink_addr') || 'http://localhost:50032';

// ---- サイト別 DOM アダプタ (ChatGPT / Grok) ----
const SITE = (() => {
  const host = location.hostname;
  if (host === 'grok.com' || host.endsWith('.grok.com')) return 'grok';
  if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com')) return 'chatgpt';
  return 'unknown';
})();

const siteAdapters = {
  chatgpt: {
    name: 'ChatGPT',
    getAssistantMessages() {
      return document.querySelectorAll('div[data-message-author-role="assistant"]');
    },
    getTextBlocks(messageEl) {
      return messageEl.querySelectorAll('p');
    },
    isGenerating() {
      return !!document.querySelector(
        'button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label*="Stop generating"], button[aria-label*="生成を停止"]'
      );
    },
    isComposerTarget(el) {
      if (!el) return false;
      if (el.id === 'prompt-textarea') return true;
      return !!el.closest('#prompt-textarea, [contenteditable="true"]#prompt-textarea');
    },
    isSendButton(el) {
      return !!el.closest(
        'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label*="Send prompt"], button[data-testid="composer-send-button"]'
      );
    }
  },
  grok: {
    name: 'Grok',
    getAssistantMessages() {
      // ユーザー吹き出しは items-end 側。アシスタントは items-start 側の message-bubble
      const fromItemsStart = document.querySelectorAll('.items-start .message-bubble');
      if (fromItemsStart.length > 0) return fromItemsStart;

      // フォールバック: items-end 以外の message-bubble
      return Array.from(document.querySelectorAll('.message-bubble')).filter(
        (el) => !el.closest('.items-end')
      );
    },
    getTextBlocks(messageEl) {
      const md = messageEl.querySelector('.response-content-markdown') || messageEl;
      const blocks = Array.from(md.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6'))
        // li 内の p は親 li 側で拾うため二重読み上げを避ける
        .filter((el) => !(el.tagName === 'P' && el.closest('li')));
      if (blocks.length > 0) return blocks;
      // 段落がまだ無いストリーミング序盤などは markdown 全体を1ブロックとして扱う
      return md.innerText && md.innerText.trim() ? [md] : [];
    },
    isGenerating() {
      // 公式デフォルト: aria-label="Stop model response"（i18n のフォールバック文言）
      return !!document.querySelector(
        'button[aria-label="Stop model response"],' +
        'button[aria-label*="Stop model"],' +
        'button[aria-label*="Stop response"],' +
        'button[aria-label*="応答を停止"],' +
        'button[aria-label*="生成を停止"]'
      );
    },
    isComposerTarget(el) {
      if (!el) return false;
      // Grok は ProseMirror ベースの contenteditable（フィードバック欄などは除外）
      if (el.closest && el.closest('.ProseMirror')) return true;
      if (el.tagName === 'TEXTAREA' && el.closest('form')) return true;
      return false;
    },
    isSendButton(el) {
      return !!el.closest(
        'button[aria-label="Submit"], button[aria-label*="Submit"], button[aria-label*="送信"], button[aria-label="Send message"], button[aria-label*="Send message"]'
      );
    }
  }
};

const site = siteAdapters[SITE] || siteAdapters.chatgpt;

// UIの作成（Shadow DOM + documentElement へマウント。Grok の SPA 差し替え／CSS 干渉を回避）
// 右上にサイト側のアイコンがあるため、やや下にずらす
const PANEL_TOP = '56px';
const panelHost = document.createElement('div');
panelHost.id = 'voicevox-talker-host';
panelHost.setAttribute('data-vv-host', '1');
panelHost.style.cssText = [
  'all: initial',
  'position: fixed',
  `top: ${PANEL_TOP}`,
  'right: 10px',
  'z-index: 2147483647',
  'pointer-events: auto',
  'display: block',
  'width: auto',
  'height: auto',
  'margin: 0',
  'padding: 0',
  'border: none',
  'background: transparent',
  'overflow: visible',
  'visibility: visible',
  'opacity: 1'
].join(';');

const panelShadow = panelHost.attachShadow({ mode: 'open' });
const panelStyle = document.createElement('style');
panelStyle.textContent = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: sans-serif; }
  #voicevox-config-panel {
    pointer-events: auto;
    position: relative;
    width: 220px;
    background: rgba(20, 20, 20, 0.95);
    color: #e0e0e0;
    font-size: 11px;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
    border: 1px solid #444;
    text-align: left;
    user-select: none;
  }
  #voicevox-config-panel select,
  #voicevox-config-panel input[type="text"],
  #voicevox-config-panel input[type="range"] {
    width: 100%;
    background: #333;
    color: #fff;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 2px;
    font-size: 10px;
    cursor: pointer;
  }
  #voicevox-config-panel input[type="text"] {
    cursor: text;
  }
  #voicevox-config-panel .vv-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  #voicevox-config-panel .vv-section { margin-bottom: 8px; }
  #voicevox-config-panel .vv-val { color: #70ff70; font-weight: bold; }
  #vv-config-header {
    font-weight: bold;
    border-bottom: 1px solid #444;
    padding-bottom: 4px;
    margin-bottom: 0;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    color: #fff;
  }
`;
panelShadow.appendChild(panelStyle);

const configPanel = document.createElement('div');
configPanel.id = 'voicevox-config-panel';

const header = document.createElement('div');
header.id = 'vv-config-header';
// デフォルトは縮小表示（[O] 状態）
header.innerHTML = '<span>音声設定</span><span id="vv-toggle-btn">[O]</span>';
configPanel.appendChild(header);
configPanel.style.width = '100px';

const body = document.createElement('div');
body.id = 'vv-config-body';
body.style.display = 'none';

// 音声エンジン設定
const engineDiv = document.createElement('div');
engineDiv.className = 'vv-section';
engineDiv.style.marginBottom = '0';
engineDiv.innerHTML = `
  <div class="vv-row"><span>音声エンジン:</span></div>
  <select id="vv-engine-select">
    <option value="voicevox">VOICEVOX (50021)</option>
    <option value="coeiroink">COEIROINK (50032)</option>
  </select>
`;
body.appendChild(engineDiv);

// VOICEVOXアドレス設定
const vvAddrDiv = document.createElement('div');
vvAddrDiv.className = 'vv-section';
vvAddrDiv.innerHTML = `
  <div class="vv-row"><span>VOICEVOX アドレス:</span></div>
  <input type="text" id="vv-vv-addr" value="${VOICEVOX_ADDR}">
`;
body.appendChild(vvAddrDiv);

// COEIROINKアドレス設定
const coeiroinkAddrDiv = document.createElement('div');
coeiroinkAddrDiv.className = 'vv-section';
coeiroinkAddrDiv.innerHTML = `
  <div class="vv-row"><span>COEIROINK アドレス:</span></div>
  <input type="text" id="vv-coeiroink-addr" value="${COEIROINK_ADDR}">
`;
body.appendChild(coeiroinkAddrDiv);

// 速度設定
const speedDiv = document.createElement('div');
speedDiv.className = 'vv-section';
speedDiv.innerHTML = `
  <div class="vv-row">
    <span>再生速度:</span>
    <div><span id="vv-speed-val" class="vv-val">${SPEED_SCALE}</span>倍</div>
  </div>
  <input type="range" id="vv-speed-range" min="0.5" max="2.0" step="0.1" value="${SPEED_SCALE}">
`;
body.appendChild(speedDiv);

// 継ぎ目ウェイト設定
const gapDiv = document.createElement('div');
gapDiv.className = 'vv-section';
gapDiv.innerHTML = `
  <div class="vv-row">
    <span>段落間の待ち時間:</span>
    <div><span id="vv-gap-val" class="vv-val">${GAP_TIME}</span>ms</div>
  </div>
  <input type="range" id="vv-gap-range" min="0" max="1000" step="10" value="${GAP_TIME}">
`;
body.appendChild(gapDiv);

// 話者選択（ドロップダウン）設定
const speakerDiv = document.createElement('div');
speakerDiv.className = 'vv-section';
speakerDiv.innerHTML = `
  <div class="vv-row"><span>話者選択:</span></div>
  <select id="vv-speaker-select">
    <!-- 動的に切り替え -->
  </select>
`;
body.appendChild(speakerDiv);

configPanel.appendChild(body);
panelShadow.appendChild(configPanel);

// Shadow 内要素の取得
const $panel = (sel) => panelShadow.querySelector(sel);

function mountConfigPanel() {
  const parent = document.documentElement || document.body;
  if (!parent) return false;
  // 既に接続済みなら何もしない
  if (panelHost.isConnected && parent.contains(panelHost)) return true;
  // 旧ホストが残っていれば除去
  document.querySelectorAll('#voicevox-talker-host, #voicevox-config-panel').forEach((el) => {
    if (el !== panelHost) el.remove();
  });
  parent.appendChild(panelHost);
  return true;
}

// 初回マウント（body 未準備時はリトライ）
if (!mountConfigPanel()) {
  const boot = setInterval(() => {
    if (mountConfigPanel()) clearInterval(boot);
  }, 50);
  setTimeout(() => clearInterval(boot), 15000);
}

// SPA に消されたら付け直す
const panelGuard = new MutationObserver(() => {
  if (!panelHost.isConnected) {
    mountConfigPanel();
  }
});
panelGuard.observe(document.documentElement, { childList: true, subtree: false });
// 念のため定期的にも確認
setInterval(() => {
  if (!panelHost.isConnected) mountConfigPanel();
}, 2000);

// イベントハンドラ
const toggleBtn = $panel('#vv-toggle-btn');
header.onclick = () => {
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggleBtn.innerText = '[X]';
    configPanel.style.width = '220px';
  } else {
    body.style.display = 'none';
    toggleBtn.innerText = '[O]';
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

const engineSelect = $panel('#vv-engine-select');
const speakerSelect = $panel('#vv-speaker-select');

const updateSpeakerSelect = async () => {
  speakerSelect.innerHTML = '<option value="">読み込み中...</option>';
  
  try {
    const response = await new Promise((resolve) => {
      if (!chrome.runtime || !chrome.runtime.id) {
        resolve({ success: false, error: 'Context invalidated' });
        return;
      }
      chrome.runtime.sendMessage({
        action: 'get_speakers',
        engine: ENGINE,
        voicevoxAddr: VOICEVOX_ADDR,
        coeiroinkAddr: COEIROINK_ADDR
      }, resolve);
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

const speedRange = $panel('#vv-speed-range');
const speedVal = $panel('#vv-speed-val');
speedRange.oninput = (e) => {
  SPEED_SCALE = parseFloat(e.target.value);
  speedVal.innerText = SPEED_SCALE;
  localStorage.setItem('vv_speed_scale', SPEED_SCALE);
};
speedRange.onchange = () => {
  stopAllSpeech();
};

const gapRange = $panel('#vv-gap-range');
const gapVal = $panel('#vv-gap-val');
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

const vvAddrInput = $panel('#vv-vv-addr');
vvAddrInput.onchange = (e) => {
  VOICEVOX_ADDR = e.target.value.trim();
  localStorage.setItem('vv_voicevox_addr', VOICEVOX_ADDR);
  stopAllSpeech();
  updateSpeakerSelect();
};

const coeiroinkAddrInput = $panel('#vv-coeiroink-addr');
coeiroinkAddrInput.onchange = (e) => {
  COEIROINK_ADDR = e.target.value.trim();
  localStorage.setItem('vv_coeiroink_addr', COEIROINK_ADDR);
  stopAllSpeech();
  updateSpeakerSelect();
};

function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  console.log(`[VOICEVOX][${time}][${type}] ${msg}`);
}

const CHECK_INTERVAL = 100; // 100ms間隔で超高速監視

let lastMessageId = '';
const speechQueue = [];
let isSpeaking = false;
const sentSentences = new Set();

log(`拡張機能による監視を開始しました。 (site=${SITE} / ${site.name})`);
log('【CORS/CSP完全回避・音声先行合成モード】');
log(`${site.name} のAI返答を待っています...`);
log(`コントローラ mount: connected=${panelHost.isConnected} parent=${panelHost.parentElement && panelHost.parentElement.tagName}`);

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
        coeiroinkStyleId: COEIROINK_STYLE_ID,
        voicevoxAddr: VOICEVOX_ADDR,
        coeiroinkAddr: COEIROINK_ADDR
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
  let text = clone.innerText.trim()
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/[^\s]+/g, '');

  // ネットスラング・読み上げ用の表現調整
  // - 笑いを表す「w」や「ｗ」の連続（英単語の一部やコード表現を除く）を「わら」に置換
  text = text.replace(/(?<![a-zA-Z0-9])[wｗ]+(?![a-zA-Z0-9_\-\.])/gi, 'わら');
  // - (笑) や （笑） を「わら」に置換
  text = text.replace(/\(笑\)|（笑）/g, 'わら');
  // - 888や８８８などの拍手を「ぱちぱちぱち」に置換（数値や単位・通貨などを除く）
  text = text.replace(/(?<!\d)[8８]{3,}(?!\d|円|個|人|回|年|日|分|秒|月|万|億|頭|匹|着|足|冊|丁|枚|本|杯|g|kg|m|cm|mm|l|ml|%|％)/g, 'ぱちぱちぱち');
  // - 「orz」を「がっくり」に置換
  text = text.replace(/(?<![a-zA-Z])orz(?![a-zA-Z])/gi, 'がっくり');

  return text;
}

let hasStartedGenerating = false;

// 監視ループ
let watchInterval = setInterval(() => {
  const messages = site.getAssistantMessages();
  if (!messages || messages.length === 0) return;

  const latestMessage = messages[messages.length - 1];

  // 生成中（ストリーミング中）かどうかの判定
  const isGenerating = site.isGenerating();

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
    site.getTextBlocks(latestMessage).forEach((el) => el.setAttribute('data-vv-spoken', 'true'));
    return;
  }

  // メッセージ内のテキストブロック（p / li / 見出し など）を取得
  const pElements = site.getTextBlocks(latestMessage);
  
  // メッセージ全体で各テキストの出現回数を記録する Map (ダブりチェック用)
  const sentenceCounts = new Map();
  
  pElements.forEach((p, pIndex) => {
    // 完全に完了済みのブロックはスキップ
    if (p.getAttribute('data-vv-spoken') === 'true') return;

    const isLast = (pIndex === pElements.length - 1);
    const text = cleanseText(p);
    if (!text) return;

    // 全文から文末の区切り文字で分割して探す
    const match = text.match(/.*?[。！？、，\n]/g);
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

        // 次のブロックへ移っているなら、このブロックの残存テキストを送信して完了とする
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
      // 残存テキストがない場合、かつ生成完了している、または最後のブロックでない場合は完了マークを付与
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

// 既存のアシスタント返答を「読み上げ済み」にして過去ログの再読みを防ぐ
function markAllExistingAsSpoken() {
  const messages = site.getAssistantMessages();
  if (!messages) return;
  Array.from(messages).forEach((msg) => {
    site.getTextBlocks(msg).forEach((el) => el.setAttribute('data-vv-spoken', 'true'));
  });
}

// ユーザー送信を検知したときの共通処理
function onUserSubmit() {
  stopAllSpeech();
  markAllExistingAsSpoken();
  // 停止ボタン出現前でも新レスポンス待ちに入れる（Grok向け）
  hasStartedGenerating = true;
  sentSentences.clear();
}

// ユーザーの入力送信アクションの監視
// 1. Enterキーによる送信 (Shift+Enterは改行のため除外)
document.addEventListener('keydown', (e) => {
  if (site.isComposerTarget(e.target)) {
    if (e.key === 'Enter' && !e.shiftKey) {
      onUserSubmit();
    }
  }
}, true); // キャプチャリングフェーズで優先的に検知

// 2. 送信ボタンクリックによる送信
document.addEventListener('click', (e) => {
  if (site.isSendButton(e.target)) {
    onUserSubmit();
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


