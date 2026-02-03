<p align="center">
  <img src="../resource/logo.png" alt="MeetCat" width="360" />
</p>

<p align="center">
  <strong>Google Meet를 더 이상 놓치지 마세요.</strong><br />
  일정 자동 인식, 카운트다운, 제때 자동 입장.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf">Chrome 확장</a>
  ·
  <a href="https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg">macOS 다운로드(Universal)</a>
  ·
  <a href="../CHANGELOG.md">변경 로그</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="README_CN.md">简体中文</a> · <a href="README_JP.md">日本語</a> · <a href="README_KO.md">한국어</a>
</p>

> [!NOTE]
> MeetCat은 무료, 오픈소스, 경량입니다. Windows 버전도 준비 중입니다.

> [!IMPORTANT]
> 개인정보 최우선: 데이터 수집 없음, 분석 없음, 추적 없음.

---

## MeetCat 소개

MeetCat은 Google Meet 일정 관리를 조용하고 안정적으로 만듭니다. Meet 홈에서 다음 회의를 읽어오고, 부드러운 카운트다운을 표시하며, 회의 페이지를 미리 열고 설정에 따라 자동으로 입장합니다.

## 핵심 특징

- Meet 홈에서 다음 회의를 자동 감지.
- 입장 전 카운트다운(취소/조정 가능).
- 입장 전에 마이크/카메라 기본 상태 적용.
- 자동 입장을 원치 않는 회의는 필터로 제외.
- 두 가지 형태: Chrome 확장 + macOS 데스크톱 앱.

<p align="center">
  <img src="../resource/icon-color.png" alt="MeetCat Icon" width="120" />
</p>

## 다운로드

- macOS(Universal): https://github.com/onevcat/MeetCat/releases/latest/download/MeetCat_macos_universal.dmg
- Chrome 확장: https://chromewebstore.google.com/detail/ochakcekieihhfoefaokllabgkgbcedf

> [!TIP]
> Google Meet 홈을 한 번 열어 오버레이가 보이면 일정이 정상적으로 감지된 것입니다.

## 동작 방식

1. Google Meet(브라우저/앱)를 열어 다음 회의를 감지합니다.
2. 시간이 되면 카운트다운이 시작됩니다.
3. 회의 페이지를 열고 마이크/카메라 설정을 적용한 뒤 자동 입장합니다.

## 플랫폼

**Chrome 확장**
- 가벼운 브라우저 경험.
- 홈 오버레이와 회의 페이지 자동 오픈.

**macOS 앱(Tauri)**
- 메뉴 막대 상주.
- 확장 기능에 더해 항상 켜둘 수 있는 데스크톱 경험.

## 개발자용(빠른 시작)

```bash
pnpm install
pnpm run dev
```

이것만으로 로컬에서 실행됩니다. 자세한 내용은 `RELEASE.md`를 확인하세요.

## 라이선스

미정.
