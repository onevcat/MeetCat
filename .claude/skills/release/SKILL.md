---
name: release
description: 自动化 MeetCat 完整发布流程：版本号确定、changelog 生成、extension 打包、Tauri app 发布。当用户提到发布新版本、准备 release、bump version、更新 changelog 时触发此 skill。即使用户只是简单地说"发布"或"release"，也应该使用此 skill。
---

# MeetCat Release

执行 MeetCat 全量发布（Tauri 桌面端 + Chrome 扩展）。流程分五个阶段，按顺序执行。

## 前置检查

开始前确认：
- 当前目录是 MeetCat 项目根目录
- 工作区干净或仅有发布相关文件的改动（版本文件、CHANGELOG）
- `gh` CLI 已登录（`gh auth status`）

如果有未提交的非发布相关改动，提醒用户先处理。

## Phase 1: 确定版本号

1. 读取 root `package.json` 中的当前版本
2. 找到最新的 git tag 确认上次发布版本
3. 列出自上次 tag 以来的所有 commits：`git log <last-tag>..HEAD --oneline`
4. 根据变更内容建议版本号（遵循 semver）：
   - **patch**（x.y.Z）：仅 bug 修复
   - **minor**（x.Y.0）：新功能，向后兼容
   - **major**（X.0.0）：破坏性变更
5. 将建议版本号和 commit 摘要呈现给用户确认
6. 用户确认后：
   - 如果 package.json 中的版本已经是目标版本，跳过此步
   - 否则执行 `pnpm run version:set <version>`

## Phase 2: 更新 Changelog

1. 读取当前 `CHANGELOG.md`
2. 分析自上次 release tag 以来的所有 commits
3. 按 [Keep a Changelog](https://keepachangelog.com/) 格式分类：
   - **Added**：新功能
   - **Changed**：已有功能的变更
   - **Fixed**：bug 修复
   - **Deprecated** / **Removed** / **Security**：按需使用
4. 在版本标题下写一行总结，概括本次发布的主题
5. 每条 bullet 以过去式动词开头（Added…、Fixed…、Changed…）
6. 内容面向用户视角，不写实现细节
7. 跨 Tauri 和 extension 的变更要说明涉及的平台

**格式要求：**
- 版本标题不写日期，使用 `## [VERSION]` 格式（release 脚本会自动补上日期）
- 新版本条目插入在 `## [Unreleased]` 之后

将 changelog 草稿呈现给用户审阅。用户确认后写入 `CHANGELOG.md`。

**重要：不要 git commit。** `release:app` 脚本会自动提交所有发布相关文件。

## Phase 3: 打包 Extension

执行：
```bash
pnpm run release:extension
```

这会构建扩展并生成 `release/meetcat-extension-<VERSION>.zip`。确认 zip 文件已成功创建。

## Phase 4: 发布 App

这一步需要交互式输入密码（updater 签名密钥密码、Apple 公证凭据），无法自动执行。

**告诉用户自行在终端中运行：**
```bash
pnpm run release:app
```

并说明此命令会：
- 自动提交版本文件和 CHANGELOG（commit message: `chore(release): prepare <VERSION>`）
- 给 CHANGELOG 盖上当天日期
- 构建并公证 macOS app
- 创建 git tag
- 推送并创建 GitHub Release（附带所有构建产物）

等用户报告完成后再进入下一阶段。

## Phase 5: 验证与收尾

用户确认 `release:app` 完成后：

1. 验证 tag：`git tag --sort=-v:refname | head -3`
2. 验证 GitHub Release：`gh release view <version>`
3. 汇报发布结果：
   - GitHub Release URL
   - Extension zip 路径（`release/meetcat-extension-<VERSION>.zip`）
4. 提醒用户手动上传 extension zip 到 Chrome Web Store

## 部分发布

如果用户只想发布其中一个平台：

- **仅 extension**：跳过 Phase 4，只执行 Phase 1-3 + Phase 5 中的 extension 部分
- **仅 app**：跳过 Phase 3，Phase 4-5 正常执行
- **仅更新 changelog**：只执行 Phase 1-2
