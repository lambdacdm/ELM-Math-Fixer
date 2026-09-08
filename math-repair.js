(function () {
  'use strict';

  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log('[ELM Math Fixer]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[ELM Math Fixer]', ...args); };

  const hasMath = (text) => text.includes('$') || text.includes('\\(') || text.includes('\\[');

  function countMathDelimiters(text) {
    const tokens = text.match(
      /(?<!\\)(?:\\\\)*\$\$|(?<!\\)(?:\\\\)*\$(?!\$)|(?<!\\)(?:\\\\)*\\[\[\]()]/g
    ) || [];
    let delimiters = 0;
    let dollars = 0;
    let brackets = 0;
    for (const token of tokens) {
      if (token.endsWith('$$')) delimiters++;
      else if (token.endsWith('$')) dollars++;
      else brackets++;
    }
    return { delimiters, dollars, brackets };
  }

  const CORE = globalThis.ELMMathFixerCore;
  if (!CORE) throw new Error('ELM Math Fixer core failed to load.');
  const {
    normalizePairedEscapedSetBraces,
    normalizeEscapedLatexText,
    normalizeCodeBlockLatexLayer,
    unwrapEscapedLatexLayer,
    normalizeMathDelimiterWhitespace,
    protectMathBoundaryWhitespace,
    isEscapedAt,
    isSafeMixedTextMath
  } = CORE;
  const MAX_SPLIT_MATH_NODES = 12;
  const MAX_SPLIT_MATH_LENGTH = 50000;
  const MAX_MISPAIRED_NATIVE_MATH = 12;
  const MAX_MISPAIRED_NATIVE_LENGTH = 20000;
  const SETEXT_OPERATOR_BY_TAG = { H1: '=', H2: '-' };
  let getMathTextCache = new WeakMap();

  function isDelimitedMathText(text) {
    return (
      /^\$\$[\s\S]+\$\$$/.test(text) ||
      /^\$(?!\$)[^$\r\n]+\$$/.test(text) ||
      /^\\\[[\s\S]+\\\]$/.test(text) ||
      /^\\\([\s\S]+\\\)$/.test(text)
    );
  }

  function getCodeWrappedMathText(code) {
    if (
      code.closest(
        'pre, .elm-math-hidden-original, .elm-math-rescued-block, .elm-math-rescued-code, .elm-math-rescued-wrapper, .elm-math-code-unescaped'
      )
    ) {
      return null;
    }

    const text = (code.textContent || '').trim();
    if (!isDelimitedMathText(text)) return null;
    return normalizeMathDelimiterWhitespace(text);
  }

  function unescapeEscapedCodeMath(container) {
    container
      .querySelectorAll(
        'code[class~="language-latex"], code[class~="language-tex"], pre > code[class~="language-none"]'
      )
      .forEach((code) => {
        if (
          code.closest(
            '.elm-math-hidden-original, .elm-math-rescued-block, .elm-math-rescued-code, .elm-math-rescued-wrapper'
          )
        ) {
          return;
        }

        const raw = code.textContent || '';
        if (!raw.includes('\\\\')) return;

        const unwrapped = unwrapEscapedLatexLayer(raw);
        let changed = unwrapped !== raw ? unwrapped : normalizeEscapedLatexText(raw);
        if (!code.classList.contains('language-none')) {
          changed = normalizeCodeBlockLatexLayer(changed);
        }
        if (changed === raw) return;

        code.classList.add('elm-math-code-unescaped');
        if (!code.dataset.elmMathOriginalText) code.dataset.elmMathOriginalText = raw;
        code.textContent = changed;
      });
  }

  function rescueCodeWrappedMath(container) {
    container.querySelectorAll('code').forEach((code) => {
      const mathText = getCodeWrappedMathText(code);
      if (!mathText) return;

      const rendered = document.createElement('span');
      rendered.className = 'elm-math-rescued-code-rendered';
      rendered.textContent = mathText;

      try {
        renderMathInto(rendered);
        if (!hasAcceptableMathResult(rendered)) return;

        const host = document.createElement('span');
        host.className = 'elm-math-rescued-code';
        host.dataset.rawText = code.textContent || '';
        code.dataset.elmMathOriginalDisplay = code.style.display;
        code.classList.add('elm-math-code-original');
        code.style.display = 'none';
        code.replaceWith(host);
        host.appendChild(code);
        host.appendChild(rendered);
      } catch (error) {
        warn('failed to render code-wrapped math:', error);
      }
    });
  }

  function rescueMixedTextMath(el) {
    if (!hasMath(el.textContent || '')) return;
    const ignoredSelector = [
      'code',
      'pre',
      '.katex',
      '.elm-math-hidden-original',
      '.elm-math-rescued-block',
      '.elm-math-rescued-code',
      '.elm-math-rescued-text',
      '.elm-math-rescued-wrapper',
      '.elm-math-local-chain',
      '.elm-math-local-original',
      '.elm-math-local-rendered',
      '.elm-math-native-brace-repair',
      '.elm-math-code-unescaped'
    ].join(', ');

    normalizeCrossingEmphasis(el, ignoredSelector);

    const runs = getTextRuns(el, ignoredSelector);

    runs.forEach((run) => {
      const runText = run.text.includes('\n') ? flattenSplitInlineMath(run.text) : run.text;
      if (!isSafeMixedTextMath(runText, { allowUndefinedCommands: true })) return;
      const wrapper = document.createElement('span');
      wrapper.textContent = runText;

      try {
        renderMathInto(wrapper);
        if (!hasAcceptableMathResult(wrapper)) return;

        const host = document.createElement('span');
        host.className = 'elm-math-rescued-text';
        host.dataset.rawText = runText;
        while (wrapper.firstChild) host.appendChild(wrapper.firstChild);
        run.nodes[0].replaceWith(host);
        for (let i = 1; i < run.nodes.length; i++) run.nodes[i].remove();
      } catch (error) {
        warn('failed to render mixed text math:', error);
      }
    });

    rescueEmphasisSplitMathRuns(el, runs);
  }

  function getTextRuns(host, ignoredSelector) {
    const runs = [];
    let current = null;
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest(ignoredSelector)) {
        current = null;
        continue;
      }
      if (!current || node.previousSibling !== current.nodes[current.nodes.length - 1]) {
        current = { nodes: [], text: '' };
        runs.push(current);
      }
      current.nodes.push(node);
      current.text += node.textContent || '';
    }
    return runs;
  }

  function getNodeTextOffset(host, node) {
    const range = document.createRange();
    range.selectNodeContents(host);
    range.setEndBefore(node);
    return range.toString().length;
  }

  // A Markdown emphasis element can span two broken inline formulas at once:
  // the `_..._` pair wraps `[part of $A$][prose][part of $B$]`, so one `<em>`
  // element contains the closing `$` of one formula and the opening `$` of the
  // next. It can also span from inside a display `$$...$$` body into prose
  // (e.g. `per<em>{p,v}(b_i)=0\n$$\nwas found with </em>`), swallowing the
  // closing delimiter. Normalize such elements back into flat text with `_`
  // markers at the math boundaries (symmetric for crossing, asymmetric for
  // spanning), but only after the reconstructed runs validate.
  // Genuine prose emphasis never crosses an odd number of unpaired `$` tokens
  // and never has one endpoint inside a math body, so the parity gate plus the
  // dry-run validation keep it untouched.
  function normalizeCrossingEmphasis(el, ignoredSelector) {
    const emphasisSelector = 'em, i';
    const topEms = Array.from(el.querySelectorAll(emphasisSelector)).filter(
      (node) => !node.parentElement?.closest(emphasisSelector)
    );
    if (topEms.length === 0) return;

    const fullText = el.textContent || '';
    const openAt = (endOffset) => countMathDelimiters(fullText.slice(0, endOffset)).dollars % 2 === 1;
    const crossingIndices = [];
    topEms.forEach((em, index) => {
      const emText = em.textContent || '';
      if (!emText.includes('$')) return;
      const start = getNodeTextOffset(el, em);
      if (openAt(start) && openAt(start + emText.length)) crossingIndices.push(index);
    });

    // Spanning: exactly one endpoint inside a math body (display or inline)
    // and the em text itself contains math delimiters. Use asymmetric markers:
    // leading `_` only if start is in a body, trailing `_` only if end is.
    const mathRanges = getMathBodyRanges(fullText);
    const spanningIndices = [];
    if (mathRanges.length > 0) {
      topEms.forEach((em, index) => {
        if (crossingIndices.includes(index)) return;
        const emText = em.textContent || '';
        if (!hasMath(emText)) return;
        const start = getNodeTextOffset(el, em);
        const end = start + emText.length;
        const startInBody = mathRanges.some((r) => start >= r.start && start < r.end);
        const endInBody = mathRanges.some((r) => end > r.start && end <= r.end);
        if ((startInBody || endInBody) && !(startInBody && endInBody)) {
          spanningIndices.push(index);
        }
      });
    }

    if (crossingIndices.length === 0 && spanningIndices.length === 0) return;

    // Try standard `_` markers first; if validation fails, retry with `}_`
    // for spanning nodes (Markdown can eat the closing `}` of
    // `\operatorname{per}_{p,v}` together with the `_` pair).
    const tryApply = (braceRestore) => {
      const clone = el.cloneNode(true);
      const cloneTopEms = Array.from(clone.querySelectorAll(emphasisSelector)).filter(
        (node) => !node.parentElement?.closest(emphasisSelector)
      );
      if (cloneTopEms.length !== topEms.length) return false;

      crossingIndices.forEach((index) => unwrapCrossingEmphasis(cloneTopEms[index]));
      spanningIndices.forEach((index) => {
        const em = cloneTopEms[index];
        const start = getNodeTextOffset(clone, em);
        const end = start + (em.textContent || '').length;
        const sIn = mathRanges.some((r) => start >= r.start && start < r.end);
        const eIn = mathRanges.some((r) => end > r.start && end <= r.end);
        unwrapSpanningEmphasis(em, sIn, eIn, braceRestore);
      });
      const runs = getTextRuns(clone, ignoredSelector);
      for (const run of runs) {
        if (!run.text.includes('_') || !run.text.includes('$')) continue;
        if (!validateMixedRunText(run.text)) return false;
      }

      crossingIndices.forEach((index) => unwrapCrossingEmphasis(topEms[index]));
      spanningIndices.forEach((index) => {
        const em = topEms[index];
        const start = getNodeTextOffset(el, em);
        const end = start + (em.textContent || '').length;
        const sIn = mathRanges.some((r) => start >= r.start && start < r.end);
        const eIn = mathRanges.some((r) => end > r.start && end <= r.end);
        unwrapSpanningEmphasis(em, sIn, eIn, braceRestore);
      });
      return true;
    };

    if (!tryApply(false)) {
      if (spanningIndices.length > 0) tryApply(true);
    }
  }

  function unwrapCrossingEmphasis(em) {
    const marker = document.createTextNode('_');
    em.before(marker.cloneNode(false));
    em.after(marker.cloneNode(false));
    em.replaceWith(...Array.from(em.childNodes));
  }

  function unwrapSpanningEmphasis(em, leading, trailing, braceRestore = false) {
    if (leading) em.before(document.createTextNode(braceRestore ? `}_` : '_'));
    if (trailing) em.after(document.createTextNode('_'));
    em.replaceWith(...Array.from(em.childNodes));
  }

  function validateMixedRunText(runText) {
    const normalized = runText.includes('\n') ? flattenSplitInlineMath(runText) : runText;
    if (!isSafeMixedTextMath(normalized, { allowUndefinedCommands: true })) return false;
    const wrapper = document.createElement('span');
    wrapper.textContent = normalized;
    try {
      renderMathInto(wrapper);
      return hasAcceptableMathResult(wrapper);
    } catch (error) {
      warn('failed to render crossing emphasis math:', error);
      return false;
    }
  }

  // Markdown-damaged inline formulas can survive as emphasis elements: the
  // underscore/subscript pair `_..._` becomes `<em>...</em>`, splitting one
  // `$...$` formula across several text runs. Reconstruct the group of runs
  // connected only by plain emphasis elements, reverse the emphasis back to
  // its original markers (strictly inside the math range), and rescue the
  // group as one formula when the reconstructed text validates while no
  // individual member run did.
  function rescueEmphasisSplitMathRuns(el, runs) {
    const bridgeAnchor = (node) => {
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;
      let anchor = node;
      let em = node.parentElement;
      while (em && em.matches('em, i') && !em.querySelector('*') && em.childNodes.length === 1) {
        anchor = em;
        em = em.parentElement;
      }
      return anchor;
    };

    const groups = [];
    let currentGroup = null;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (!run.nodes[0]?.isConnected) {
        currentGroup = null;
        continue;
      }
      if (!currentGroup) {
        currentGroup = { runs: [run] };
        groups.push(currentGroup);
        continue;
      }
      const previousRun = currentGroup.runs[currentGroup.runs.length - 1];
      const endAnchor = bridgeAnchor(previousRun.nodes[previousRun.nodes.length - 1]);
      const startAnchor = bridgeAnchor(run.nodes[0]);
      if (!endAnchor || endAnchor.nextSibling !== startAnchor) {
        currentGroup = { runs: [run] };
        groups.push(currentGroup);
        continue;
      }
      currentGroup.runs.push(run);
    }

    groups.forEach((group) => {
      if (group.runs.length < 2) return;
      const fragment = document.createElement('span');
      const appendedEm = new Set();
      group.runs.forEach((run) => {
        run.nodes.forEach((node) => {
          const anchor = bridgeAnchor(node);
          if (anchor && anchor.nodeType === Node.ELEMENT_NODE) {
            if (!appendedEm.has(anchor)) {
              appendedEm.add(anchor);
              fragment.appendChild(anchor.cloneNode(true));
            }
          } else {
            fragment.appendChild(node.cloneNode(true));
          }
        });
      });
      const rawText = group.runs.map((run) => run.text).join('');
      let groupText = getMathAwareTextExcludingRendered(fragment);
      groupText = groupText.includes('\n') ? flattenSplitInlineMath(groupText) : groupText;
      if (groupText === rawText) return;
      if (!isSafeMixedTextMath(groupText, { allowUndefinedCommands: true })) return;
      const wrapper = document.createElement('span');
      wrapper.textContent = groupText;

      try {
        renderMathInto(wrapper);
        if (!hasAcceptableMathResult(wrapper)) return;

        const host = document.createElement('span');
        host.className = 'elm-math-rescued-text';
        host.dataset.rawText = groupText;
        while (wrapper.firstChild) host.appendChild(wrapper.firstChild);
        const allNodes = group.runs.flatMap((run) => run.nodes);
        allNodes[0].replaceWith(host);
        for (let i = 1; i < allNodes.length; i++) allNodes[i].remove();
        el.querySelectorAll('em:empty, i:empty, strong:empty, b:empty').forEach((node) => node.remove());
      } catch (error) {
        warn('failed to render emphasis-split mixed text math:', error);
      }
    });
  }

  function hasNativeRenderedMath(el) {
    const wrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
    return !wrapper && Boolean(el.querySelector('.katex, .katex-display'));
  }

  function getNativeMathSource(math) {
    return (
      math.querySelector('annotation[encoding="application/x-tex"]')?.textContent ||
      math.dataset.copytexLatex ||
      ''
    );
  }

  function restoreNativeBraceRepair(host) {
    const original = host.querySelector(':scope > .elm-math-native-brace-original');
    if (!original) {
      host.remove();
      return;
    }

    original.style.display = original.dataset.elmMathOriginalDisplay || '';
    delete original.dataset.elmMathOriginalDisplay;
    original.classList.remove('elm-math-native-brace-original');
    host.replaceWith(original);
  }

  function rescueNativePairedSetBraces(el) {
    const roots = Array.from(el.querySelectorAll('.katex-display, .katex')).filter((root) => {
      if (root.closest('.elm-math-native-brace-repair')) return false;
      if (root.matches('.katex-display')) {
        return !root.parentElement?.closest('.katex-display');
      }
      return !root.parentElement?.closest('.katex, .katex-display');
    });
    let repaired = false;

    roots.forEach((root) => {
      const source = getNativeMathSource(root);
      const normalized = normalizePairedEscapedSetBraces(source);
      if (!source || normalized === source) return;

      const displayMode = root.matches('.katex-display');
      const rendered = document.createElement('span');
      rendered.className = 'elm-math-native-brace-rendered';
      rendered.textContent = displayMode ? `$$${normalized}$$` : `$${normalized}$`;

      try {
        renderMathInto(rendered);
        if (!hasAcceptableSingleMathResult(rendered)) {
          return;
        }

        const host = document.createElement('span');
        host.className = 'elm-math-native-brace-repair';
        host.dataset.rawText = source;
        root.dataset.elmMathOriginalDisplay = root.style.display;
        root.classList.add('elm-math-native-brace-original');
        root.style.display = 'none';
        root.replaceWith(host);
        host.append(root, rendered);
        repaired = true;
      } catch (error) {
        warn('failed to repair paired escaped set braces:', error);
      }
    });

    return repaired;
  }

  function isLikelyMispairedProse(source) {
    const trimmed = source.trim();
    return (
      trimmed.split(/\s+/).length >= 2 &&
      /^[\p{L}\p{M}][\p{L}\p{M}\s,.;:'"!?()\-\u2013\u2014]*$/u.test(trimmed)
    );
  }

  function countUnescapedDollars(text) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '$' && !isEscapedAt(text, i)) count++;
    }
    return count;
  }

  function hasProseLikeInlineMath(text) {
    const segmentPattern = /\$(?!\$)([^$\r\n]+?)\$/g;
    let match;
    while ((match = segmentPattern.exec(text)) !== null) {
      if (isLikelyMispairedProse(match[1])) return true;
    }
    return false;
  }

  function padMispairedNativeText(source) {
    const leadingSpace = /^\s/.test(source) || /^[,.;:!?)\]}]/.test(source) ? '' : ' ';
    const trailingSpace = /\s$/.test(source) || /[(\[{]$/.test(source) ? '' : ' ';
    return `${leadingSpace}${source}${trailingSpace}`;
  }

  function collectMispairedNativeTokens(el) {
    const tokens = [];
    let virtualText = '';

    function addToken(token, text) {
      token.start = virtualText.length;
      virtualText += text;
      token.end = virtualText.length;
      token.text = text;
      tokens.push(token);
    }

    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          addToken(
            {
              type: 'text',
              node,
              restricted: Boolean(node.parentElement?.closest('a, code, pre, button'))
            },
            text
          );
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;
      if (
        element.matches(
          '.elm-math-local-original, .elm-math-local-chain, .elm-math-native-brace-repair'
        )
      ) {
        return;
      }

      if (
        element.matches('.katex') &&
        !element.parentElement?.closest('.katex') &&
        !element.closest('.katex-display')
      ) {
        const source = getNativeMathSource(element);
        if (!source) return;
        const paddedSource = padMispairedNativeText(source);
        addToken(
          {
            type: 'math',
            node: element,
            source,
            restricted: Boolean(element.closest('a, code, pre, button'))
          },
          `$${paddedSource}$`
        );
        return;
      }

      Array.from(element.childNodes).forEach(visit);
    }

    Array.from(el.childNodes).forEach(visit);
    return { tokens, virtualText };
  }

  function findMispairedNativeRanges(el) {
    const { tokens, virtualText } = collectMispairedNativeTokens(el);
    const mathTokens = tokens.filter((token) => token.type === 'math');
    if (mathTokens.length === 0 || mathTokens.length > MAX_MISPAIRED_NATIVE_MATH) return [];

    const rawDollars = [];
    tokens.forEach((token) => {
      if (token.type !== 'text') return;
      for (let offset = 0; offset < token.text.length; offset++) {
        if (token.text[offset] === '$' && !isEscapedAt(token.text, offset)) {
          rawDollars.push({ token, offset, position: token.start + offset });
        }
      }
    });

    const candidates = [];
    for (let i = 0; i + 1 < rawDollars.length; i += 2) {
      const start = rawDollars[i];
      const end = rawDollars[i + 1];
      const enclosedTokens = tokens.filter(
        (token) => token.start > start.position && token.end <= end.position
      );
      const enclosedMath = enclosedTokens.filter((token) => token.type === 'math');
      const reconstructed = virtualText.slice(start.position, end.position + 1);
      const dollarCount = countUnescapedDollars(reconstructed);
      const inspectionRange = document.createRange();
      inspectionRange.setStart(start.token.node, start.offset);
      inspectionRange.setEnd(end.token.node, end.offset + 1);
      const crossesRestrictedMarkup = Boolean(
        inspectionRange.cloneContents().querySelector?.('a, code, pre, img, button')
      );

      if (
        enclosedMath.length === 0 ||
        enclosedTokens.some((token) => token.restricted) ||
        start.token.restricted ||
        end.token.restricted ||
        crossesRestrictedMarkup ||
        reconstructed.length > MAX_MISPAIRED_NATIVE_LENGTH ||
        reconstructed.includes('$$') ||
        dollarCount < 4 ||
        dollarCount % 2 !== 0 ||
        hasProseLikeInlineMath(reconstructed) ||
        !isSafeMixedTextMath(reconstructed, { allowUndefinedCommands: true })
      ) {
        continue;
      }

      candidates.push({ start, end, reconstructed, dollarCount });
    }

    return candidates;
  }

  function restoreLocalMathChain(host) {
    const original = host.querySelector(':scope > .elm-math-local-original');
    const parent = host.parentNode;
    if (!original || !parent) {
      host.remove();
      return;
    }

    while (original.firstChild) parent.insertBefore(original.firstChild, host);
    host.remove();
    parent.normalize();
  }

  function rescueMispairedNativeInlineMath(el) {
    const candidates = findMispairedNativeRanges(el);
    if (candidates.length === 0) return false;

    const prepared = [];
    try {
      candidates.forEach((candidate) => {
        const rendered = document.createElement('span');
        rendered.className = 'elm-math-local-rendered';
        rendered.textContent = candidate.reconstructed;
        renderMathInto(rendered);
        if (
          !hasAcceptableMathResult(rendered) ||
          rendered.querySelectorAll('.katex').length + rendered.querySelectorAll('.katex-error').length !==
            candidate.dollarCount / 2
        ) {
          throw new Error('local reconstruction did not render every formula');
        }
        prepared.push({ ...candidate, rendered });
      });
    } catch (error) {
      warn('failed to validate local native math repair:', error);
      return false;
    }

    const inserted = [];
    try {
      prepared
        .sort((a, b) => b.start.position - a.start.position)
        .forEach((candidate) => {
          const range = document.createRange();
          range.setStart(candidate.start.token.node, candidate.start.offset);
          range.setEnd(candidate.end.token.node, candidate.end.offset + 1);

          const original = document.createElement('span');
          original.className = 'elm-math-local-original';
          original.style.display = 'none';
          original.appendChild(range.extractContents());

          const host = document.createElement('span');
          host.className = 'elm-math-local-chain';
          host.dataset.rawText = candidate.reconstructed;
          host.append(original, candidate.rendered);
          range.insertNode(host);
          inserted.push(host);
        });
      return inserted.length > 0;
    } catch (error) {
      inserted.forEach(restoreLocalMathChain);
      warn('failed to install local native math repair:', error);
      return false;
    }
  }

  function protectNativeMathBoundaryWhitespace(el) {
    el.querySelectorAll('.katex').forEach((math) => {
      if (
        math.parentElement?.closest('.katex') ||
        math.closest(
          '.katex-display, .elm-math-local-chain, .elm-math-rescued-text, .elm-math-native-brace-repair'
        )
      ) {
        return;
      }

      const before = math.previousSibling;
      if (before?.nodeType === Node.TEXT_NODE && /[ \t]$/.test(before.textContent || '')) {
        before.textContent = (before.textContent || '').slice(0, -1);
        const spacer = document.createElement('span');
        spacer.className = 'elm-math-boundary-space';
        spacer.dataset.originalWhitespace = ' ';
        spacer.textContent = '\u00a0';
        math.before(spacer);
      }

      const after = math.nextSibling;
      if (after?.nodeType === Node.TEXT_NODE && /^[ \t]/.test(after.textContent || '')) {
        after.textContent = (after.textContent || '').slice(1);
        const spacer = document.createElement('span');
        spacer.className = 'elm-math-boundary-space';
        spacer.dataset.originalWhitespace = ' ';
        spacer.textContent = '\u00a0';
        math.after(spacer);
      }
    });
  }

  function getMathBodyRanges(text) {
    const segmentPattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
    const ranges = [];
    let match;

    while ((match = segmentPattern.exec(text)) !== null) {
      const delimiterLength = match[0].startsWith('$$') ? 2 : match[0].startsWith('$') ? 1 : 2;
      ranges.push({
        start: match.index + delimiterLength,
        end: match.index + match[0].length - delimiterLength
      });
    }

    return ranges;
  }

  // Reverse Markdown emphasis only when it sits inside a math-delimited range.
  // Genuine prose emphasis remains as DOM markup and keeps its visual styling.
  // When the default marker reconstruction (e.g. `_..._`) does not produce valid
  // LaTeX, we fall back to alternative emphasis markers and finally to plain
  // text unwrapping so Markdown-damaged math (notably inside pmatrix cells) can
  // still render.
  function getMathAwareClone(el, assumeMath = false) {
    const clone = el.cloneNode(true);
    const fullText = clone.textContent || '';
    if (!assumeMath && !hasMath(fullText)) return clone;

    const mathRanges = assumeMath
      ? [{ start: 0, end: fullText.length }]
      : getMathBodyRanges(fullText);
    const emphasisNodes = Array.from(clone.querySelectorAll('em, i, strong, b')).filter(
      (node) => !node.parentElement?.closest('em, i, strong, b')
    );
    if (emphasisNodes.length === 0) return clone;
    const rangeForPos = document.createRange();
    rangeForPos.selectNodeContents(clone);
    const positionedNodes = emphasisNodes.map((node) => {
      rangeForPos.setEndBefore(node);
      const start = rangeForPos.toString().length;
      return { node, start, end: start + (node.textContent || '').length };
    });

    const containedNodes = positionedNodes.filter(({ start, end }) =>
      mathRanges.some((mathRange) => start >= mathRange.start && end <= mathRange.end)
    );
    const crossingNodes = positionedNodes.filter(
      ({ start, end }) =>
        !mathRanges.some((mathRange) => start >= mathRange.start && end <= mathRange.end) &&
        mathRanges.some((mathRange) => start >= mathRange.start && start < mathRange.end) &&
        mathRanges.some((mathRange) => end > mathRange.start && end <= mathRange.end)
    );
    const spanningNodes = positionedNodes.filter(
      ({ start, end, node }) =>
        !mathRanges.some((mathRange) => start >= mathRange.start && end <= mathRange.end) &&
        !crossingNodes.some((n) => n.node === node) &&
        (mathRanges.some((mathRange) => start >= mathRange.start && start < mathRange.end) ||
          mathRanges.some((mathRange) => end > mathRange.start && end <= mathRange.end)) &&
        hasMath(node.textContent || '')
    );
    const mathNodes = [...containedNodes, ...crossingNodes, ...spanningNodes];
    if (mathNodes.length === 0) return clone;

    const candidateSets = [['_', '__'], ['*', '**'], ['', '']];
    for (const [emMarker, strongMarker] of candidateSets) {
      const trial = clone.cloneNode(true);
      const trialNodes = Array.from(trial.querySelectorAll('em, i, strong, b')).filter(
        (node) => !node.parentElement?.closest('em, i, strong, b')
      );
      trialNodes.forEach((node, idx) => {
        const pn = positionedNodes[idx];
        const isMathNode = pn && mathNodes.some((mn) => mn.node === pn.node);
        if (!isMathNode) return;
        const isStrong = node.matches('strong, b');
        const marker = isStrong ? strongMarker : emMarker;
        const startInBody = mathRanges.some((r) => pn.start >= r.start && pn.start < r.end);
        const endInBody = mathRanges.some((r) => pn.end > r.start && pn.end <= r.end);
        const leading = startInBody ? marker : '';
        const trailing = endInBody ? marker : '';
        const text = node.textContent || '';
        node.replaceWith(document.createTextNode(`${leading}${text}${trailing}`));
      });
      trial.normalize();
      let validationText = normalizeMathDelimiterWhitespace(trial.textContent || '');
      if (assumeMath) {
        const open = validationText.startsWith('$$');
        const close = validationText.endsWith('$$');
        if (!open && close) validationText = '$$' + validationText;
        else if (open && !close) validationText = validationText + '$$';
        else if (!open && !close) validationText = '$$' + validationText + '$$';
      }
      if (isSafeMixedTextMath(validationText)) {
        return trial;
      }
    }

    // Additional trial for spanning nodes: Markdown can eat the closing `}` of
    // `\operatorname{per}_{p,v}` together with the `_` pair, leaving
    // `\operatorname{per<em>{p,v}...`. Inserting `_` alone gives unbalanced
    // braces. Try `}` + marker to restore `\operatorname{per}_{p,v}...`.
    if (spanningNodes.length > 0) {
      const trial = clone.cloneNode(true);
      const trialNodes = Array.from(trial.querySelectorAll('em, i, strong, b')).filter(
        (node) => !node.parentElement?.closest('em, i, strong, b')
      );
      trialNodes.forEach((node, idx) => {
        const pn = positionedNodes[idx];
        const isSpanning = pn && spanningNodes.some((mn) => mn.node === pn.node);
        if (!isSpanning) {
          const isMath = pn && mathNodes.some((mn) => mn.node === pn.node);
          if (!isMath || !containedNodes.some((mn) => mn.node === pn.node)) return;
          const m = node.matches('strong, b') ? '__' : '_';
          const sIn = mathRanges.some((r) => pn.start >= r.start && pn.start < r.end);
          const eIn = mathRanges.some((r) => pn.end > r.start && pn.end <= r.end);
          node.replaceWith(document.createTextNode(`${sIn ? m : ''}${node.textContent || ''}${eIn ? m : ''}`));
          return;
        }
        const marker = node.matches('strong, b') ? '__' : '_';
        const startInBody = mathRanges.some((r) => pn.start >= r.start && pn.start < r.end);
        const endInBody = mathRanges.some((r) => pn.end > r.start && pn.end <= r.end);
        const leading = startInBody ? `}${marker}` : marker;
        const trailing = endInBody ? marker : '';
        const text = node.textContent || '';
        node.replaceWith(document.createTextNode(`${leading}${text}${trailing}`));
      });
      trial.normalize();
      let validationText = normalizeMathDelimiterWhitespace(trial.textContent || '');
      if (assumeMath) {
        const open = validationText.startsWith('$$');
        const close = validationText.endsWith('$$');
        if (!open && close) validationText = '$$' + validationText;
        else if (open && !close) validationText = validationText + '$$';
        else if (!open && !close) validationText = '$$' + validationText + '$$';
      }
      if (isSafeMixedTextMath(validationText)) {
        return trial;
      }
    }

    // All marker candidates failed validation; use the default reconstruction
    // (underscore) which preserves the historical subscript behavior.
    // Crossing/spanning nodes are intentionally excluded from the fallback — if no
    // marker set validated, a crossing unwrap would corrupt prose.
    containedNodes.forEach(({ node }) => {
      const marker = node.matches('strong, b') ? '__' : '_';
      node.replaceWith(document.createTextNode(`${marker}${node.textContent}${marker}`));
    });
    clone.normalize();
    return clone;
  }

  function getMathAwareText(el, assumeMath = false) {
    if (el.nodeType === Node.TEXT_NODE) return el.nodeValue || '';
    // Without math markers the math-aware clone is an untouched deep clone,
    // so the live textContent is identical and skips the cloneNode entirely.
    // (Eaten-delimiter repairs operate on elements WITHOUT math markers too,
    // but they only need this same text — the skip below stays transparent.)
    if (!assumeMath && !hasMath(el.textContent || '')) return el.textContent || '';
    if (assumeMath) {
      const cached = getMathTextCache.get(el);
      if (cached !== undefined) return cached;
    }
    const text = getMathAwareClone(el, assumeMath).textContent || '';
    if (assumeMath) getMathTextCache.set(el, text);
    return text;
  }

  const RENDERED_EXCLUDE_SELECTOR = [
    '.katex',
    '.katex-display',
    '.elm-math-rescued-text',
    '.elm-math-rescued-wrapper',
    '.elm-math-rescued-block',
    '.elm-math-rescued-code',
    '.elm-math-hidden-original',
    '.elm-math-local-chain',
    '.elm-math-local-rendered'
  ].join(', ');

  function getMathAwareTextExcludingRendered(el, assumeMath = false) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(RENDERED_EXCLUDE_SELECTOR).forEach((node) => node.remove());
    return getMathAwareClone(clone, assumeMath).textContent || '';
  }

  function isLikelyMathFragment(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    if (/\\[A-Za-z]+|[_^{}]|\d|[+\-*/<>]|[()[\],]/.test(trimmed)) return true;
    return !/[A-Za-z]{3,}/.test(trimmed);
  }

  function isEmptySplitListMarker(node) {
    if (node?.nodeType !== Node.ELEMENT_NODE) return false;
    if (!node.matches('ol, ul') || node.children.length !== 1) return false;
    const item = node.firstElementChild;
    return item?.tagName === 'LI' && !(item.textContent || '').trim();
  }

  function hasOnlyAllowedSplitSeparators(previous, next, markers) {
    let cursor = previous.nextSibling;
    let emptyListCount = 0;
    while (cursor && cursor !== next) {
      if (cursor.nodeType === Node.ELEMENT_NODE) {
        if (!isEmptySplitListMarker(cursor) || emptyListCount > 0) return false;
        emptyListCount++;
        if (markers && cursor.tagName === 'UL') markers.push(cursor);
      } else if (cursor.nodeType === Node.TEXT_NODE && (cursor.nodeValue || '').trim()) {
        return false;
      }
      cursor = cursor.nextSibling;
    }
    return cursor === next;
  }

  function flattenSplitInlineMath(text) {
    return text.replace(/(?<!\$)\$(?!\$)[\s\S]*?(?<!\$)\$(?!\$)/g, (segment) =>
      segment.includes('\n') ? segment.replace(/\s*\n\s*/g, ' ') : segment
    );
  }

  // Markdown consumes standalone "=" and "-" lines as Setext heading markers.
  // Infer them only inside one structurally continuous split display formula.
  function inferSetextOperatorRepair(group) {
    if (group.length < 2 || group[group.length - 1].tagName !== 'P') return null;
    if (!['H1', 'H2'].includes(group[0].tagName)) return null;
    if (group.some((node) => !['H1', 'H2', 'P'].includes(node.tagName))) return null;

    const operators = group
      .map((node) => SETEXT_OPERATOR_BY_TAG[node.tagName])
      .filter(Boolean);
    if (operators.length === 0) return null;

    for (let i = 1; i < group.length; i++) {
      if (
        group[i].parentElement !== group[0].parentElement ||
        !hasOnlyAllowedSplitSeparators(group[i - 1], group[i])
      ) {
        return null;
      }
    }

    const fragments = group.map((node) => getMathAwareText(node, true));
    const openingText = fragments[0].trim();
    const closingText = fragments[fragments.length - 1].trim();
    const completeText = fragments.join('\n');

    if (!openingText.startsWith('$$') || !closingText.endsWith('$$')) return null;
    if ((openingText.match(/\$\$/g) || []).length !== 1) return null;
    if ((completeText.match(/\$\$/g) || []).length !== 2) return null;

    const mathFragments = fragments.map((fragment, index) => {
      let body = fragment.trim();
      if (index === 0) body = body.slice(2).trim();
      if (index === fragments.length - 1) body = body.slice(0, -2).trim();
      return body;
    });
    const nonemptyMathFragments = mathFragments.filter(Boolean);
    const hasClosingOnlyParagraph =
      mathFragments[mathFragments.length - 1] === '' && closingText === '$$';
    if (nonemptyMathFragments.length < (hasClosingOnlyParagraph ? 1 : 2)) return null;
    if (mathFragments.some((fragment, index) => {
      if (fragment) return !isLikelyMathFragment(fragment);
      return index !== mathFragments.length - 1 || !hasClosingOnlyParagraph;
    })) {
      return null;
    }

    let repairedText = '';
    const effectiveOperators = [];
    group.forEach((node, index) => {
      repairedText += fragments[index];
      const operator = SETEXT_OPERATOR_BY_TAG[node.tagName];
      const hasLaterMathFragment = mathFragments.slice(index + 1).some(Boolean);
      if (operator && hasLaterMathFragment) {
        repairedText += `\n${operator}\n`;
        effectiveOperators.push(operator);
      } else if (index < group.length - 1) {
        repairedText += '\n';
      }
    });

    if (!isSafeMixedTextMath(repairedText, { allowUndefinedCommands: true })) return null;

    let reason = 'setext-operators';
    if (effectiveOperators.length === 1 && effectiveOperators[0] === '=') reason = 'setext-equals';
    if (effectiveOperators.length === 1 && effectiveOperators[0] === '-') reason = 'setext-minus';
    return { text: repairedText, reason };
  }

  // Markdown treats "\[" and "\]" as punctuation escapes, so a display formula
  // split by Markdown may lose its backslash delimiters entirely, leaving bare
  // "[" and "]" that no other repair path recognises. Rebuild \[...\] only for
  // a structural Setext chain (heading + closing paragraph) whose body
  // contains a LaTeX command and which validates cleanly.
  function rescueEatenBracketSetext(el) {
    if (hasNativeRenderedMath(el)) return false;

    const group = [el];
    let node = el.nextSibling;
    while (node && group.length < MAX_SPLIT_MATH_NODES) {
      if (node.nodeType === Node.TEXT_NODE && !(node.nodeValue || '').trim()) {
        node = node.nextSibling;
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      if (isEmptySplitListMarker(node)) {
        node = node.nextSibling;
        continue;
      }
      if (!['H1', 'H2', 'P'].includes(node.tagName)) return false;
      if (node.parentElement !== el.parentElement) return false;
      if (!hasOnlyAllowedSplitSeparators(group[group.length - 1], node)) return false;
      if (hasNativeRenderedMath(node)) return false;
      group.push(node);
      if (getMathAwareText(node, true).trimEnd().endsWith(']')) break;
      node = node.nextSibling;
    }
    if (group.length < 2 || group[group.length - 1].tagName !== 'P') return false;

    const fragments = group.map((item) => getMathAwareText(item, true));
    const completeText = fragments.join('\n');
    if (completeText.length > MAX_SPLIT_MATH_LENGTH) return false;
    const openingText = fragments[0].trimStart();
    const closingText = fragments[fragments.length - 1].trimEnd();
    if (!openingText.startsWith('[') || !closingText.endsWith(']')) return false;
    if ((completeText.match(/[[]/g) || []).length !== 1) return false;
    if ((completeText.match(/[\]]/g) || []).length !== 1) return false;

    const bodyFragments = fragments.map((fragment, index) => {
      let body = fragment.trim();
      if (index === 0) body = body.slice(1).trim();
      if (index === fragments.length - 1) body = body.slice(0, -1).trim();
      return restoreEatenBracketBackslashes(body);
    });
    if (!bodyFragments.some((body) => /\\[A-Za-z]+/.test(body))) return false;
    const hasClosingOnlyParagraph =
      bodyFragments[bodyFragments.length - 1] === '' && closingText === ']';
    if (bodyFragments.some((body, index) => {
      if (body) return !isLikelyMathFragment(body);
      return index !== bodyFragments.length - 1 || !hasClosingOnlyParagraph;
    })) {
      return false;
    }

    let repairedText = '';
    const effectiveOperators = [];
    group.forEach((item, index) => {
      repairedText += bodyFragments[index];
      const operator = SETEXT_OPERATOR_BY_TAG[item.tagName];
      const hasLaterMathFragment = bodyFragments.slice(index + 1).some(Boolean);
      if (operator && hasLaterMathFragment) {
        repairedText += `\n${operator}\n`;
        effectiveOperators.push(operator);
      } else if (index < group.length - 1) {
        repairedText += '\n';
      }
    });

    repairedText = `\\[ ${repairedText} \\]`;
    if (!isSafeMixedTextMath(repairedText, { allowUndefinedCommands: true })) return false;

    let reason = 'setext-operators';
    if (effectiveOperators.length === 1 && effectiveOperators[0] === '=') reason = 'setext-equals';
    if (effectiveOperators.length === 1 && effectiveOperators[0] === '-') reason = 'setext-minus';
    finalizeSplitMathRescue(group, [], repairedText, { text: repairedText, reason });
    return true;
  }

  const EATEN_BRACKET_DELIMITER_COMMANDS = [
    'left', 'right', 'big', 'Big', 'bigl', 'bigr', 'Bigl', 'Bigr',
    'biggl', 'biggr', 'Biggl', 'Biggr'
  ];
  const EATEN_BRACKET_ARGUMENT_COMMANDS = {
    frac: 2,
    dfrac: 2,
    tfrac: 2,
    cfrac: 2,
    binom: 2,
    dbinom: 2,
    tbinom: 2,
    sqrt: 1,
    mathbb: 1,
    mathrm: 1,
    mathbf: 1,
    mathcal: 1,
    mathfrak: 1,
    mathscr: 1,
    mathsf: 1,
    mathtt: 1,
    mathit: 1,
    boldsymbol: 1,
    text: 1,
    textrm: 1,
    textsf: 1,
    texttt: 1,
    mbox: 1,
    makebox: 1,
    overset: 2,
    underset: 2,
    stackrel: 2,
    substack: 1,
    pmod: 1,
    operatorname: 1,
    color: 1,
    textcolor: 1,
    begin: 1,
    end: 1,
    underbrace: 1,
    overbrace: 1,
    phantom: 1,
    hphantom: 1,
    vphantom: 1,
    hspace: 1,
    vspace: 1,
    mspace: 1,
    raisebox: 1,
    newcommand: 2,
    renewcommand: 2,
    DeclareMathOperator: 2,
    genfrac: 6
  };
  function restoreEatenLiteralBraces(text) {
    let result = '';
    let pendingArgs = 0;
    const braceStack = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\') {
        let j = i + 1;
        while (j < text.length && /[A-Za-z]/.test(text[j])) j++;
        if (j === i + 1) {
          result += text.slice(i, i + 2);
          i++;
          continue;
        }
        const arity = EATEN_BRACKET_ARGUMENT_COMMANDS[text.slice(i + 1, j)];
        if (arity) pendingArgs += arity;
        result += text.slice(i, j);
        i = j - 1;
        continue;
      }
      if (ch === '{') {
        const isArgument = pendingArgs > 0 || text[i - 1] === '^' || text[i - 1] === '_';
        if (pendingArgs > 0) pendingArgs--;
        braceStack.push(isArgument ? 'arg' : 'lit');
        result += isArgument ? '{' : '\\{';
        continue;
      }
      if (ch === '}') {
        const matching = braceStack.length > 0 ? braceStack.pop() : 'lit';
        result += matching === 'arg' ? '}' : '\\}';
        continue;
      }
      if (ch === '[' && pendingArgs > 0 && braceStack.length === 0) {
        let j = i;
        while (j < text.length && text[j] !== ']') j++;
        result += text.slice(i, Math.min(j + 1, text.length));
        i = j;
        continue;
      }
      if (pendingArgs > 0 && braceStack.length === 0 && !/\s/.test(ch)) pendingArgs--;
      result += ch;
    }
    return result;
  }
  function restoreEatenBracketBackslashes(text) {
    const pattern = new RegExp(
      `\\\\(left|right|big|Big|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)([{}])`,
      'g'
    );
    return restoreEatenLiteralBraces(
      text.replace(pattern, '\\$1\\$2').replace(/,\s?;/g, ',\\;')
    );
  }

  // A \\\\[...\\\\] formula that stayed inside one element also loses its
  // delimiters: the element text is a bare multiline "[\\n...\\n]". Rebuild it
  // only when the body is multiline (prose brackets stay on one line) and
  // validates as a display formula.
  function rescueEatenBracketSingle(el, text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false;
    const rawBody = trimmed.slice(1, -1);
    if (!rawBody.includes('\n')) return false;
    const body = rawBody.trim();
    if (!isLikelyMathFragment(body)) return false;
    if (body.length > MAX_SPLIT_MATH_LENGTH) return false;
    const repairedText = `\\[ ${restoreEatenBracketBackslashes(body)} \\]`;
    if (!isSafeMixedTextMath(repairedText, { allowUndefinedCommands: true })) return false;
    finalizeSplitMathRescue([el], [], repairedText, { text: repairedText, reason: 'eaten-brackets' });
    return true;
  }

  function finalizeSplitMathRescue(group, separatorMarkers, combinedText, setextRepair) {
    const prevSibling = group[0].previousElementSibling;
    if (
      prevSibling &&
      prevSibling.classList.contains('elm-math-rescued-block') &&
      prevSibling.dataset.rawText === combinedText
    ) {
      markRescuedLayoutHosts(group[0]);
      group.forEach(hideSplitOriginal);
      separatorMarkers.forEach(hideSplitOriginal);
      return true;
    }

    if (prevSibling && prevSibling.classList.contains('elm-math-rescued-block')) {
      prevSibling.remove();
    }

    const mathBlock = document.createElement('div');
    mathBlock.className = 'elm-math-rescued-block';
    mathBlock.dataset.rawText = combinedText;
    if (setextRepair) mathBlock.dataset.repairReason = setextRepair.reason;
    mathBlock.style.margin = '1em 0';
    mathBlock.textContent = combinedText;

    try {
      renderMathInto(mathBlock);
      if (!hasAcceptableMathResult(mathBlock)) {
        throw new Error('split display math did not render cleanly');
      }

      group.forEach(hideSplitOriginal);
      separatorMarkers.forEach(hideSplitOriginal);
      group[0].parentNode.insertBefore(mathBlock, group[0]);
      markRescuedLayoutHosts(mathBlock);
      return true;
    } catch (error) {
      warn('failed to render split display math:', error);
      return false;
    }
  }

  function cleanMathClone(clone) {
    if (clone.querySelector('br')) {
      clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));
    }

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach((textNode) => {
      textNode.textContent = normalizeMathDelimiterWhitespace(textNode.textContent || '');
    });
    clone.normalize();
    return clone;
  }

  function isBenignKatexError(node) {
    const message = String(node.getAttribute('title') || node.textContent || '');
    return /Undefined control sequence/.test(message);
  }

  function hasBlockingKatexError(root) {
    return [...root.querySelectorAll('.katex-error')].some((node) => !isBenignKatexError(node));
  }

  function hasAcceptableMathResult(root) {
    if (hasBlockingKatexError(root)) return false;
    if ([...root.querySelectorAll('.katex-mathml annotation')].some((node) => !(node.textContent || '').trim())) return false;
    return Boolean(root.querySelector('.katex')) || root.querySelectorAll('.katex-error').length > 0;
  }

  function hasAcceptableSingleMathResult(root) {
    if (hasBlockingKatexError(root)) return false;
    const katexCount = root.querySelectorAll('.katex').length;
    const errorCount = root.querySelectorAll('.katex-error').length;
    return katexCount === 1 || (katexCount === 0 && errorCount === 1);
  }

  function renderMathInto(el) {
    el.normalize();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach((textNode) => {
      const normalizedText = protectMathBoundaryWhitespace(
        normalizeEscapedLatexText(textNode.textContent || '')
      );
      if (normalizedText !== textNode.textContent) textNode.textContent = normalizedText;
    });

    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  }

  function restoreSingleLineElement(el, hiddenOriginal, wrapper) {
    while (hiddenOriginal.firstChild) {
      el.insertBefore(hiddenOriginal.firstChild, hiddenOriginal);
    }
    hiddenOriginal.remove();
    if (wrapper) wrapper.remove();
    if ('elmMathOriginalDisplay' in el.dataset) {
      el.style.display = el.dataset.elmMathOriginalDisplay;
      delete el.dataset.elmMathOriginalDisplay;
    }
  }

  function hideSplitOriginal(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentNode) return;
      const span = document.createElement('span');
      span.className = 'elm-math-split-original';
      span.dataset.elmMathWrappedText = '1';
      node.parentNode.replaceChild(span, node);
      span.appendChild(node);
      span.style.display = 'none';
      return;
    }
    if (!node.classList.contains('elm-math-split-original')) {
      node.dataset.elmMathOriginalDisplay = node.style.display;
      node.classList.add('elm-math-split-original');
    }
    node.style.display = 'none';
  }

  function restoreSplitOriginal(el) {
    if (el.dataset.elmMathWrappedText) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
      }
      el.remove();
      return;
    }
    el.style.display = el.dataset.elmMathOriginalDisplay || '';
    delete el.dataset.elmMathOriginalDisplay;
    el.classList.remove('elm-math-split-original');
  }

  function markRescuedLayoutHosts(node) {
    let host = node.parentElement;
    for (let depth = 0; host && depth < 5; depth++) {
      if (
        depth === 0 ||
        host.matches('markdown, .markdown, .markdown-container, .response-ai, .message-content')
      ) {
        host.classList.add('elm-math-rescued-container');
      }
      host = host.parentElement;
    }
  }

  let restoreToken = 0;

  // Invalidates pending rAF scroll restores (rapid toggle clicks, streaming
  // mutations). restoreAllRescuedMath already guards its phases with the same
  // token; toggle-initiated scroll chains check it via content.js local token.
  function cancelPendingRestores() {
    ++restoreToken;
  }

  // Scroll-position preservation across toggle off/on. Repaired formulas take
  // different space than raw text, so absolute scrollTop values are meaningless
  // after a transition; instead we pin the viewport to a stable content
  // element. TARGET_ELEMENTS are only hidden/revealed by the toggle (never
  // removed), so the anchor's element identity survives both directions.
  const SCROLL_ANCHOR_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
  const SCROLL_ANCHOR_SKIP_SELECTOR =
    '#elm-math-fixer-toggle, #elm-math-fixer-prompt-button, #elm-math-fixer-prompt-panel';
  // A scroller within this distance of its maximum counts as pinned to the
  // bottom (chat follow mode). Restores re-pin instead of anchor-correcting.
  const BOTTOM_PIN_TOLERANCE_PX = 40;
  // Pinned mode additionally requires a meaningful scroll range: barely
  // scrollable content (max within tolerance even at the top) must not count
  // as bottom-following, or enabling repairs would yank a top-anchored reader
  // to the grown maximum. Such scrollers use the anchor-delta path (≈0 move).
  const MIN_PINNABLE_RANGE_PX = 120;
  // Symmetric top pin: a reader at/near the very top stays there. Anchoring to
  // a viewport-center element instead would scroll them down whenever content
  // between the top and that element grows — the exact short-content yank.
  const TOP_PIN_TOLERANCE_PX = 40;

  function isScrollableElement(el) {
    const style = getComputedStyle(el);
    if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) return false;
    return el.scrollHeight > el.clientHeight + 1;
  }

  function isPotentialScrollableElement(el) {
    const style = getComputedStyle(el);
    return ['auto', 'scroll', 'overlay'].includes(style.overflowY);
  }

  function collectScrollScrollers(fromElement) {
    const scrollers = [];
    let node = fromElement;
    while (node && node !== document.body) {
      if (node.nodeType === Node.ELEMENT_NODE && isScrollableElement(node)) {
        scrollers.unshift(node);
      }
      node = node.parentElement;
    }
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) scrollers.unshift(scrollingElement);
    return scrollers;
  }

  function collectPotentialScrollers(fromElement) {
    const scrollers = [];
    let node = fromElement;
    while (node && node !== document.body) {
      if (node.nodeType === Node.ELEMENT_NODE && isPotentialScrollableElement(node)) {
        scrollers.unshift(node);
      }
      node = node.parentElement;
    }
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) scrollers.unshift(scrollingElement);
    return scrollers;
  }

  function captureScrollAnchor() {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const candidates = [
      [centerX, centerY],
      [centerX, centerY - Math.min(200, centerY * 0.5)],
      [centerX, centerY + Math.min(200, centerY * 0.5)]
    ];
    let anchor = null;
    for (const [x, y] of candidates) {
      const stack = document.elementsFromPoint(x, y);
      for (const hit of stack) {
        if (hit.nodeType !== Node.ELEMENT_NODE) continue;
        if (hit.closest(SCROLL_ANCHOR_SKIP_SELECTOR)) continue;
        const block = hit.closest('.elm-math-rescued-block');
        const base = block ? (block.previousElementSibling || block.nextElementSibling) : hit;
        if (!base) continue;
        let cand = null;
        if (base.matches?.(SCROLL_ANCHOR_SELECTOR) && base.getBoundingClientRect().height > 0) {
          cand = base;
        } else {
          cand = base.closest(SCROLL_ANCHOR_SELECTOR);
          if (cand && cand.getBoundingClientRect().height === 0) cand = null;
        }
        if (!cand || cand.getBoundingClientRect().height === 0) {
          let sib = base.nextElementSibling;
          for (let k = 0; k < 3 && sib; k++, sib = sib.nextElementSibling) {
            if (sib.matches(SCROLL_ANCHOR_SELECTOR) && sib.getBoundingClientRect().height > 0) { cand = sib; break; }
          }
          if (!cand || cand.getBoundingClientRect().height === 0) continue;
        }
        if (cand.closest(SCROLL_ANCHOR_SKIP_SELECTOR) || cand.closest('.elm-math-split-original')) continue;
        anchor = cand;
        break;
      }
      if (anchor) break;
    }
    if (!anchor) {
      const cx = centerX, cy = centerY;
      let best = null, bestDist = Infinity;
      document.querySelectorAll(SCROLL_ANCHOR_SELECTOR).forEach((el) => {
        if (!el.isConnected || el.getBoundingClientRect().height === 0) return;
        if (el.closest(SCROLL_ANCHOR_SKIP_SELECTOR) || el.closest('.elm-math-split-original')) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const dist = Math.abs((r.top + r.bottom) / 2 - cy) + Math.abs((r.left + r.right) / 2 - cx) * 0.3;
        if (dist < bestDist) { bestDist = dist; best = el; }
      });
      anchor = best;
    }
    if (!anchor || !anchor.isConnected) return null;

    // Pinning to the growing tail races with streaming appends: when the anchor
    // is the last visible block of its parent, prefer the previous stable
    // sibling. Static content is unaffected (second-last vs last is equivalent).
    const anchorParent = anchor.parentElement;
    if (anchorParent) {
      const visibleSiblings = Array.from(anchorParent.children).filter(
        (sib) => sib.matches?.(SCROLL_ANCHOR_SELECTOR) &&
          sib.getBoundingClientRect().height > 0 &&
          !sib.closest('.elm-math-split-original')
      );
      if (visibleSiblings.length > 1 && visibleSiblings[visibleSiblings.length - 1] === anchor) {
        anchor = visibleSiblings[visibleSiblings.length - 2];
      }
    }

    const scrollers = collectPotentialScrollers(anchor)
      .map((el) => {
        const anchorRect = anchor.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const max = el.scrollHeight - el.clientHeight;
        return {
          el,
          anchorOffset: anchorRect.top - elRect.top,
          scrollTop: el.scrollTop,
          pinnedToBottom: max > MIN_PINNABLE_RANGE_PX && max - el.scrollTop <= BOTTOM_PIN_TOLERANCE_PX,
          pinnedToTop: el.scrollTop <= TOP_PIN_TOLERANCE_PX
        };
      });
    return { anchor, scrollers };
  }

  function restoreScrollAnchor(saved) {
    if (!saved || !saved.anchor) return;
    let anchor = saved.anchor;
    if (!anchor.isConnected || (anchor.getBoundingClientRect().height === 0)) {
      let found = null;
      let cursor = anchor.isConnected ? anchor : (anchor.previousElementSibling || anchor.parentElement);
      for (let step = 0; step < 24 && cursor; step++) {
        if (cursor !== anchor && cursor.isConnected &&
            cursor.getBoundingClientRect().height > 0 &&
            (cursor.matches(SCROLL_ANCHOR_SELECTOR) || cursor.querySelector?.(SCROLL_ANCHOR_SELECTOR))) {
          found = cursor.matches(SCROLL_ANCHOR_SELECTOR) ? cursor : cursor.querySelector(SCROLL_ANCHOR_SELECTOR);
          break;
        }
        cursor = cursor.nextElementSibling || (cursor.parentElement && cursor.parentElement.closest(SCROLL_ANCHOR_SELECTOR));
      }
      if (found) anchor = found;
      else return;
    }
    if (!anchor.isConnected) return;

    // Union saved + fresh potential scrollers so a container that became
    // scrollable after the transition is still corrected.
    const freshScrollers = collectPotentialScrollers(anchor);
    const seen = new Set(saved.scrollers.map((s) => s.el));
    const unionScrollers = [...saved.scrollers];
    for (const el of freshScrollers) {
      if (!seen.has(el)) {
        const anchorRect = anchor.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        // Fresh scroller had no saved offset; extrapolate from document root delta
        const rootDelta = (() => {
          const rootSaved = saved.scrollers.find((s) => s.el === document.scrollingElement);
          const rootFresh = freshScrollers.find((s) => s.el === document.scrollingElement);
          // Not needed for now; use current offset as base (delta 0 => no correction if fresh)
          return 0;
        })();
        unionScrollers.push({ el, anchorOffset: anchorRect.top - elRect.top - rootDelta, scrollTop: el.scrollTop });
      }
    }

    for (const savedScroller of unionScrollers) {
      const el = savedScroller.el;
      if (!el.isConnected) continue;
      const savedEntry = saved.scrollers.find((s) => s.el === el);
      if (savedEntry?.pinnedToTop) {
        // Nothing above the viewport can have meaningfully shifted (at most a
        // tolerance worth of content sits above); keep the top stable instead
        // of chasing a center anchor that growth below has pushed down.
        const max = el.scrollHeight - el.clientHeight;
        const target = Math.max(0, Math.min(savedEntry.scrollTop, max));
        if (Math.abs(el.scrollTop - target) >= 1) el.scrollTop = target;
        continue;
      }
      if (savedEntry?.pinnedToBottom) {
        const max = el.scrollHeight - el.clientHeight;
        const target = Math.max(0, max);
        if (Math.abs(el.scrollTop - target) >= 1) el.scrollTop = target;
        continue;
      }
      // Re-find fresh anchor position for this scroller (anchor may have moved)
      const anchorRect = anchor.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const currentOffset = anchorRect.top - elRect.top;
      // Use saved offset if available, otherwise treat as 0 delta (fresh scroller)
      const savedOffset = savedEntry ? savedEntry.anchorOffset : currentOffset;
      const delta = currentOffset - savedOffset;
      if (Math.abs(delta) < 1) continue;
      const max = el.scrollHeight - el.clientHeight;
      // Adjust from the CURRENT scrollTop: the browser may have auto-clamped
      // or native-anchor-adjusted scrollTop between capture and now (a shrink
      // below the old scrollTop clamps immediately, before our rAF runs).
      // Using the stale saved scrollTop here would double-count that
      // adjustment and overshoot into the clamp.
      el.scrollTop = Math.max(0, Math.min(el.scrollTop + delta, max));
    }
  }

  function restoreAllRescuedMath(options = {}) {
    const token = ++restoreToken;
    const savedScroll = options.preserveScroll ? captureScrollAnchor() : null;

    const phases = [
      // Phase 1: local chain + native brace repair
      () => {
        document.querySelectorAll('.elm-math-local-chain, .elm-math-native-brace-repair').forEach((el) => {
          if (el.classList.contains('elm-math-local-chain')) restoreLocalMathChain(el);
          else restoreNativeBraceRepair(el);
        });
      },
      // Phase 2: hidden original unwrap
      () => {
        document.querySelectorAll('.elm-math-hidden-original').forEach((hiddenOriginal) => {
          const el = hiddenOriginal.parentElement;
          if (!el) return;
          const wrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
          restoreSingleLineElement(el, hiddenOriginal, wrapper);
        });
      },
      // Phase 3: rescued code + rescued text + boundary space + unescaped code
      () => {
        document.querySelectorAll('.elm-math-code-unescaped').forEach((el) => {
          if ('elmMathOriginalText' in el.dataset) {
            el.textContent = el.dataset.elmMathOriginalText;
            delete el.dataset.elmMathOriginalText;
          }
          el.classList.remove('elm-math-code-unescaped');
        });
        document.querySelectorAll('.elm-math-rescued-code, .elm-math-rescued-text, .elm-math-boundary-space').forEach((host) => {
          if (host.classList.contains('elm-math-rescued-code')) {
            const original = host.querySelector(':scope > code.elm-math-code-original');
            if (original) {
              original.style.display = original.dataset.elmMathOriginalDisplay || '';
              delete original.dataset.elmMathOriginalDisplay;
              original.classList.remove('elm-math-code-original');
              host.replaceWith(original);
              return;
            }
            const fallback = document.createElement('code');
            fallback.textContent = host.dataset.rawText || '';
            host.replaceWith(fallback);
          } else if (host.classList.contains('elm-math-rescued-text')) {
            host.replaceWith(document.createTextNode(host.dataset.rawText || ''));
          } else {
            const parent = host.parentNode;
            host.replaceWith(document.createTextNode(host.dataset.originalWhitespace || ' '));
            parent?.normalize();
          }
        });
      },
      // Phase 4: rescued block + split original + container class
      () => {
        document.querySelectorAll('.elm-math-rescued-block, .elm-math-split-original, .elm-math-rescued-container').forEach((el) => {
          if (el.classList.contains('elm-math-rescued-block')) el.remove();
          else if (el.classList.contains('elm-math-split-original')) restoreSplitOriginal(el);
          else el.classList.remove('elm-math-rescued-container');
        });
      }
    ];

    function runPhase(i) {
      if (token !== restoreToken) return;
      if (i >= phases.length) {
        if (savedScroll) requestAnimationFrame(() => {
          if (token !== restoreToken) return;
          restoreScrollAnchor(savedScroll);
          options.onComplete?.();
        });
        else options.onComplete?.();
        return;
      }
      // Collapse the 4 phases synchronously to avoid 3 intermediate paints;
      // a single rAF after all phases restores the viewport once.
      for (let p = i; p < phases.length; p++) {
        if (token !== restoreToken) return;
        phases[p]();
      }
      if (savedScroll) requestAnimationFrame(() => {
        if (token !== restoreToken) return;
        restoreScrollAnchor(savedScroll);
        options.onComplete?.();
      });
      else options.onComplete?.();
    }

    runPhase(0);
    // Returned for the toggle's settled second-pass verification (same saved
    // anchor re-applied after fonts/settle scans finish). Ignored by callers
    // that do not need it.
    return savedScroll;
  }

  function getAffectedMathElements(container, children, affectedRoots) {
    if (affectedRoots === null || affectedRoots === undefined) return null;
    const directIndexes = new Set();
    const connectedElements = affectedRoots
      .map((root) => root?.nodeType === Node.ELEMENT_NODE ? root : root?.parentElement)
      .filter((element) => element?.isConnected);
    const specificElements = connectedElements.filter(
      (element) => element !== container && container.contains(element)
    );
    const rootsToInspect = specificElements.length > 0 ? specificElements : connectedElements;

    for (const element of rootsToInspect) {
      if (element === container || element.contains?.(container)) return null;

      children.forEach((child, index) => {
        if (child === element || child.contains(element) || element.contains?.(child)) {
          directIndexes.add(index);
        }
      });
    }

    const affected = new Set();
    directIndexes.forEach((index) => {
      const start = Math.max(0, index - MAX_SPLIT_MATH_NODES);
      const end = Math.min(children.length - 1, index + MAX_SPLIT_MATH_NODES);
      for (let nearbyIndex = start; nearbyIndex <= end; nearbyIndex++) {
        affected.add(children[nearbyIndex]);
      }
    });
    return affected;
  }

  function getScanChildren(allChildren, affectedElements) {
    if (!affectedElements) return allChildren;
    const affectedIndexes = [];
    allChildren.forEach((child, index) => {
      if (affectedElements.has(child)) affectedIndexes.push(index);
    });
    if (affectedIndexes.length === 0) return allChildren;
    const included = new Set();
    affectedIndexes.forEach((index) => {
      const start = Math.max(0, index - MAX_SPLIT_MATH_NODES);
      const end = Math.min(allChildren.length - 1, index + MAX_SPLIT_MATH_NODES);
      for (let i = start; i <= end; i++) included.add(i);
    });
    return Array.from(included).sort((a, b) => a - b).map((i) => allChildren[i]);
  }

  function finalizeInlineMath(el) {
    const freshClone = cleanMathClone(getMathAwareClone(el));
    if ((freshClone.textContent || '').includes('\n')) {
      const textNodes = [];
      const walker = document.createTreeWalker(freshClone, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) textNodes.push(textNode);
      textNodes.forEach((node) => {
        node.textContent = flattenSplitInlineMath(node.textContent || '');
      });
    }
    const freshText = freshClone.textContent || '';
    const mathWrapper = document.createElement('span');
    mathWrapper.className = 'elm-math-rescued-wrapper';
    mathWrapper.dataset.rawText = freshText;
    while (freshClone.firstChild) mathWrapper.appendChild(freshClone.firstChild);

    try {
      renderMathInto(mathWrapper);
      if (!hasAcceptableMathResult(mathWrapper)) {
        throw new Error('inline math did not render cleanly');
      }

      const newHiddenOriginal = document.createElement('span');
      newHiddenOriginal.className = 'elm-math-hidden-original';
      newHiddenOriginal.style.display = 'none';
      el.dataset.elmMathOriginalDisplay = el.style.display;

      while (el.firstChild) {
        newHiddenOriginal.appendChild(el.firstChild);
      }

      el.appendChild(newHiddenOriginal);
      el.appendChild(mathWrapper);
      el.style.display = '';
      return true;
    } catch (error) {
      warn('failed to render inline math:', error);
      return false;
    }
  }

  // Markdown backslash-escapes also eat \\\\( and \\\\) before inline math
  // delimiters, leaving bare balanced parens around pure-TeX formulas inside
  // prose. Re-delimit only paren pairs whose bodies look like inline math
  // (balanced, TeX markers, no CJK) and gate the whole paragraph on KaTeX
  // validation like every other repair.
  function rescueEatenInlineMath(el, text) {
    if (!text.includes('(') || !text.includes(')') || text.includes('\n')) return false;
    if (text.length > MAX_SPLIT_MATH_LENGTH) return false;
    if (/\\[()]/.test(text)) return false;

    const openIndexes = [];
    const spans = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\') {
        i++;
        continue;
      }
      if (text[i] === '(') {
        openIndexes.push(i);
      } else if (text[i] === ')') {
        if (openIndexes.length === 0) return false;
        const open = openIndexes.pop();
        if (openIndexes.length === 0) spans.push([open, i]);
      }
    }
    if (openIndexes.length > 0 || spans.length === 0) return false;

    let repaired = '';
    let cursor = 0;
    let adopted = 0;
    for (const [open, close] of spans) {
      const body = text.slice(open + 1, close);
      const isInlineBody =
        body.length >= 1 &&
        body.length <= 200 &&
        !/[\u3000-\u303f\uFF00-\uFFEF\u4E00-\u9FFF]/.test(body) &&
        /\\[^\\]|[\^_][0-9A-Za-z(]/.test(body);
      if (!isInlineBody) continue;
      repaired += text.slice(cursor, open) + `\\(${restoreEatenBracketBackslashes(body)}\\)`;
      cursor = close + 1;
      adopted++;
    }
    if (adopted === 0) return false;
    repaired += text.slice(cursor);

    if (!isSafeMixedTextMath(repaired, { allowUndefinedCommands: true })) return false;

    const originalText = el.textContent;
    el.textContent = repaired;
    if (!finalizeInlineMath(el)) {
      el.textContent = originalText;
      return false;
    }
    const mathWrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
    if (mathWrapper) mathWrapper.dataset.repairReason = 'eaten-inline-parens';
    return true;
  }

  function processContainer(container, affectedRoots = null) {
    if (!container?.isConnected) return;
    getMathTextCache = new WeakMap();
    unescapeEscapedCodeMath(container);

    const allChildren = Array.from(container.querySelectorAll(TARGET_ELEMENTS));
    const affectedElements = getAffectedMathElements(container, allChildren, affectedRoots);
    if (affectedElements && affectedElements.size === 0) return;

    const children = getScanChildren(allChildren, affectedElements);

    log(
      'matched text elements:',
      affectedElements ? affectedElements.size : children.length,
      container
    );

    let i = 0;
    while (i < children.length) {
      const el = children[i];

      if (affectedElements && !affectedElements.has(el)) {
        i++;
        continue;
      }

      if (el.closest('.elm-math-rescued-block') || el.classList.contains('elm-math-hidden-original')) {
        i++;
        continue;
      }

      if (el.closest('.elm-math-local-original')) {
        i++;
        continue;
      }

      rescueCodeWrappedMath(el);
      rescueNativePairedSetBraces(el);

      if (el.querySelector('.elm-math-local-chain')) {
        rescueMispairedNativeInlineMath(el);
        protectNativeMathBoundaryWhitespace(el);
        rescueMixedTextMath(el);
        i++;
        continue;
      }

      if (hasNativeRenderedMath(el)) {
        rescueMispairedNativeInlineMath(el);
        protectNativeMathBoundaryWhitespace(el);
        rescueMixedTextMath(el);
        if (!hasMath(el.textContent || '')) {
          i++;
          continue;
        }
        const nativeCounts = countMathDelimiters(getMathAwareTextExcludingRendered(el));
        if (
          nativeCounts.delimiters % 2 === 0 &&
          nativeCounts.dollars % 2 === 0 &&
          nativeCounts.brackets % 2 === 0
        ) {
          i++;
          continue;
        }
      }

      const hiddenOriginal = el.querySelector(':scope > .elm-math-hidden-original');
      const wrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
      let text = hiddenOriginal
        ? getMathAwareText(hiddenOriginal)
        : getMathAwareText(el);
      const { delimiters: delimiterCount, dollars: dollarCount, brackets: bracketCount } = countMathDelimiters(text);

      if (
        !hiddenOriginal &&
        (el.tagName === 'H1' || el.tagName === 'H2') &&
        text.trimStart().startsWith('[') &&
        rescueEatenBracketSetext(el)
      ) {
        i++;
        continue;
      }

      if (!hiddenOriginal && rescueEatenBracketSingle(el, text)) {
        i++;
        continue;
      }

      if (!hiddenOriginal && rescueEatenInlineMath(el, text)) {
        i++;
        continue;
      }

      if (delimiterCount % 2 === 1 || dollarCount % 2 === 1 || bracketCount % 2 === 1) {
        const splitDelimiter = delimiterCount % 2 === 1;
        if (hiddenOriginal) {
          restoreSingleLineElement(el, hiddenOriginal, wrapper);
          getMathTextCache.delete(el);
          text = getMathAwareText(el, true);
        } else {
          text = getMathAwareText(el, true);
        }

        const group = [el];
        const separatorMarkers = [];
        let combinedText = text;
        let totalDelimiters = delimiterCount;
        let totalDollars = dollarCount;
        let totalBrackets = bracketCount;
        let foundEnd = false;
        let nextNode = el.nextSibling;

        while (nextNode && group.length < MAX_SPLIT_MATH_NODES) {
          if (nextNode.nodeType === Node.TEXT_NODE && !(nextNode.nodeValue || '').trim()) {
            nextNode = nextNode.nextSibling;
            continue;
          }
          if (nextNode.nodeType === Node.TEXT_NODE) {
            const nextText = nextNode.nodeValue || '';
            const previousEl = group[group.length - 1];
            if (
              nextNode.parentElement !== el.parentElement ||
              !hasOnlyAllowedSplitSeparators(previousEl, nextNode, separatorMarkers)
            ) {
              break;
            }
            if (combinedText.length + nextText.length + 1 > MAX_SPLIT_MATH_LENGTH) break;
            combinedText += `\n${nextText}`;
            group.push(nextNode);

            const nextCounts = countMathDelimiters(nextText);
            totalDelimiters += nextCounts.delimiters;
            totalDollars += nextCounts.dollars;
            totalBrackets += nextCounts.brackets;
            if (totalDelimiters % 2 === 0 && totalDollars % 2 === 0 && totalBrackets % 2 === 0) {
              foundEnd = true;
              i = children.indexOf(previousEl);
              break;
            }

            nextNode = nextNode.nextSibling;
            continue;
          }
          if (nextNode.nodeType !== Node.ELEMENT_NODE) {
            nextNode = nextNode.nextSibling;
            continue;
          }

          const nextEl = nextNode;
          if (isEmptySplitListMarker(nextEl)) {
            nextNode = nextEl.nextSibling;
            continue;
          }

          const isListWrapper = ['UL', 'OL'].includes(nextEl.tagName) &&
            nextEl.children.length === 1 &&
            nextEl.firstElementChild?.tagName === 'LI';
          const effectiveEl = isListWrapper ? nextEl.firstElementChild : nextEl;

          const nextIndex = children.indexOf(effectiveEl);
          if (nextIndex < 0) break;
          if (effectiveEl.closest('.elm-math-rescued-block')) {
            nextNode = nextEl.nextSibling;
            continue;
          }

          const previousEl = group[group.length - 1];
          if (
            !['H1', 'H2', 'P', 'LI'].includes(effectiveEl.tagName) ||
            nextEl.parentElement !== el.parentElement ||
            !hasOnlyAllowedSplitSeparators(previousEl, nextEl, separatorMarkers)
          ) {
            break;
          }

          if (hasNativeRenderedMath(effectiveEl)) {
            break;
          }

          const nextHidden = effectiveEl.querySelector(':scope > .elm-math-hidden-original');
          const nextText = nextHidden
            ? getMathAwareText(nextHidden, true)
            : hasNativeRenderedMath(effectiveEl)
              ? getMathAwareTextExcludingRendered(effectiveEl, true)
              : getMathAwareText(effectiveEl, true);

          if (combinedText.length + nextText.length + 1 > MAX_SPLIT_MATH_LENGTH) break;
          combinedText += `\n${nextText}`;
          group.push(nextEl);

          const nextCounts = countMathDelimiters(nextText);
          totalDelimiters += nextCounts.delimiters;
          totalDollars += nextCounts.dollars;
          totalBrackets += nextCounts.brackets;
          if (totalDelimiters % 2 === 0 && totalDollars % 2 === 0 && totalBrackets % 2 === 0) {
            foundEnd = true;
            i = nextIndex;
            break;
          }

          nextNode = nextEl.nextSibling;
        }

        if (foundEnd) {
          group.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const hidden = node.querySelector(':scope > .elm-math-hidden-original');
            const oldWrapper = node.querySelector(':scope > .elm-math-rescued-wrapper');
            if (hidden) {
              restoreSingleLineElement(node, hidden, oldWrapper);
              getMathTextCache.delete(node);
            }
          });

          combinedText = group
            .map((node) =>
              node.nodeType === Node.TEXT_NODE
                ? node.nodeValue || ''
                : hasNativeRenderedMath(node)
                  ? getMathAwareTextExcludingRendered(node, true)
                  : getMathAwareText(node, true)
            )
            .join('\n');
          combinedText = flattenSplitInlineMath(combinedText);
          const hasSetextHeading = group.some((node) => node.tagName === 'H1' || node.tagName === 'H2');
          const setextRepair = inferSetextOperatorRepair(group);
          const nativeGroupHead = hasNativeRenderedMath(group[0]);
          if (hasSetextHeading && !setextRepair && splitDelimiter && !nativeGroupHead) {
            i++;
            continue;
          }
          if (setextRepair) combinedText = setextRepair.text;
          if (
            !isSafeMixedTextMath(combinedText, {
              allowUndefinedCommands: true
            })
          ) {
            i++;
            continue;
          }

          finalizeSplitMathRescue(group, separatorMarkers, combinedText, setextRepair);
        }
      } else if (hasMath(text)) {
        const trimmedText = normalizeMathDelimiterWhitespace(text);
        const cleanedText = trimmedText.includes('\n') ? flattenSplitInlineMath(trimmedText) : trimmedText;

        if (!isSafeMixedTextMath(cleanedText, { allowUndefinedCommands: true })) {
          if (hiddenOriginal) restoreSingleLineElement(el, hiddenOriginal, wrapper);
          i++;
          continue;
        }

        if (wrapper) {
          const rawText = wrapper.dataset.rawText || '';
          const normalizedRaw = rawText.includes('\n')
            ? flattenSplitInlineMath(normalizeMathDelimiterWhitespace(rawText))
            : normalizeMathDelimiterWhitespace(rawText);
          if (normalizedRaw === cleanedText) {
            i++;
            continue;
          }
        }

        if (hiddenOriginal) {
          restoreSingleLineElement(el, hiddenOriginal, wrapper);
        }

        finalizeInlineMath(el);
      } else if (hiddenOriginal) {
        restoreSingleLineElement(el, hiddenOriginal, wrapper);
      }

      i++;
    }
  }

  globalThis.ELMMathFixerRepair = {
    processContainer,
    restoreAllRescuedMath,
    captureScrollAnchor,
    restoreScrollAnchor,
    cancelPendingRestores
  };
})();
