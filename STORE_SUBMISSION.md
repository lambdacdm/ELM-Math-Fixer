# Chrome Web Store Submission Notes

Use this file as a working checklist when publishing ELM Math Fixer.

## Before Uploading

- Confirm `manifest.json` is at the top level of the ZIP.
- Confirm the ZIP includes `content.js`, `math-repair.js`, `prompts.js`, `ui.css`, `katex/`, `icons/`, and `THIRD_PARTY_NOTICES.md`.
- Confirm the extension loads locally from `chrome://extensions`.
- Test on `https://elm.edina.ac.uk/`.
- Run the browser regression tests before packaging.
- Build the ZIP with `powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1`.

Run the local verification commands after installing development dependencies:

```powershell
npm run check
npm test
npm run build
```

## Suggested Store Listing

Name:

```text
ELM Math Fixer
```

Short description:

```text
Fixes common KaTeX math rendering failures on the ELM platform.
```

Detailed description:

```text
ELM Math Fixer improves mathematical formula rendering on the University of Edinburgh ELM platform.

It locally repairs known failures caused when Markdown alters formulas before KaTeX can render them. These include display math split across paragraphs, standalone equals signs consumed as heading markers, damaged subscript underscores, valid formulas wrapped as code, and accidental doubled backslashes before LaTeX commands.

The extension works independently. Its built-in prompt picker provides optional, partial aids for users who want to reduce malformed formula output at generation time.
```

Single purpose:

```text
Fix KaTeX rendering problems on https://elm.edina.ac.uk/ by re-rendering affected math formulas in page content.
```

Privacy statement:

```text
This extension does not collect, store, transmit, sell, or share user data. It runs only on https://elm.edina.ac.uk/ and modifies page rendering locally in the browser.
```

Testing instructions for reviewers:

```text
1. Load the extension.
2. Visit https://elm.edina.ac.uk/.
3. Open an ELM page containing Markdown/KaTeX math formulas.
4. Verify that formulas containing subscripts, split display math, and standalone equals signs render correctly.
5. Use the Fixer switch to confirm that the original page can be restored and the repairs re-enabled.

No external account is provided by this extension. If ELM access is required, please use a reviewer test account for the platform.
```

## Upload Steps

1. Register as a Chrome Web Store developer if you have not done so.
2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1` from the repository root.
3. Open the Chrome Developer Dashboard.
4. Click **Add new item**.
5. Upload the ZIP file.
6. Complete Store Listing, Privacy, Distribution, and Test instructions.
7. Submit for review.

## Notes

- Chrome recommends PNG extension icons and specifically notes that SVG and WebP are not supported for manifest icons.
- The extension is intentionally narrow: it only matches `https://elm.edina.ac.uk/*`.
- The ZIP package limit is far above this project size, but avoid adding screenshots, archives, or unrelated files to the ZIP.
