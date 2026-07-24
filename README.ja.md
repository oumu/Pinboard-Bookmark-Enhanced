# Pinboard Bookmark Enhanced

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [繁體中文（香港）](README.zh-HK.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | **日本語** | [Polski](README.pl.md) | [Русский](README.ru.md)

[Pinboard](https://pinboard.in) のための Chrome 拡張機能。AI タグと要約、翻訳・ハイライト付きの内蔵リーダー、そして pinboard.in 用テーマ 13 種を備えています。

> **注意:** Pinboard.in アカウントが必要です。[Pinboard](https://pinboard.in)（pinboard.in）は独立した**有料**のブックマークサービスです。本拡張機能は、ご自身の Pinboard API token を使って既存の Pinboard アカウントに接続するサードパーティ製クライアントであり、Pinboard との提携・出資・公式の承認は一切ありません。本拡張機能を利用するには、有料の Pinboard.in アカウントを既にお持ちであるか、新たに登録する必要があります。

[![Chrome](https://img.shields.io/badge/Chrome-MV3-brightgreen?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/github/v/release/pine2D/Pinboard-Bookmark-Enhanced?label=version)](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

![Popup demo](docs/screenshots/demo-popup.png)

---

## 機能

### 保存
- **ワンクリック保存**：タイトル・説明・選択テキストを自動入力し、URL からトラッキングパラメーターを除去します
- **ショートカットで直接保存**：ポップアップを開かずに保存でき、開いているタブの一括保存にも対応します
- **オフラインでも保存**：いったんローカルキューに入り、再接続後に自動で再試行します

![ワンクリック保存、AI タグと要約](docs/cws-assets/originals/screenshot-1-save.png)

### タグ
- **AI タグ・要約**：広告・メニュー・サイドバーを除いた記事本文だけを読み取ります。自前の API キーで 13 のプロバイダー、または任意の OpenAI 互換エンドポイントに対応
- **タグ補完**：自分のタグ、Pinboard のおすすめタグ、ワンタップのプリセットから入力できます
- **タグ整理**：重複タグや使用回数の少ないタグを洗い出し、バッチ処理でまとめて統合します

### リーダー
- **どんなページもすっきりしたリーダーに**：Markdown 表示で、目次・記事内検索・脚注ののぞき見表示付き
- **5色のハイライトとメモ**：再描画・翻訳・ページ内容の変化をまたいでも、どちらも保持されます
- **ページ全体の翻訳と、ページへの質問**：対訳表示に対応。回答には出典への引用が付き、クリックで該当箇所へジャンプします
- **読みながら単語を調べて復習**：オンライン辞書または必要に応じて追加できる CC-CEDICT オフライン中英辞書を使い、単語帳に保存した語を検索・並べ替え・グループ分けできます。現在の Pinboard アカウントの全項目をエクスポートまたは Anki に送信し、対応する単語は Eudic に送信できます
- **送信もダウンロードも**：[Obsidian](https://obsidian.md)・GitHub Gist・任意の webhook へ送信でき、`.md`・`.html`・`.epub` としてダウンロードして電子書籍リーダーでも読めます

![リーダー：対訳表示とハイライト](docs/cws-assets/originals/screenshot-2-reader.png)

![ページへの質問、回答には出典引用付き](docs/cws-assets/originals/screenshot-3-ask.png)

### カスタマイズ
- **pinboard.in 用テーマ 13 種**（Dracula、Nord、Catppuccin、Solarized など）+ 独自のカスタム CSS
- **[Wayback Machine](https://web.archive.org) へ自動アーカイブ**：保存のたびに自動送信するよう選べます。元のページが消えても、あとから参照できます
- **バックアップと同期**：有効にしたデバイス間では Chrome Sync で設定を共有できます。認証情報の共有には別の有効化が必要です。手動の JSON バックアップには設定が含まれ、ハイライト、メモ、現在の Pinboard アカウントの単語帳も選択して含められます。Google Drive によるその単語帳の同期は実装済みですが、OAuth の有効化が完了するまでは利用できません。
- **9 言語対応** · カスタマイズ可能なショートカット · ローカルファースト保存 · トラッキング一切なし

![pinboard.in 用テーマ 13 種](docs/cws-assets/originals/screenshot-4-themes.png)

## インストール

**[→ Chrome ウェブストアからインストール](https://chromewebstore.google.com/detail/pinboard-bookmark-enhance/pnjndmjhljjbdlbejeenkepdalokfooh)**（推奨）

またはリリース ZIP からアンパック読み込み:
1. 最新の [リリース ZIP](https://github.com/pine2D/Pinboard-Bookmark-Enhanced/releases/latest) をダウンロード
2. 解凍
3. `chrome://extensions/` → **デベロッパーモード** を有効化 → **パッケージ化されていない拡張機能を読み込む** → 解凍したフォルダを選択

リリース ZIP は Chrome ウェブストア版と同じ拡張機能 ID を使用します。各デバイスで設定の同期を有効にすると、Chrome Sync で設定を共有できます。2 つのバージョンを同じ Chrome プロフィールに共存させることはできません。以前のリリース ZIP から移行する場合は、先に設定をエクスポートし、新しいリリースを読み込んでからバックアップをインポートしてください。

インストール後: ツールバーのアイコンをクリック → [Pinboard API トークン](https://pinboard.in/settings/password) を貼り付け → 保存

## プライバシー

トラッキング、解析、テレメトリは一切ありません。新規ユーザーでは、設定と認証情報は既定でこのデバイスに保存されます。通常の設定同期はデバイスごとに個別に有効化します。認証情報の同期は Chrome アカウント全体のひとつの選択ですが、設定同期を有効にしたデバイスだけが参加し、それ以外のデバイスはローカルの認証情報を使い続けます。新規ユーザーでは認証情報の同期は既定で無効です。アップグレード時に Chrome Sync に空でない認証情報がすでに存在する場合は、データ損失を避けるため有効のまま維持されます。有効にすると、API キー、トークン、パスワード、エクスポート先の認証情報が Chrome Sync 経由で共有されますが、難読化されるだけで暗号化はされません。保存済みブックマーク、ページ内容、オフラインキューは Chrome Sync には入りません。AI リクエストは、AI タグ・要約、ページへの質問、翻訳、選択範囲の解説、オプトインの要点スキムといった、有効にした、または呼び出した機能を通じて**のみ**発生し、設定したプロバイダーに直接送信されます。インストール時に許可されるのは Pinboard へのアクセスだけです。AI、Jina、Batch で選択したサイト、および任意のエクスポート・アーカイブ先は、対応する操作を行うときに、その正確なサイトへの権限だけを要求します。カスタムのネットワークエンドポイントには HTTPS が必要で、HTTP は `localhost`、`127.0.0.1`、`[::1]` に限り許可されます。拡張機能の各ページは厳格な Content-Security-Policy（リモートコードを禁止）を適用しています。詳細ポリシー: <https://pine2d.github.io/Pinboard-Bookmark-Enhanced/privacy.html>

## ライセンス

MIT。[LICENSE](LICENSE) を参照。
