// 設定の読み込み (localStorageで永続化)
function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) { /* ignore */ }
}

let ENGINE = lsGet('vv_engine', 'voicevox');
let SPEAKER_ID = parseInt(lsGet('vv_speaker_id', '3'), 10);
let COEIROINK_SPEAKER_UUID = lsGet('vv_coeiroink_speaker_uuid', '3c37fa81-1fb7-4ad2-8b8b-172fd2f1adbd');
let COEIROINK_STYLE_ID = parseInt(lsGet('vv_coeiroink_style_id', '0'), 10);
let SPEED_SCALE = parseFloat(lsGet('vv_speed_scale', '1.1'), 10);
let GAP_TIME = parseInt(lsGet('vv_gap_time', '10'), 10);
let VOICEVOX_ADDR = lsGet('vv_voicevox_addr', 'http://localhost:50021');
let COEIROINK_ADDR = lsGet('vv_coeiroink_addr', 'http://localhost:50032');
let MUTED = lsGet('vv_muted', '0') === '1';

// ---- サイト別 DOM アダプタ (ChatGPT / Grok / Gemini / Copilot / X.com Grok) ----
const SITE = (() => {
  const host = (location.hostname || '').toLowerCase();
  const path = location.pathname || '';
  if (host === 'grok.com' || host.endsWith('.grok.com')) return 'grok';
  if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com')) return 'chatgpt';
  if (host === 'gemini.google.com' || host.endsWith('.gemini.google.com')) return 'gemini';

  // Microsoft Copilot 系（ドメインが複数ある）
  const isCopilotHost =
    host === 'copilot.microsoft.com' || host.endsWith('.copilot.microsoft.com') ||
    host === 'copilot.cloud.microsoft' || host.endsWith('.copilot.cloud.microsoft') ||
    host === 'm365.cloud.microsoft' || host.endsWith('.m365.cloud.microsoft') ||
    host === 'microsoft365.com' || host.endsWith('.microsoft365.com') ||
    host === 'www.office.com' || host === 'office.com' ||
    host === 'www.bing.com' || host === 'bing.com' ||
    host === 'edgeservices.bing.com' || host.endsWith('.edgeservices.bing.com') ||
    host === 'sydney.bing.com';
  if (isCopilotHost) {
    // 検索トップ等には載せない
    if (host === 'www.bing.com' || host === 'bing.com') {
      if (path.startsWith('/chat') || path.startsWith('/copilot')) return 'copilot';
      return 'unknown';
    }
    if (host === 'www.office.com' || host === 'office.com' ||
        host === 'microsoft365.com' || host.endsWith('.microsoft365.com')) {
      if (path.startsWith('/chat') || path.startsWith('/copilot') || path.includes('/chat')) return 'copilot';
      return 'unknown';
    }
    // m365 / copilot.cloud はチャット起点が多いので広く許可
    return 'copilot';
  }

  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
    // X は SPA のため全ページに載せ、Grok 表示中だけ UI/監視を有効化する
    return 'x_grok';
  }
  return 'unknown';
})();

// X.com: Grok 専用 URL かどうか（pathname のみ。?conversation= は無視される）
// サイドバーの Grok リンクは /home にもあるので DOM では判定しない
function isXGrokRoute() {
  const path = (location.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
  // /i/grok または /i/grok/... のみ（/home や /search は除外）
  return path === '/i/grok' || path.startsWith('/i/grok/');
}

function isXGrokActive() {
  if (SITE !== 'x_grok') return true;
  // URL が Grok チャットのときだけ表示（/home では絶対に出さない）
  return isXGrokRoute();
}

// 共通: 段落/見出しブロック抽出（li 内の p は二重読み上げを避ける）
function defaultTextBlocks(messageEl) {
  if (!messageEl) return [];
  const root = messageEl;
  const blocks = Array.from(root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6'))
    .filter((el) => !(el.tagName === 'P' && el.closest('li')));
  if (blocks.length > 0) return blocks;
  // div ベースの本文（p が無い UI）向け
  const divBlocks = Array.from(root.querySelectorAll('div'))
    .filter((el) => {
      if (!el.innerText || !el.innerText.trim()) return false;
      // 直下にテキストっぽい子だけ持つ葉に近いノードを優先しないよう、子に p/li があるものは除外
      if (el.querySelector('p, li, h1, h2, h3, h4, h5, h6')) return false;
      // 深すぎるネストを避ける
      return el.children.length === 0 || Array.from(el.children).every((c) => c.tagName === 'SPAN' || c.tagName === 'A' || c.tagName === 'STRONG' || c.tagName === 'EM' || c.tagName === 'CODE');
    });
  if (divBlocks.length > 0) return divBlocks;
  return root.innerText && root.innerText.trim() ? [root] : [];
}

// document + 同一オリジン iframe + open shadow をまたいで query
function collectSearchRoots(rootDoc = document) {
  const roots = [rootDoc];
  try {
    rootDoc.querySelectorAll('iframe').forEach((iframe) => {
      try {
        if (iframe.contentDocument) roots.push(iframe.contentDocument);
      } catch (_) { /* cross-origin */ }
    });
  } catch (_) { /* ignore */ }
  return roots;
}

function queryAllInRoots(selector, roots) {
  const out = [];
  for (const root of roots) {
    try {
      out.push(...root.querySelectorAll(selector));
    } catch (_) { /* invalid selector */ }
    // open shadow root も浅く辿る
    try {
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) {
          try {
            out.push(...el.shadowRoot.querySelectorAll(selector));
          } catch (_) { /* ignore */ }
        }
      });
    } catch (_) { /* ignore */ }
  }
  return out;
}

// grok.com 系: アシスタント返答の取得
function getGrokFamilyAssistantMessages() {
  const roots = collectSearchRoots();

  // 1) アシスタント本文クラス（最優先・ユーザー吹き出しを含まない）
  const responses = queryAllInRoots('.response-content-markdown', roots);
  if (responses.length > 0) {
    return responses.map((el) => el.closest('.message-bubble') || el);
  }

  // 2) items-start 側の message-bubble
  const fromItemsStart = queryAllInRoots('.items-start .message-bubble', roots);
  if (fromItemsStart.length > 0) return fromItemsStart;

  // 3) message-bubble のうちユーザー側 (bg-surface / items-end) を除外
  const bubbles = queryAllInRoots('.message-bubble', roots).filter((el) => {
    if (el.closest('.items-end')) return false;
    const cls = typeof el.className === 'string' ? el.className : '';
    if (cls.includes('bg-surface-l1')) return false;
    if (el.querySelector('[class*="bg-surface-l1"]') && !el.querySelector('.response-content-markdown')) return false;
    return true;
  });
  if (bubbles.length > 0) return bubbles;

  // 4) data-testid 系
  const byTestId = queryAllInRoots(
    '[data-testid="grokResponse"], [data-testid="grok-response"], [data-testid="grok_response"], [data-testid="grokResponseText"]',
    roots
  );
  if (byTestId.length > 0) return byTestId;

  return [];
}

// ツイート／記事カードなど Grok 返答以外の X コンテンツか
function isXNonGrokContent(el) {
  if (!el || !el.closest) return true;

  // Grok 返答ノード自身（またはその子孫）は許可
  const inGrokReply = !!el.closest(
    '[data-testid="grokResponseText"], [data-testid="grokResponse"],' +
    '[data-testid="grok-response"], [data-testid="grok_response"],' +
    '.response-content-markdown'
  );

  // ツイート／TL セル自体
  if (el.matches && el.matches(
    'article[data-testid="tweet"], [data-testid="tweet"], [data-testid="tweetText"],' +
    '[data-testid="cellInnerDiv"], [data-testid="card.wrapper"]'
  )) return true;

  // ツイート記事の中にいるが Grok 返答の中ではない
  if (!inGrokReply && el.closest(
    'article[data-testid="tweet"], [data-testid="tweet"], [data-testid="cellInnerDiv"],' +
    '[aria-label*="Timeline"], [data-testid="primaryColumn"] article'
  )) return true;

  // 入力欄・サイドバー・ナビ
  if (el.closest('[data-testid="grokInput"], [data-testid="sidebarColumn"], [data-testid="DMDrawer"], header, nav')) {
    // grokResponse 内なら許可済み。入力欄そのものは除外
    if (el.closest('[data-testid="grokInput"]')) return true;
    if (!inGrokReply) return true;
  }
  return false;
}

// x.com/i/grok 専用: Grok 返答だけを取る（記事・TL は絶対に拾わない）
function getXGrokAssistantMessages() {
  const roots = collectSearchRoots();

  // 1) X 公式 Grok 返答 testid のみ（曖昧な *grokResponse* は使わない）
  const xSelectors = [
    '[data-testid="grokResponseText"]',
    '[data-testid="grokResponse"]',
    '[data-testid="grok-response"]',
    '[data-testid="grok_response"]'
  ];
  for (const sel of xSelectors) {
    const nodes = queryAllInRoots(sel, roots).filter((el) => !isXNonGrokContent(el));
    if (nodes.length > 0) {
      const filtered = nodes.filter((el) => !nodes.some((other) => other !== el && other.contains(el)));
      return filtered.length > 0 ? filtered : nodes;
    }
  }

  // 2) Grok チャット領域に限定した markdown / bubble
  const grokScopes = queryAllInRoots(
    '[data-testid="grokChatHistory"], [data-testid="grokChat"], [data-testid="grok-chat"],' +
    '[data-testid="grokConversation"], [aria-label*="Grok" i], [data-testid*="GrokChat"]',
    roots
  );
  const scopes = grokScopes.length > 0 ? grokScopes : [];

  // scope 内、または grokInput の祖先パネル内だけを対象
  let panel = null;
  const input = document.querySelector('[data-testid="grokInput"]');
  if (input) {
    panel =
      input.closest('[data-testid="grokChatHistory"]') ||
      input.closest('main') ||
      input.closest('[role="main"]') ||
      input.parentElement;
  }

  const searchRoots = scopes.length > 0 ? scopes : (panel ? [panel] : []);
  if (searchRoots.length === 0) {
    // Grok UI が特定できないときは何も読まない（TL/記事を拾うより安全）
    return [];
  }

  // アシスタント本文クラス（grok.com 同系統）を scope 内だけで
  const responses = [];
  for (const root of searchRoots) {
    try {
      root.querySelectorAll('.response-content-markdown, .message-bubble').forEach((el) => {
        if (isXNonGrokContent(el)) return;
        // ユーザー吹き出し除外
        if (el.closest('.items-end')) return;
        const cls = typeof el.className === 'string' ? el.className : '';
        if (cls.includes('bg-surface-l1')) return;
        responses.push(el.closest('.message-bubble') || el);
      });
    } catch (_) { /* ignore */ }
  }
  if (responses.length > 0) {
    const uniq = Array.from(new Set(responses));
    const leaves = uniq.filter((el) => !uniq.some((other) => other !== el && other.contains(el)));
    return leaves.length > 0 ? leaves : uniq;
  }

  // 記事・TL 向けの main/article ヒューリスティックは使わない
  return [];
}

function isGrokFamilyGenerating() {
  // Stop ボタン系のみ（.animate-pulse 等の全体検索は X で常時ヒットして途中停止の原因になる）
  if (document.querySelector(
    'button[aria-label="Stop model response"],' +
    'button[aria-label*="Stop model"],' +
    'button[aria-label*="Stop response"],' +
    'button[aria-label*="Stop generating"],' +
    'button[aria-label*="応答を停止"],' +
    'button[aria-label*="生成を停止"],' +
    'button[data-testid="grokStop"],' +
    'button[data-testid="grokStopButton"],' +
    'button[data-testid="stop-button"]'
  )) return true;

  // composer 付近の Stop のみ（ページ全体の cancel は見ない）
  const nearComposer = document.querySelector(
    '[data-testid="grokInput"], [data-testid="grokSendButton"], .ProseMirror'
  );
  const scope = nearComposer
    ? (nearComposer.closest('form') || nearComposer.closest('[class*="composer"]') || nearComposer.parentElement)
    : null;
  if (scope && scope.querySelectorAll) {
    const buttons = scope.querySelectorAll('button');
    for (const btn of buttons) {
      const label = ((btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '')).toLowerCase();
      if (label.includes('stop generating') || label.includes('stop response') || label.includes('stop model') ||
          label.includes('生成を停止') || label.includes('応答を停止')) {
        return true;
      }
      // 送信ボタンが消えて Stop アイコンだけになっているケース
      const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
      if (tid.includes('stop') && !tid.includes('stopwatch')) return true;
    }
  }
  return false;
}

function isGrokFamilyComposer(el) {
  if (!el) return false;
  if (SITE === 'x_grok') {
    // X は誤 Enter 検知でキューが消えるのを防ぐため入力欄を絞る
    if (el.closest && el.closest('[data-testid="grokInput"]')) return true;
    if (el.getAttribute && el.getAttribute('data-testid') === 'grokInput') return true;
    if (el.closest && el.closest('[data-testid="grokInput"] .ProseMirror, [data-testid="grokInput"] [contenteditable="true"]')) return true;
    return false;
  }
  if (el.closest && el.closest('[data-testid="grokInput"], [data-testid*="grok" i][contenteditable], [data-testid*="grok" i] textarea')) return true;
  if (el.getAttribute && String(el.getAttribute('data-testid') || '').toLowerCase().includes('grok')) return true;
  if (el.closest && el.closest('.ProseMirror')) return true;
  if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
    if (el.closest('form, [role="textbox"], [class*="composer"], [class*="input"]')) return true;
  }
  if (el.tagName === 'TEXTAREA') {
    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
    if (ph.includes('grok') || ph.includes('ask') || ph.includes('message') || ph.includes('メッセージ') || el.closest('form')) return true;
  }
  if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
  return false;
}

function isGrokFamilySendButton(el) {
  if (!el) return false;
  // X は send を広く取ると誤クリックで stopAllSpeech が連発し無音になる
  if (SITE === 'x_grok') {
    return !!el.closest(
      'button[data-testid="grokSendButton"], button[data-testid="grokSend"], button[data-testid="grok-send"]'
    );
  }
  return !!el.closest(
    'button[data-testid="grokSendButton"], button[data-testid="grokSend"], button[data-testid="grok-send"],' +
    'button[aria-label="Submit"], button[aria-label*="Submit"],' +
    'button[aria-label="Send message"], button[aria-label*="Send message"],' +
    'button[aria-label*="送信"]'
  );
}

const siteAdapters = {
  chatgpt: {
    name: 'ChatGPT',
    getAssistantMessages() {
      return document.querySelectorAll('div[data-message-author-role="assistant"]');
    },
    getTextBlocks(messageEl) {
      // オフセット追跡: メッセージ単位で1本（p 分割は語順が壊れやすい）
      if (!messageEl) return [];
      const t = (messageEl.innerText || messageEl.textContent || '').trim();
      return t ? [messageEl] : [];
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
        'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label*="Send prompt"],' +
        'button[data-testid="composer-send-button"], button[aria-label*="送信"],' +
        'button[data-testid="fruitjuice-send-button"]'
      );
    }
  },
  grok: {
    name: 'Grok',
    getAssistantMessages() {
      return getGrokFamilyAssistantMessages();
    },
    getTextBlocks(messageEl) {
      // 思考ブロック内の markdown は使わず、最終回答側を優先
      const mds = Array.from(messageEl.querySelectorAll('.response-content-markdown')).filter((el) => {
        const id = ((el.getAttribute && el.getAttribute('data-testid')) || '').toLowerCase();
        const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
        if (/think|thought|reason|cot/.test(id) || /think|thought|reason|cot/.test(cls)) return false;
        if (el.closest('[data-testid*="think" i], [data-testid*="thought" i], [class*="thinking"], [class*="Thought"]')) {
          return false;
        }
        return true;
      });
      const md = mds.length > 0 ? mds[mds.length - 1] : (messageEl.querySelector('.response-content-markdown') || messageEl);
      // オフセット追跡用に1ブロック
      const t = (md.innerText || md.textContent || '').trim();
      return t ? [md] : [];
    },
    isGenerating() {
      return isGrokFamilyGenerating();
    },
    isComposerTarget(el) {
      return isGrokFamilyComposer(el);
    },
    isSendButton(el) {
      return isGrokFamilySendButton(el);
    }
  },
  gemini: {
    name: 'Gemini',
    getAssistantMessages() {
      // 優先度順。DOM 変更に備え複数セレクタを試す
      const selectors = [
        '.model-response-text',
        '.response-container-content',
        '.model-response',
        '[data-message-author-role="model"]',
        'message-content.model-response-text',
        '.markdown.markdown-main-panel'
      ];
      for (const sel of selectors) {
        const nodes = Array.from(document.querySelectorAll(sel));
        if (nodes.length === 0) continue;
        // 親ごと拾って語順・二重読みになるのを防ぐ
        const leaves = nodes.filter((el) => !nodes.some((other) => other !== el && other.contains(el)));
        return leaves.length > 0 ? leaves : nodes;
      }
      // 最終フォールバック: conversation-container 内のモデル側
      return document.querySelectorAll(
        '.conversation-container .model-response, .conversation-container .response-container'
      );
    },
    getTextBlocks(messageEl) {
      // オフセット追跡: メッセージ単位で1本
      if (!messageEl) return [];
      const t = (messageEl.innerText || messageEl.textContent || '').trim();
      return t ? [messageEl] : [];
    },
    isGenerating() {
      return !!document.querySelector(
        'button[aria-label="Stop generating"],' +
        'button[aria-label*="Stop generating"],' +
        'button[aria-label="Stop"],' +
        'button[aria-label*="Stop response"],' +
        'button[aria-label*="生成を停止"],' +
        'button[aria-label*="応答を停止"],' +
        'button[data-test-id="stop-button"],' +
        'button.stop-button'
      );
    },
    isComposerTarget(el) {
      if (!el) return false;
      if (el.closest && el.closest('rich-textarea, .text-input-field, .input-area, .ql-editor, .ProseMirror')) {
        return true;
      }
      if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        return !!el.closest('rich-textarea, .text-input-field, .input-area');
      }
      return false;
    },
    isSendButton(el) {
      return !!el.closest(
        'button[aria-label="Send message"], button[aria-label="Send"], button[aria-label*="Send message"],' +
        'button[aria-label*="送信"], button[data-test-id="send-button"], .send-button'
      );
    }
  },
  copilot: {
    name: 'Copilot',
    getAssistantMessages() {
      const selectors = [
        '[data-content="ai-message"]',
        '[data-testid="ai-message"]',
        '[data-testid="chat-message"][data-author="bot"]',
        '[data-testid="bot-message"]',
        '[data-author="bot"]',
        '[data-message-author="bot"]',
        '[data-message-author-role="assistant"]',
        '.group\\/ai-message',
        '[class*="ai-message"]',
        '[class*="AiMessage"]',
        '[class*="bot-message"]',
        '[class*="BotMessage"]',
        'cib-message[type="text"][source="bot"]',
        '[role="article"][data-content*="ai"]',
        '[role="log"] [data-content="ai-message"]'
      ];
      for (const sel of selectors) {
        try {
          const nodes = Array.from(document.querySelectorAll(sel));
          if (nodes.length === 0) continue;
          // ネスト重複除去（親コンテナ全体を拾って過去会話ごと読むのを防ぐ）
          const leaves = nodes.filter((el) => !nodes.some((other) => other !== el && other.contains(el)));
          if (leaves.length > 0) return leaves;
          return nodes;
        } catch (_) { /* invalid selector */ }
      }
      // Fluent / Adaptive Card 系（会話ログ全体は避ける）
      const prose = Array.from(document.querySelectorAll(
        '[class*="bot-response"], [class*="response-message"], [class*="assistant-message"],' +
        '[class*="prose"][class*="response"]'
      ));
      if (prose.length > 0) {
        const leaves = prose.filter((el) => !prose.some((other) => other !== el && other.contains(el)));
        return leaves.length > 0 ? leaves : prose;
      }
      return [];
    },
    getTextBlocks(messageEl) {
      // オフセット追跡前提: メッセージ単位で1ブロック（話者ラベル込みの親を細かく割らない）
      if (!messageEl) return [];
      const t = (messageEl.innerText || messageEl.textContent || '').trim();
      return t ? [messageEl] : [];
    },
    isGenerating() {
      // 曖昧な「Stop」「停止」はページ UI と誤爆しやすいので絞る
      if (document.querySelector(
        'button[aria-label="Stop generating"],' +
        'button[aria-label*="Stop generating"],' +
        'button[aria-label="Stop responding"],' +
        'button[aria-label*="Stop responding"],' +
        'button[aria-label*="生成を停止"],' +
        'button[aria-label*="応答を停止"],' +
        'button[data-testid="stop-button"]'
      )) return true;
      return false;
    },
    isComposerTarget(el) {
      if (!el) return false;
      if (el.id === 'userInput' || el.id === 'searchbox' || el.id === 'prompt-textarea') return true;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
      if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
      if (el.closest && el.closest('[contenteditable="true"], [role="textbox"], textarea')) return true;
      return false;
    },
    isSendButton(el) {
      return !!el.closest(
        'button[aria-label="Submit"], button[aria-label*="Submit"],' +
        'button[aria-label="Send"], button[aria-label*="Send"],' +
        'button[aria-label*="送信"], button[data-testid="submit-button"],' +
        'button[data-testid*="send"], button[type="submit"]'
      );
    }
  },
  x_grok: {
    name: 'X Grok',
    getAssistantMessages() {
      return getXGrokAssistantMessages();
    },
    getTextBlocks(messageEl) {
      // ストリーミング中に子ノードが差し替わるため、メッセージ単位1ブロック
      // 思考トレースは cleanseText 側で除去
      if (!messageEl) return [];
      const t = (messageEl.innerText || messageEl.textContent || '').trim();
      return t ? [messageEl] : [];
    },
    isGenerating() {
      const roots = collectSearchRoots();
      // 曖昧な Stop / 停止 は拾わず、Grok 用に絞る
      if (queryAllInRoots(
        'button[data-testid="grokStop"], button[data-testid="grokStopButton"],' +
        'button[aria-label="Stop model response"], button[aria-label*="Stop model"],' +
        'button[aria-label*="Stop generating"], button[aria-label*="生成を停止"]',
        roots
      ).length > 0) return true;
      return isGrokFamilyGenerating();
    },
    isComposerTarget(el) {
      if (!el) return false;
      if (el.closest && el.closest(
        '[data-testid="grokInput"], [data-testid="grokComposer"], [data-testid*="grokInput" i]'
      )) return true;
      return isGrokFamilyComposer(el);
    },
    isSendButton(el) {
      if (!el) return false;
      if (el.closest && el.closest(
        'button[data-testid="grokSendButton"], button[data-testid="grokSend"],' +
        'button[data-testid*="grokSend" i]'
      )) return true;
      return isGrokFamilySendButton(el);
    }
  }
};

const site = siteAdapters[SITE];

// 子フレームは Copilot のみ許可（X は top のみ。二重注入で再生が潰れるのを防ぐ）
const isTopFrame = (window === window.top);
const allowInFrame = SITE === 'copilot';
if (!isTopFrame && !allowInFrame) {
  // skip
} else if (!site) {
  // 未対応ホストでは何もしない（x.com タイムライン等への誤注入を防ぐ）
  console.log('[VOICEVOX] unsupported host, skip:', location.hostname, location.pathname);
} else {
(() => {
// UIの作成（Shadow DOM + documentElement へマウント。SPA 差し替え／CSS 干渉を回避）
// サイト右上アイコンを避けるため位置をサイト別に調整
// - Gemini / Copilot: 右上アイコン帯の下へ
// - X.com Grok: 下端へ逃がす
const PANEL_LAYOUT = (() => {
  switch (SITE) {
    case 'gemini':
    case 'copilot':
      return { top: '88px', right: '14px', bottom: 'auto' };
    case 'x_grok':
      return { top: 'auto', right: '16px', bottom: '96px' };
    case 'grok':
    case 'chatgpt':
    default:
      return { top: '56px', right: '10px', bottom: 'auto' };
  }
})();

const panelHost = document.createElement('div');
panelHost.id = 'voicevox-talker-host';
panelHost.setAttribute('data-vv-host', '1');
panelHost.style.cssText = [
  'all: initial',
  'position: fixed',
  `top: ${PANEL_LAYOUT.top}`,
  `right: ${PANEL_LAYOUT.right}`,
  `bottom: ${PANEL_LAYOUT.bottom}`,
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
    align-items: center;
    gap: 6px;
    color: #fff;
  }
  #vv-config-header .vv-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #vv-config-header .vv-header-btns {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  #vv-mute-btn, #vv-toggle-btn {
    cursor: pointer;
    padding: 0 2px;
    border-radius: 3px;
    line-height: 1.2;
  }
  #vv-mute-btn:hover, #vv-toggle-btn:hover { background: rgba(255,255,255,0.1); }
  #vv-mute-btn.vv-muted {
    color: #ff4444;
    font-weight: bold;
  }
  #voicevox-config-panel.vv-panel-muted {
    border-color: #a33;
  }
`;
panelShadow.appendChild(panelStyle);

const configPanel = document.createElement('div');
configPanel.id = 'voicevox-config-panel';

const header = document.createElement('div');
header.id = 'vv-config-header';
// デフォルトは縮小表示（[O] 状態）。[M] は縮小でも常に見える
header.innerHTML =
  '<span class="vv-title">音声設定</span>' +
  '<span class="vv-header-btns">' +
  '<span id="vv-mute-btn" title="ミュート切替">[M]</span>' +
  '<span id="vv-toggle-btn" title="展開/縮小">[O]</span>' +
  '</span>';
configPanel.appendChild(header);
// 縮小時も [M][O] が収まる幅
configPanel.style.width = '118px';

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
  // X: Grok 非表示中はマウントしない（パネルを消す）
  if (SITE === 'x_grok' && !isXGrokActive()) {
    if (panelHost.isConnected) {
      try { panelHost.remove(); } catch (_) { /* ignore */ }
    }
    return false;
  }
  // 既に接続済みなら何もしない
  if (panelHost.isConnected && parent.contains(panelHost)) return true;
  // 旧ホストが残っていれば除去
  document.querySelectorAll('#voicevox-talker-host, #voicevox-config-panel').forEach((el) => {
    if (el !== panelHost) el.remove();
  });
  parent.appendChild(panelHost);
  return true;
}

function setPanelVisible(visible) {
  if (visible) {
    panelHost.style.display = 'block';
    panelHost.style.visibility = 'visible';
    panelHost.style.pointerEvents = 'auto';
    panelHost.style.opacity = '1';
    mountConfigPanel();
  } else {
    panelHost.style.display = 'none';
    panelHost.style.visibility = 'hidden';
    panelHost.style.pointerEvents = 'none';
    panelHost.style.opacity = '0';
    if (panelHost.isConnected) {
      try { panelHost.remove(); } catch (_) { /* ignore */ }
    }
  }
}

let lastXGrokActive = null;
function syncXGrokPanelVisibility() {
  if (SITE !== 'x_grok') return true;
  const active = isXGrokActive();
  if (active !== lastXGrokActive) {
    lastXGrokActive = active;
    setPanelVisible(active);
    if (!active) {
      try { stopAllSpeech('Grok非表示'); } catch (_) { /* stopAllSpeech 未定義の起動直後は無視 */ }
      log('Grok 非表示のため音声設定パネルを消去しました');
    } else {
      log('Grok 表示を検出。音声設定パネルを表示します');
    }
  } else if (active && !panelHost.isConnected) {
    setPanelVisible(true);
  } else if (!active && panelHost.isConnected) {
    setPanelVisible(false);
  }
  return active;
}

// 初回マウント（body 未準備時はリトライ）
// X は Grok 表示後に出す
if (SITE === 'x_grok') {
  setPanelVisible(false);
  const boot = setInterval(() => {
    if (syncXGrokPanelVisibility()) clearInterval(boot);
  }, 200);
  setTimeout(() => clearInterval(boot), 30000);
} else if (!mountConfigPanel()) {
  const boot = setInterval(() => {
    if (mountConfigPanel()) clearInterval(boot);
  }, 50);
  setTimeout(() => clearInterval(boot), 15000);
}

// SPA に消されたら付け直す（X は Grok 表示中のみ）
const panelGuard = new MutationObserver(() => {
  if (SITE === 'x_grok') {
    syncXGrokPanelVisibility();
    return;
  }
  if (!panelHost.isConnected) {
    mountConfigPanel();
  }
});
panelGuard.observe(document.documentElement, { childList: true, subtree: false });
// 念のため定期的にも確認（X の SPA ルート変化含む）
setInterval(() => {
  if (SITE === 'x_grok') {
    syncXGrokPanelVisibility();
    return;
  }
  if (!panelHost.isConnected) mountConfigPanel();
}, 1000);

// 履歴 API でのルート変化も拾う
if (SITE === 'x_grok') {
  const wrapHist = (fnName) => {
    const orig = history[fnName];
    if (typeof orig !== 'function') return;
    history[fnName] = function (...args) {
      const ret = orig.apply(this, args);
      setTimeout(syncXGrokPanelVisibility, 0);
      setTimeout(syncXGrokPanelVisibility, 300);
      return ret;
    };
  };
  wrapHist('pushState');
  wrapHist('replaceState');
  window.addEventListener('popstate', () => {
    setTimeout(syncXGrokPanelVisibility, 0);
    setTimeout(syncXGrokPanelVisibility, 300);
  });
}

// イベントハンドラ
const toggleBtn = $panel('#vv-toggle-btn');
const muteBtn = $panel('#vv-mute-btn');

function applyMuteUi() {
  if (!muteBtn) return;
  if (MUTED) {
    muteBtn.classList.add('vv-muted');
    muteBtn.title = 'ミュート中（クリックで解除）';
    configPanel.classList.add('vv-panel-muted');
  } else {
    muteBtn.classList.remove('vv-muted');
    muteBtn.title = 'ミュート切替';
    configPanel.classList.remove('vv-panel-muted');
  }
}

function setMuted(next) {
  MUTED = !!next;
  lsSet('vv_muted', MUTED ? '1' : '0');
  applyMuteUi();
  if (MUTED) {
    try { stopAllSpeech('ミュート'); } catch (_) { /* 起動直後 */ }
    log('ミュート ON');
  } else {
    log('ミュート OFF');
  }
}

if (muteBtn) {
  muteBtn.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setMuted(!MUTED);
  };
}
applyMuteUi();

header.onclick = (e) => {
  // ミュートボタンは展開トグルしない
  if (e.target && (e.target.id === 'vv-mute-btn' || e.target.closest && e.target.closest('#vv-mute-btn'))) {
    return;
  }
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggleBtn.innerText = '[X]';
    configPanel.style.width = '220px';
  } else {
    body.style.display = 'none';
    toggleBtn.innerText = '[O]';
    configPanel.style.width = '118px';
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
        lsSet('vv_coeiroink_speaker_uuid', COEIROINK_SPEAKER_UUID);
        lsSet('vv_coeiroink_style_id', COEIROINK_STYLE_ID);
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
        lsSet('vv_speaker_id', SPEAKER_ID);
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
  lsSet('vv_engine', ENGINE);
  updateSpeakerSelect().then(() => {
    restartPlaybackWithNewVoice('エンジン変更');
  });
};

const speedRange = $panel('#vv-speed-range');
const speedVal = $panel('#vv-speed-val');
speedRange.oninput = (e) => {
  SPEED_SCALE = parseFloat(e.target.value);
  speedVal.innerText = SPEED_SCALE;
  lsSet('vv_speed_scale', SPEED_SCALE);
};
// ドラッグ中は連発しない。確定時に新速度で続きから再開
speedRange.onchange = () => {
  restartPlaybackWithNewVoice('再生速度変更');
};

const gapRange = $panel('#vv-gap-range');
const gapVal = $panel('#vv-gap-val');
gapRange.oninput = (e) => {
  GAP_TIME = parseInt(e.target.value, 10);
  gapVal.innerText = GAP_TIME;
  lsSet('vv_gap_time', GAP_TIME);
};
// ギャップは次の文境界から効かせれば十分なので停止しない

speakerSelect.onchange = (e) => {
  if (ENGINE === 'coeiroink') {
    const val = e.target.value;
    if (val && val.includes(':')) {
      const [uuid, style] = val.split(':');
      COEIROINK_SPEAKER_UUID = uuid;
      COEIROINK_STYLE_ID = parseInt(style, 10);
      lsSet('vv_coeiroink_speaker_uuid', COEIROINK_SPEAKER_UUID);
      lsSet('vv_coeiroink_style_id', COEIROINK_STYLE_ID);
    }
  } else {
    SPEAKER_ID = parseInt(e.target.value, 10);
    lsSet('vv_speaker_id', SPEAKER_ID);
  }
  restartPlaybackWithNewVoice('話者変更');
};

const vvAddrInput = $panel('#vv-vv-addr');
vvAddrInput.onchange = (e) => {
  VOICEVOX_ADDR = e.target.value.trim();
  lsSet('vv_voicevox_addr', VOICEVOX_ADDR);
  updateSpeakerSelect().then(() => {
    restartPlaybackWithNewVoice('VOICEVOX アドレス変更');
  });
};

const coeiroinkAddrInput = $panel('#vv-coeiroink-addr');
coeiroinkAddrInput.onchange = (e) => {
  COEIROINK_ADDR = e.target.value.trim();
  lsSet('vv_coeiroink_addr', COEIROINK_ADDR);
  updateSpeakerSelect().then(() => {
    restartPlaybackWithNewVoice('COEIROINK アドレス変更');
  });
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
// 再生中の文（音声設定変更時にここから新ボイスで再開する）
let currentPlayingText = null;
// ソフト再起動で古い processQueue を無効化するための世代
let playGeneration = 0;

log(`拡張機能による監視を開始しました。 (site=${SITE} / ${site.name})`);
log('【CORS/CSP完全回避・音声先行合成モード】');
log(`${site.name} のAI返答を待っています...`);
log(`コントローラ mount: connected=${panelHost.isConnected} parent=${panelHost.parentElement && panelHost.parentElement.tagName}`);

// chrome.runtime.sendMessage をタイムアウト付きで待つ
function sendRuntimeMessage(payload, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish({ success: false, error: `timeout ${timeoutMs}ms` });
    }, timeoutMs);

    if (!chrome.runtime || !chrome.runtime.id) {
      finish({ success: false, error: '拡張機能のコンテキストが無効です' });
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          finish({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        finish(response || { success: false, error: '応答なし' });
      });
    } catch (err) {
      finish({ success: false, error: err.message });
    }
  });
}

// VOICEVOXに非同期で音声合成をリクエストしPromiseを返す関数
function requestVoicevoxBase64(text) {
  return (async () => {
    if (!chrome.runtime || !chrome.runtime.id) {
      log('拡張機能のコンテキストが無効になりました。ページをリロードしてください。', 'error');
      stopMonitoring();
      return null;
    }

    log(`音声先行取得開始: "${text.substring(0, 15)}..."`, 'synth');
    const response = await sendRuntimeMessage({
      action: 'synthesize',
      engine: ENGINE,
      text: text,
      speakerId: SPEAKER_ID,
      speedScale: SPEED_SCALE,
      coeiroinkSpeakerUuid: COEIROINK_SPEAKER_UUID,
      coeiroinkStyleId: COEIROINK_STYLE_ID,
      voicevoxAddr: VOICEVOX_ADDR,
      coeiroinkAddr: COEIROINK_ADDR
    }, 45000);

    if (!response || !response.success) {
      const err = response ? response.error : '応答なし';
      if (err && /context|invalidated|extension/i.test(err)) {
        log('通信エラー: 拡張機能がリロードされました。ページをリロードしてください。', 'error');
        stopMonitoring();
      } else {
        log(`合成失敗: ${err}`, 'error');
      }
      return null;
    }
    if (!response.base64Wav) {
      log('合成失敗: base64 が空です', 'error');
      return null;
    }
    log(`音声取得完了: "${text.substring(0, 15)}..." (${Math.round(response.base64Wav.length / 1024)}KB)`, 'synth');
    return response.base64Wav;
  })();
}

// 先読み（プリフェッチ）のトリガー関数 (最大1つの先読みのみ開始するバッファ1テキスト制限)
function triggerPrefetch() {
  if (MUTED) return;
  if (speechQueue.length > 0) {
    const nextItem = speechQueue[0];
    if (!nextItem.promise) {
      nextItem.promise = requestVoicevoxBase64(nextItem.text);
    }
  }
}

// 再生キュー
async function processQueue() {
  if (MUTED) {
    speechQueue.length = 0;
    isSpeaking = false;
    currentPlayingText = null;
    return;
  }
  if (isSpeaking || speechQueue.length === 0) return;
  isSpeaking = true;

  const myGen = playGeneration;
  const item = speechQueue.shift();
  currentPlayingText = item.text || null;
  log(`キュー再生開始: rest=${speechQueue.length} text="${(item.text || '').substring(0, 15)}..."`);

  try {
    if (MUTED || myGen !== playGeneration) return;
    // 常に現在の話者・速度で合成（先読みの古い音声を使わない）
    item.promise = requestVoicevoxBase64(item.text);
    triggerPrefetch();

    const base64Data = await item.promise;
    if (MUTED || myGen !== playGeneration) return;

    if (base64Data) {
      log(`再生中: "${item.text.substring(0, 15)}..."`, 'success');
      const response = await sendRuntimeMessage({
        action: 'play_offscreen',
        base64Wav: base64Data,
        gapTime: GAP_TIME
      }, 120000);

      if (myGen !== playGeneration) return;

      if (!response || !response.success) {
        log(`再生失敗: ${response ? response.error : '応答なし'}`, 'error');
      } else {
        log(`再生完了: "${item.text.substring(0, 15)}..."`, 'success');
      }
    } else {
      log(`音声データが無いためスキップ: "${item.text.substring(0, 15)}..."`, 'error');
    }
  } catch (err) {
    log(`再生例外: ${err.message}`, 'error');
  } finally {
    // 自分の世代だけロック解除（古い processQueue が新再生を壊さない）
    if (myGen === playGeneration) {
      if (currentPlayingText === item.text) currentPlayingText = null;
      isSpeaking = false;
      if (!MUTED) {
        triggerPrefetch();
        setTimeout(processQueue, 10);
      }
    }
  }
}

// 音声設定変更時: 読み上げ位置は維持し、再生中＋待ち行列を新設定で再開
function restartPlaybackWithNewVoice(reason = '音声設定変更') {
  if (MUTED) {
    log(`${reason}: ミュート中のため再生再開はしません`);
    return;
  }

  const remaining = [];
  if (currentPlayingText) {
    remaining.push(currentPlayingText);
  }
  for (const item of speechQueue) {
    if (item && item.text && item.text !== currentPlayingText) {
      remaining.push(item.text);
    }
  }

  // 進行中の processQueue を無効化
  playGeneration += 1;
  speechQueue.length = 0;
  isSpeaking = false;
  currentPlayingText = null;
  if (chrome.runtime && chrome.runtime.id) {
    try {
      chrome.runtime.sendMessage({ action: 'stop_offscreen' });
    } catch (_) { /* ignore */ }
  }

  if (remaining.length === 0) {
    log(`${reason}: 再開する文がありません（次の文から新設定が適用されます）`);
    return;
  }

  remaining.forEach((text) => {
    speechQueue.push({ text, promise: null, seq: ++enqueueSeq });
  });
  log(`${reason}: ${remaining.length} 文を新設定で再開 ("${remaining[0].substring(0, 15)}...")`);
  triggerPrefetch();
  processQueue();
}

// UI の話者ラベル・操作文言を落とす（「COPILOTの発言」等）
function stripSpeakerChrome(text) {
  let t = String(text || '');
  // 先頭の話者ラベル
  t = t.replace(/^(microsoft\s+)?copilot(\s*の\s*発言)?\s*[:：\-]?\s*/i, '');
  t = t.replace(/^(chatgpt|gemini|grok|assistant|ai|bot|モデル)\s*(の\s*発言)?\s*[:：\-]?\s*/i, '');
  // 文中・単独の話者ラベル
  t = t.replace(/\b(microsoft\s+)?copilot\s*の\s*発言\b[:：\-]?\s*/gi, '');
  t = t.replace(/\b(chatgpt|gemini|grok)\s*の\s*発言\b[:：\-]?\s*/gi, '');
  // よくあるアクション文言（単独で読まれがち）
  t = t.replace(/^\s*(コピー|Copy|Like|Dislike|Share|共有|再生成|Regenerate|Sources?|ソース|引用)\s*$/gim, '');
  return t.trim();
}

// クレンジング処理
function cleansePlainText(raw) {
  let text = stripSpeakerChrome(String(raw || '').trim()
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/[^\s]+/g, ''));

  // ネットスラング・読み上げ用の表現調整
  text = text.replace(/(?<![a-zA-Z0-9])[wｗ]+(?![a-zA-Z0-9_\-\.])/gi, 'わら');
  text = text.replace(/\(笑\)|（笑）/g, 'わら');
  text = text.replace(/(?<!\d)[8８]{3,}(?!\d|円|個|人|回|年|日|分|秒|月|万|億|頭|匹|着|足|冊|丁|枚|本|杯|g|kg|m|cm|mm|l|ml|%|％)/g, 'ぱちぱちぱち');
  text = text.replace(/(?<![a-zA-Z])orz(?![a-zA-Z])/gi, 'がっくり');

  // 再度ラベル掃除（置換後に露出した場合）
  text = stripSpeakerChrome(text);
  return text;
}

// Grok 等の「思考中 / Thinking / Thoughts」ブロックを DOM から除去
function stripThinkingDom(root) {
  if (!root || !root.querySelectorAll) return;

  const selectors = [
    // data-testid / aria
    '[data-testid*="thinking" i]',
    '[data-testid*="thought" i]',
    '[data-testid*="reasoning" i]',
    '[data-testid*="chain-of-thought" i]',
    '[data-testid*="cot" i]',
    '[aria-label*="Thinking" i]',
    '[aria-label*="Thought" i]',
    '[aria-label*="思考"]',
    '[aria-label*="推論"]',
    // class（大小ゆれ）
    '[class*="thinking"]',
    '[class*="Thinking"]',
    '[class*="thought-panel"]',
    '[class*="ThoughtPanel"]',
    '[class*="thoughts"]',
    '[class*="Thoughts"]',
    '[class*="reasoning"]',
    '[class*="Reasoning"]',
    '[class*="chain-of-thought"]',
    '[class*="cot-"]',
    // 折りたたみ UI
    'details[data-testid*="think" i]',
    'details[class*="think" i]',
    'details[class*="Thought"]',
    'details[class*="thinking"]'
  ];

  for (const sel of selectors) {
    try {
      root.querySelectorAll(sel).forEach((el) => el.remove());
    } catch (_) { /* 古いブラウザ等で i フラグ不可 */ }
  }

  // 見出しが Thinking / 思考 の details / セクションを heuristically 除去
  try {
    root.querySelectorAll('details, section, div').forEach((el) => {
      if (!el || !el.getAttribute) return;
      const label = (
        (el.getAttribute('aria-label') || '') + ' ' +
        (el.querySelector('summary, [class*="title"], [class*="header"]')?.textContent || '')
      ).trim();
      if (/^(thinking|thoughts?|reasoning|思考|考え中|推論)/i.test(label) ||
          /\b(thinking|thoughts?|reasoning)\b/i.test(label) && label.length < 80) {
        // 巨大な回答コンテナ自体は消さない
        if (el.querySelector && el.querySelector('.response-content-markdown') &&
            (el.textContent || '').length > 2000 &&
            !/thinking|thought|思考/i.test(el.getAttribute('data-testid') || '')) {
          return;
        }
        el.remove();
      }
    });
  } catch (_) { /* ignore */ }
}

function stripThinkingPlainText(text) {
  let t = String(text || '');
  // 先頭の思考ヘッダ行
  t = t.replace(/^(Thinking|Thoughts?|Reasoning|思考中|考え中|推論中)([.．…]*|\s*).*$/gim, '');
  t = t.replace(/^Thought for \d+\s*(seconds?|s|秒)?.*$/gim, '');
  t = t.replace(/^思考に\s*\d+\s*秒.*$/gim, '');
  // よくある区切り
  t = t.replace(/\bThinking\.+\s*/gi, '');
  return t.replace(/\s+/g, ' ').trim();
}

function cleanseText(element) {
  if (!element) return '';
  if (typeof element === 'string') {
    return stripThinkingPlainText(cleansePlainText(element));
  }
  const clone = element.cloneNode(true);

  // 思考トレースを先に落とす（Grok / X Grok）
  stripThinkingDom(clone);

  clone.querySelectorAll(
    'pre, code, style, script, .sr-only, button, svg, nav, ' +
    '[class*="attribution"], [class*="Attribution"],' +
    '[class*="author-name"], [class*="AuthorName"],' +
    '[class*="speaker"], [class*="Speaker"],' +
    '[class*="message-header"], [class*="MessageHeader"],' +
    '[data-testid*="author"], [aria-label*="Copy"], [aria-label*="コピー"],' +
    // X: 引用ツイート・記事カード・メディア（本文として読ませない）
    'article[data-testid="tweet"], [data-testid="tweet"], [data-testid="tweetText"],' +
    '[data-testid="card.wrapper"], [data-testid="card.layoutLarge.media"],' +
    '[data-testid="card.layoutSmall.media"], [data-testid="placementTracking"],' +
    '[data-testid="User-Name"], a[href*="/status/"], a[href*="/i/articles"],' +
    'img, video, time'
  ).forEach((el) => el.remove());
  return stripThinkingPlainText(cleansePlainText(clone.innerText || clone.textContent || ''));
}

// 句読点分割（文末のみ。読点「、」では切らない）
// 返す complete は「元テキスト上の連続スライス」なので offset が進んでも順序が壊れない
function splitCompleteSentences(text) {
  if (!text) return { complete: [], rest: '' };
  // 文末: 。！？ / 改行 / … / .!?（小数点除外）
  const re = /[\s\S]*?(?:[。！？\n]|…+|(?<![0-9])[.!?](?=\s|$|["'”’)\]]))/g;
  const complete = [];
  let used = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[0];
    // 空マッチ防止
    if (!s) {
      re.lastIndex++;
      continue;
    }
    complete.push(s); // trim しない（offset 用）
    used = m.index + s.length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return { complete, rest: text.slice(used) };
}

function normalizeSpokenKey(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function enqueueSentence(rawSlice, sentenceCounts, reason) {
  if (rawSlice == null || rawSlice === '') return false;
  const norm = normalizeSpokenKey(rawSlice);
  if (!norm) return false;
  // 空白・記号だけの破片はスキップ（offset は呼び出し側で進める）
  if (!/[\p{L}\p{N}]/u.test(norm)) return false;

  // 完全一致の再読だけ防ぐ（前方一致は読み飛ばしの原因になるのでやめる）
  if (spokenNormSet.has(norm)) return false;

  const count = (sentenceCounts.get(norm) || 0) + 1;
  sentenceCounts.set(norm, count);
  const key = `${norm}:${count}`;
  if (sentSentences.has(key)) return false;

  // ミュート中も既読扱いにはする（解除後に溜まった文を一気に読まない）
  sentSentences.add(key);
  spokenNormSet.add(norm);

  if (MUTED) {
    log(`${reason} [ミュート中スキップ]: "${norm.substring(0, 15)}..."`);
    return true;
  }

  log(`${reason}: "${norm.substring(0, 15)}..."`);
  speechQueue.push({ text: norm, promise: null, seq: ++enqueueSeq });
  triggerPrefetch();
  processQueue();
  return true;
}

let hasStartedGenerating = false;
let lastAssistantCount = 0;
let lastAssistantSnapshot = '';
let lastAssistantFullLen = 0;
let lastEmptyMsgLogAt = 0;
let lastFoundMsgLogAt = 0;
// 起動直後の履歴ロードを「新規生成」と誤認しないための安定待ち
let baselineStableSince = 0;
let baselineSettled = false;
const BASELINE_STABLE_MS = (SITE === 'x_grok' || SITE === 'copilot') ? 800 : 300;
// 送信時点のアシスタント件数。これ以下の過去分は読まない
let armBaselineCount = 0;
// 送信後、新しい返答本文を待つ（件数増なしの差し替えにも対応）
let awaitingNewResponse = false;
let armSeedText = '';

// ストリーミング粘着: Stop が消えても本文が伸びている間は生成中扱い
// ※ hasStartedGenerating 後のみ使う（起動時の過去文読み防止）
const STREAM_IDLE_MS = (SITE === 'x_grok' || SITE === 'grok' || SITE === 'gemini') ? 2500 : 900;
let lastTextGrowthAt = 0;
let enqueueSeq = 0;
// 現レスポンスで既に読んだ正規化文
let spokenNormSet = new Set();

// メッセージ単位の読み上げオフセット（単調増加・巻き戻し禁止）
let streamTrack = {
  fingerprint: '',
  spokenLen: 0,
  lastFullText: '',
  finalized: false,
  responseGen: 0
};

function resetStreamTrack() {
  streamTrack = { fingerprint: '', spokenLen: 0, lastFullText: '', finalized: false, responseGen: streamTrack.responseGen || 0 };
  lastTextGrowthAt = 0;
}

function beginNewResponseTrack(fingerprint) {
  streamTrack = {
    fingerprint: fingerprint || '',
    spokenLen: 0,
    lastFullText: '',
    finalized: false,
    responseGen: (streamTrack.responseGen || 0) + 1
  };
  spokenNormSet = new Set();
  lastTextGrowthAt = Date.now();
}

function messageFingerprint(el, index, total) {
  // className は React 再描画で変わりやすいので fingerprint に使わない
  const id = (el && el.getAttribute && (el.getAttribute('data-testid') || el.id || '')) || '';
  return `${total}#${index}#${id}`;
}

// 現在の最新メッセージを「全部既読」にして過去ログを読まない
function seedStreamTrackAsFullyRead(messageEl, msgCount) {
  if (!messageEl) {
    resetStreamTrack();
    spokenNormSet = new Set();
    return;
  }
  const fullText = cleanseText(messageEl);
  streamTrack.fingerprint = messageFingerprint(messageEl, Math.max(0, msgCount - 1), msgCount);
  streamTrack.lastFullText = fullText;
  streamTrack.spokenLen = fullText.length;
  streamTrack.finalized = true;
  lastAssistantFullLen = (messageEl.innerText || '').trim().length;
  lastAssistantSnapshot = (messageEl.innerText || '').trim();
  lastAssistantCount = msgCount;
  lastTextGrowthAt = 0;
}

// 本文を「伸びる一方のカノニカル文字列」にマージ（語順・読み飛ばし対策の中核）
function mergeCanonicalText(incoming) {
  const prev = streamTrack.lastFullText || '';
  let spokenLen = streamTrack.spokenLen || 0;
  if (!incoming) {
    return { text: prev, spokenLen, changed: false };
  }
  if (!prev) {
    return { text: incoming, spokenLen: 0, changed: true };
  }

  // 純粋追記
  if (incoming.startsWith(prev)) {
    return { text: incoming, spokenLen, changed: incoming.length !== prev.length };
  }

  // 一時的な短縮（再描画）→ 前回を維持
  if (prev.startsWith(incoming) && incoming.length < prev.length) {
    return { text: prev, spokenLen, changed: false };
  }

  // 既読部分が先頭に残っている
  const spokenPart = prev.slice(0, spokenLen);
  if (spokenPart && incoming.startsWith(spokenPart)) {
    return { text: incoming, spokenLen, changed: true };
  }

  // 共通接頭辞
  let common = 0;
  const max = Math.min(prev.length, incoming.length);
  while (common < max && prev[common] === incoming[common]) common++;

  // 既読アンカーで位置を再マップ（大きく巻き戻さない）
  if (spokenLen > 0) {
    const anchorLen = Math.min(48, spokenLen);
    const anchor = prev.slice(spokenLen - anchorLen, spokenLen);
    const idx = incoming.indexOf(anchor);
    if (idx >= 0) {
      const mapped = idx + anchorLen;
      // 許容: わずかなずれのみ。大幅巻き戻しはしない
      if (mapped >= spokenLen - 8) {
        return {
          text: incoming,
          spokenLen: Math.max(spokenLen, mapped),
          changed: true
        };
      }
    }
  }

  // 既読より後ろで合流できるなら、カノニカルを incoming に更新し spokenLen は維持
  if (common >= spokenLen) {
    return { text: incoming, spokenLen, changed: true };
  }

  // 既読領域は概ね一致（90%以上）→ わずかな揺れとして incoming を採用
  if (spokenLen > 0 && common >= Math.floor(spokenLen * 0.9)) {
    return { text: incoming, spokenLen: Math.max(common, spokenLen), changed: true };
  }

  // どうしても合わないが incoming の方が長い → 読み進めた位置は維持したまま更新を試みる
  if (incoming.length > prev.length && spokenLen <= incoming.length) {
    return { text: incoming, spokenLen, changed: true };
  }

  // それ以外は前回維持（この tick は変更なし）
  return { text: prev, spokenLen, changed: false };
}

// 全文オフセット追跡（Grok / X / Copilot / Gemini）
function processMessageByOffset(messageEl, isGenerating) {
  const rawFull = cleanseText(messageEl);
  if (!rawFull) return;

  const merged = mergeCanonicalText(rawFull);
  const trackText = merged.text;
  let spokenLen = Math.max(merged.spokenLen, streamTrack.spokenLen || 0);

  if (trackText.length > (streamTrack.lastFullText || '').length) {
    lastTextGrowthAt = Date.now();
    // 伸びたら最終 flush 済みでも再開
    streamTrack.finalized = false;
  }

  streamTrack.lastFullText = trackText;
  streamTrack.spokenLen = Math.min(spokenLen, trackText.length);

  if (streamTrack.spokenLen >= trackText.length) {
    return;
  }

  const unsent = trackText.slice(streamTrack.spokenLen);
  const { complete } = splitCompleteSentences(unsent);
  const sentenceCounts = new Map();
  let advanced = 0;

  complete.forEach((sentence) => {
    // sentence は unsent 先頭からの連続スライス（順序保証）
    enqueueSentence(sentence, sentenceCounts, '新規確定文を検知 (offset)');
    // キューに入れても入れなくても、原文上の長さだけ進める（読み飛ばし・二重読防止）
    advanced += sentence.length;
  });
  streamTrack.spokenLen += advanced;

  // 生成完了が安定してから残余を flush（何度も確定しない）
  if (!isGenerating && !streamTrack.finalized) {
    const remainSlice = trackText.slice(streamTrack.spokenLen);
    const remain = remainSlice.trim();
    if (remain) {
      enqueueSentence(remainSlice, sentenceCounts, '最終残余分を検知 (offset)');
    }
    streamTrack.spokenLen = trackText.length;
    streamTrack.finalized = true;
  }
}

// 監視ループ
let watchInterval = setInterval(() => {
  // X: Grok 非表示ならパネル消去＋監視スキップ
  if (SITE === 'x_grok') {
    if (!syncXGrokPanelVisibility()) return;
  }

  const messages = site.getAssistantMessages();
  if (!messages || messages.length === 0) {
    // X Grok 等で DOM が取れないときの診断（5秒に1回）
    const now = Date.now();
    if (now - lastEmptyMsgLogAt > 5000) {
      lastEmptyMsgLogAt = now;
      const roots = typeof collectSearchRoots === 'function' ? collectSearchRoots() : [document];
      const probe = {
        site: SITE,
        testid_responseText: document.querySelectorAll('[data-testid="grokResponseText"]').length,
        testid_response: document.querySelectorAll('[data-testid="grokResponse"]').length,
        testid_input: document.querySelectorAll('[data-testid="grokInput"]').length,
        testid_send: document.querySelectorAll('[data-testid="grokSendButton"], [data-testid="grokSend"]').length,
        markdown: document.querySelectorAll('.response-content-markdown').length,
        bubble: document.querySelectorAll('.message-bubble').length,
        iframes: document.querySelectorAll('iframe').length,
        roots: roots.length
      };
      log(`アシスタントDOM未検出: ${JSON.stringify(probe)}`, 'warning');
    }
    // 履歴が後から載るサイト向け: 空の間はベースライン未確定
    if (!hasStartedGenerating) {
      baselineSettled = false;
      baselineStableSince = 0;
    }
    return;
  }
  // 初回検出をログ
  if (Date.now() - lastFoundMsgLogAt > 10000) {
    lastFoundMsgLogAt = Date.now();
    const sample = ((messages[messages.length - 1].innerText || '').trim()).slice(0, 40);
    log(`アシスタントDOM検出: count=${messages.length} sample="${sample}..."`);
  }

  const latestMessage = messages[messages.length - 1];
  const msgCount = messages.length;
  let latestFullText = '';
  try {
    latestFullText = (latestMessage.innerText || latestMessage.textContent || '').trim();
  } catch (_) { /* ignore */ }
  const latestFullLen = latestFullText.length;

  // ---- 読み上げ未開始: 過去ログをベースラインとして固定（絶対に読まない）----
  if (!hasStartedGenerating) {
    // 履歴の遅延ロードで count/text が伸びても「新規生成」にしない
    const changed =
      msgCount !== lastAssistantCount ||
      latestFullText !== lastAssistantSnapshot;

    if (changed || !baselineStableSince) {
      baselineStableSince = Date.now();
      baselineSettled = false;
      lastAssistantCount = msgCount;
      lastAssistantSnapshot = latestFullText;
      lastAssistantFullLen = latestFullLen;
      // 常に最新を既読 seed（後から履歴が増えても seed を更新）
      seedStreamTrackAsFullyRead(latestMessage, msgCount);
      site.getTextBlocks(latestMessage).forEach((el) => el.setAttribute('data-vv-spoken', 'true'));
      // 全メッセージもマーク
      try {
        Array.from(messages).forEach((msg) => {
          site.getTextBlocks(msg).forEach((el) => el.setAttribute('data-vv-spoken', 'true'));
        });
      } catch (_) { /* ignore */ }
      return;
    }

    if (!baselineSettled && (Date.now() - baselineStableSince) >= BASELINE_STABLE_MS) {
      baselineSettled = true;
      seedStreamTrackAsFullyRead(latestMessage, msgCount);
      log(`過去ログをベースライン固定: messages=${msgCount} chars=${latestFullLen}`);
    }

    // 起動直後は Stop 誤検知でも読まない。
    // 主要サイトは「送信検知」でのみアーム（会話追加で過去を読むのを防ぐ）
    // Stop だけの誤アームは全サイトで無効化。
    return;
  }

  // ---- 読み上げ開始後 ----
  // 本文伸長をストリーミング継続とみなす（開始後のみ）
  if (latestFullLen > lastAssistantFullLen) {
    lastTextGrowthAt = Date.now();
  } else if (latestFullText && lastAssistantSnapshot &&
             latestFullText !== lastAssistantSnapshot &&
             latestFullText.startsWith(lastAssistantSnapshot.slice(0, Math.min(32, lastAssistantSnapshot.length)))) {
    lastTextGrowthAt = Date.now();
  }
  lastAssistantFullLen = Math.max(lastAssistantFullLen, latestFullLen);

  // 生成中判定（Stop + 粘着）
  let isGenerating = !!site.isGenerating();
  if (lastTextGrowthAt && (Date.now() - lastTextGrowthAt) < STREAM_IDLE_MS) {
    isGenerating = true;
  }

  lastAssistantCount = msgCount;
  lastAssistantSnapshot = latestFullText;

  // 送信前に存在していた件数のメッセージは読まない（過去会話スキップ）
  if (msgCount < armBaselineCount) {
    armBaselineCount = msgCount;
  }

  const cleansedLatest = cleanseText(latestMessage);
  const prevText = streamTrack.lastFullText || '';
  const fp = messageFingerprint(latestMessage, msgCount - 1, msgCount);

  // 送信直後: 新しい返答の到着を待つ
  // ※「本文が違う」だけでは過去返答の再読になるので、原則「件数増」だけを新規とする
  if (awaitingNewResponse) {
    const seed = armSeedText || '';
    const isNewCount = msgCount > armBaselineCount;
    // 初回（seed 空）だけ: 件数0→1 でなくても本文が生えたら開始
    const freshFirst = !seed && armBaselineCount === 0 && cleansedLatest.length > 8;
    // 同一ノードへの追記（稀）: seed の続きだけ許可
    const grewFromSeed = !!(
      seed &&
      cleansedLatest.startsWith(seed) &&
      cleansedLatest.length > seed.length + 2
    );

    if (isNewCount || freshFirst) {
      awaitingNewResponse = false;
      armBaselineCount = Math.max(armBaselineCount, msgCount);
      beginNewResponseTrack(fp);
      log(`新規返答開始を検出 (${isNewCount ? '件数増' : '初回本文'})`);
    } else if (grewFromSeed) {
      awaitingNewResponse = false;
      streamTrack.fingerprint = fp;
      streamTrack.lastFullText = seed;
      streamTrack.spokenLen = seed.length;
      streamTrack.finalized = false;
      spokenNormSet = new Set();
      log('既存返答枠の伸長を検出（seed 以降のみ読む）');
    } else {
      // 古い本文のまま / 再描画の揺らぎ → 読まない
      return;
    }
  } else if (fp !== streamTrack.fingerprint) {
    const looksLikeContinuation =
      prevText &&
      cleansedLatest &&
      (cleansedLatest.startsWith(prevText.slice(0, Math.min(40, prevText.length))) ||
        prevText.startsWith(cleansedLatest.slice(0, Math.min(40, cleansedLatest.length))));

    if (looksLikeContinuation) {
      // 同一返答のラッパ差し替え: fingerprint だけ更新、既読は維持
      streamTrack.fingerprint = fp;
    } else if (msgCount > armBaselineCount) {
      // 新しいアシスタント吹き出しだけ 0 から読む
      beginNewResponseTrack(fp);
      armBaselineCount = msgCount;
      log('新しいアシスタントメッセージを検出。読み上げ位置をリセットしました。');
    } else {
      // 件数同じで fingerprint だけ変化 → 再マウント。既読を壊さない
      streamTrack.fingerprint = fp;
    }
  }

  // ほぼ全サイトを全文オフセット方式に（p タグ単位は語順が壊れやすい）
  const useOffsetMode = (
    SITE === 'x_grok' || SITE === 'grok' || SITE === 'copilot' ||
    SITE === 'gemini' || SITE === 'chatgpt'
  );

  if (useOffsetMode) {
    processMessageByOffset(latestMessage, isGenerating);
    return;
  }

  // ---- フォールバック: ブロック単位追跡 ----
  const pElements = site.getTextBlocks(latestMessage);
  const sentenceCounts = new Map();

  pElements.forEach((p, pIndex) => {
    const isLast = (pIndex === pElements.length - 1);
    if (isLast && isGenerating && p.getAttribute('data-vv-spoken') === 'true') {
      p.removeAttribute('data-vv-spoken');
    }
  });

  pElements.forEach((p, pIndex) => {
    if (p.getAttribute('data-vv-spoken') === 'true') return;

    const isLast = (pIndex === pElements.length - 1);
    const text = cleanseText(p);
    if (!text) return;

    const { complete, rest } = splitCompleteSentences(text);
    let bytesUsed = 0;
    complete.forEach((sentence) => {
      enqueueSentence(sentence, sentenceCounts, '新規確定文を検知 (メモリ)');
      bytesUsed += sentence.length;
    });

    const remainSlice = rest || text.slice(bytesUsed);
    const trimmedRemaining = remainSlice.trim();

    if (trimmedRemaining.length > 0) {
      if (isLast && !isGenerating) {
        enqueueSentence(remainSlice, sentenceCounts, '最終残余分を検知 (メモリ)');
        p.setAttribute('data-vv-spoken', 'true');
      } else if (!isLast) {
        enqueueSentence(remainSlice, sentenceCounts, '段落移動による残余分を検知 (メモリ)');
        p.setAttribute('data-vv-spoken', 'true');
      }
    } else {
      if ((isLast && !isGenerating) || !isLast) {
        p.setAttribute('data-vv-spoken', 'true');
      }
    }
  });
}, CHECK_INTERVAL);

// すべての音声再生を強制停止しキューをクリアする関数（送信・ミュート用）
function stopAllSpeech(reason = '送信検知') {
  log(`【${reason}】音声再生を強制停止し、待機キューをクリアしました。`);
  
  playGeneration += 1;
  speechQueue.length = 0;
  isSpeaking = false;
  currentPlayingText = null;
  sentSentences.clear();
  spokenNormSet = new Set();
  
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

let lastSubmitArmAt = 0;

// ユーザー送信を検知したときの共通処理
function onUserSubmit() {
  const now = Date.now();
  // Enter + 送信ボタンの二重発火でキューが即クリアされるのを防ぐ
  if (now - lastSubmitArmAt < 800) {
    log('送信検知をデバウンス（連続発火を無視）');
    return;
  }
  lastSubmitArmAt = now;

  stopAllSpeech('送信検知');
  markAllExistingAsSpoken();
  sentSentences.clear();
  spokenNormSet = new Set();

  // いま画面にある過去返答はすべて既読。新しい返答の伸びだけ読む
  const messages = site.getAssistantMessages();
  const msgCount = messages ? messages.length : 0;
  const latest = messages && messages.length ? messages[messages.length - 1] : null;
  seedStreamTrackAsFullyRead(latest, msgCount);
  armBaselineCount = msgCount;
  armSeedText = latest ? cleanseText(latest) : '';
  awaitingNewResponse = true;

  hasStartedGenerating = true;
  baselineSettled = true;
  lastTextGrowthAt = 0; // 送信直後の既存文をストリーミング扱いしない
  log(`送信検知: 読み上げアーム (既存 ${msgCount} 件はスキップ, 新返答待ち)`);
}

// ユーザーの入力送信アクションの監視
// 1. Enterキーによる送信 (Shift+Enterは改行のため除外)
document.addEventListener('keydown', (e) => {
  if (site.isComposerTarget(e.target)) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
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

// 3. ChatGPT 等: 送信ボタンが disabled→enabled 変化だけでは拾えないので
//    form の submit も拾う（ページ内の無関係 form は isSendButton 相当で絞れないため
//    composer 近傍のみ）
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!form || !form.closest) return;
  if (SITE === 'chatgpt') {
    // メインのプロンプト付近
    if (form.closest('main') || form.querySelector('#prompt-textarea, [data-testid="composer-footer"]')) {
      onUserSubmit();
    }
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

})(); // end site bootstrap IIFE
} // end if (site)

