const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const repoRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadContentScripts(page) {
  for (const relativePath of manifest.content_scripts[0].css) {
    await page.addStyleTag({ path: path.join(repoRoot, relativePath) });
  }
  for (const relativePath of manifest.content_scripts[0].js) {
    await page.addScriptTag({ path: path.join(repoRoot, relativePath) });
  }
}

async function runMathRepairTests(browser) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>
    <main>
      <section class="markdown" id="setext-case">
        <h1>$$ \\dim \\operatorname{Hom}_G(\\chi,M_n)</h1>
        <p>\\dim \\chi^{\\,c=(-1)^{n-1}}, $$</p>
      </section>
      <section class="markdown" id="setext-chain-case">
        <h1>$$A</h1>
        <h2>B</h2>
        <p>C$$</p>
      </section>
      <section class="markdown" id="setext-subscript-case">
        <h1>$$ X(\\mathbb Z_p)<em>{S,\\Pi</em>{\\mathrm{orb}}}</h1>
        <p>X(\\mathbb Z_p)_{S,\\PL^\\sigma}. $$</p>
      </section>
      <section class="markdown" id="setext-invalid-case">
        <h1>$$ \\frac{a</h1>
        <p>b$$</p>
      </section>
      <section class="markdown" id="escaped-layer-case">
        <h2>$$ \\\\lambda_{n,m} := \\\\frac{1}{c_m} \\\\left(a</h2>
        <p>\\\\sum_{\\\\substack{r&lt;n\\\\\\\\ r\\\\equiv m\\\\,(\\\\mathrm{mod}\\\\,2)}} b_r \\\\right) $$</p>
      </section>
      <section class="markdown" id="split-case">
        <p>$$x +</p>
        <p>y$$</p>
      </section>
      <div id="alignment-outer" style="align-items:flex-start;display:flex;flex-direction:column;width:800px">
        <div class="markdown-container" id="alignment-container">
          <div class="markdown" id="alignment-markdown">
            <markdown id="alignment-case">
              <p>$$u +</p>
              <p>v$$</p>
            </markdown>
          </div>
        </div>
      </div>
      <section class="markdown" id="nonadjacent-case">
        <p>$$A</p>
        <div><p>B$$</p></div>
      </section>
      <section class="markdown" id="paragraph-heading-case">
        <p>$$A</p>
        <h2>B</h2>
        <p>C$$</p>
      </section>
      <section class="markdown" id="single-line-cases">
        <p id="valid-inline">For $x_1$.</p>
        <p id="currency">Tickets cost $5 and $10.</p>
        <p id="unmatched">The price is $5.</p>
        <p id="subscript">$L<em>n(z</em>1)$</p>
        <p id="prose-strong"><strong>Important prose</strong> remains bold.</p>
        <p id="code-math"><code>$a_1$</code></p>
        <p id="known-double">$\\\\alpha + 1$</p>
        <p id="unknown-double">$\\\\notARealCommand + 1$</p>
      </section>
    </main>
  `);
  await loadContentScripts(page);
  await page.waitForTimeout(800);

  const initial = await page.evaluate(() => {
    const annotation = (selector) =>
      document.querySelector(selector)?.textContent || '';
    return {
      setextRaw: document.querySelector('#setext-case > .elm-math-rescued-block')?.dataset.rawText,
      setextReason: document.querySelector('#setext-case > .elm-math-rescued-block')?.dataset.repairReason,
      setextChainRaw: document.querySelector('#setext-chain-case > .elm-math-rescued-block')?.dataset.rawText,
      setextChainReason: document.querySelector('#setext-chain-case > .elm-math-rescued-block')?.dataset.repairReason,
      setextSubscriptRaw: document.querySelector('#setext-subscript-case > .elm-math-rescued-block')?.dataset.rawText,
      setextSubscriptRendered: document.querySelectorAll('#setext-subscript-case > .elm-math-rescued-block .katex').length,
      setextSubscriptText: document.querySelector('#setext-subscript-case > .elm-math-rescued-block .katex')?.textContent,
      setextInvalidBlocks: document.querySelectorAll('#setext-invalid-case > .elm-math-rescued-block').length,
      escapedLayerReason: document.querySelector('#escaped-layer-case > .elm-math-rescued-block')?.dataset.repairReason,
      escapedLayerTex: annotation('#escaped-layer-case annotation[encoding="application/x-tex"]'),
      splitBlocks: document.querySelectorAll('#split-case > .elm-math-rescued-block').length,
      alignment: (() => {
        const container = document.querySelector('#alignment-case');
        const markdownContainer = document.querySelector('#alignment-container');
        const markdown = document.querySelector('#alignment-markdown');
        const outer = document.querySelector('#alignment-outer');
        const block = container.querySelector(':scope > .elm-math-rescued-block');
        const formula = block?.querySelector('.katex');
        const outerRect = outer.getBoundingClientRect();
        const markdownContainerRect = markdownContainer.getBoundingClientRect();
        const markdownRect = markdown.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const blockRect = block?.getBoundingClientRect();
        const formulaRect = formula?.getBoundingClientRect();
        return {
          outerWidth: outerRect.width,
          markdownContainerWidth: markdownContainerRect.width,
          markdownWidth: markdownRect.width,
          containerWidth: containerRect.width,
          blockWidth: blockRect?.width || 0,
          centerDifference: formulaRect && blockRect
            ? Math.abs((formulaRect.left + formulaRect.right) / 2 - (blockRect.left + blockRect.right) / 2)
            : Number.POSITIVE_INFINITY
        };
      })(),
      nonadjacentBlocks: document.querySelectorAll('#nonadjacent-case > .elm-math-rescued-block').length,
      paragraphHeadingBlocks: document.querySelectorAll('#paragraph-heading-case > .elm-math-rescued-block').length,
      validInline: document.querySelectorAll('#valid-inline .katex').length,
      currencyWrapper: document.querySelectorAll('#currency > .elm-math-rescued-wrapper').length,
      currencyText: document.querySelector('#currency')?.textContent,
      unmatchedWrapper: document.querySelectorAll('#unmatched > .elm-math-rescued-wrapper').length,
      subscriptTex: annotation('#subscript annotation[encoding="application/x-tex"]'),
      strongPreserved: Boolean(document.querySelector('#prose-strong > strong')),
      strongWrapper: document.querySelectorAll('#prose-strong > .elm-math-rescued-wrapper').length,
      codeRendered: document.querySelectorAll('#code-math .elm-math-rescued-code .katex').length,
      knownDoubleTex: annotation('#known-double annotation[encoding="application/x-tex"]'),
      unknownDoubleWrapper: document.querySelectorAll('#unknown-double > .elm-math-rescued-wrapper').length
    };
  });
  assert(initial.setextRaw?.includes('\n=\n'), 'Setext-swallowed equals was not restored');
  assert(initial.setextReason === 'setext-equals', 'Setext repair marker is missing');
  assert(initial.setextChainRaw === '$$A\n=\nB\n-\nC$$', 'Setext equals/minus chain was not restored');
  assert(initial.setextChainReason === 'setext-operators', 'Setext operator-chain marker is missing');
  assert(initial.setextSubscriptRaw?.includes('X(\\mathbb Z_p)_{S,\\Pi_{\\mathrm{orb}}}'),
    `Markdown-swallowed underscores were not restored inside split display math: ${initial.setextSubscriptRaw}`);
  assert(initial.setextSubscriptRendered > 0, 'Split display math with restored underscores did not render');
  assert(initial.setextSubscriptText?.includes('\\PL'),
    'An undefined command was not preserved visibly in repaired display math');
  assert(initial.setextInvalidBlocks === 0, 'Malformed Setext math bypassed syntax validation');
  assert(initial.escapedLayerReason === 'setext-minus',
    'A fully escaped Setext formula was not repaired');
  assert(initial.escapedLayerTex.includes('\\lambda') && !initial.escapedLayerTex.includes('\\\\lambda'),
    'A fully escaped LaTeX layer was not unwrapped');
  assert(initial.splitBlocks === 1, 'adjacent split display math was not rescued');
  assert(Math.abs(initial.alignment.outerWidth - initial.alignment.markdownContainerWidth) < 1,
    'rescued markdown container did not fill its flex parent');
  assert(Math.abs(initial.alignment.markdownContainerWidth - initial.alignment.markdownWidth) < 1,
    'rescued markdown content wrapper did not fill its container');
  assert(Math.abs(initial.alignment.outerWidth - initial.alignment.containerWidth) < 1,
    'rescued markdown host did not fill its flex container');
  assert(Math.abs(initial.alignment.containerWidth - initial.alignment.blockWidth) < 1,
    'rescued display math did not fill its markdown host');
  assert(initial.alignment.centerDifference < 1, 'rescued display math was not centered');
  assert(initial.nonadjacentBlocks === 0, 'nonadjacent paragraphs were incorrectly joined');
  assert(initial.paragraphHeadingBlocks === 0, 'a P/H2/P chain was incorrectly treated as Setext damage');
  assert(initial.validInline > 0, 'valid inline math was not rendered');
  assert(initial.currencyWrapper === 0, 'currency text was incorrectly treated as math');
  assert(initial.currencyText === 'Tickets cost $5 and $10.', 'currency text was modified');
  assert(initial.unmatchedWrapper === 0, 'an unmatched dollar sign was treated as math');
  assert(initial.subscriptTex.includes('L_n(z_1)'), 'Markdown-damaged subscript was not restored');
  assert(initial.strongPreserved && initial.strongWrapper === 0, 'ordinary strong text was modified');
  assert(initial.codeRendered > 0, 'code-wrapped math was not rendered');
  assert(initial.knownDoubleTex.includes('\\alpha'), 'known doubled LaTeX command was not normalized');
  assert(!initial.knownDoubleTex.includes('\\\\alpha'), 'known command still has doubled backslashes');
  assert(initial.unknownDoubleWrapper === 0, 'unknown doubled command was modified');

  await page.evaluate(() => {
    document.querySelector('#setext-case').appendChild(document.createElement('span'));
    const late = document.createElement('p');
    late.id = 'late-inline';
    late.textContent = 'Later: $z_2$.';
    document.querySelector('#single-line-cases').appendChild(late);
  });
  await page.waitForTimeout(700);

  const afterMutation = await page.evaluate(() => ({
    setextBlocks: document.querySelectorAll('#setext-case > .elm-math-rescued-block').length,
    lateRendered: document.querySelectorAll('#late-inline .katex').length
  }));
  assert(afterMutation.setextBlocks === 1, 'repeated scanning duplicated a display formula');
  assert(afterMutation.lateRendered > 0, 'incrementally added math was not processed');

  await page.evaluate(() => document.querySelector('#elm-math-fixer-toggle').click());
  await page.waitForTimeout(100);
  const restored = await page.evaluate(() => ({
    blocks: document.querySelectorAll('.elm-math-rescued-block').length,
    wrappers: document.querySelectorAll('.elm-math-rescued-wrapper').length,
    codeHosts: document.querySelectorAll('.elm-math-rescued-code').length,
    setextHeadingVisible: getComputedStyle(document.querySelector('#setext-case > h1')).display !== 'none'
  }));
  assert(restored.blocks === 0 && restored.wrappers === 0 && restored.codeHosts === 0,
    'turning Fixer off did not restore the original DOM');
  assert(restored.setextHeadingVisible, 'turning Fixer off left the original heading hidden');

  await page.close();
  return { initial, afterMutation, restored };
}

async function runModernUiTest(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 500 } });
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; }
    header { align-items: center; background: #e5e5e5; display: flex; height: 92px; justify-content: space-between; padding: 0 30px; }
    aside { background: #eee; height: 408px; width: 270px; }
    nav { display: flex; flex-direction: column; width: 270px; }
    .nav-item { align-items: center; border: 0; display: flex; height: 54px; padding: 0 26px; width: 100%; }
    #tools { height: 42px; width: 90px; }
    .right, .look-group { align-items: center; display: flex; gap: 10px; }
    .look-group { margin-left: auto; }
    #native-switch { background: rgb(18, 83, 62); height: 38px; width: 62px; }
    @media (max-width: 1120px) { aside, .look-group span { display: none; } }
  </style></head><body>
    <header><button id="tools">Tools</button><div class="right"><div class="look-group"><span>Try our new look!</span><button id="native-switch" role="switch"></button></div><button>Request an API Key</button></div></header>
    <aside><nav><button class="nav-item"><span>Prompts</span></button><button class="nav-item" id="model-guide"><span>Model Guide</span></button><button class="nav-item"><span>Folders</span></button></nav></aside>
    <main class="markdown"><p>Modern response.</p></main>
  </body></html>`);
  await loadContentScripts(page);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const prompt = document.querySelector('#elm-math-fixer-prompt-button');
    const toggle = document.querySelector('#elm-math-fixer-toggle');
    return {
      promptInSidebar: prompt?.parentElement?.tagName === 'NAV',
      promptBeforeModelGuide: prompt?.nextElementSibling?.id === 'model-guide',
      toggleBeforeNativeGroup: toggle?.nextElementSibling?.classList.contains('look-group'),
      switchSymbol: getComputedStyle(toggle?.querySelector('.elm-mf-switch-thumb'), '::after').content,
      promptClass: prompt?.className
    };
  });

  assert(result.promptInSidebar && result.promptBeforeModelGuide,
    'modern Fixer Prompts launcher is not in the expected sidebar position');
  assert(result.toggleBeforeNativeGroup, 'modern Fixer switch is not before the native look control');
  assert(result.switchSymbol.includes('✓'), 'enabled Fixer switch does not show a check mark');

  await page.evaluate(() => document.querySelector('#elm-math-fixer-prompt-button').click());
  const copyButtons = await page.locator('#elm-math-fixer-prompt-panel .elm-mf-copy').count();
  assert(copyButtons === 4, 'prompt catalog did not load in the modern UI');

  await page.setViewportSize({ width: 900, height: 500 });
  await page.waitForTimeout(300);
  const narrow = await page.evaluate(() => {
    const prompt = document.querySelector('#elm-math-fixer-prompt-button');
    const toggle = document.querySelector('#elm-math-fixer-toggle');
    return {
      promptHidden: getComputedStyle(prompt).display === 'none',
      compactToggle: toggle.classList.contains('elm-mf-compact'),
      powerVisible: getComputedStyle(toggle.querySelector('.elm-mf-power-icon')).display !== 'none'
    };
  });
  assert(narrow.promptHidden, 'prompt launcher should be hidden when the sidebar is unavailable');
  assert(narrow.compactToggle && narrow.powerVisible, 'narrow layout did not use the compact Fixer control');

  await page.close();
  return { wide: result, narrow };
}

async function runLegacyUiTest(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 760 } });
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; }
    header { align-items: center; display: flex; height: 78px; justify-content: flex-end; gap: 18px; padding: 0 24px; }
    .look-group { align-items: center; display: flex; gap: 8px; }
    #native-switch { height: 36px; width: 58px; }
    aside { border-right: 1px solid #ddd; height: 682px; width: 420px; }
    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); height: 54px; }
    .tab { font-size: 17px; }
    .prompt-panel { padding: 28px 0; }
    .prompt-panel p { margin: 0 14px 24px; }
    .add { height: 48px; margin: 0 10px 8px; width: 400px; }
    .actions { display: flex; gap: 8px; margin: 0 10px; }
    .actions button { height: 48px; width: 196px; }
  </style></head><body>
    <header><button>Request an API Key</button><div class="look-group"><span>Try our new look!</span><button id="native-switch" role="switch"></button></div><button>Settings</button></header>
    <aside><div class="tabs"><button class="tab">History</button><button class="tab">Documents</button><button class="tab">Prompts</button></div>
      <div class="prompt-panel"><p>Select your prompt to change or refine how ELM replies.</p><p>Any custom prompts you create are private.</p><button class="add">Add Prompt</button><div class="actions"><button>Edit</button><button>Delete</button></div></div>
    </aside>
    <main class="markdown"><p>Legacy response.</p></main>
  </body></html>`);
  await loadContentScripts(page);
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const prompt = document.querySelector('#elm-math-fixer-prompt-button');
    const toggle = document.querySelector('#elm-math-fixer-toggle');
    return {
      legacyClass: prompt?.classList.contains('elm-mf-legacy-sidebar'),
      promptAfterActions: prompt?.previousElementSibling?.classList.contains('actions'),
      toggleBeforeNativeGroup: toggle?.nextElementSibling?.classList.contains('look-group')
    };
  });

  assert(result.legacyClass && result.promptAfterActions,
    'legacy Fixer Prompts launcher is not after the prompt actions');
  assert(result.toggleBeforeNativeGroup, 'legacy Fixer switch is not before the native look control');

  await page.evaluate(() => document.querySelector('#elm-math-fixer-toggle').click());
  const offSymbol = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#elm-math-fixer-toggle .elm-mf-switch-thumb'), '::after').content
  );
  assert(offSymbol.includes('−'), 'disabled Fixer switch does not show a minus sign');

  await page.evaluate(() => document.querySelector('#elm-math-fixer-prompt-button').click());
  const copyButtons = await page.locator('#elm-math-fixer-prompt-panel .elm-mf-copy').count();
  assert(copyButtons === 4, 'prompt catalog did not load in the legacy UI');
  await page.close();
  return result;
}

(async () => {
  const executablePath = findChrome();
  if (!executablePath) throw new Error('Chrome was not found. Set CHROME_PATH to run browser tests.');

  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const result = await runMathRepairTests(browser);
    const modern = await runModernUiTest(browser);
    const legacy = await runLegacyUiTest(browser);
    console.log(`Browser tests passed: ${JSON.stringify({
      setext: result.initial.setextReason,
      splitBlocks: result.initial.splitBlocks,
      incrementalMath: result.afterMutation.lateRendered,
      restoredBlocks: result.restored.blocks,
      modernSidebar: modern.wide.promptInSidebar,
      compactFixer: modern.narrow.compactToggle,
      legacySidebar: legacy.legacyClass
    })}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
