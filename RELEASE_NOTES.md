# ELM Math Fixer v1.3.6

## What's New since v1.3.5

### Bug fixes
- **Setext-split display math with paren-prefixed row breaks** (v1.3.6): display formulas split across a heading and a closing paragraph are now repaired even when a `\substack` row separator is immediately followed by a paren (e.g. `\substack{a\bmod w\\(a,w)=1}`). Previously the repaired `\\` was miscounted as an unpaired `\(` delimiter, so the parity check never completed and the split formula stayed unrendered. The delimiter counter is now escape-aware, so `\\(`, `\\[`, `\\]` and `\$` no longer disturb the split-math balance.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.6.zip`.