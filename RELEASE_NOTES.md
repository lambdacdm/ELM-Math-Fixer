# ELM Math Fixer v1.2

This release rolls up all of the v1.1.x maintenance and quality improvements into a single minor-version bump, and supersedes the previous v1.1.x line.

## What's New since v1.1

### Fixes
- **Container selector & emphasis markers**: Fixed the container selector that missed some ELM output structures, and corrected emphasis-marker (`*`/`**`/plain) candidate handling in `getMathAwareClone` so Markdown emphasis adjacent to math no longer breaks rescue. Also added fallback through all candidate markers before falling back to underscore, and support for unbalanced `$` in `getMathAwareClone` when `assumeMath=true`.
- **Z-index button overlap**: Fixed the prompt-picker button overlapping other ELM UI elements (z-index handling) introduced in v1.1.1.
- **Scan timing**: Wrapped the post-mutation rescan in a short debounce (`setTimeout 100ms`) to avoid running scans on mid-flux DOM, reducing flicker and redundant work.
- **Restore pipeline**: Reworked `restoreAllRescuedMath` into a token-based, three-phase pipeline (local chain/native brace repair → hidden-original unwrap → rescued code/text/boundary-space) so restores are resilient to re-entrance and partial DOM changes.

### Performance
- **Validation cache**: Added a WeakMap cache for `getMathAwareText(assumeMath=true)` and a cache for repeated KaTeX validation results, avoiding redundant `cloneNode(true)` and render calls within a single scan pass.
- **Text cache invalidation**: Invalidate the text cache after `restoreSingleLineElement` DOM changes so subsequent scans see fresh content.

### Coverage
- Added `td`, `th` to `TARGET_ELEMENTS` so table-cell formulas are scanned and repaired.
- Unwrap single-child `UL`/`OL` wrappers in split-math merge so list-wrapped math restores cleanly.
- Added `hasMath` guard in math-repair entry so non-math text nodes short-circuit early.

### Documentation & Packaging
- Renamed "Install Locally in Chrome" to "How to Use", with both **Chrome Web Store** (stable) and **local install** (latest) options, mirrored in the Chinese section.
- Replaced the specific LLM attribution with a generic "developed with the assistance of multiple large language models" note.
- Fixed stale Chinese version string in README (1.1.4 → 1.1.5).
- Added a GitHub Actions release workflow (`release.yml`) that builds the zip from source and publishes the GitHub Release on tag push.
- Bumped `softprops/action-gh-release` to `v2.2.1` for Node 24 compatibility.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.zip`.
