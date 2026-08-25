# ELM Math Fixer v1.3.10

## What's New since v1.3.9

### Bug fixes
- **Math rendering: flush and spanning emphasis** (v1.3.10): `getMathAwareClone` now treats `$<em>x</em>$`-style flush boundaries as math (previously required strict interior), restoring `pmatrix` cell subscripts that were left as `<em>`.
- **Math rendering: display↔inline and display↔prose spanning** (v1.3.10): an `<em>` that starts inside a display `$$...$$` body and ends in prose (or vice versa, e.g. `per<em>{p,v}(b_i)=0\n$$\nwas found with </em>`) is now detected via body-range analysis with asymmetric `_` markers and a dry-run `isSafeMixedTextMath` gate. The fallback underscore path now applies only to fully-contained ems, so prose is never polluted. This fixes `per_{p,v}` and `\|c\|_{\infty}`-style subscripts that span a math delimiter.
- **Math rendering: brace recovery for `\operatorname`** (v1.3.10): when Markdown eats the closing `}` of `\operatorname{per}_{p,v}` together with the `_` pair, the spanning trial now retries with `}_{p,v}` (inserting the missing `}`) so `isSafeMixedTextMath` validates and the display `$$\sum_i c_i\operatorname{per}_{p,v}(b_i)=0$$` renders.
- **Math rendering: `<br>`-split display** (v1.3.10): `cleanMathClone` converts every `<br>` to `\n` before delimiter pairing, so `$$<br>\operatorname{per}_{p,v}…<br>$$` inside a `<blockquote><p>` (e.g. the user's blockquote) is now recognised as a single `$$...$$` display and rendered.
- **Math rendering: empty display guard** (v1.3.10): `hasAcceptableMathResult` now rejects a `.katex` result whose `annotation` is empty/whitespace, preventing a stray `$$` split across nodes from being committed as an empty display.
- **Math rendering: idempotency guard** (v1.3.10): `processContainer` now compares `normalizeMathDelimiterWhitespace(flattenSplitInlineMath(rawText))` against `cleanedText`, so a `<br>`-inside-math display no longer ping-pongs between `rawText` (per-node trim) and `cleanedText` (whole-string trim) every 180ms — fixing the observed selection-clearing / Elements-panel flashing.

### Tests
- Added `td-flush-em`, `crossing-display-inline` (`x_{p,v}`/`a_{K,S}`), `crossing-real-operator` (`\operatorname{per}_{p,v}`), `br-display` (blockquote `$$<br>…<br>$$`), `br-prose` (prose `<br>` + inline `$x$`), and `spanning-display-prose` / `spanning-local-chain` (display→prose spanning + local-chain) fixtures. Empty-display and stability (700ms) assertions added.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.10.zip`.
