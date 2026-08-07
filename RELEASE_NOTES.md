# ELM Math Fixer v1.3.4

## What's New since v1.3.3

### Fixes
- **Unknown LaTeX commands are marked red after repair** (v1.3.4): previously, repaired formulas rendered unknown commands (e.g. `\MT`, `\fp`, `\cO`, `\PL`) as plain literal text via a macro substitution that also hid KaTeX's native error styling. The substitution has been removed, so unknown commands in repaired formulas are now displayed exactly as on the ELM site — red (KaTeX's `#cc0000` error colour) — while the rest of the formula renders normally. Repairs whose formulas contain other structural errors (unknown environments such as `\begin{subarray}`, unbalanced braces) are still refused wholesale and left untouched.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.4.zip`.