const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const repoRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));

function findChrome() {
  const bases = [
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  ];
  if (fs.existsSync('/mnt/c/Users')) {
    for (const name of fs.readdirSync('/mnt/c/Users')) {
      if (name === 'Public' || name === 'Default') continue;
      bases.push(path.join('/mnt/c/Users', name, 'AppData', 'Local', 'ms-playwright'));
    }
  }
  for (const base of bases) {
    let entries;
    try { entries = fs.readdirSync(base); } catch (e) { continue; }
    for (const name of entries.sort().reverse()) {
      if (!name.startsWith('chromium') || name.includes('headless')) continue;
      const dir = path.join(base, name);
      for (const candidate of [
        path.join(dir, 'chrome-win64', 'chrome.exe'),
        path.join(dir, 'chrome-win', 'chrome.exe'),
        path.join(dir, 'chrome-linux', 'chrome')
      ]) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].find((c) => fs.existsSync(c));
}

(async () => {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>
    <main><section class="markdown">
      <p id="distribution-case">Let <span><span class="katex"><annotation encoding="application/x-tex">\\xi</annotation></span></span> be a primitive <span><span class="katex"><annotation encoding="application/x-tex">r</annotation></span></span>-th root of unity and put <span><span class="katex"><annotation encoding="application/x-tex">c=p^{n-1}</annotation></span></span>. The distribution relation gives $ \\operatorname{Li}<em>n^{\\mathfrak u}(\\xi)=c\\sum</em>{x^p=\\xi}\\operatorname{Li}_n^{\\mathfrak u}(x) $.</p>
    </section></main>
  </body></html>`);

  for (const relativePath of ['katex/katex.min.js', ...manifest.content_scripts[0].js]) {
    await page.addScriptTag({ path: path.join(repoRoot, relativePath) });
  }
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const p = document.getElementById('distribution-case');
    return {
      rescued: p.querySelectorAll('.elm-math-rescued-text').length,
      em: p.querySelectorAll(':scope em').length,
      tex: Array.from(p.querySelectorAll('.elm-math-rescued-text annotation[encoding="application/x-tex"]'))
        .map((node) => node.textContent).join('|')
    };
  });
  console.log(JSON.stringify(state, null, 2));
  const pass =
    state.rescued === 1 &&
    state.em === 0 &&
    state.tex.includes('\\operatorname{Li}_n^{\\mathfrak u}(\\xi)=c\\sum_{x^p=\\xi}');
  console.log(pass ? 'DISTRIBUTION CASE: PASS' : 'DISTRIBUTION CASE: FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });