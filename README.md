[English](https://github.com/lambdacdm/ELM-Math-Fixer#english) | [中文](https://github.com/lambdacdm/ELM-Math-Fixer#%E4%B8%AD%E6%96%87)

# ELM Math Fixer

<details open>
<summary id="english"><strong>English</strong></summary>

## Overview

ELM Math Fixer is a small Chrome extension that improves KaTeX math rendering on the University of Edinburgh [ELM platform](https://elm.edina.ac.uk/).

The extension is a complete standalone solution for known common rendering failures. The optional prompt is only a partial aid.

Extension version: 1.0.6.

Bundled KaTeX version: [0.17.0](https://github.com/KaTeX/KaTeX). This matches the version currently declared by the upstream `main` source.

This project was developed with GPT-5.6 Sol, Claude Sonnet 5, and Gemini 3.5 Flash.

## What It Fixes

ELM appears to parse Markdown before KaTeX, so formulas can be altered or split before the math renderer sees them. The extension repairs these known failure patterns locally in the browser:

- Reassembles `$$...$$` display formulas split across multiple Markdown paragraphs by literal line breaks.
- Restores an equation's standalone `=` when Markdown consumes it as a Setext heading marker.
- Recovers formula underscores that Markdown converted into emphasis, while preserving genuine emphasis in ordinary prose.
- Renders valid formulas mistakenly wrapped as inline code or left as unrendered text.
- Corrects accidental doubled backslashes before recognized LaTeX commands.
- Removes stray whitespace immediately inside dollar delimiters.

Repairs are applied only when the DOM structure matches a known failure pattern and the reconstructed formula passes KaTeX validation.

It also adds a small prompt picker to the ELM chat page, so you can copy recommended math-formatting prompts without changing your ELM account automatically.

## Install Locally in Chrome

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

ELM Math Fixer 是一个小型 Chrome 扩展，用于改善爱丁堡大学 [ELM 平台](https://elm.edina.ac.uk/)上的 KaTeX 数学公式渲染。

插件可独立完整修复已知的常见渲染问题；提示词仅为可选的辅助方案，只能解决部分问题。

插件版本：1.0.6。

内置 KaTeX 版本：[0.17.0](https://github.com/KaTeX/KaTeX)。该版本与 KaTeX 上游仓库当前 `main` 源码声明的版本一致。

本项目由 GPT-5.6 Sol、Claude Sonnet 5 和 Gemini 3.5 Flash 协助开发。

## 这个插件解决什么

ELM 平台看起来会先解析 Markdown，再交给 KaTeX，因此公式可能在进入数学渲染器之前就被修改或拆散。插件会在浏览器本地修复以下已知问题：

- 重新拼合因真实换行而被 Markdown 拆成多个段落的 `$$...$$` 展示公式。
- 恢复被 Markdown 当作 Setext 标题标记吞掉的独占一行等号 `=`。
- 恢复被 Markdown 误识别为强调格式的公式下划线，同时保留普通正文中的正常强调格式。
- 渲染被误包成行内代码或残留为原始文本的有效公式。
- 修正已知 LaTeX 命令前误生成的双反斜杠。
- 清除美元符号分隔符内侧多余的空格。

插件只在 DOM 结构符合已知错误特征且重建后的公式通过 KaTeX 验证时执行修复。

它也会在 ELM 聊天页面添加一个小型提示词选择器，方便你复制推荐的数学格式提示词；插件不会自动修改你的 ELM 账号设置。

## 在 Chrome 本地安装

1. 下载或克隆这个仓库。
2. 打开 `chrome://extensions`。
3. 打开右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择 `ELM-Math-Fixer` 文件夹。
6. 打开或刷新 `https://elm.edina.ac.uk/`。

## 隐私

这个插件只在 `https://elm.edina.ac.uk/` 上运行。它不会收集、存储、传输、出售或分享用户数据。所有公式修复都只发生在你的本地浏览器中。

</details>
