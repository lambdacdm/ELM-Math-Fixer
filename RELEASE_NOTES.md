# ELM Math Fixer v1.2.3

This release fixes a split-display-math miss found on real ELM pages.

## What's New since v1.2.2

### Fixes
- **Multiline h1 formula rescue**: When Markdown's Setext rule swallows a multiline `$$...$$` formula into an `<h1>` (triggered by a line ending in `=`), leaving only the closing `$$` in the following paragraph, the repair now succeeds instead of being skipped. Previously the closing-only paragraph made the split group fail validation, so the formula stayed unrendered. Equals signs inside the formula body are preserved and are not mistaken for swallowed Setext operators.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.3.zip`.
