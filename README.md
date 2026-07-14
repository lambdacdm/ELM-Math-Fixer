[English](https://github.com/lambdacdm/ELM-Math-Fixer#english) | [中文](https://github.com/lambdacdm/ELM-Math-Fixer#%E4%B8%AD%E6%96%87)

# ELM Math Fixer

<details open>
<summary id="english"><strong>English</strong></summary>

## Overview

ELM Math Fixer is a small Chrome extension that improves KaTeX math rendering on the University of Edinburgh [ELM platform](https://elm.edina.ac.uk/). It is available on the [Chrome Web Store](https://chromewebstore.google.com/detail/elm-math-fixer/llkakngbkhmnfopiidofpnfacmiboddd).

For best results, use the included Math Rendering Fix prompt alongside the extension, although it is not required.

Extension version: 1.1.2.

Bundled KaTeX version: [0.17.0](https://github.com/KaTeX/KaTeX). This matches the version currently declared by the upstream `main` source.

This project was developed with GPT-5.6 Sol, Claude Sonnet 5, Gemini 3.5 Flash, and Mimo v2.5.

## What It Fixes

ELM appears to parse Markdown before KaTeX, so formulas can be altered or split before the math renderer sees them. The extension repairs these known failure patterns locally in the browser:

- Rebuilds `$$...$$` display math split by Markdown, including swallowed `=` signs and damaged subscripts.
- Repairs shifted `$...$` boundaries that render prose as math or leave formulas unrendered.
- Renders valid formulas left as plain text or inline code while preserving nearby formatting and spacing.
- Corrects accidental doubled backslashes before LaTeX commands and paired set braces.

Repairs run only when the DOM matches a known failure pattern. Each repair uses pattern-specific structural checks and, where appropriate, KaTeX validation.

It also adds a small prompt picker to the ELM chat page, so you can copy recommended math-formatting prompts without changing your ELM account automatically.

## How to Use

**Chrome Web Store (stable):** Install the extension directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/elm-math-fixer/llkakngbkhmnfopiidofpnfacmiboddd).

**Install locally (latest version):**

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `ELM-Math-Fixer` folder.
6. Open or refresh `https://elm.edina.ac.uk/`.

## Privacy

This extension runs only on `https://elm.edina.ac.uk/`. It does not collect, store, transmit, sell, or share user data. All rendering fixes happen locally in your browser.

</details>

<details open>
<summary id="中文"><strong>中文</strong></summary>

## 简介

ELM Math Fixer 是一个小型 Chrome 扩展，用于改善爱丁堡大学 [ELM 平台](https://elm.edina.ac.uk/)上的 KaTeX 数学公式渲染。本扩展可在 [Chrome 应用商店](https://chromewebstore.google.com/detail/elm-math-fixer/llkakngbkhmnfopiidofpnfacmiboddd) 安装。

为获得最佳效果，建议将插件与内置的 Math Rendering Fix 提示词配合使用，但这不是必需的。

插件版本：1.1.2。

内置 KaTeX 版本：[0.17.0](https://github.com/KaTeX/KaTeX)。该版本与 KaTeX 上游仓库当前 `main` 源码声明的版本一致。

本项目由 GPT-5.6 Sol、Claude Sonnet 5、Gemini 3.5 Flash 和 Mimo v2.5 协助开发。

## 这个插件解决什么

ELM 平台看起来会先解析 Markdown，再交给 KaTeX，因此公式可能在进入数学渲染器之前就被修改或拆散。插件会在浏览器本地修复以下已知问题：

- 重建被 Markdown 拆散的 `$$...$$` 展示公式，包括被吞掉的等号和损坏的下标。
- 修复错位的 `$...$` 边界，避免正文被渲染成公式或公式残留为原始文本。
- 渲染残留为普通文本或行内代码的有效公式，同时保留附近的格式和间距。
- 修正 LaTeX 命令和成对集合花括号前误生成的双反斜杠。

插件只在 DOM 符合已知错误特征时执行修复。每类修复都有对应的结构检查，并在适用时使用 KaTeX 校验。

它也会在 ELM 聊天页面添加一个小型提示词选择器，方便你复制推荐的数学格式提示词；插件不会自动修改你的 ELM 账号设置。

## 如何使用

**Chrome 应用商店（稳定版）：** 直接从 [Chrome 应用商店](https://chromewebstore.google.com/detail/elm-math-fixer/llkakngbkhmnfopiidofpnfacmiboddd) 安装。

**本地安装（最新版本）：**

1. 下载或克隆这个仓库。
2. 打开 `chrome://extensions`。
3. 打开右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择 `ELM-Math-Fixer` 文件夹。
6. 打开或刷新 `https://elm.edina.ac.uk/`。

## 隐私

这个插件只在 `https://elm.edina.ac.uk/` 上运行。它不会收集、存储、传输、出售或分享用户数据。所有公式修复都只发生在你的本地浏览器中。

</details>
