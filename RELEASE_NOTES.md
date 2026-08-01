# ELM Math Fixer v1.2.2

This release focuses on performance for long chat histories and automated quality gates.

## What's New since v1.2.1

### Performance
- **Segment-level KaTeX validation cache**: KaTeX validation results are now cached per formula fragment (not per full text block), so the same formula appearing dozens of times in a long chat history is only rendered/validated once. Long pages with repeated formulas see noticeably less main-thread work during scans.
- **Incremental scan scoping**: Code-wrapped math rescue (`rescueCodeWrappedMath`) now runs per scanned element instead of scanning the entire container, so incremental scans no longer re-inspect code elements outside the affected window.

### Quality & CI
- **Automated test workflow**: Added a GitHub Actions workflow (`test.yml`) that runs syntax checks, metadata checks, and the full browser test suite on every push and pull request, with Chromium installed automatically on CI.
- **Version consistency checks**: Metadata tests now also verify the RELEASE_NOTES title and packaged zip reference match the current version.
- **Test browser discovery**: Browser tests now auto-detect Playwright-downloaded Chromium on Linux, Windows, and WSL, so the suite runs locally without a system Chrome install.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.2.zip`.
