(function () {
  'use strict';

  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log('[ELM Math Fixer]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[ELM Math Fixer]', ...args); };

  const hasMath = (text) => text.includes('$') || text.includes('\\(') || text.includes('\\[');

  function countMathDelimiters(text) {
    const tokens = text.match(/\$\$|\$(?!\$)|\\[\[\]()]/g) || [];
    let delimiters = 0;
    let dollars = 0;
    let brackets = 0;
    for (const token of tokens) {
      if (token === '$$') delimiters++;
      else if (token === '$') dollars++;
      else brackets++;
    }
    return { delimiters, dollars, brackets };
  }

  const CORE = globalThis.ELMMathFixerCore;
  if (!CORE) throw new Error('ELM Math Fixer core failed to load.');
  const {
    validateWithLiteralUnknownCommands,
    normalizePairedEscapedSetBraces,
    normalizeEscapedLatexText,
    normalizeCodeBlockLatexLayer,
    unwrapEscapedLatexLayer,
    normalizeMathDelimiterWhitespace,
    protectMathBoundaryWhitespace,
    isEscapedAt,
    getMathSegmentDetails,
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
        if (!rendered.querySelector('.katex') || rendered.querySelector('.katex-error')) return;

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
    const runs = [];
    let current = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
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

    runs.forEach((run) => {
      const runText = run.text.includes('\n') ? flattenSplitInlineMath(run.text) : run.text;
      if (!isSafeMixedTextMath(runText, { allowUndefinedCommands: true })) return;
      const wrapper = document.createElement('span');
      wrapper.textContent = runText;

      try {
        renderMathInto(wrapper, { allowUndefinedCommands: true });
        if (!wrapper.querySelector('.katex') || wrapper.querySelector('.katex-error')) return;

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
        renderMathInto(rendered, { allowUndefinedCommands: true });
        if (rendered.querySelectorAll('.katex').length !== 1 || rendered.querySelector('.katex-error')) {
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
        renderMathInto(rendered, { allowUndefinedCommands: true });
        if (
          rendered.querySelectorAll('.katex').length !== candidate.dollarCount / 2 ||
          rendered.querySelector('.katex-error')
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
    const positionedNodes = emphasisNodes.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(clone);
      range.setEndBefore(node);
      const start = range.toString().length;
      return { node, start, end: start + (node.textContent || '').length };
    });

    const mathNodes = positionedNodes.filter(({ start, end }) =>
      mathRanges.some((mathRange) => start >= mathRange.start && end <= mathRange.end)
    );
    if (mathNodes.length === 0) return clone;

    const candidateSets = [['_', '__'], ['*', '**'], ['', '']];
    for (const [emMarker, strongMarker] of candidateSets) {
      const trial = clone.cloneNode(true);
      const trialNodes = Array.from(trial.querySelectorAll('em, i, strong, b')).filter(
        (node) => !node.parentElement?.closest('em, i, strong, b')
      );
      trialNodes.forEach((node) => {
        const isStrong = node.matches('strong, b');
        const marker = isStrong ? strongMarker : emMarker;
        const text = node.textContent || '';
        node.replaceWith(document.createTextNode(`${marker}${text}${marker}`));
      });
      trial.normalize();
      let validationText = trial.textContent || '';
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
    mathNodes.forEach(({ node }) => {
      const marker = node.matches('strong, b') ? '__' : '_';
      node.replaceWith(document.createTextNode(`${marker}${node.textContent}${marker}`));
    });
    clone.normalize();
    return clone;
  }

  function getMathAwareText(el, assumeMath = false) {
    if (el.nodeType === Node.TEXT_NODE) return el.nodeValue || '';
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
  function restoreEatenBracketBackslashes(text) {
    const pattern = new RegExp(
      `\\\\(left|right|big|Big|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)([{}])`,
      'g'
    );
    return text.replace(pattern, '\\$1\\$2');
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
      renderMathInto(mathBlock, { allowUndefinedCommands: true });
      if (!mathBlock.querySelector('.katex') || mathBlock.querySelector('.katex-error')) {
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

  const literalMacroCache = new Map();
  function collectLiteralUnknownCommandMacros(text) {
    if (literalMacroCache.has(text)) return literalMacroCache.get(text);
    const segmentPattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
    const macros = {};
    let match;

    while ((match = segmentPattern.exec(text)) !== null) {
      const segment = normalizeEscapedLatexText(match[0]);
      const { body, displayMode } = getMathSegmentDetails(segment);
      const result = validateWithLiteralUnknownCommands(body, { displayMode }, macros);
      if (!result.ok) return null;
      Object.assign(macros, result.macros);
    }

    if (literalMacroCache.size >= 500) {
      literalMacroCache.delete(literalMacroCache.keys().next().value);
    }
    literalMacroCache.set(text, macros);
    return macros;
  }

  function renderMathInto(el, options = {}) {
    const { allowUndefinedCommands = false } = options;
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

    const macros = allowUndefinedCommands
      ? collectLiteralUnknownCommandMacros(el.textContent || '')
      : null;

    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ],
      ...(macros ? { macros: { ...macros } } : {}),
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

  function restoreAllRescuedMath() {
    const token = ++restoreToken;

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
      if (i >= phases.length) return;
      phases[i]();
      requestAnimationFrame(() => runPhase(i + 1));
    }

    runPhase(0);
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
        : false
          ? getMathAwareTextExcludingRendered(el)
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

        if (wrapper && wrapper.dataset.rawText === cleanedText) {
          i++;
          continue;
        }

        if (hiddenOriginal) {
          restoreSingleLineElement(el, hiddenOriginal, wrapper);
        }

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
          renderMathInto(mathWrapper, { allowUndefinedCommands: true });
          if (!mathWrapper.querySelector('.katex') || mathWrapper.querySelector('.katex-error')) {
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
        } catch (error) {
          warn('failed to render inline math:', error);
        }
      } else if (hiddenOriginal) {
        restoreSingleLineElement(el, hiddenOriginal, wrapper);
      }

      i++;
    }
  }

  globalThis.ELMMathFixerRepair = { processContainer, restoreAllRescuedMath };
})();
