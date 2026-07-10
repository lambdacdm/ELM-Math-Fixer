# ELM Math Fixer

ELM Math Fixer is a small Chrome extension that improves KaTeX math rendering on the University of Edinburgh ELM platform.

It is designed to be used together with a short ELM prompt rule that prevents AI-generated display formulas from being split by Markdown before KaTeX can render them.

This project was developed with GPT-5.5, Claude Sonnet 5, and Gemini 3.5 Flash.

<p>
  <a href="#english">English</a> |
  <a href="#中文">中文</a>
</p>

<details open>
<summary id="english"><strong>English</strong></summary>

## What It Fixes

ELM appears to run Markdown parsing before KaTeX rendering. That can break math in two common ways:

- Display formulas may be split across Markdown paragraphs when `$$...$$` contains literal line breaks.
- Subscript underscores such as `x_{ij}` may be interpreted as Markdown emphasis markers and removed before KaTeX sees the formula.

The extension rescues affected math blocks locally in the browser. The prompt below prevents the most common line-break failure at generation time.

It also adds a small prompt picker to the ELM chat page, so you can copy recommended math-formatting prompts without changing your ELM account automatically.

## Install Locally in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `ELM-Math-Fixer` folder.
6. Open or refresh `https://elm.edina.ac.uk/`.

## ELM Prompt

Add this prompt to ELM as a system/custom instruction, or paste it at the beginning of a conversation:

```text
When generating mathematical formulas ($...$ or $$...$$), you must follow these rules, or the formula will fail to render or won't be recognized at all:

[MOST IMPORTANT] Never include a line break or blank line inside a $$...$$ formula. Everything from the opening $$ to the closing $$ must be one continuous, unbroken block of text — no line breaks in between, even for long formulas; keep it all on the same line/paragraph. Otherwise the platform will split the formula partway through and it won't render at all. If you need multi-line display, use an aligned/array/gathered environment with \\ line breaks inside the LaTeX itself — never insert a literal line break at the text level.
```

## Privacy

This extension runs only on `https://elm.edina.ac.uk/`. It does not collect, store, transmit, sell, or share user data. All rendering fixes happen locally in your browser.

</details>

<details>
<summary id="中文"><strong>中文</strong></summary>

## 这个插件解决什么

ELM 平台看起来是先做 Markdown 渲染，再做 KaTeX 公式渲染。这可能导致两类常见问题：

- 如果 `$$...$$` 展示公式内部出现真实换行，公式可能会被 Markdown 拆成多个段落，KaTeX 无法识别完整公式。
- `x_{ij}` 这类下标里的 `_` 可能被 Markdown 当成斜体标记吃掉，导致 KaTeX 看到的公式已经被破坏。

浏览器插件会在本地网页中抢救受影响的数学公式。下面的提示词负责从生成端避免最常见的公式内换行问题。

它也会在 ELM 聊天页面添加一个小型提示词选择器，方便你复制推荐的数学格式提示词；插件不会自动修改你的 ELM 账号设置。

## 在 Chrome 本地安装

1. 下载或克隆这个仓库。
2. 打开 `chrome://extensions`。
3. 打开右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择 `ELM-Math-Fixer` 文件夹。
6. 打开或刷新 `https://elm.edina.ac.uk/`。

## ELM 提示词

把这段加入 ELM 的 system prompt / custom instruction，或者每次对话开始时粘贴：

```text
生成数学公式（$...$ 或 $$...$$）时，必须遵守以下规则，否则公式会渲染失败或完全不被识别：

【最重要】一条 $$...$$ 公式内部绝对不能换行或有空行。从开头 $$ 到结尾 $$ 之间必须是连续的一整段文本，中间不能敲回车——哪怕公式很长也要写在同一行/同一段落里，否则平台会把公式从中间切断，导致完全不渲染。需要分行展示时，用 aligned/array/gathered 环境配合 \\ 处理，不要在文本层面换行。
```

## 隐私

这个插件只在 `https://elm.edina.ac.uk/` 上运行。它不会收集、存储、传输、出售或分享用户数据。所有公式修复都只发生在你的本地浏览器中。

</details>
