# ELM Math Fixer v1.3.3

## What's New since v1.3.2

### Fixes
- **Markdown-eaten display math in the full ELM message structure** (v1.3.3): when Markdown swallows a `$$...$$` formula, the Setext chain is now walked correctly across the whole message (not just until the first closing delimiter), so `[...\n...]`-style split display formulas regain their delimiters and render. The chain walk stops at the first `]`-terminated node so later prose paragraphs are never overrun, and backslashes eaten before `\left{`/`\right}` (and similar) are restored.
- **Literal braces and escaped spaces in eaten-bracket math** (v1.3.3): eaten formulas such as `(\lambda \in K \setminus \{0,1\}: \mathbb Z_p^\times)` get their `\{ \}` braces and `\;` space commands rebuilt, and the brace restoration is hardened against false positives: braced arguments of `\begin`/`\end` environments, `\underbrace`/`\overbrace`, spacing and phantom commands, and macro declarations (`\newcommand`, `\genfrac`) stay real TeX groups instead of being rewritten as literal braces.
- **Markdown-eaten inline math delimiters inside prose** (v1.3.3): bare balanced parens whose bodies are pure-TeX formulas (e.g. `(\lambda_a = -4\zeta_{2^n}^{,a})`) are re-wrapped with `\(...\)` and rendered — but only when every paren pair in the paragraph is balanced, the body has a math marker and no CJK, and the whole paragraph passes KaTeX validation; otherwise the paragraph stays untouched. Regular inline rendering and the new eaten-inline repair share one finalization path with safe rollback.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.3.zip`.