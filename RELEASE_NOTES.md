# ELM Math Fixer v1.2.6

This release fixes inline math that stays unrendered when ELM splits a formula across elements, and unwraps doubled-backslash LaTeX in `language-none` and document-level code blocks.

## What's New since v1.2.5

### Fixes
- **Inline formula split across a heading and a paragraph**: ELM can stream an inline `$...$` formula so that the opening half lands in one element (e.g. an `<h1>`) and the closing half in the next sibling (e.g. a `<p>`). Split elements are now merged and the combined formula is rendered, including when Markdown has eaten underscores into `<em>` tags (e.g. `\operatorname{Li}<em>n^{\mathfrak p}...`) and when the split introduced newlines inside the formula.
- **Doubled-backslash LaTeX in `language-none` code blocks**: blocks such as a `\begin{lemma}` snippet that ELM classifies as `language-none` (not `language-latex`) now get the doubled layer unwrapped too, while genuinely plain-text `language-none` blocks stay untouched.
- **Document-level LaTeX code blocks**: mixed-layer documents (single-backslash `\documentclass`/`\begin{lemma}` alongside doubled `\\author{}`/`\\begin{document}`) are now normalized per segment, and an already-unwrapped block whose text is replaced by streaming can be re-repaired instead of staying stale.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.2.6.zip`.
