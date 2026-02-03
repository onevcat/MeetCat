<p align="center">
  <img src="../resource/logo.png" alt="MeetCat" width="360" />
</p>

<p align="center">
  <strong>不再错过任何一场 Google Meet。</strong><br />
  自动识别日程、倒计时、准时加入。
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf">Chrome 扩展</a>
  ·
  <a href="https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg">下载 macOS（Universal）</a>
  ·
  <a href="../CHANGELOG.md">更新日志</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README_CN.md">简体中文</a> · <a href="README_JP.md">日本語</a> · <a href="README_KO.md">한국어</a>
</p>

> [!NOTE]
> MeetCat 免费、开源、轻量。Windows 正在计划中。

> [!IMPORTANT]
> 隐私优先：不采集数据、不做分析、不做追踪。

---

## 为什么是 MeetCat

MeetCat 让你的 Google Meet 日程更从容可控。它会从 Meet 首页读取下一场会议，显示温和的倒计时，提前打开会议页面，并根据你的设置自动加入。

## 核心亮点

- 自动识别 Meet 首页上的下一场会议。
- 倒计时覆盖层，可随时取消或调整。
- 入会前自动设置麦克风/摄像头默认状态。
- 会议过滤：不想自动加入的会议可提前排除。
- 双平台形态：Chrome 扩展 + macOS 桌面应用。

<p align="center">
  <img src="../resource/icon-color.png" alt="MeetCat Icon" width="120" />
</p>

## 下载

- macOS（Universal）：https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg
- Chrome 扩展：https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf

> [!TIP]
> 建议先打开一次 Google Meet 首页，确认覆盖层出现，即表示日程已被识别。

## 工作方式

1. 打开 Google Meet（浏览器或桌面 App）以识别下一场会议。
2. 到点后开始倒计时。
3. 自动打开会议页面，应用麦克风/摄像头设置并加入。

## 平台

**Chrome 扩展**
- 轻量浏览器体验。
- 首页覆盖层与自动打开会议页面。

**macOS App（Tauri）**
- 桌面常驻体验，菜单栏可见。
- 包含扩展全部功能，并提供更稳定的常驻体验。

## 开发者（快速开始）

```bash
pnpm install
pnpm run dev
```

以上即可本地预览。完整流程见 `RELEASE.md`。

## 许可证

待定。
