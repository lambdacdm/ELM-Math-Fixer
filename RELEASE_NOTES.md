# ELM Math Fixer v1.3.2

## What's New since v1.3.1

### Fixes
- **Display math split across consecutive headings** (v1.3.2): when a `$$...$$` formula is split by Markdown into two consecutive headings plus a closing paragraph — with equals signs swallowed as Setext markers — the chain is now reconstructed and rendered, including formulas that end in a plain fragment such as `l.`. Fragment acceptance is principled rather than an ever-growing signature list: a fragment with no LaTeX signatures is treated as math unless it looks like a prose word (three or more consecutive letters), so `l.`, `ab`, and `x:` are accepted while sentences like `where` still block the repair.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.2.zip`.

---

# ELM Math Fixer v1.3.1


## What's New since v1.3

### Fixes
- **Multiline row separators inside `\substack{}`** (v1.3.1): a `\\` row separator inside a `\substack{...}` is now recognised as a legitimate line break in display math, so formulas such as `\substack{a\bmod q\\a\text{ odd}}` render instead of being rejected as a doubled backslash. The row-separator environments `drcases`, `smallmatrix`, and `subarray` are also recognised as multiline math. Doubled backslashes anywhere else are still rejected, and unknown doubled commands (e.g. `{\\fp}`) remain unrepaired.

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.1.zip`.

---

# ELM Math Fixer v1.3


This major release is a cumulative update covering all fixes since v1.2: rescuing split math in every form ELM's Markdown parsing can produce, repairing doubled-backslash LaTeX everywhere, and making the compact top bar controls follow the page layout reliably.

## What's New since v1.2

### Fixes
- **Streaming text split across adjacent text nodes** (v1.2.5): when ELM streams a message in chunks and splits a formula in half, the mixed-text rescuer now merges the neighbouring text nodes and validates the combined text, so the formula renders instead of staying as literal `$`. The incremental scanner also re-scans affected containers after settling, and no mutations are lost between observer reconnects.
- **Inline formula split across elements** (v1.2.6): an inline `$...$` formula split between a heading and the next paragraph (including underscores eaten into `<em>` tags, or newlines introduced by the split) is now merged and rendered.
- **Display formula split across headings, paragraphs, and list items** (v1.2.7): `$$...$$` formulas split so the opening half lands in a heading and the closing half in the next paragraph — or in a bare text node inside a list item — are merged and rendered, including around KaTeX that ELM already rendered natively. `\[...\]` and `\(...\)` delimiters are tracked like `$`/`$$` across split elements.
- **Unknown LaTeX commands render literally** (v1.2.7): formulas containing commands ELM's KaTeX does not know (e.g. `\Ext`, `\fp`, `\ur`) are displayed with the unknown commands as literal text instead of leaving the whole formula unrendered.
- **Multiline h1 formula rescue** (v1.2.3): when Markdown's Setext rule swallows a multiline `$$...$$` formula into an `<h1>`, leaving only the closing `$$` in the following paragraph, the formula now renders instead of staying unrendered, with equals signs inside the body preserved.
- **Doubled-backslash repair unified** (v1.2.4): LaTeX code blocks (`language-latex`, `language-tex`) display correctly when ELM doubles every backslash, `language-none` and document-level blocks get the doubled layer unwrapped too, and the math environment and code blocks now share one normalization entry point. Content is kept as code, never re-rendered as math.
- **Stray bullet after a rescued formula** (v1.2.8): when a `$$...$$` formula is split around an empty `<ul>` bullet that Markdown extracted from inside the formula, the marker is now hidden with the split originals so no stray bullet remains. Ordered-list numbers, which carry real list structure, stay visible.
- **Compact top bar control placement** (v1.2.9): on small windows the compact fixer toggle and prompt button now follow the top bar when a banner pushes it down, stay in place while a full-page overlay like the model picker menu is open (so the overlay hides them naturally, like ELM's own controls), and no longer get stuck between the banner and the top bar when the window is resized quickly.

### Other
- Disclaimers added to the README and metadata (v1.2.1).
- CI uses a committed `package-lock.json` and Node 24 (v1.2.2).

## Install

See [README](https://github.com/lambdacdm/ELM-Math-Fixer) for installation instructions. The packaged zip is attached below as `ELM-Math-Fixer-v1.3.zip`.
