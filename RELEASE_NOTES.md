# ELM Math Fixer v1.4

## Summary of changes since v1.3

v1.4 is a consolidation release: it rolls up all fixes and improvements from the v1.3.1–v1.3.13 patch series with no additional changes.

### Math rendering repairs
- Rebuilds display math (`$$…$$`) split across paragraphs/headings, including standalone `=`/`-` consumed as Setext markers and damaged subscripts.
- Repairs emphasis-damaged math: `_…_` eaten into `<em>`, including groups spanning a display/inline boundary and `\operatorname{…}_{…}` with a swallowed closing brace.
- Repairs `<br>`-split formulas inside a single paragraph (e.g. blockquote `$$<br>…<br>$$`).
- Repairs mispaired native inline math and doubled escaped set braces in native KaTeX.
- Restores eaten `\[ … \]` / `\( … \)` delimiters and bare-paren inline math.
- Guards: rejects empty rendered displays; idempotency guard stops repair/restore ping-pong (no more flicker or selection loss).

### Performance
- Fixer switch appears as soon as ELM renders (startup polling instead of waiting for the SPA's first mutation).
- ~8x faster KaTeX validation (MathML-only output); no DOM cloning for prose; per-tick UI layout memoization; throttled accent-color sampling.

### UI
- Viewport position is preserved when toggling the Fixer switch off/on (content-anchored, works with nested scroll containers).
- Fixer switch label typography now matches ELM's native top-bar controls.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.4.zip`.
