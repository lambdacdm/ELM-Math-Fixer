# ELM Math Fixer v1.3.7

## What's New since v1.3.6

### Bug fixes
- **Markdown-eaten math split across two formulas** (v1.3.7): one `_..._` subscript "damage" pair can now span from inside one `$...$` formula, across prose and already-rendered math, into the next `$...$` formula (e.g. `\operatorname{Li}_n^{...}(\xi)` and `E_n(Z)=\sum_{r\mid m}V_r`). Such a formula pair is recognized only when both of its ends sit inside unpaired math delimiters, reconstructed on a detached clone, and committed only when the restored runs render cleanly; genuine prose emphasis between formulas is never touched.
- **Emphasis-broken inline math in rendered paragraphs** (v1.3.7): inline `$...$` formulas whose subscript pair Markdown turned into `<em>...</em>` are now repaired inside paragraphs that already contain native KaTeX (e.g. `\operatorname{Li}<em>n^{...}\in V</em>{pr}`), restoring the original underscores and rendering the formula while leaving neighbouring native math and ordinary prose emphasis intact.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.7.zip`.