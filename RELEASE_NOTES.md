# ELM Math Fixer v1.3.13

## What's New since v1.3.12

### Fixes
- **Toggle no longer jumps the page** (v1.3.13): toggling the Fixer switch off/on now preserves the viewport position. Before the transition, the extension pins the viewport to the nearest visible paragraph (a content anchor); after the repair/restore completes, it re-aligns every scrollable container so the same paragraph stays where it was. This works across nested scroll containers and both directions (raw↔rendered), eliminating the accumulated drift that grew with page length.
- **Toggle completes without intermediate flicker** (v1.3.13): the restore path now runs all phases synchronously in one task followed by a single scroll-restore frame, instead of spreading layout changes across 4 animation frames.
- **Fixer label now matches ELM's native font** (v1.3.13): the `Fixer` switch label copies `fontFamily` / `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing` from the leftmost native top-bar control (e.g. `Request an ELM API Key`), so the typography is visually identical.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.13.zip`.
