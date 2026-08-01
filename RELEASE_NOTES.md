# ELM Math Fixer v1.2.4

This release unifies the double-backslash repair between the math environment and LaTeX code blocks, and fixes a KaTeX validation bug that rejected doubled delimiters.

## What's New since v1.2.3

### Fixes
- **Doubled backslashes in `language-latex` code blocks**: LaTeX code blocks (`<code class="language-latex">`, `<code class="language-tex">`) now display correctly when ELM doubles every backslash (`\\[`, `\\frac`, `\\zeta`, ...). Whole-block unwrapping handles environments like `\begin{aligned}` (including `\\` line breaks), and per-segment handling fixes mixed blocks that contain both doubled and correct single-backslash formulas (e.g. `\\[\frac{\zeta_8^i-1}{\zeta_8^j-1},\qquad 1\leq i\ne j<8,\\]`). Delimiter-only formulas like `\\[24+42+3=69\\]` are unwrapped via a numeric-only fallback. Content is kept as code (not rendered as math). Normal code blocks, `language-text` blocks, and genuine single-layer LaTeX are never modified.
- **Unified repair strategy**: The math environment and LaTeX code blocks now share one backslash-normalization entry point (`normalizeEscapedLatexText`). Doubled delimiters inside the math environment (`\\[...\\]`, `\\(...\\))` are repaired the same way as in code blocks, while whitespace normalization, gating, and KaTeX rendering stay math-environment-only.
- **Validation fix**: The escaped-layer validator no longer feeds `\[`/`\]` delimiters to KaTeX (which rejects them as undefined control sequences); it validates the body only.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.4.zip`.
