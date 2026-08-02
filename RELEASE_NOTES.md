# ELM Math Fixer v1.2.8

This release hides empty list markers that Markdown pulls out of the middle of a split display formula, so a rescued formula no longer leaves a stray bullet point behind it.

## What's New since v1.2.7

### Fixes
- **Stray bullet after a rescued formula**: when a `$$...$$` display formula is split around an empty list marker (an empty `<ul>` bullet that Markdown extracted from inside the formula), the marker is now hidden together with the split original elements. Previously the bullet stayed visible after the rendered formula block. Ordered-list numbers (`<ol>`), which carry real list structure, remain visible as before.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.8.zip`.
