# ELM Math Fixer v1.2.7

This release rescues display formulas that Markdown splits across headings, paragraphs, and list items — including around formulas ELM already rendered — and renders formulas containing unknown LaTeX commands literally instead of leaving them unrendered.

## What's New since v1.2.6

### Fixes
- **Display formula split across a heading and following content**: ELM can split a `$$...$$` display formula so the opening half lands inside a heading and the closing half in the next paragraph — or in a bare text node inside a list item (`<li>`), with no `<p>` wrapper at all. Split elements are now merged and the combined formula is rendered.
- **Split formulas around already-rendered KaTeX**: when a heading already contains KaTeX that ELM rendered natively, a remaining split `$$...$$` fragment is still detected and repaired, without duplicating or leaking the already-rendered content.
- **Unknown LaTeX commands render literally**: formulas containing commands ELM's KaTeX does not know (e.g. `\Ext`, `\fp`, `\ur`) are now displayed with the unknown commands as literal text instead of leaving the whole formula unrendered. This also applies to split display formulas and inline formulas spanning multiple lines.
- **`\[`/`\]` and `\(`/`\)` split across elements**: these delimiters are now tracked like `$`/`$$` when a formula is split between adjacent elements.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.7.zip`.
