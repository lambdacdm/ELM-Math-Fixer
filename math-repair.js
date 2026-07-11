(function () {
  'use strict';

  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6';
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log('[ELM Math Fixer]', ...args); };
  const warn = (...args) => { if (DEBUG) console.warn('[ELM Math Fixer]', ...args); };

  const hasMath = (text) => text.includes('$') || text.includes('\\(') || text.includes('\\[');

  const MULTILINE_MATH_ENVIRONMENTS = new Set([
    'align',
    'aligned',
    'alignedat',
    'alignat',
    'array',
    'bmatrix',
    'Bmatrix',
    'cases',
    'dcases',
    'flalign',
    'gather',
    'gathered',
    'matrix',
    'multline',
    'pmatrix',
    'rcases',
    'split',
    'Vmatrix',
    'vmatrix'
  ]);
  const KNOWN_LATEX_COMMAND_CACHE = new Map();
  const MAX_SPLIT_MATH_NODES = 12;
  const MAX_SPLIT_MATH_LENGTH = 50000;
  const SETEXT_OPERATOR_BY_TAG = { H1: '=', H2: '-' };

  function validateLatex(source, options = {}) {
    const renderer = globalThis.katex;
    if (!renderer || typeof renderer.renderToString !== 'function') {
      return { ok: false, error: null };
    }

    try {
      renderer.renderToString(source, {
        throwOnError: true,
        strict: 'error',
        ...options
      });
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function getUndefinedCommand(error) {
    const match = String(error?.message || '').match(
      /Undefined control sequence:\s*(\\[A-Za-z]+)/
    );
    return match?.[1] || null;
  }

  function literalUnknownCommandMacro(command) {
    const name = command.slice(1);
    return `\\mathord{\\backslash\\mathrm{${name}}}`;
  }

  function validateWithLiteralUnknownCommands(source, options = {}, initialMacros = {}) {
    const macros = { ...initialMacros };

    for (let attempt = 0; attempt < 16; attempt++) {
      const result = validateLatex(source, { ...options, macros });
      if (result.ok) return { ok: true, macros };

      const command = getUndefinedCommand(result.error);
      if (!command || macros[command]) return { ok: false, macros, error: result.error };
      macros[command] = literalUnknownCommandMacro(command);
    }

    return { ok: false, macros, error: new Error('too many undefined control sequences') };
  }

  function isMultilineMathEnvironment(name) {
    return MULTILINE_MATH_ENVIRONMENTS.has(name.replace(/\*$/, ''));
  }

  function isKnownLatexCommand(command) {
    if (KNOWN_LATEX_COMMAND_CACHE.has(command)) {
      return KNOWN_LATEX_COMMAND_CACHE.get(command);
    }

    const result = validateLatex(`\\${command}`, { strict: 'ignore' });
    const isKnown = result.ok ||
      Boolean(result.error && !String(result.error.message).includes('Undefined control sequence'));

    KNOWN_LATEX_COMMAND_CACHE.set(command, isKnown);
    return isKnown;
  }

  function normalizeLatexBackslashes(source) {
    return source.replace(
      /(?<!\\)\\{2}(?=([A-Za-z]+))/g,
      (backslashes, command) => (isKnownLatexCommand(command) ? '\\' : backslashes)
    );
  }

  function unwrapEscapedLatexLayer(source) {
    const runs = [];
    let knownEscapedCommands = 0;

    for (let i = 0; i < source.length;) {
      if (source[i] !== '\\') {
        i++;
        continue;
      }

      const start = i;
      while (source[i] === '\\') i++;
      const length = i - start;
      runs.push({ start, length });

      if (length === 2) {
        const command = source.slice(i).match(/^([A-Za-z]+)/)?.[1];
        if (command && isKnownLatexCommand(command)) knownEscapedCommands++;
      }
    }

    if (
      runs.length < 3 ||
      knownEscapedCommands < 3 ||
      runs.some((run) => run.length % 2 !== 0)
    ) {
      return source;
    }

    let candidate = '';
    let cursor = 0;
    runs.forEach(({ start, length }) => {
      candidate += source.slice(cursor, start);
      candidate += '\\'.repeat(length / 2);
      cursor = start + length;
    });
    candidate += source.slice(cursor);

    return validateWithLiteralUnknownCommands(candidate).ok ? candidate : source;
  }

  function hasUnresolvedDoubledBackslash(source) {
    const environmentPattern = /\\+(begin|end)\{([^{}]+)\}/g;
    const environmentStack = [];
    let cursor = 0;
    let match;

    const hasUnsafeSegment = (segment) =>
      !environmentStack.some(isMultilineMathEnvironment) && /\\{2,}(?=\S)/.test(segment);

    while ((match = environmentPattern.exec(source)) !== null) {
      if (hasUnsafeSegment(source.slice(cursor, match.index))) return true;

      const [, command, environmentName] = match;
      if (command === 'begin') {
        environmentStack.push(environmentName);
      } else {
        const matchingIndex = environmentStack.lastIndexOf(environmentName);
        if (matchingIndex !== -1) environmentStack.splice(matchingIndex, 1);
      }

      cursor = environmentPattern.lastIndex;
    }

    return hasUnsafeSegment(source.slice(cursor));
  }

  function normalizeMathBackslashes(text) {
    const mathSegmentPattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\r\n]*?\$/g;

    return text.replace(mathSegmentPattern, (segment) => {
      if (segment.startsWith('$$')) {
        const body = unwrapEscapedLatexLayer(segment.slice(2, -2));
        return `$$${normalizeLatexBackslashes(body)}$$`;
      }

      if (segment.startsWith('\\[') || segment.startsWith('\\(')) {
        const body = unwrapEscapedLatexLayer(segment.slice(2, -2));
        return `${segment.slice(0, 2)}${normalizeLatexBackslashes(body)}${segment.slice(-2)}`;
      }

      const body = unwrapEscapedLatexLayer(segment.slice(1, -1));
      return `$${normalizeLatexBackslashes(body)}$`;
    });
  }

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
    return text.replace(/\$\s+/g, '$').replace(/\s+\$/g, '$');
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

  function isEscapedAt(text, index) {
    let backslashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashCount++;
    return backslashCount % 2 === 1;
  }

  function getMathSegmentDetails(segment) {
    if (segment.startsWith('$$')) {
      return { body: segment.slice(2, -2), displayMode: true };
    }

    if (segment.startsWith('\\[')) {
      return { body: segment.slice(2, -2), displayMode: true };
    }

    if (segment.startsWith('\\(')) {
      return { body: segment.slice(2, -2), displayMode: false };
    }

    return { body: segment.slice(1, -1), displayMode: false };
  }

  function isSafeMixedTextMath(text, options = {}) {
    const { allowUndefinedCommands = false } = options;
    if (!globalThis.katex || typeof globalThis.katex.renderToString !== 'function') return false;

    const segmentPattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
    const coveredRanges = [];
    let foundMath = false;
    let match;

    while ((match = segmentPattern.exec(text)) !== null) {
      const segment = match[0];
      const closingIndex = match.index + segment.length - 1;
      const isSingleDollar = segment.startsWith('$') && !segment.startsWith('$$');
      if (
        segment.startsWith('$') &&
        (isEscapedAt(text, match.index) || isEscapedAt(text, closingIndex))
      ) {
        return false;
      }

      const { body, displayMode } = getMathSegmentDetails(segment);
      const trimmedBody = body.trim();
      if (!trimmedBody) return false;

      // Avoid treating two currency amounts such as "$5 and $10" as one formula.
      const followingCharacter = text[match.index + segment.length] || '';
      if (isSingleDollar && /^\d/.test(trimmedBody) && /^\d/.test(followingCharacter)) {
        return false;
      }

      const normalizedSegment = normalizeMathBackslashes(segment);
      const normalizedBody = getMathSegmentDetails(normalizedSegment).body;
      if (hasUnresolvedDoubledBackslash(normalizedBody)) return false;

      const validation = allowUndefinedCommands
        ? validateWithLiteralUnknownCommands(normalizedBody, { displayMode })
        : validateLatex(normalizedBody, { displayMode });
      if (!validation.ok) return false;

      coveredRanges.push({ start: match.index, end: match.index + segment.length });
      foundMath = true;
    }

    if (!foundMath) return false;

    let rangeIndex = 0;
    for (let i = 0; i < text.length; i++) {
      while (coveredRanges[rangeIndex]?.end <= i) rangeIndex++;
      const coveredRange = coveredRanges[rangeIndex];
      if (coveredRange && i >= coveredRange.start && i < coveredRange.end) {
        i = coveredRange.end - 1;
        continue;
      }
      if (text[i] === '$' && !isEscapedAt(text, i)) return false;
      if (
        text[i] === '\\' &&
        (text[i + 1] === '(' || text[i + 1] === '[') &&
        !isEscapedAt(text, i)
      ) {
        return false;
      }
    }

    return true;
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
      '.elm-math-rescued-wrapper'
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

    positionedNodes.forEach(({ node, start, end }) => {
      const isInsideMath = mathRanges.some(
        (mathRange) => start >= mathRange.start && end <= mathRange.end
      );
      if (!isInsideMath) return;

      const marker = node.matches('strong, b') ? '__' : '_';
      node.replaceWith(document.createTextNode(`${marker}${node.textContent}${marker}`));
    });

    clone.normalize();
    return clone;
  }

  function getMathAwareText(el, assumeMath = false) {
    return getMathAwareClone(el, assumeMath).textContent || '';
  }

  function isLikelyMathFragment(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    return (
      /^[A-Za-z]$/.test(trimmed) ||
      /\\[A-Za-z]+|[_^{}]|\d|[+\-*/<>]|[()[\],]/.test(trimmed)
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
        group[i - 1].nextElementSibling !== group[i]
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
    if (mathFragments.some((fragment) => !isLikelyMathFragment(fragment))) return null;

    let repairedText = '';
    group.forEach((node, index) => {
      repairedText += fragments[index];
      const operator = SETEXT_OPERATOR_BY_TAG[node.tagName];
      if (operator) {
        repairedText += `\n${operator}\n`;
      } else if (index < group.length - 1) {
        repairedText += '\n';
      }
    });

    if (!isSafeMixedTextMath(repairedText, { allowUndefinedCommands: true })) return null;

    let reason = 'setext-operators';
    if (operators.length === 1 && operators[0] === '=') reason = 'setext-equals';
    if (operators.length === 1 && operators[0] === '-') reason = 'setext-minus';
    return { text: repairedText, reason };
  }

  function cleanMathClone(clone) {
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach((textNode) => {
      textNode.textContent = (textNode.textContent || '')
        .replace(/\$\s+/g, '$')
        .replace(/\s+\$/g, '$');
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
      const normalizedText = normalizeMathBackslashes(textNode.textContent || '');
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
        host.matches('.markdown, .markdown-container, .response-ai, .message-content')
      ) {
        host.classList.add('elm-math-rescued-container');
      }
      host = host.parentElement;
    }
  }

  function restoreAllRescuedMath() {
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

    document.querySelectorAll('.elm-math-rescued-block').forEach((block) => block.remove());
    document.querySelectorAll('.elm-math-split-original').forEach(restoreSplitOriginal);
    document.querySelectorAll('.elm-math-rescued-container').forEach((container) => {
      container.classList.remove('elm-math-rescued-container');
    });
  }

  function processContainer(container) {
    rescueCodeWrappedMath(container);

    const children = Array.from(container.querySelectorAll(TARGET_ELEMENTS));
    log('matched text elements:', children.length, container);

    let i = 0;
    while (i < children.length) {
      const el = children[i];

      if (el.closest('.elm-math-rescued-block') || el.classList.contains('elm-math-hidden-original')) {
        i++;
        continue;
      }

      if (hasNativeRenderedMath(el)) {
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
          text = getMathAwareText(el, true);
        } else {
          text = getMathAwareText(el, true);
        }

        const group = [el];
        let combinedText = text;
        let foundEnd = false;
        let j = i + 1;

        while (j < children.length && group.length < MAX_SPLIT_MATH_NODES) {
          const nextEl = children[j];
          if (nextEl.closest('.elm-math-rescued-block')) {
            j++;
            continue;
          }

          const previousEl = group[group.length - 1];
          if (
            !['H1', 'H2', 'P'].includes(nextEl.tagName) ||
            nextEl.parentElement !== el.parentElement ||
            previousEl.nextElementSibling !== nextEl
          ) {
            break;
          }

          if (hasNativeRenderedMath(nextEl)) {
            break;
          }

          const nextHidden = nextEl.querySelector(':scope > .elm-math-hidden-original');
          const nextText = nextHidden
            ? getMathAwareText(nextHidden, true)
            : getMathAwareText(nextEl, true);

          if (combinedText.length + nextText.length + 1 > MAX_SPLIT_MATH_LENGTH) break;
          combinedText += `\n${nextText}`;
          group.push(nextEl);

          const nextDelimiterCount = (nextText.match(/\$\$/g) || []).length;
          if (nextDelimiterCount % 2 === 1) {
            foundEnd = true;
            i = j;
            break;
          }

          j++;
        }

        if (foundEnd) {
          group.forEach((node) => {
            const hidden = node.querySelector(':scope > .elm-math-hidden-original');
            const oldWrapper = node.querySelector(':scope > .elm-math-rescued-wrapper');
            if (hidden) restoreSingleLineElement(node, hidden, oldWrapper);
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
        const cleanedText = text.replace(/\$\s+/g, '$').replace(/\s+\$/g, '$');

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
