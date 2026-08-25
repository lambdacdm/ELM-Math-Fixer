# ELM Math Fixer v1.3.11

## What's New since v1.3.10

### Performance
- **Faster Fixer switch appearance** (v1.3.11): the extension now polls briefly (every 300ms, up to 12s) until ELM renders its composer/container, so the Fixer switch and prompt launcher appear as soon as the page is ready instead of waiting for the SPA's first DOM mutation - on a quiet bootstrap this cuts several seconds of waiting to well under a second.
- **~8x faster KaTeX validation** (v1.3.11): internal formula validation now renders MathML-only output instead of the full HTML tree. Validation results are identical (errors are decided at parse time), but each check is dramatically cheaper - this is the hot path re-run for every growing formula while a long answer streams, and it is multiplied by the per-unknown-command retry loop.
- **No cloning for plain prose** (v1.3.11): text extraction now skips the deep DOM clone for paragraphs without math markers, removing most per-scan allocation on long, mostly-prose messages.
- **UI scan memoization** (v1.3.11): the toolbar/sidebar layout probes (top-bar controls, sidebar labels, chat input rect) are computed once per scan tick instead of 3-5 times, and the ELM accent color is re-sampled at most every 2 seconds.

No repair behavior changed in this release; all fixes from v1.3.10 and earlier are unchanged and covered by the existing regression suite.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.11.zip`.
