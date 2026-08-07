const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const repoRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));

function findPlaywrightChrome() {
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
    try {
      entries = fs.readdirSync(base);
    } catch (error) {
      continue;
    }
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
  return undefined;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    findPlaywrightChrome()
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
        <h1>$$ \dim \operatorname{Hom}_G(\chi,M_n)</h1>
        <p>\dim \chi^{\,c=(-1)^{n-1}}, $$</p>
      </section>
      <section class="markdown" id="h1-multiline-equals-case">
        <h1>$$
E_2=
\operatorname{Ext}^1(\mathbb Q(0),\mathbb Q(2))
\simeq
K_3(\mathbb Z[1/6])\otimes\mathbb Q</h1>
        <p>$$</p>
      </section>
      <section class="markdown" id="setext-chain-case">
        <h1>$$A</h1>
        <h2>B</h2>
        <p>C$$</p>
      </section>
      <section class="markdown" id="setext-empty-list-case">
        <h1>$$A</h1>
        <h1>B</h1>
        <ol start="2"><li></li></ol>
        <p>$$</p>
      </section>
      <section class="markdown" id="split-marker-case">
        <h1>$$
f_M(\\eta_{\\fp})</h1>
        <ul><li></li></ul>
        <p>\\exp_{\\mathrm{BK}}^{-1}(M_{\\fp}).
$$</p>
      </section>
      <section class="markdown" id="setext-subscript-case">
        <h1>$$ X(\\mathbb Z_p)<em>{S,\\Pi</em>{\\mathrm{orb}}}</h1>
        <p>X(\\mathbb Z_p)_{S,\\PL^\\sigma}. $$</p>
      </section>
      <section class="markdown" id="setext-substack-case">
        <h1>$$
H_n</h1>
        <p>\\#
\\bigcup_{k=1}^4
\\ \\bigcup_{\\substack{a\\bmod q\\\\a\\text{ odd}}}
\\operatorname{Orb}<em>{S_3}(u</em>{k,a}).
$$</p>
      </section>
      <section class="markdown" id="setext-double-h1-case">
        <h1>$$
N_{K/\\mathbb Q}(\\pi_a)</h1><h1>N_{K/\\mathbb Q}(1-4\\zeta_q^a)</h1><p>l.
$$</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-case">
        <h1>[
X(\\mathcal O_{K,S})</h1><p>{\\lambda\\in K\\setminus{0,1}:\\lambda,;1-\\lambda\\in \\mathcal O_{K,S}^{\\times}}.
]</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-prose-case">
        <h1>[Note</h1><p>misc.]</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-citation-case">
        <h1>[ref](url</h1><p>x)]</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-env-case">
        <h1>[
\\begin{matrix}</h1><p>1&amp;2 \\\\ 3&amp;4 \\end{matrix}
]</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-sqrt-case">
        <p>[
\\sqrt[2^k]{x+y}
]</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-underbrace-case">
        <p>[
\\underbrace{a+b+c}_{3}
]</p>
      </section>
      <section class="markdown" id="setext-eaten-bracket-def-case">
        <p>[
\\begin{subarray}{c} a \\ b \\end{subarray}
]</p>
      </section>
      <section class="markdown" id="eaten-inline-positive-case">
        <p>令 (\\zeta=\\zeta_{2^n})，并把 (X=\\mathbb P^1\\setminus{0,1,\\infty}) 用仿射坐标 (\\lambda) 表示。则</p>
      </section>
      <section class="markdown" id="eaten-inline-single-case">
        <p>这给出 (\\lambda) 的唯一性。</p>
      </section>
      <section class="markdown" id="eaten-inline-prose-case">
        <p>（注：(1)——见 (a,b) 与 (n+1)，还有 (0,1] 区间）</p>
      </section>
      <section class="markdown" id="eaten-inline-unbalanced-case">
        <p>((\\lambda) 未配对</p>
      </section>
      <section class="markdown" id="eaten-inline-unknown-case">
        <p>考虑 (Z=\\Zcc_p^{\\mathrm{orb}}) 是一般环。</p>
      </section>
      <markdown id="real-message-case">
        <p>令 (\\zeta=\\zeta_{2^n})，并把 (X=\\mathbb P^1\\setminus{0,1,\\infty}) 用仿射坐标 (\\lambda) 表示。则</p>
        <h1>[
X(\\mathcal O_{K,S})</h1>
        <p>{\\lambda\\in K\\setminus{0,1}:\\lambda,;1-\\lambda\\in \\mathcal O_{K,S}^{\\times}}.
]</p>
        <p>Siksek–Visser 的构造给出：若</p>
        <p>[
l=2^{2^n}+1
]</p>
        <p>是素数，且 (K=\\mathbb Q(\\zeta_{2^n}))，(S) 为 (K) 中位于 (2) 和 (l) 上方的素理想集合，则对每个奇数 (a) 模 (2^n)，即 (a\\in(\\mathbb Z/2^n\\mathbb Z)^\\times)，点</p>
        <p>[
\\lambda_a=-4\\zeta_{2^n}^{,a}
]</p>
        <p>属于 (X(\\mathcal O_{K,S}))。原因是</p>
        <p>[
\\lambda_a=-4\\zeta_{2^n}^{,a}
]</p>
        <p>只在 (2) 上有分母/零点，而</p>
        <p>[
1-\\lambda_a=1+4\\zeta_{2^n}^{,a}
]</p>
        <p>的范数为</p>
        <p>[
N_{K/\\mathbb Q}(1+4\\zeta_{2^n}^{,a})=2^{2^n}+1=l,
]</p>
        <p>所以它只在 (l) 上方的素理想处有零点。因此 (\\lambda_a) 和 (1-\\lambda_a) 都是 (S)-单位。</p>
        <p>此外，由于 (X) 的自同构群会置换 (0,1,\\infty)，还可得到每个 (\\lambda_a) 的六个等价点。因此 (X(\\mathcal O_{K,S})) 至少包含</p>
        <p>[
\\bigcup_{a\\in(\\mathbb Z/2^n\\mathbb Z)^\\times}
\\left{
-4\\zeta^a,;
1+4\\zeta^a,;
-\\frac{1}{4\\zeta^a},;
\\frac{1}{1+4\\zeta^a},;
\\frac{4\\zeta^a}{1+4\\zeta^a},;
\\frac{1+4\\zeta^a}{4\\zeta^a}
\\right},
]</p>
        <p>其中 (\\zeta=\\zeta_{2^n})。</p>
        <p>特别地，对 (n\\ge 2)，这给出至少</p>
        <p>[
6\\varphi(2^n)=6\\cdot 2^{n-1}=3\\cdot 2^n
]</p>
        <p>个显式的 (P)-整点。</p>
      </markdown>
      <section class="markdown" id="setext-eaten-bracket-single-negative-case">
        <p>[1]</p>
        <p>[Note]</p>
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
      <section class="markdown" id="inline-split-heading-case">
        <h1>哦，我有几个问题。有
$ \\operatorname{per}_{\\mathfrak p}
\\left(
I^C(0;\\epsilon,{0}^{n-1};1)
\\right)</h1>
        <p>-\\operatorname{Li}<em>n^{\\mathfrak p}(\\epsilon^{-1}).$】。这是在论文的哪里？在 n 是奇数的时候，你给出了\\sigma</em>{n,1}的系数。</p>
      </section>
      <section class="markdown" id="inline-newline-case">
        <p>Formula $L_1 +
M_2$ spans lines.</p>
      </section>
      <section class="markdown" id="bracket-split-case">
        <p>\\[x +</p>
        <p>y\\]</p>
      </section>
      <section class="markdown" id="paren-split-case">
        <p>\\(a +</p>
        <p>b\\)</p>
      </section>
      <section class="markdown" id="bracket-nonadjacent-case">
        <p>\\[A</p>
        <div><p>B\\]</p></div>
      </section>
      <section class="markdown" id="native-split-case">
        <li>
          <h1><span class="elm-math-rescued-text" data-raw-text="对于扩张
$$
M\in \\Ext^1_{\\MT(\\mathcal O_{K,S})}(\\mathbb Q(0),\\mathbb Q(n)),\\qquad n\\ge 1,
$$
相应的矩阵系数函数 ">对于扩张
<span><span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mtext>M</mtext></mrow><annotation encoding="application/x-tex">M\in \\Ext^1_{\\MT(\\mathcal O_{K,S})}(\\mathbb Q(0),\\mathbb Q(n)),\\qquad n\\ge 1,</annotation></semantics></math></span></span></span></span>
相应的矩阵系数函数 </span><span><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mtext>f</mtext></mrow><annotation encoding="application/x-tex">f_M\\in A(Z)</annotation></semantics></math></span></span></span> 满足
$$
f_M(\\eta_{\\fp}^{\\ur})</h1>
\\exp_{\\mathrm{BK}}^{-1}(M_{\\fp})\\in K_{\\fp}.
$$
        </li>
      </section>
      </section>
      <section class="markdown" id="setext-matrix-amp-case">
        <p>$$ \\rho_{E,\\ell}(G_{\\mathbb Q}) \\subseteq \\left\\{ \\begin{pmatrix}</p>
        <li>&amp; *\\\\ 0 &amp; * \\end{pmatrix} \\right\\}. $$</li>
      </section>
      <section class="markdown" id="single-line-cases">
        <p id="valid-inline">For $x_1$.</p>
        <p id="inline-spacing">is the $x_1=e_1$ coordinate and</p>
        <ul><li id="link-spacing"><a href="https://example.com">number theory - Primitive $p^n$-th root of unity</a></li></ul>
        <ul><li id="native-link-spacing"><a href="https://example.com">number theory - Primitive <span class="katex">pⁿ</span>-th root of unity</a></li></ul>
        <p id="native-paired-braces">Set <span class="katex"><annotation encoding="application/x-tex">S=\\\\{(\\mathfrak{p})\\\\}</annotation></span>.</p>
        <p id="native-multiline-braces"><span class="katex"><annotation encoding="application/x-tex">\\begin{aligned}a\\\\{b\\\\}\\end{aligned}</annotation></span></p>
        <h2 id="mispaired-native">The function $L_2<span><span class="katex" data-copytex-latex=" and the key "><annotation encoding="application/x-tex"> and the key </annotation></span></span>p$-adic fact</h2>
        <p id="mispaired-native-chain">Let $L_2<span><span class="katex"><annotation encoding="application/x-tex"> be a function, </annotation></span></span>z_1<span><span class="katex"><annotation encoding="application/x-tex"> is a point, and </annotation></span></span>p$ is prime.</p>
        <p id="mispaired-native-word">The numbers $1-\\zeta<span><span class="katex"><annotation encoding="application/x-tex">and</annotation></span></span>1-\\eta$ are units.</p>
        <p id="mispaired-native-symbol">Symbols $A<span><span class="katex"><annotation encoding="application/x-tex">B</annotation></span></span>C$.</p>
        <ul><li id="mispaired-native-multiple">First $x<span><span class="katex"><annotation encoding="application/x-tex"> plus prose </annotation></span></span>y$. <strong>Cases (1), (2), and (3).</strong> Second $a<span><span class="katex"><annotation encoding="application/x-tex"> more prose </annotation></span></span>b$.</li></ul>
        <ul><li id="mixed-valid-and-mispaired"><strong>$w=-1$</strong>: Gives $1-w=2$. Also $A<span><span class="katex"><annotation encoding="application/x-tex">and</annotation></span></span>B$.</li></ul>
        <p id="mispaired-native-unknown">Because $K<span><span class="katex"><annotation encoding="application/x-tex">is a field and</annotation></span></span>\\cO_K^\\times$ is used. Before $1-w=2$.</p>
        <p id="normal-native">A normal <span class="katex"><annotation encoding="application/x-tex">x+1</annotation></span> formula.</p>
        <p id="currency">Tickets cost $5 and $10.</p>
        <p id="unmatched">The price is $5.</p>
        <p id="subscript">$L<em>n(z</em>1)$</p>
        <p id="prose-strong"><strong>Important prose</strong> remains bold.</p>
        <p id="code-math"><code>$a_1$</code></p>
        <p id="known-double">$\\\\alpha + 1$</p>
        <p id="unknown-double">$\\\\notARealCommand + 1$</p>
        <p id="unknown-double-braces">\${\\\\fp}$</p>
        <p id="unknown-command-math">With $U_S^{\\MT}$ and $1-\\zeta$.</p>
      </section>
      <section class="markdown" id="table-cases">
        <table><tbody>
          <tr><td id="td-em-backslash"></td></tr>
          <tr><td id="td-em-amp"></td></tr>
        </tbody></table>
      </section>
      <section class="markdown" id="code-block-escape-case">
        <pre><code class="language-latex">\\\\[ \\\\frac{\\\\zeta_8^i-1}{\\\\zeta_8^j-1},\\\\qquad 1\\\\leq i\\\\ne j<8, \\\\]</code></pre>
      </section>
      <section class="markdown" id="code-block-plain-case">
        <pre><code>const s = "\\\\[not math\\\\]";</code></pre>
      </section>
      <section class="markdown" id="code-block-mixed-case">
        <pre><code class="language-latex">The $S_3$-action adds $12$ points, since
\\\\[
    \\\\frac{\\\\zeta_8^i-1}{\\\\zeta_8^j-1},\\\\qquad 1\\\\leq i\\\\ne j&lt;8,
\\\\]
are distinct, and give
\\\\[ 24+42+3=69 \\\\]
points, matching \\[ -2+2\\zeta_8 \\].</code></pre>
      </section>
      <section class="markdown" id="code-block-latex-inline">
        <pre><code class="language-latex">The ratio is $\\\\frac{1}{2}$.</code></pre>
      </section>
      <section class="markdown" id="code-block-latex-env">
        <pre><code class="language-latex">\\\\begin{aligned} a &amp;= \\\\frac{1}{2} \\\\\\\\ b &amp;= \\\\frac{3}{4} \\\\end{aligned}</code></pre>
      </section>
      <section class="markdown" id="code-block-text-case">
        <pre><code class="language-text">\\\\frac{1}{2} and \\\\[x\\\\]</code></pre>
      </section>
      <section class="markdown" id="code-block-tex-case">
        <pre><code class="language-tex">\\\\frac{1}{2} \\\\text{ and } \\\\zeta_8</code></pre>
      </section>
      <section class="markdown" id="code-block-latex-clean">
        <pre><code class="language-latex">\\begin{aligned} a &amp;= b \\\\ c &amp;= d \\end{aligned}</code></pre>
      </section>
      <section class="markdown" id="code-block-none-case">
        <pre><code class="language-none">\\begin{lemma}[{\\cite[Lemma~15]{siksek-visser}}]
If $l^m\\nmid n$, then
$$\\\\frac{\\\\sigma_+\\\\Phi_n(\\\\zeta_{l^m})}{\\\\Phi_n(\\\\zeta_{l^m})}=\\\\begin{cases}\\\\zeta_{l^m}^{-\\\\varphi(n)} &amp; n\\\\geq 2,\\
-\\\\zeta_{l^m}^{-1} &amp; n=1\\\\end{cases}.$$
\\end{lemma}</code></pre>
      </section>
      <section class="markdown" id="code-block-none-plain-case">
        <pre><code class="language-none">C:\\\\Users\\\\name\\\\file.txt has no LaTeX. Also \\\\[not math\\\\].</code></pre>
      </section>
      <section class="markdown" id="code-block-doc-case">
        <pre><code class="language-latex">\\documentclass[11pt]{article}
\\usepackage{amsmath}
\\newcommand{\\Q}{\\mathbb Q}
\\title{A}
\\\\author{}
\\\\date{}
\\\\begin{document}
\\\\maketitle
\\\\section{Setup}
Let
\\\\[
K=\\\\Q(\\\\zeta_8),
\\\\]
and let $U_S^{\\\\MT}$ be the unipotent part.
\\\\begin{lemma}
For the depth-one basis, one has
\\\\[
\\\\sigma_+^* b_n^\\\\alpha=(-1)^{n+1}b_n^\\\\alpha,
\\\\]
\\end{lemma}
\\\\end{document}</code></pre>
      </section>
      <section class="markdown" id="incremental-window"></section>
    </main>
  `);
  await page.evaluate(() => {
    const fillCell = (id, beforeEm, emText, afterEm) => {
      const cell = document.getElementById(id);
      cell.textContent = '$ ' + beforeEm;
      const em = document.createElement('em');
      em.textContent = emText;
      cell.appendChild(em);
      cell.appendChild(document.createTextNode(afterEm));
    };
    fillCell('td-em-backslash', '\\begin{pmatrix}1&', '\\\\0&', '\\end{pmatrix} $');
    fillCell('td-em-amp', '\\begin{pmatrix}', '&', '\\\\0&*\\end{pmatrix} $');
  });
  await loadContentScripts(page);
  await page.waitForTimeout(800);

  const initial = await page.evaluate(() => {
    const annotation = (selector) =>
      document.querySelector(selector)?.textContent || '';
    return {
      setextRaw: document.querySelector('#setext-case > .elm-math-rescued-block')?.dataset.rawText,
      setextReason: document.querySelector('#setext-case > .elm-math-rescued-block')?.dataset.repairReason,
      h1MultilineBlocks: document.querySelectorAll('#h1-multiline-equals-case > .elm-math-rescued-block').length,
      h1MultilineRendered: document.querySelectorAll('#h1-multiline-equals-case .katex').length,
      h1MultilineRaw: document.querySelector('#h1-multiline-equals-case > .elm-math-rescued-block')?.dataset.rawText,
      setextChainRaw: document.querySelector('#setext-chain-case > .elm-math-rescued-block')?.dataset.rawText,
      setextChainReason: document.querySelector('#setext-chain-case > .elm-math-rescued-block')?.dataset.repairReason,
      setextEmptyListRaw: document.querySelector('#setext-empty-list-case > .elm-math-rescued-block')?.dataset.rawText,
      setextEmptyListRendered: document.querySelectorAll('#setext-empty-list-case > .elm-math-rescued-block .katex').length,
      setextEmptyListVisible: getComputedStyle(document.querySelector('#setext-empty-list-case > ol')).display !== 'none',
      setextSubscriptRaw: document.querySelector('#setext-subscript-case > .elm-math-rescued-block')?.dataset.rawText,
      setextSubscriptRendered: document.querySelectorAll('#setext-subscript-case > .elm-math-rescued-block .katex').length,
      setextSubscriptText: document.querySelector('#setext-subscript-case > .elm-math-rescued-block .katex')?.textContent,
      setextSubstackBlocks: document.querySelectorAll('#setext-substack-case > .elm-math-rescued-block').length,
      setextSubstackRendered: document.querySelectorAll('#setext-substack-case > .elm-math-rescued-block .katex').length,
      setextSubstackRaw: document.querySelector('#setext-substack-case > .elm-math-rescued-block')?.dataset.rawText,
      setextDoubleH1Blocks: document.querySelectorAll('#setext-double-h1-case > .elm-math-rescued-block').length,
      setextDoubleH1Rendered: document.querySelectorAll('#setext-double-h1-case > .elm-math-rescued-block .katex').length,
      setextDoubleH1Raw: document.querySelector('#setext-double-h1-case > .elm-math-rescued-block')?.dataset.rawText,
      setextDoubleH1Reason: document.querySelector('#setext-double-h1-case > .elm-math-rescued-block')?.dataset.repairReason,
      setextEatenBracketBlocks: document.querySelectorAll('#setext-eaten-bracket-case > .elm-math-rescued-block').length,
      setextEatenBracketRendered: document.querySelectorAll('#setext-eaten-bracket-case > .elm-math-rescued-block .katex').length,
      setextEatenBracketRaw: document.querySelector('#setext-eaten-bracket-case > .elm-math-rescued-block')?.dataset.rawText,
      setextEatenBracketReason: document.querySelector('#setext-eaten-bracket-case > .elm-math-rescued-block')?.dataset.repairReason,
      setextEatenBracketProseBlocks: document.querySelectorAll('#setext-eaten-bracket-prose-case > .elm-math-rescued-block').length,
      setextEatenBracketCitationBlocks: document.querySelectorAll('#setext-eaten-bracket-citation-case > .elm-math-rescued-block').length,
      setextEatenBracketEnvBlocks: document.querySelectorAll('#setext-eaten-bracket-env-case > .elm-math-rescued-block').length,
      setextEatenBracketEnvRendered: document.querySelectorAll('#setext-eaten-bracket-env-case > .elm-math-rescued-block .katex').length,
      setextEatenBracketEnvRaw: document.querySelector('#setext-eaten-bracket-env-case > .elm-math-rescued-block')?.dataset.rawText,
      setextEatenBracketSqrtBlocks: document.querySelectorAll('#setext-eaten-bracket-sqrt-case > .elm-math-rescued-block').length,
      setextEatenBracketSqrtRaw: document.querySelector('#setext-eaten-bracket-sqrt-case > .elm-math-rescued-block')?.dataset.rawText,
      setextEatenBracketUbraceBlocks: document.querySelectorAll('#setext-eaten-bracket-underbrace-case > .elm-math-rescued-block').length,
      setextEatenBracketUbraceRaw: document.querySelector('#setext-eaten-bracket-underbrace-case > .elm-math-rescued-block')?.dataset.rawText,
      setextEatenBracketDefBlocks: document.querySelectorAll('#setext-eaten-bracket-def-case > .elm-math-rescued-block').length,
      eatenInlinePositiveKatex: document.querySelectorAll('#eaten-inline-positive-case .katex').length,
      eatenInlinePositiveReason: document.querySelector('#eaten-inline-positive-case .elm-math-rescued-wrapper')?.dataset.repairReason,
      eatenInlineAnnotations: [...document.querySelectorAll('#eaten-inline-positive-case annotation[encoding="application/x-tex"]')].map((a) => a.textContent),
      eatenInlineSingleKatex: document.querySelectorAll('#eaten-inline-single-case .katex').length,
      eatenInlineProseKatex: document.querySelectorAll('#eaten-inline-prose-case .katex').length,
      eatenInlineProseText: document.querySelector('#eaten-inline-prose-case p')?.textContent,
      eatenInlineUnbalancedKatex: document.querySelectorAll('#eaten-inline-unbalanced-case .katex').length,
      realMessageBlocks: document.querySelectorAll('#real-message-case > .elm-math-rescued-block').length,
      realMessageRendered: document.querySelectorAll('#real-message-case > .elm-math-rescued-block .katex').length,
      realMessageRaws: [...document.querySelectorAll('#real-message-case > .elm-math-rescued-block')].map((b) => b.dataset.rawText || ''),
      singleBracketNegativeBlocks: document.querySelectorAll('#setext-eaten-bracket-single-negative-case > .elm-math-rescued-block').length,
      realMessageIntroKatex: document.querySelectorAll('#real-message-case > p:first-of-type .katex').length,
      realMessageIntroAnnotations: [...document.querySelectorAll('#real-message-case > p:first-of-type annotation[encoding="application/x-tex"]')].map((a) => a.textContent),
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
      inlineSplitBlocks: document.querySelectorAll('#inline-split-heading-case > .elm-math-rescued-block').length,
      inlineSplitKatex: document.querySelectorAll('#inline-split-heading-case .katex').length,
      inlineSplitRaw: document.querySelector('#inline-split-heading-case > .elm-math-rescued-block')?.dataset.rawText,
      inlineNewlineRendered: document.querySelectorAll('#inline-newline-case .katex').length,
      inlineNewlineRaw: document.querySelector('#inline-newline-case .elm-math-rescued-wrapper')?.dataset.rawText,
      unknownMathWrapper: document.querySelectorAll('#unknown-command-math > .elm-math-rescued-wrapper').length,
      unknownMathKatex: document.querySelectorAll('#unknown-command-math .katex').length,
      unknownMathTex: annotation('#unknown-command-math annotation[encoding="application/x-tex"]'),
      unknownLocalRaw: document.querySelector('#mispaired-native-unknown > .elm-math-local-chain')?.dataset.rawText,
      unknownLocalMath: document.querySelectorAll('#mispaired-native-unknown .elm-math-local-rendered .katex').length,
      unknownFollowingMath: document.querySelectorAll('#mispaired-native-unknown .elm-math-rescued-text .katex').length,
      eatenInlineUnknownWrapper: document.querySelectorAll('#eaten-inline-unknown-case .elm-math-rescued-wrapper').length,
      redTexts: [...document.querySelectorAll('span')]
        .filter((node) => getComputedStyle(node).color === 'rgb(204, 0, 0)')
        .map((node) => node.textContent)
        .filter((text) => text && text.startsWith('\\')),
      validInlineErrors: document.querySelectorAll('#valid-inline .katex-error').length,
      bracketSplitBlocks: document.querySelectorAll('#bracket-split-case > .elm-math-rescued-block').length,
      bracketSplitKatex: document.querySelectorAll('#bracket-split-case .katex').length,
      parenSplitBlocks: document.querySelectorAll('#paren-split-case > .elm-math-rescued-block').length,
      parenSplitKatex: document.querySelectorAll('#paren-split-case .katex').length,
      bracketNonadjacentBlocks: document.querySelectorAll('#bracket-nonadjacent-case > .elm-math-rescued-block').length,
      nativeSplitBlocks: document.querySelectorAll('#native-split-case .elm-math-rescued-block').length,
      nativeSplitKatex: document.querySelectorAll('#native-split-case .elm-math-rescued-block .katex').length,
      nativeSplitRaw: document.querySelector('#native-split-case .elm-math-rescued-block')?.dataset.rawText,
      nativeSplitHidden: document.querySelectorAll('#native-split-case .elm-math-split-original').length,
      splitMarkerBlocks: document.querySelectorAll('#split-marker-case > .elm-math-rescued-block').length,
      splitMarkerKatex: document.querySelectorAll('#split-marker-case > .elm-math-rescued-block .katex').length,
      splitMarkerHidden: document.querySelectorAll('#split-marker-case .elm-math-split-original').length,
      validInline: document.querySelectorAll('#valid-inline .katex').length,
      inlineSpacingBefore: document.querySelector('#inline-spacing > .elm-math-rescued-wrapper')?.firstChild?.textContent,
      inlineSpacingAfter: document.querySelector('#inline-spacing > .elm-math-rescued-wrapper')?.lastChild?.textContent,
      linkSpacingBefore: document.querySelector('#link-spacing .elm-math-rescued-wrapper a')?.firstChild?.textContent,
      linkSpacingAfter: document.querySelector('#link-spacing .elm-math-rescued-wrapper a')?.lastChild?.textContent,
      nativeLinkSpacer: document.querySelector('#native-link-spacing .elm-math-boundary-space')?.textContent,
      nativeLinkAfter: document.querySelector('#native-link-spacing .katex')?.nextSibling?.textContent,
      nativeBraceTex: annotation('#native-paired-braces .elm-math-native-brace-rendered annotation[encoding="application/x-tex"]'),
      nativeBraceRepairs: document.querySelectorAll('#native-paired-braces > .elm-math-native-brace-repair').length,
      multilineBraceRepairs: document.querySelectorAll('#native-multiline-braces > .elm-math-native-brace-repair').length,
      mispairedNativeRaw: document.querySelector('#mispaired-native > .elm-math-local-chain')?.dataset.rawText,
      mispairedNativeMath: document.querySelectorAll('#mispaired-native > .elm-math-local-chain .elm-math-local-rendered .katex').length,
      mispairedChainRaw: document.querySelector('#mispaired-native-chain > .elm-math-local-chain')?.dataset.rawText,
      mispairedChainMath: document.querySelectorAll('#mispaired-native-chain > .elm-math-local-chain .elm-math-local-rendered .katex').length,
      mispairedWordRaw: document.querySelector('#mispaired-native-word > .elm-math-local-chain')?.dataset.rawText,
      mispairedWordMath: document.querySelectorAll('#mispaired-native-word > .elm-math-local-chain .elm-math-local-rendered .katex').length,
      mispairedSymbolRaw: document.querySelector('#mispaired-native-symbol > .elm-math-local-chain')?.dataset.rawText,
      mispairedSymbolMath: document.querySelectorAll('#mispaired-native-symbol > .elm-math-local-chain .elm-math-local-rendered .katex').length,
      multipleLocalRepairs: document.querySelectorAll('#mispaired-native-multiple > .elm-math-local-chain').length,
      multipleStrongText: document.querySelector('#mispaired-native-multiple > strong')?.textContent,
      mixedValidMath: document.querySelectorAll('#mixed-valid-and-mispaired .elm-math-rescued-text .katex').length,
      mixedLocalMath: document.querySelectorAll('#mixed-valid-and-mispaired .elm-math-local-rendered .katex').length,
      mixedStrongPreserved: Boolean(document.querySelector('#mixed-valid-and-mispaired > strong .elm-math-rescued-text')),
      normalNativeRepairs: document.querySelectorAll('#normal-native > .elm-math-local-chain').length,
      currencyWrapper: document.querySelectorAll('#currency > .elm-math-rescued-wrapper').length,
      currencyText: document.querySelector('#currency')?.textContent,
      unmatchedWrapper: document.querySelectorAll('#unmatched > .elm-math-rescued-wrapper').length,
      subscriptTex: annotation('#subscript annotation[encoding="application/x-tex"]'),
      setextMatrixAmpRendered: document.querySelectorAll('#setext-matrix-amp-case > .elm-math-rescued-block .katex').length,
      setextMatrixAmpTex: annotation('#setext-matrix-amp-case annotation[encoding="application/x-tex"]'),
      strongPreserved: Boolean(document.querySelector('#prose-strong > strong')),
      strongWrapper: document.querySelectorAll('#prose-strong > .elm-math-rescued-wrapper').length,
      codeRendered: document.querySelectorAll('#code-math .elm-math-rescued-code .katex').length,
      codeBlockEscapeText: document.querySelector('#code-block-escape-case code')?.textContent,
      codeBlockEscapeUnescaped: document.querySelectorAll('#code-block-escape-case code.elm-math-code-unescaped').length,
      codeBlockEscapeKatex: document.querySelectorAll('#code-block-escape-case .katex').length,
      codeBlockPlainText: document.querySelector('#code-block-plain-case code')?.textContent,
      codeBlockPlainUnescaped: document.querySelectorAll('#code-block-plain-case code.elm-math-code-unescaped').length,
      codeBlockMixedText: document.querySelector('#code-block-mixed-case code')?.textContent,
      codeBlockMixedUnescaped: document.querySelectorAll('#code-block-mixed-case code.elm-math-code-unescaped').length,
      codeBlockMixedKatex: document.querySelectorAll('#code-block-mixed-case .katex').length,
      codeBlockLatexInlineText: document.querySelector('#code-block-latex-inline code')?.textContent,
      codeBlockLatexInlineUnescaped: document.querySelectorAll('#code-block-latex-inline code.elm-math-code-unescaped').length,
      codeBlockLatexEnvText: document.querySelector('#code-block-latex-env code')?.textContent,
      codeBlockLatexEnvUnescaped: document.querySelectorAll('#code-block-latex-env code.elm-math-code-unescaped').length,
      codeBlockTextText: document.querySelector('#code-block-text-case code')?.textContent,
      codeBlockTextUnescaped: document.querySelectorAll('#code-block-text-case code.elm-math-code-unescaped').length,
      codeBlockTexText: document.querySelector('#code-block-tex-case code')?.textContent,
      codeBlockTexUnescaped: document.querySelectorAll('#code-block-tex-case code.elm-math-code-unescaped').length,
      codeBlockCleanText: document.querySelector('#code-block-latex-clean code')?.textContent,
      codeBlockCleanUnescaped: document.querySelectorAll('#code-block-latex-clean code.elm-math-code-unescaped').length,
      codeBlockNoneText: document.querySelector('#code-block-none-case code')?.textContent,
      codeBlockNoneUnescaped: document.querySelectorAll('#code-block-none-case code.elm-math-code-unescaped').length,
      codeBlockNoneKatex: document.querySelectorAll('#code-block-none-case .katex').length,
      codeBlockNonePlainText: document.querySelector('#code-block-none-plain-case code')?.textContent,
      codeBlockNonePlainUnescaped: document.querySelectorAll('#code-block-none-plain-case code.elm-math-code-unescaped').length,
      codeBlockDocText: document.querySelector('#code-block-doc-case code')?.textContent,
      codeBlockDocUnescaped: document.querySelectorAll('#code-block-doc-case code.elm-math-code-unescaped').length,
      knownDoubleTex: annotation('#known-double annotation[encoding="application/x-tex"]'),
      unknownDoubleWrapper: document.querySelectorAll('#unknown-double > .elm-math-rescued-wrapper').length,
      unknownDoubleBracesKatex: document.querySelectorAll('#unknown-double-braces .katex').length,
      unknownDoubleBracesWrapper: document.querySelectorAll('#unknown-double-braces > .elm-math-rescued-wrapper').length,
      unknownDoubleBracesText: document.querySelector('#unknown-double-braces')?.textContent,
      tdEmBackslashRendered: document.querySelectorAll('#td-em-backslash .katex:not(.katex-error)').length,
      tdEmBackslashTex: annotation('#td-em-backslash annotation[encoding="application/x-tex"]'),
      tdEmAmpRendered: document.querySelectorAll('#td-em-amp .katex:not(.katex-error)').length,
      tdEmAmpTex: annotation('#td-em-amp annotation[encoding="application/x-tex"]')
    };
  });
  assert(initial.setextRaw?.includes('\n=\n'), 'Setext-swallowed equals was not restored');
  assert(initial.setextReason === 'setext-equals', 'Setext repair marker is missing');
  assert(initial.h1MultilineBlocks === 1 && initial.h1MultilineRendered > 0,
    'multiline h1 formula with a closing-only paragraph was not rescued');
  assert(initial.h1MultilineRaw?.includes('E_2=') && !initial.h1MultilineRaw?.includes('\n=\n'),
    'multiline h1 formula repair altered the equals sign');
  assert(initial.setextChainRaw === '$$A\n=\nB\n-\nC$$', 'Setext equals/minus chain was not restored');
  assert(initial.setextChainReason === 'setext-operators', 'Setext operator-chain marker is missing');
  assert(initial.setextEmptyListRaw === '$$A\n=\nB\n$$' && initial.setextEmptyListRendered === 1,
    'a Setext formula interrupted by an empty list marker was not reconstructed');
  assert(initial.setextEmptyListVisible,
    'repairing an interrupted Setext formula hid its following list marker');
  assert(initial.setextSubscriptRaw?.includes('X(\\mathbb Z_p)_{S,\\Pi_{\\mathrm{orb}}}'),
    `Markdown-swallowed underscores were not restored inside split display math: ${initial.setextSubscriptRaw}`);
  assert(initial.setextSubscriptRendered > 0, 'Split display math with restored underscores did not render');
  assert(initial.setextSubscriptText?.includes('\\PL') &&
    initial.redTexts.includes('\\PL'),
    `an undefined command in repaired display math was not kept red: red text: ${initial.redTexts.join(' | ')}`);
  assert(initial.setextSubstackBlocks === 1 && initial.setextSubstackRendered > 0,
    `a substack row separator inside split display math was not rescued: blocks ${initial.setextSubstackBlocks}, katex ${initial.setextSubstackRendered}`);
  assert(initial.setextSubstackRaw?.includes('\\substack{a\\bmod q\\\\a\\text{ odd}}'),
    `the substack row separator was damaged in the repaired formula: ${initial.setextSubstackRaw}`);
  assert(initial.setextSubstackRaw?.includes('\\operatorname{Orb}_{S_3}(u_{k,a})'),
    `markdown-swallowed subscripts were not restored inside the substack formula: ${initial.setextSubstackRaw}`);
  assert(initial.setextDoubleH1Blocks === 1 && initial.setextDoubleH1Rendered > 0,
    `a double-h1 Setext chain was not rescued: blocks ${initial.setextDoubleH1Blocks}, katex ${initial.setextDoubleH1Rendered}`);
  assert(initial.setextDoubleH1Raw?.includes('N_{K/\\mathbb Q}(\\pi_a)') &&
    initial.setextDoubleH1Raw?.includes('N_{K/\\mathbb Q}(1-4\\zeta_q^a)') &&
    initial.setextDoubleH1Raw?.includes('\n=\n') &&
    initial.setextDoubleH1Raw?.includes('l.'),
    `the double-h1 chain was not reconstructed faithfully: ${initial.setextDoubleH1Raw}`);
  assert(initial.setextDoubleH1Reason === 'setext-operators',
    'double-h1 Setext chain marker is missing');
  assert(initial.setextEatenBracketBlocks === 1 && initial.setextEatenBracketRendered > 0,
    `a \\[...\\] formula with Markdown-eaten backslashes was not rescued: blocks ${initial.setextEatenBracketBlocks}, katex ${initial.setextEatenBracketRendered}`);
  assert(initial.setextEatenBracketRaw?.startsWith('\\[') &&
    initial.setextEatenBracketRaw?.endsWith('\\]') &&
    initial.setextEatenBracketRaw?.includes('\n=\n') &&
    initial.setextEatenBracketRaw?.includes('\\mathcal') &&
    initial.setextEatenBracketRaw?.includes('\\setminus') &&
    initial.setextEatenBracketRaw?.includes('\\{') &&
    initial.setextEatenBracketRaw?.includes('\\;'),
    `the eaten-bracket chain was not reconstructed faithfully: ${initial.setextEatenBracketRaw}`);
  assert(initial.setextEatenBracketEnvBlocks === 1 && initial.setextEatenBracketEnvRendered === 1 &&
    initial.setextEatenBracketEnvRaw?.includes('\\begin{matrix}') &&
    initial.setextEatenBracketEnvRaw?.includes('\\end{matrix}'),
    `environment braces were wrongly escaped: ${initial.setextEatenBracketEnvRaw}`);
  assert(initial.setextEatenBracketSqrtBlocks === 1 &&
    initial.setextEatenBracketSqrtRaw?.includes('\\sqrt[2^k]{x+y}'),
    `optional-argument braces were wrongly escaped: ${initial.setextEatenBracketSqrtRaw}`);
  assert(initial.setextEatenBracketUbraceBlocks === 1 &&
    initial.setextEatenBracketUbraceRaw?.includes('\\underbrace{a+b+c}_{3}'),
    `underbrace argument braces were wrongly escaped: ${initial.setextEatenBracketUbraceRaw}`);
  assert(initial.setextEatenBracketDefBlocks === 0,
    'eaten-bracket math that KaTeX cannot resolve must be refused, not repaired');
  assert(initial.eatenInlinePositiveKatex === 3 &&
    initial.eatenInlinePositiveReason === 'eaten-inline-parens' &&
    initial.eatenInlineAnnotations.some((a) => a === '\\zeta=\\zeta_{2^n}') &&
    initial.eatenInlineAnnotations.some((a) => a.includes('X=\\mathbb P^1\\setminus\\{0,1,\\infty\\}')) &&
    initial.eatenInlineAnnotations.some((a) => a === '\\lambda'),
    `eaten inline parens were not restored faithfully: ${initial.eatenInlineAnnotations.join(' | ')}`);
  assert(initial.eatenInlineSingleKatex === 1,
    'a single parenthesised inline formula inside prose was not rescued');
  assert(initial.eatenInlineProseKatex === 0 &&
    initial.eatenInlineProseText?.includes('（注：(1)——见 (a,b)') &&
    initial.eatenInlineProseText?.includes('(0,1] 区间）'),
    `prose parens were wrongly rewritten as math: ${initial.eatenInlineProseText}`);
  assert(initial.eatenInlineUnbalancedKatex === 0,
    'unbalanced parens must never be treated as eaten inline math');
  assert(initial.eatenInlineUnknownWrapper === 1 && initial.redTexts.includes('\\Zcc'),
    `an unknown command in rescued eaten-inline math was not marked red: ${initial.redTexts.join(' | ')}`);
  assert(initial.setextEatenBracketReason === 'setext-equals',
    'eaten-bracket Setext chain marker is missing');
  assert(initial.setextEatenBracketProseBlocks === 0 && initial.setextEatenBracketCitationBlocks === 0,
    'bare-bracket prose or citation chains were wrongly rescued as math');
  assert(initial.realMessageBlocks === 8 && initial.realMessageRendered === 8,
    `the real ELM message was not fully rescued: blocks ${initial.realMessageBlocks}, katex ${initial.realMessageRendered}`);
  assert(initial.realMessageRaws[0]?.startsWith('\\[') &&
    initial.realMessageRaws[0]?.includes('\n=\n') &&
    initial.realMessageRaws[0]?.includes('X(\\mathcal O_{K,S})') &&
    initial.realMessageRaws[0]?.includes('\\{\\lambda') &&
    initial.realMessageRaws[0]?.includes('\\setminus\\{0,1\\}') &&
    initial.realMessageRaws[0]?.includes('\\lambda,\\;1-\\lambda'),
    `the real-message Setext chain was not reconstructed first: ${initial.realMessageRaws[0]}`);
  assert(initial.realMessageRaws.some((r) => r.includes('\\left\\{') && r.includes('\\right\\}')),
    'eaten \\left\\{ backslashes were not restored in the union formula');
  assert(initial.realMessageRaws.some((r) => r.includes('-4\\zeta^a,\\;') && r.includes('\\frac{1}{4\\zeta^a}')),
    'eaten \\; spaces or \\frac argument braces were not restored in the union formula');
  assert(initial.realMessageRaws.some((r) => r.includes('\\lambda_a=-4\\zeta_{2^n}^{,a}')),
    'a single-element eaten-bracket formula was not rescued');
  assert(initial.realMessageIntroKatex === 3 &&
    initial.realMessageIntroAnnotations.some((a) => a.includes('\\setminus\\{0,1,\\infty\\}')),
    'the real-message intro paragraph was not shown as inline math');
  assert(initial.singleBracketNegativeBlocks === 0,
    'single-line prose brackets were wrongly rescued as math');
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
  assert(initial.inlineSplitBlocks === 1 && initial.inlineSplitKatex > 0,
    `an inline formula split across a heading and paragraph was not rescued: blocks ${initial.inlineSplitBlocks}, katex ${initial.inlineSplitKatex}`);
  assert(initial.inlineSplitRaw?.includes(
    '$ \\operatorname{per}_{\\mathfrak p} \\left( I^C(0;\\epsilon,{0}^{n-1};1) \\right) -\\operatorname{Li}_n^{\\mathfrak p}(\\epsilon^{-1}).$'),
    `split inline formula newlines were not flattened or underscores not restored: ${initial.inlineSplitRaw}`);
  assert(initial.inlineNewlineRendered > 0,
    `an inline formula spanning lines inside a single element was not rescued: ${initial.inlineNewlineRendered}`);
  assert(initial.inlineNewlineRaw?.includes('$L_1 + M_2$'),
    `inline formula newlines were not flattened in the single-element path: ${initial.inlineNewlineRaw}`);
  assert(initial.unknownMathWrapper === 1 && initial.unknownMathKatex === 2 &&
    initial.redTexts.includes('\\MT'),
    `an inline formula with an unknown command was not rendered with it marked red: wrapper ${initial.unknownMathWrapper}, katex ${initial.unknownMathKatex}, red ${initial.redTexts.join(' | ')}`);
  assert(initial.bracketSplitBlocks === 1 && initial.bracketSplitKatex > 0,
    `a \\[ formula split across paragraphs was not rescued: blocks ${initial.bracketSplitBlocks}, katex ${initial.bracketSplitKatex}`);
  assert(initial.parenSplitBlocks === 1 && initial.parenSplitKatex > 0,
    `a \\( formula split across paragraphs was not rescued: blocks ${initial.parenSplitBlocks}, katex ${initial.parenSplitKatex}`);
  assert(initial.bracketNonadjacentBlocks === 0,
    'nonadjacent \\[ fragments were incorrectly joined');
  assert(initial.nativeSplitBlocks === 1 && initial.nativeSplitKatex > 0,
    `a display formula split across a native-rendered heading and paragraph was not rescued: blocks ${initial.nativeSplitBlocks}, katex ${initial.nativeSplitKatex}`);
  assert(initial.nativeSplitHidden === 2,
    `split originals were not hidden after rescue: ${initial.nativeSplitHidden}`);
  assert(initial.nativeSplitRaw?.includes('f_M(\\eta') && initial.nativeSplitRaw?.includes('\\exp_{\\mathrm{BK}}'),
    `a split display formula after native katex was not joined cleanly: ${initial.nativeSplitRaw}`);
  assert(!initial.nativeSplitRaw?.includes('A(Z)'),
    `a native katex annotation leaked into the rescued math: ${initial.nativeSplitRaw}`);
  assert(initial.splitMarkerBlocks === 1 && initial.splitMarkerKatex > 0,
    `a display formula split around an empty list marker was not rescued: blocks ${initial.splitMarkerBlocks}, katex ${initial.splitMarkerKatex}`);
  assert(initial.redTexts.includes('\\fp'),
    `the unknown command in the rescued split formula lost its red marker: ${initial.redTexts.join(' | ')}`);
  assert(initial.splitMarkerHidden === 3,
    `the empty list marker was left visible after rescue: ${initial.splitMarkerHidden} split-original nodes`);
  assert(initial.validInline > 0, 'valid inline math was not rendered');
  assert(initial.validInlineErrors === 0, 'valid inline math was wrongly marked as an error');
  assert(initial.inlineSpacingBefore?.endsWith('\u00a0') && initial.inlineSpacingAfter?.startsWith('\u00a0'),
    'inline math lost surrounding prose whitespace');
  assert(initial.linkSpacingBefore?.endsWith('\u00a0') && initial.linkSpacingAfter === '-th root of unity',
    'inline math inside a link lost its intended surrounding whitespace');
  assert(initial.nativeLinkSpacer === '\u00a0' && initial.nativeLinkAfter === '-th root of unity',
    'native inline math inside a link lost its intended boundary whitespace');
  assert(initial.nativeBraceTex === 'S=\\{(\\mathfrak{p})\\}' && initial.nativeBraceRepairs === 1,
    'paired doubled set braces in native KaTeX were not repaired');
  assert(initial.multilineBraceRepairs === 0,
    'paired doubled braces inside a multiline environment were incorrectly changed');
  assert(initial.mispairedNativeRaw === '$L_2$ and the key $p$',
    'mispaired native inline math was not reconstructed correctly');
  assert(initial.mispairedNativeMath === 2,
    'reconstructed native inline math did not render as two formulas');
  assert(initial.mispairedChainRaw === '$L_2$ be a function, $z_1$ is a point, and $p$',
    'a continuous native inline math mismatch was not reconstructed correctly');
  assert(initial.mispairedChainMath === 3,
    'a continuous native inline math mismatch did not render all formulas');
  assert(initial.mispairedWordRaw === '$1-\\zeta$ and $1-\\eta$' && initial.mispairedWordMath === 2,
    `a single-word native mismatch was not reconstructed: ${initial.mispairedWordRaw} (${initial.mispairedWordMath})`);
  assert(initial.mispairedSymbolRaw === '$A$ B $C$' && initial.mispairedSymbolMath === 2,
    'a single-symbol native mismatch was not reconstructed structurally');
  assert(initial.multipleLocalRepairs === 2,
    'multiple independent native math mismatches were not repaired locally');
  assert(initial.multipleStrongText === 'Cases (1), (2), and (3).',
    'local native math repair removed unrelated bold markup');
  assert(initial.mixedValidMath === 2 && initial.mixedLocalMath === 2,
    'local mismatch repair prevented other valid inline formulas from rendering');
  assert(initial.mixedStrongPreserved,
    'rendering valid math alongside a local repair removed bold markup');
  assert(initial.unknownLocalRaw === '$K$ is a field and $\\cO_K^\\times$' && initial.unknownLocalMath === 2 &&
    initial.redTexts.includes('\\cO'),
    `the undefined command in the local mismatch repair was not marked red: ${initial.redTexts.join(' | ')}`);
  assert(initial.unknownFollowingMath === 1,
    'an undefined-command repair prevented following valid inline math from rendering');
  assert(initial.normalNativeRepairs === 0,
    'ordinary native inline math was incorrectly reconstructed');
  assert(initial.currencyWrapper === 0, 'currency text was incorrectly treated as math');
  assert(initial.currencyText === 'Tickets cost $5 and $10.', 'currency text was modified');
  assert(initial.unmatchedWrapper === 0, 'an unmatched dollar sign was treated as math');
  assert(initial.subscriptTex.includes('L_n(z_1)'), 'Markdown-damaged subscript was not restored');
  assert(initial.strongPreserved && initial.strongWrapper === 0, 'ordinary strong text was modified');
  assert(initial.codeRendered > 0, 'code-wrapped math was not rendered');
  assert(initial.codeBlockEscapeText?.includes('\\frac') && !initial.codeBlockEscapeText?.includes('\\\\frac'),
    'escaped code block commands were not unwrapped to single backslashes');
  assert(initial.codeBlockEscapeText?.includes('\\[') && !initial.codeBlockEscapeText?.includes('\\\\['),
    'escaped code block delimiters were not unwrapped');
  assert(initial.codeBlockEscapeUnescaped === 1 && initial.codeBlockEscapeKatex === 0,
    'an unwrapped code block was not left as plain code');
  assert(initial.codeBlockPlainText === 'const s = "\\\\[not math\\\\]";' && initial.codeBlockPlainUnescaped === 0,
    'a genuine code block was incorrectly modified');
  assert(initial.codeBlockMixedText?.includes('\\frac') && !initial.codeBlockMixedText?.includes('\\\\frac'),
    'mixed code block commands were not unwrapped');
  assert(initial.codeBlockMixedText?.includes('\\[ 24+42+3=69 \\]'),
    'a delimiter-only doubled formula in a code block was not unwrapped');
  assert(initial.codeBlockMixedText?.includes('matching \\[ -2+2\\zeta_8 \\]'),
    'a single-backslash formula in a mixed code block was incorrectly modified');
  assert(initial.codeBlockMixedUnescaped === 1 && initial.codeBlockMixedKatex === 0,
    'a mixed code block was not left as plain code');
  assert(initial.codeBlockLatexInlineText === 'The ratio is $\\frac{1}{2}$.' && initial.codeBlockLatexInlineUnescaped === 1,
    'inline doubled LaTeX inside a latex code block was not normalized');
  assert(initial.codeBlockLatexEnvText === '\\begin{aligned} a &= \\frac{1}{2} \\\\ b &= \\frac{3}{4} \\end{aligned}' && initial.codeBlockLatexEnvUnescaped === 1,
    'a doubled LaTeX environment block was not unwrapped');
  assert(initial.codeBlockTextText === '\\\\frac{1}{2} and \\\\[x\\\\]' && initial.codeBlockTextUnescaped === 0,
    'a language-text block was incorrectly modified');
  assert(initial.codeBlockTexText === '\\frac{1}{2} \\text{ and } \\zeta_8' && initial.codeBlockTexUnescaped === 1,
    'language-tex block commands were not unwrapped');
  assert(initial.codeBlockCleanText === '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}' && initial.codeBlockCleanUnescaped === 0,
    'a genuine single-layer latex block was incorrectly modified');
  assert(initial.codeBlockNoneText?.includes('\\frac{\\sigma_+\\Phi_n(\\zeta_{l^m})')
    && !initial.codeBlockNoneText?.includes('\\\\frac')
    && initial.codeBlockNoneText?.includes('\\begin{lemma}')
    && !initial.codeBlockNoneText?.includes('\\\\begin{lemma}'),
    `a language-none LaTeX block was not unwrapped: ${initial.codeBlockNoneText}`);
  assert(initial.codeBlockNoneUnescaped === 1 && initial.codeBlockNoneKatex === 0,
    'an unwrapped language-none LaTeX block was not left as plain code');
  assert(initial.codeBlockNonePlainText === 'C:\\\\Users\\\\name\\\\file.txt has no LaTeX. Also \\\\[not math\\\\].'
    && initial.codeBlockNonePlainUnescaped === 0,
    'a genuine language-none code block was incorrectly modified');
  const expectedDoc = [
    '\\documentclass[11pt]{article}',
    '\\usepackage{amsmath}',
    '\\newcommand{\\Q}{\\mathbb Q}',
    '\\title{A}',
    '\\author{}',
    '\\date{}',
    '\\begin{document}',
    '\\maketitle',
    '\\section{Setup}',
    'Let',
    '\\[',
    'K=\\Q(\\zeta_8),',
    '\\]',
    'and let $U_S^{\\MT}$ be the unipotent part.',
    '\\begin{lemma}',
    'For the depth-one basis, one has',
    '\\[',
    '\\sigma_+^* b_n^\\alpha=(-1)^{n+1}b_n^\\alpha,',
    '\\]',
    '\\end{lemma}',
    '\\end{document}'
  ].join('\n');
  assert(initial.codeBlockDocText === expectedDoc,
    `document-level and custom LaTeX commands were not unwrapped: ${initial.codeBlockDocText}`);
  assert(initial.codeBlockDocUnescaped === 1,
    'an unwrapped language-latex document block was not marked');
  assert(initial.knownDoubleTex.includes('\\alpha'), 'known doubled LaTeX command was not normalized');
  assert(!initial.knownDoubleTex.includes('\\\\alpha'), 'known command still has doubled backslashes');
  assert(initial.unknownDoubleWrapper === 0, 'unknown doubled command was modified');
  assert(initial.unknownDoubleBracesKatex === 0 && initial.unknownDoubleBracesWrapper === 0,
    'a doubled unknown command inside braces was rendered instead of left unresolved');
  assert(initial.unknownDoubleBracesText?.includes('${\\\\fp}$'),
    `an unresolved doubled command inside braces was altered: ${initial.unknownDoubleBracesText}`);
  assert(initial.tdEmBackslashRendered === 1 && initial.tdEmBackslashTex.includes('\\begin{pmatrix}'),
    'Markdown-damaged pmatrix inside a td cell with backslash was not restored');
  assert(initial.tdEmAmpRendered === 1 && initial.tdEmAmpTex.includes('\\begin{pmatrix}'),
    'Markdown-damaged pmatrix inside a td cell with ampersand was not restored');
  assert(initial.setextMatrixAmpRendered === 1 && initial.setextMatrixAmpTex.includes('begin{pmatrix'),
    'Markdown-split display math starting with pmatrix spanning <li> was not restored');

  const incrementalWindow = await page.evaluate(() => {
    const container = document.querySelector('#incremental-window');
    const paragraphs = Array.from({ length: 30 }, (_, index) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = index === 0
        ? 'Near: $n$.'
        : index === 29
          ? 'Far: $f$.'
          : `Plain paragraph ${index}.`;
      container.appendChild(paragraph);
      return paragraph;
    });
    const farCode = document.createElement('p');
    farCode.id = 'incremental-code-math';
    const codeEl = document.createElement('code');
    codeEl.textContent = '$z_3$';
    farCode.appendChild(codeEl);
    container.appendChild(farCode);
    globalThis.ELMMathFixerRuntime.scan([container, paragraphs[0]], false);
    return {
      nearRendered: paragraphs[0].querySelectorAll('.katex').length,
      farRendered: paragraphs[29].querySelectorAll('.katex').length,
      codeMathRescued: farCode.querySelectorAll('.elm-math-rescued-code').length
    };
  });
  assert(incrementalWindow.nearRendered > 0 && incrementalWindow.farRendered === 0,
    'an incremental scan processed the entire container instead of the affected window');
  assert(incrementalWindow.codeMathRescued === 0,
    'an incremental scan processed code-wrapped math outside the affected window');

  await page.evaluate(() => {
    document.querySelector('#setext-case').appendChild(document.createElement('span'));
    const late = document.createElement('p');
    late.id = 'late-inline';
    late.textContent = 'Later: $z_2$.';
    document.querySelector('#single-line-cases').appendChild(late);

    const streamed = document.createElement('p');
    streamed.id = 'streamed-inline';
    streamed.textContent = 'Streaming: $\\kappa';
    document.querySelector('#single-line-cases').appendChild(streamed);
    streamed.textContent = 'Streaming: $\\kappa_1(u)$.';

    const inlineSplit = document.createElement('section');
    inlineSplit.className = 'markdown';
    inlineSplit.id = 'streamed-inline-split-case';
    const splitH1 = document.createElement('h1');
    splitH1.textContent = 'Late: $\\operatorname{per}_{\\mathfrak p}\\left( I^C \\right)';
    const splitP = document.createElement('p');
    splitP.id = 'streamed-inline-split-tail';
    splitP.textContent = '-\\operatorname{Li}_n^{\\mathfrak p}(\\epsilon^{-1}).$ tail.';
    inlineSplit.appendChild(splitH1);
    inlineSplit.appendChild(splitP);
    document.querySelector('main').appendChild(inlineSplit);

    const newlineRun = document.createElement('p');
    newlineRun.id = 'streamed-newline-run';
    newlineRun.innerHTML = 'Native <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mtext>q</mtext></mrow><annotation encoding="application/x-tex">q</annotation></semantics></math></span></span> text';
    document.querySelector('#single-line-cases').appendChild(newlineRun);
    newlineRun.appendChild(document.createTextNode(' with $\\alpha +'));
    newlineRun.appendChild(document.createTextNode('\n\\beta$. done'));

    const docCode = document.querySelector('#code-block-doc-case code');
    docCode.textContent = '\\\\author{} and $\\\\frac{1}{2}$';
  });
  await page.waitForTimeout(700);

  const afterMutation = await page.evaluate(() => ({
    setextBlocks: document.querySelectorAll('#setext-case > .elm-math-rescued-block').length,
    lateRendered: document.querySelectorAll('#late-inline .katex').length,
    streamedRendered: document.querySelectorAll('#streamed-inline .katex').length,
    mixedLocalChains: document.querySelectorAll('#mixed-valid-and-mispaired > .elm-math-local-chain').length,
    mixedValidMath: document.querySelectorAll('#mixed-valid-and-mispaired .elm-math-rescued-text .katex').length,
    docCodeRepaired: document.querySelector('#code-block-doc-case code')?.textContent,
    streamedSplitBlocks: document.querySelectorAll('#streamed-inline-split-case > .elm-math-rescued-block').length,
    streamedSplitKatex: document.querySelectorAll('#streamed-inline-split-case .katex').length,
    streamedNewlineRunRescued: document.querySelectorAll('#streamed-newline-run .elm-math-rescued-text').length,
    streamedNewlineRunKatex: document.querySelectorAll('#streamed-newline-run .elm-math-rescued-text .katex').length
  }));
  assert(afterMutation.setextBlocks === 1, 'repeated scanning duplicated a display formula');
  assert(afterMutation.lateRendered > 0, 'incrementally added math was not processed');
  assert(afterMutation.streamedRendered > 0,
    'a rapidly replaced streaming node was missed by incremental scanning');
  assert(afterMutation.mixedLocalChains === 1 && afterMutation.mixedValidMath === 2,
    'repeated scanning duplicated or skipped mixed local math repairs');
  assert(afterMutation.docCodeRepaired === '\\author{} and $\\frac{1}{2}$',
    `an already-repaired code block whose text was replaced was not re-repaired: ${afterMutation.docCodeRepaired}`);
  assert(afterMutation.streamedSplitBlocks === 1 && afterMutation.streamedSplitKatex > 0,
    `a streaming inline formula split across h1/p was not rescued on rescan: blocks ${afterMutation.streamedSplitBlocks}, katex ${afterMutation.streamedSplitKatex}`);
  assert(afterMutation.streamedNewlineRunRescued === 1 && afterMutation.streamedNewlineRunKatex > 0,
    `a streaming formula split across text nodes with a newline was not rescued: rescued ${afterMutation.streamedNewlineRunRescued}, katex ${afterMutation.streamedNewlineRunKatex}`);

  const settleCatchUp = await page.evaluate(async () => {
    const section = document.createElement('section');
    section.id = 'settle-tail-case';
    section.className = 'markdown';
    const nativeSpan = (source) =>
      `<span><span class="katex" data-copytex-latex="${source}"><span class="katex-mathml"><math><semantics><mrow><mtext>${source}</mtext></mrow><annotation encoding="application/x-tex">${source}</annotation></semantics></math></span></span></span>`;
    section.innerHTML = `<p id="settle-chain">有限集合 $S${nativeSpan('对')}n&gt;1${nativeSpan('的 rational rank 没有影响，因为 localization sequence 中有限域的 higher')}K$</p>`;
    document.querySelector('main').appendChild(section);

    const originalObserve = globalThis.MutationObserver.prototype.observe;
    globalThis.MutationObserver.prototype.observe = function () {};
    globalThis.__elmRestoreObserve = () => {
      globalThis.MutationObserver.prototype.observe = originalObserve;
    };

    await new Promise((resolve) => setTimeout(resolve, 500));

    const chainBefore = document.querySelectorAll('#settle-chain .elm-math-local-rendered .katex').length;
    const chain = document.querySelector('#settle-chain');
    chain.appendChild(document.createTextNode('-groups 只贡献 torsion。因此对 $n>1$，大体可以忽略 $S'));
    chain.appendChild(document.createTextNode('$ 对维数的影响。'));
    globalThis.__elmRestoreObserve();
    delete globalThis.__elmRestoreObserve;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    return {
      chainBefore,
      chainAfter: document.querySelectorAll('#settle-chain .elm-math-local-rendered .katex').length,
      tailRescued: document.querySelectorAll('#settle-chain .elm-math-rescued-text').length,
      tailMath: document.querySelectorAll('#settle-chain .elm-math-rescued-text .katex').length
    };
  });
  assert(settleCatchUp.chainBefore > 0,
    'the native chain was not repaired before the tail arrived');
  assert(settleCatchUp.chainAfter === settleCatchUp.chainBefore,
    'the settle scan duplicated the repaired chain content');
  assert(settleCatchUp.tailRescued === 1 && settleCatchUp.tailMath === 2,
    `a streaming tail split across adjacent text nodes was not rescued: rescued ${settleCatchUp.tailRescued}, rendered ${settleCatchUp.tailMath}`);

  const segmentCacheCalls = await page.evaluate(() => {
    let calls = 0;
    const original = globalThis.katex.renderToString.bind(globalThis.katex);
    globalThis.katex.renderToString = (...args) => {
      calls++;
      return original(...args);
    };
    const texts = Array.from({ length: 12 }, (_, index) => `Text ${index}: $x_1 + y_2$.`);
    try {
      for (const text of texts) {
        if (!globalThis.ELMMathFixerCore.isSafeMixedTextMath(text)) return -1;
      }
      return calls;
    } finally {
      globalThis.katex.renderToString = original;
    }
  });
  assert(segmentCacheCalls > 0 && segmentCacheCalls < 12,
    'segment validation cache did not reuse repeated formula validation');

  await page.evaluate(() => {
    globalThis.__elmOriginalIsFixerEnabled = globalThis.ELMMathFixerUI.isFixerEnabled;
    globalThis.ELMMathFixerUI.isFixerEnabled = () => false;
    const cached = document.createElement('section');
    cached.id = 'cached-history-chat';
    cached.className = 'markdown';
    cached.hidden = true;
    cached.innerHTML = '<p>Cached history: $\\kappa_1(u)$.</p>';
    document.querySelector('main').appendChild(cached);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    globalThis.ELMMathFixerUI.isFixerEnabled = globalThis.__elmOriginalIsFixerEnabled;
    delete globalThis.__elmOriginalIsFixerEnabled;
    const cached = document.querySelector('#cached-history-chat');
    cached.hidden = false;
    cached.querySelector('p').appendChild(document.createTextNode(' Restored.'));
  });
  await page.waitForTimeout(1100);
  const cachedHistoryRendered = await page.evaluate(() =>
    document.querySelectorAll('#cached-history-chat .katex').length
  );
  assert(cachedHistoryRendered > 0,
    'showing a cached chat through an attribute-only change did not trigger math repair');

  await page.evaluate(() => document.querySelector('#elm-math-fixer-toggle').click());
  await page.waitForTimeout(100);
  const restored = await page.evaluate(() => ({
    blocks: document.querySelectorAll('.elm-math-rescued-block').length,
    wrappers: document.querySelectorAll('.elm-math-rescued-wrapper').length,
    codeHosts: document.querySelectorAll('.elm-math-rescued-code').length,
    codeBlockEscapeRestored: document.querySelector('#code-block-escape-case code')?.textContent,
    codeBlockEscapeUnescapedLeft: document.querySelectorAll('#code-block-escape-case code.elm-math-code-unescaped').length,
    codeBlockMixedRestored: document.querySelector('#code-block-mixed-case code')?.textContent,
    codeBlockMixedUnescapedLeft: document.querySelectorAll('#code-block-mixed-case code.elm-math-code-unescaped').length,
    codeBlockLatexInlineRestored: document.querySelector('#code-block-latex-inline code')?.textContent,
    codeBlockLatexInlineUnescapedLeft: document.querySelectorAll('#code-block-latex-inline code.elm-math-code-unescaped').length,
    codeBlockLatexEnvRestored: document.querySelector('#code-block-latex-env code')?.textContent,
    codeBlockLatexEnvUnescapedLeft: document.querySelectorAll('#code-block-latex-env code.elm-math-code-unescaped').length,
    boundarySpacers: document.querySelectorAll('.elm-math-boundary-space').length,
    nativeBraceRepairs: document.querySelectorAll('.elm-math-native-brace-repair').length,
    nativeBraceOriginal: document.querySelector('#native-paired-braces annotation[encoding="application/x-tex"]')?.textContent,
    localChains: document.querySelectorAll('.elm-math-local-chain').length,
    mispairedNativeOriginal: document.querySelectorAll('#mispaired-native .katex').length,
    mispairedChainOriginal: document.querySelectorAll('#mispaired-native-chain .katex').length,
    multipleOriginal: document.querySelectorAll('#mispaired-native-multiple .katex').length,
    multipleStrongText: document.querySelector('#mispaired-native-multiple > strong')?.textContent,
    mixedOriginal: document.querySelectorAll('#mixed-valid-and-mispaired .katex').length,
    mixedRescuedText: document.querySelectorAll('#mixed-valid-and-mispaired .elm-math-rescued-text').length,
    mixedStrongText: document.querySelector('#mixed-valid-and-mispaired > strong')?.textContent,
    unknownOriginal: document.querySelectorAll('#mispaired-native-unknown .katex').length,
    unknownRescuedText: document.querySelectorAll('#mispaired-native-unknown .elm-math-rescued-text').length,
    setextHeadingVisible: getComputedStyle(document.querySelector('#setext-case > h1')).display !== 'none',
    splitMarkerUlVisible: getComputedStyle(document.querySelector('#split-marker-case > ul')).display !== 'none',
    splitMarkerUlClass: document.querySelector('#split-marker-case > ul')?.className
  }));
  assert(restored.blocks === 0 && restored.wrappers === 0 && restored.codeHosts === 0 && restored.boundarySpacers === 0 && restored.localChains === 0 && restored.nativeBraceRepairs === 0,
    'turning Fixer off did not restore the original DOM');
  assert(restored.codeBlockEscapeRestored?.includes('\\\\frac') && restored.codeBlockEscapeUnescapedLeft === 0,
    'turning Fixer off did not restore the escaped code block content');
  assert(restored.codeBlockMixedRestored?.includes('\\\\frac') && restored.codeBlockMixedUnescapedLeft === 0,
    'turning Fixer off did not restore the mixed code block content');
  assert(restored.codeBlockLatexInlineRestored === 'The ratio is $\\\\frac{1}{2}$.' && restored.codeBlockLatexInlineUnescapedLeft === 0,
    'turning Fixer off did not restore the inline latex code block content');
  assert(restored.codeBlockLatexEnvRestored?.includes('\\\\begin{aligned}') && restored.codeBlockLatexEnvUnescapedLeft === 0,
    'turning Fixer off did not restore the latex environment code block content');
  assert(restored.setextHeadingVisible, 'turning Fixer off left the original heading hidden');
  assert(restored.splitMarkerUlVisible && !restored.splitMarkerUlClass?.includes('elm-math-split-original'),
    'turning Fixer off left the empty list marker hidden');
  assert(restored.mispairedNativeOriginal === 1,
    'turning Fixer off did not restore the original mispaired native math');
  assert(restored.mispairedChainOriginal === 2,
    'turning Fixer off did not restore the original continuous native mismatch');
  assert(restored.multipleOriginal === 2 && restored.multipleStrongText === 'Cases (1), (2), and (3).',
    'turning Fixer off did not restore multiple local mismatches and bold markup');
  assert(restored.mixedOriginal === 1 && restored.mixedRescuedText === 0 && restored.mixedStrongText === '$w=-1$',
    'turning Fixer off did not restore mixed valid and mispaired inline math');
  assert(restored.unknownOriginal === 1 && restored.unknownRescuedText === 0,
    'turning Fixer off did not restore an undefined-command local repair');
  assert(restored.nativeBraceOriginal === 'S=\\\\{(\\mathfrak{p})\\\\}',
    'turning Fixer off did not restore native doubled set braces');

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
