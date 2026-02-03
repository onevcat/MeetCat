<p align="center">
  <img src="../resource/logo.png" alt="MeetCat" width="360" />
</p>

<p align="center">
  <strong>Google Meet をもう逃さない。</strong><br />
  スケジュール検出、カウントダウン、時間通りに参加。
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf">Chrome 拡張</a>
  ·
  <a href="https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg">macOS ダウンロード（Universal）</a>
  ·
  <a href="../CHANGELOG.md">更新履歴</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README_CN.md">简体中文</a> · <a href="README_JP.md">日本語</a> · <a href="README_KO.md">한국어</a>
</p>

> [!NOTE]
> MeetCat は無料・オープンソース・軽量です。Windows 版も準備中。

> [!IMPORTANT]
> プライバシー最優先：データ収集なし、解析なし、トラッキングなし。

---

## MeetCat とは

MeetCat は Google Meet の予定管理を静かに整えます。Meet ホームから次の会議を読み取り、やさしいカウントダウンを表示し、会議ページを早めに開いて設定に沿って自動参加します。

## ハイライト

- Meet ホームで次の会議を自動検出。
- 参加前カウントダウン（キャンセル/調整可能）。
- 参加前にマイク/カメラの既定状態を適用。
- 参加したくない会議はフィルタで除外。
- 2 つの形態：Chrome 拡張 + macOS デスクトップアプリ。

<p align="center">
  <img src="../resource/icon-color.png" alt="MeetCat Icon" width="120" />
</p>

## ダウンロード

- macOS（Universal）：https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg
- Chrome 拡張：https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf

> [!TIP]
> まず Google Meet ホームを一度開き、オーバーレイが表示されるか確認すると安心です。

## 仕組み

1. Google Meet（ブラウザ/アプリ）を開き、次の会議を検出。
2. 時間になるとカウントダウン開始。
3. 会議ページを開き、マイク/カメラ設定を適用して自動参加。

## プラットフォーム

**Chrome 拡張**
- 軽量なブラウザ体験。
- ホームのオーバーレイと会議ページ自動オープン。

**macOS アプリ（Tauri）**
- メニューバー常駐。
- 拡張と同じ機能に加えて、常に起動できる体験。

## 開発者向け（クイックスタート）

```bash
pnpm install
pnpm run dev
```

これだけでローカル起動できます。詳細は `RELEASE.md` を参照してください。

## ライセンス

未定。
