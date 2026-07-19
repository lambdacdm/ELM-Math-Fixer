(function () {
  'use strict';

  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log('[ELM Math Fixer]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[ELM Math Fixer]', ...args); };

  const hasMath = (text) => text.includes('$') || text.includes('\\(') || text.includes('\\[');

  const CORE = globalThis.ELMMathFixerCore;
  if (!CORE) throw new Error('ELM Math Fixer core failed to load.');
  const {
    validateWithLiteralUnknownCommands,
    normalizePairedEscapedSetBraces,
    normalizeMathBackslashes,
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

  function getCodeWrappedMathText(code) {
    if (
      code.closest(
        'pre, .elm-math-hidden-original, .elm-math-rescued-block, .elm-math-rescued-code, .elm-math-rescued-wrapper'
      )
    ) {
      return null;
    }

    const text = (code.textContent || '').trim();
    const isDelimitedMath =
      /^\$\$[\s\S]+\$\$$/.test(text) ||
      /^\$(?!\$)[^$\r\n]+\$$/.test(text) ||
      /^\\\[[\s\S]+\\\]$/.test(text) ||
      /^\\\([\s\S]+\\\)$/.test(text);

    if (!isDelimitedMath) return null;
    return normalizeMathDelimiterWhitespace(text);
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
      '.elm-math-native-brace-repair'
    ].join(', ');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let node;

    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest(ignoredSelector)) continue;
      if (isSafeMixedTextMath(node.textContent || '')) candidates.push(node);
    }

    candidates.forEach((textNode) => {
      const wrapper = document.createElement('span');
      wrapper.textContent = textNode.textContent || '';

      try {
        renderMathInto(wrapper);
        if (!wrapper.querySelector('.katex') || wrapper.querySelector('.katex-error')) return;

        const host = document.createElement('span');
        host.className = 'elm-math-rescued-text';
        host.dataset.rawText = textNode.textContent || '';
        while (wrapper.firstChild) host.appendChild(wrapper.firstChild);
        textNode.replaceWith(host);
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
    if (assumeMath) {
      const cached = getMathTextCache.get(el);
      if (cached !== undefined) return cached;
    }
    const text = getMathAwareClone(el, assumeMath).textContent || '';
    if (assumeMath) getMathTextCache.set(el, text);
    return text;
  }

  function isLikelyMathFragment(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    return (
      /^[A-Za-z]$/.test(trimmed) ||
      /\\[A-Za-z]+|[_^{}]|\d|[+\-*/<>]|[()[\],]/.test(trimmed)
    );
  }

  function isEmptySplitListMarker(node) {
    if (!node?.matches('ol, ul') || node.children.length !== 1) return false;
    const item = node.firstElementChild;
    return item?.tagName === 'LI' && !(item.textContent || '').trim();
  }

  function hasOnlyAllowedSplitSeparators(previous, next) {
    let cursor = previous.nextElementSibling;
    let emptyListCount = 0;
    while (cursor && cursor !== next) {
      if (!isEmptySplitListMarker(cursor) || emptyListCount > 0) return false;
      emptyListCount++;
      cursor = cursor.nextElementSibling;
    }
    return cursor === next;
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
    if (nonemptyMathFragments.length < 2) return null;
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

  function collectLiteralUnknownCommandMacros(text) {
    const segmentPattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
    const macros = {};
    let match;

    while ((match = segmentPattern.exec(text)) !== null) {
      const segment = normalizeMathBackslashes(match[0]);
      const { body, displayMode } = getMathSegmentDetails(segment);
      const result = validateWithLiteralUnknownCommands(body, { displayMode }, macros);
      if (!result.ok) return null;
      Object.assign(macros, result.macros);
    }

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
        normalizeMathBackslashes(textNode.textContent || '')
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
      ...(macros ? { macros } : {}),
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

  function hideSplitOriginal(el) {
    if (!el.classList.contains('elm-math-split-original')) {
      el.dataset.elmMathOriginalDisplay = el.style.display;
      el.classList.add('elm-math-split-original');
    }
    el.style.display = 'none';
  }

  function restoreSplitOriginal(el) {
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

  function restoreAllRescuedMath() {
    document.querySelectorAll('.elm-math-local-chain').forEach(restoreLocalMathChain);
    document.querySelectorAll('.elm-math-native-brace-repair').forEach(restoreNativeBraceRepair);

    document.querySelectorAll('.elm-math-hidden-original').forEach((hiddenOriginal) => {
      const el = hiddenOriginal.parentElement;
      if (!el) return;
      const wrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
      restoreSingleLineElement(el, hiddenOriginal, wrapper);
    });

    document.querySelectorAll('.elm-math-rescued-code').forEach((host) => {
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
    });

    document.querySelectorAll('.elm-math-rescued-text').forEach((host) => {
      host.replaceWith(document.createTextNode(host.dataset.rawText || ''));
    });

    document.querySelectorAll('.elm-math-boundary-space').forEach((spacer) => {
      const parent = spacer.parentNode;
      spacer.replaceWith(document.createTextNode(spacer.dataset.originalWhitespace || ' '));
      parent?.normalize();
    });

    document.querySelectorAll('.elm-math-rescued-block').forEach((block) => block.remove());
    document.querySelectorAll('.elm-math-split-original').forEach(restoreSplitOriginal);
    document.querySelectorAll('.elm-math-rescued-container').forEach((container) => {
      container.classList.remove('elm-math-rescued-container');
    });
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

  function processContainer(container, affectedRoots = null) {
    if (!container?.isConnected) return;
    getMathTextCache = new WeakMap();

    const children = Array.from(container.querySelectorAll(TARGET_ELEMENTS));
    const affectedElements = getAffectedMathElements(container, children, affectedRoots);
    if (affectedElements && affectedElements.size === 0) return;

    rescueCodeWrappedMath(container);
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

      rescueNativePairedSetBraces(el);

      if (el.querySelector('.elm-math-local-chain')) {
        rescueMispairedNativeInlineMath(el);
        protectNativeMathBoundaryWhitespace(el);
        rescueMixedTextMath(el);
        i++;
        continue;
      }

      if (hasNativeRenderedMath(el)) {
        if (rescueMispairedNativeInlineMath(el)) {
          protectNativeMathBoundaryWhitespace(el);
          rescueMixedTextMath(el);
          i++;
          continue;
        }
        protectNativeMathBoundaryWhitespace(el);
        rescueMixedTextMath(el);
        i++;
        continue;
      }

      const hiddenOriginal = el.querySelector(':scope > .elm-math-hidden-original');
      const wrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
      let text = hiddenOriginal ? getMathAwareText(hiddenOriginal) : getMathAwareText(el);
      const delimiterCount = (text.match(/\$\$/g) || []).length;

      if (delimiterCount % 2 === 1) {
        if (hiddenOriginal) {
          restoreSingleLineElement(el, hiddenOriginal, wrapper);
          getMathTextCache.delete(el);
          text = getMathAwareText(el, true);
        } else {
          text = getMathAwareText(el, true);
        }

        const group = [el];
        let combinedText = text;
        let foundEnd = false;
        let nextEl = el.nextElementSibling;

        while (nextEl && group.length < MAX_SPLIT_MATH_NODES) {
          if (isEmptySplitListMarker(nextEl)) {
            nextEl = nextEl.nextElementSibling;
            continue;
          }

          const isListWrapper = ['UL', 'OL'].includes(nextEl.tagName) &&
            nextEl.children.length === 1 &&
            nextEl.firstElementChild?.tagName === 'LI';
          const effectiveEl = isListWrapper ? nextEl.firstElementChild : nextEl;

          const nextIndex = children.indexOf(effectiveEl);
          if (nextIndex < 0) break;
          if (effectiveEl.closest('.elm-math-rescued-block')) {
            nextEl = nextEl.nextElementSibling;
            continue;
          }

          const previousEl = group[group.length - 1];
          if (
            !['H1', 'H2', 'P', 'LI'].includes(effectiveEl.tagName) ||
            nextEl.parentElement !== el.parentElement ||
            !hasOnlyAllowedSplitSeparators(previousEl, nextEl)
          ) {
            break;
          }

          if (hasNativeRenderedMath(effectiveEl)) {
            break;
          }

          const nextHidden = effectiveEl.querySelector(':scope > .elm-math-hidden-original');
          const nextText = nextHidden
            ? getMathAwareText(nextHidden, true)
            : getMathAwareText(effectiveEl, true);

          if (combinedText.length + nextText.length + 1 > MAX_SPLIT_MATH_LENGTH) break;
          combinedText += `\n${nextText}`;
          group.push(nextEl);

          const nextDelimiterCount = (nextText.match(/\$\$/g) || []).length;
          if (nextDelimiterCount % 2 === 1) {
            foundEnd = true;
            i = nextIndex;
            break;
          }

          nextEl = nextEl.nextElementSibling;
        }

        if (foundEnd) {
          group.forEach((node) => {
            const hidden = node.querySelector(':scope > .elm-math-hidden-original');
            const oldWrapper = node.querySelector(':scope > .elm-math-rescued-wrapper');
            if (hidden) {
              restoreSingleLineElement(node, hidden, oldWrapper);
              getMathTextCache.delete(node);
            }
          });

          combinedText = group.map((node) => getMathAwareText(node, true)).join('\n');
          const hasSetextHeading = group.some((node) => node.tagName === 'H1' || node.tagName === 'H2');
          const setextRepair = inferSetextOperatorRepair(group);
          if (hasSetextHeading && !setextRepair) {
            i++;
            continue;
          }
          if (setextRepair) combinedText = setextRepair.text;
          if (
            !isSafeMixedTextMath(combinedText, {
              allowUndefinedCommands: Boolean(setextRepair)
            })
          ) {
            i++;
            continue;
          }

          const prevSibling = group[0].previousElementSibling;
          if (
            prevSibling &&
            prevSibling.classList.contains('elm-math-rescued-block') &&
            prevSibling.dataset.rawText === combinedText
          ) {
            markRescuedLayoutHosts(group[0]);
            group.forEach(hideSplitOriginal);
            i++;
            continue;
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
            renderMathInto(mathBlock, { allowUndefinedCommands: Boolean(setextRepair) });
            if (!mathBlock.querySelector('.katex') || mathBlock.querySelector('.katex-error')) {
              throw new Error('split display math did not render cleanly');
            }

            group.forEach(hideSplitOriginal);
            group[0].parentNode.insertBefore(mathBlock, group[0]);
            markRescuedLayoutHosts(mathBlock);
          } catch (error) {
            warn('failed to render split display math:', error);
          }
        }
      } else if (hasMath(text)) {
        const cleanedText = normalizeMathDelimiterWhitespace(text);

        if (!isSafeMixedTextMath(cleanedText)) {
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
        const freshText = freshClone.textContent || '';
        const mathWrapper = document.createElement('span');
        mathWrapper.className = 'elm-math-rescued-wrapper';
        mathWrapper.dataset.rawText = freshText;
        while (freshClone.firstChild) mathWrapper.appendChild(freshClone.firstChild);

        try {
          renderMathInto(mathWrapper);
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
