# ELM Math Fixer v1.2.5

This release fixes math that stays unrendered when ELM streams a message in chunks, and hardens the incremental scanner so no late-arriving math is left behind.

## What's New since v1.2.4

### Fixes
- **Streaming text split across adjacent text nodes**: ELM can stream a paragraph in several text chunks, sometimes splitting a formula in half (e.g. `$S` and `$ 对维数的影响。` as two neighbouring text nodes). The mixed-text rescuer now merges adjacent text nodes and validates the combined text, so split formulas are rendered instead of staying as literal `$`.
- **Settled re-scan of affected containers**: after an incremental repair batch, the containers involved are re-scanned 700 ms later, so math arriving just after a scan window is picked up without re-scanning the whole page.
- **No lost mutations between disconnect and reconnect**: pending observer records are replayed before every scan and settle pass, so mutations that occur while the observer is detached are never dropped.
- **README**: removed the note that the bundled KaTeX version matches the upstream `main` source (it no longer does).

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.5.zip`.
