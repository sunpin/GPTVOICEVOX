# AI VOICEVOX Talker

ChatGPT / Grok / Gemini / Copilot / X Grok の会話を VOICEVOX または COEIROINK で自動読み上げするブラウザ拡張です。

## 対応サイト

- [ChatGPT](https://chatgpt.com/)
- [Grok](https://grok.com/)
- [Gemini](https://gemini.google.com/)
- [Microsoft Copilot](https://copilot.microsoft.com/)（`copilot.cloud.microsoft` / Bing Chat / Microsoft 365 Chat 含む）
- [X.com の Grok](https://x.com/i/grok)

## インストール

1. 適当な場所に `code` フォルダを置く
2. ブラウザの拡張機能の管理から、開発者モードを ON にする（Edge なら左下にスイッチがあるはず）
3. 「展開して読み込み」から `code` フォルダを指定する

## 使い方

1. VOICEVOX（既定: `http://localhost:50021`）または COEIROINK（既定: `http://localhost:50032`）を起動する
2. 対応サイトを開く
3. AI の返答が始まったら、句読点単位で自動読み上げする

画面の「音声設定」パネルでエンジン・話者・速度・段落間ウェイトを変更できます。

### パネル位置

| サイト | 位置 |
| --- | --- |
| ChatGPT / grok.com | 右上（やや下） |
| Gemini / Copilot | 右上アイコン帯を避けてさらに下 |
| X.com Grok | 右下（タイムライン UI を避ける） |

## 注意

- サイトの DOM 変更で読み上げが止まることがあります。その場合はセレクタ側の更新が必要です
- 拡張をリロードしたら、対象タブもリロードしてください
- 過去ログは読み上げず、送信後に新しく生成された返答だけを対象にします
- X.com は **Grok チャットが表示されているときだけ** 音声設定パネルと監視が有効です（タイムライン等ではパネルを消します）

### Copilot で「サイトのデータを読み取れない／変更できない」と出る場合

**Microsoft Edge では仕様です。** `copilot.microsoft.com` や `edgeservices.bing.com` は保護ページ扱いになっており、拡張機能の content script がブラウザ側でブロックされます。拡張側の設定では解除できません。

| 環境 | 可否 |
| --- | --- |
| **Chrome** で `https://copilot.microsoft.com` | 動く想定 |
| **Chrome** で `https://m365.cloud.microsoft/chat` | 動く想定 |
| **Edge** で `copilot.microsoft.com` / Edge サイドバー Copilot | **不可**（ブラウザ制限） |
| **Edge** で `https://m365.cloud.microsoft/chat` | 試す価値あり（制限対象外のことがある） |

**おすすめ**

1. Copilot だけ **Chrome** で使う  
2. または Edge なら **[Microsoft 365 Chat](https://m365.cloud.microsoft/chat)** を開く  
3. 拡張の「サイトへのアクセス」が「クリック時」になっている場合は、対象サイトを許可する（Chrome の場合）
