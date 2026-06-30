let currentAudio = null;
let resolveCurrentPlay = null;
let playTimeoutId = null;

// background.js からの音声再生命令を待機
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') {
    if (message.action === 'play') {
      playAudio(message.base64Wav, message.gapTime)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(err => {
          sendResponse({ success: false, error: err.message });
        });
      return true; // 非同期応答を有効化
    }
    
    if (message.action === 'stop') {
      stopAudio();
      sendResponse({ success: true });
      return false;
    }
  }
});

// 音声再生の強制停止
function stopAudio() {
  if (playTimeoutId) {
    clearTimeout(playTimeoutId);
    playTimeoutId = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = ''; // リソースの解放
    } catch (e) {
      console.error('Error stopping audio:', e);
    }
    currentAudio = null;
  }
  if (resolveCurrentPlay) {
    resolveCurrentPlay(); // 待機中のPromiseを強制終了させて次のキュー制御に進める
    resolveCurrentPlay = null;
  }
}

// HTML5 Audioを使った音声再生 (自動再生ポリシー制限を受けない特権コンテキスト)
function playAudio(base64Wav, gapTime) {
  // すでに再生中のものがあれば停止する
  stopAudio();

  return new Promise((resolve, reject) => {
    try {
      resolveCurrentPlay = resolve;
      currentAudio = new Audio("data:audio/wav;base64," + base64Wav);
      
      currentAudio.play().catch(err => {
        // 強制停止による中断（AbortError）の場合はエラーにせず正常終了とする
        if (err.name !== 'AbortError') {
          currentAudio = null;
          resolveCurrentPlay = null;
          reject(new Error(`Offscreen playback block: ${err.message}`));
        } else {
          resolve();
        }
      });

      currentAudio.onended = () => {
        currentAudio = null;
        resolveCurrentPlay = null;
        // 段落間のウェイトをここで処理してから解決
        playTimeoutId = setTimeout(() => {
          playTimeoutId = null;
          resolve();
        }, gapTime);
      };

      currentAudio.onerror = (e) => {
        currentAudio = null;
        resolveCurrentPlay = null;
        reject(new Error('Audio loading/playback error'));
      };
    } catch (err) {
      currentAudio = null;
      resolveCurrentPlay = null;
      reject(err);
    }
  });
}
