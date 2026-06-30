// background.js からの音声再生命令を待機
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen' && message.action === 'play') {
    playAudio(message.base64Wav, message.gapTime)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // 非同期応答を有効化
  }
});

// HTML5 Audioを使った音声再生 (拡張機能の特権コンテキストなので自動再生ポリシー制限を受けない)
function playAudio(base64Wav, gapTime) {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio("data:audio/wav;base64," + base64Wav);
      
      audio.play().catch(err => {
        reject(new Error(`Offscreen playback block: ${err.message}`));
      });

      audio.onended = () => {
        // 段落間のウェイトをここで処理してから解決
        setTimeout(() => {
          resolve();
        }, gapTime);
      };

      audio.onerror = (e) => {
        reject(new Error('Audio loading/playback error'));
      };
    } catch (err) {
      reject(err);
    }
  });
}
