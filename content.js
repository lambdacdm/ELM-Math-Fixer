(function () {
  'use strict';

  const CONTAINER_SELECTOR = '.markdown, .markdown-container, .response-ai, .message-content';
  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6';
  const DEBUG = false;
  const PROMPT_BUTTON_ID = 'elm-math-fixer-prompt-button';
  const FIXER_TOGGLE_ID = 'elm-math-fixer-toggle';
  const PROMPT_PANEL_ID = 'elm-math-fixer-prompt-panel';
  const PROMPT_STYLE_ID = 'elm-math-fixer-prompt-style';
  const TOOLS_GUIDE_ID = 'elm-math-fixer-tools-guide';
  const PROMPT_DISCOVERED_STORAGE_KEY = 'elmMathFixerPromptLocationDiscoveredV2';
  const PROMPT_GUIDE_SESSION_KEY = 'elmMathFixerPromptGuideShown';
  const FIXER_ENABLED_STORAGE_KEY = 'elmMathFixerEnabled';
  let fixerEnabledFallback = true;
  let toolsAttentionTimer = null;
  let sidebarAttentionTimer = null;
  let nativePaletteControl = null;
  let nativePaletteCache = null;

  const PROMPT_GROUPS = [
    {
      title: 'Math Rendering Fix',
      description: 'Prevents display formulas from being split before KaTeX rendering.',
      prompts: [
        {
          label: 'Copy (English)',
          text: `When generating mathematical formulas ($...$ or $$...$$), you must follow these rules, or the formula will fail to render or won't be recognized at all:

[MOST IMPORTANT] Never include a line break or blank line inside a $$...$$ formula. Everything from the opening $$ to the closing $$ must be one continuous, unbroken block of text - no line breaks in between, even for long formulas; keep it all on the same line/paragraph. Otherwise the platform will split the formula partway through and it won't render at all. If you need multi-line display, use an aligned/array/gathered environment with \\\\ line breaks inside the LaTeX itself - never insert a literal line break at the text level.`
        },
        {
          label: 'Copy (中文)',
          text: `生成数学公式（$...$ 或 $$...$$）时，必须遵守以下规则，否则公式会渲染失败或完全不被识别：

【最重要】一条 $$...$$ 公式内部绝对不能换行或有空行。从开头 $$ 到结尾 $$ 之间必须是连续的一整段文本，中间不能敲回车--哪怕公式很长也要写在同一行/同一段落里，否则平台会把公式从中间切断，导致完全不渲染。需要分行展示时，用 aligned/array/gathered 环境配合 \\\\ 处理，不要在文本层面换行。`
        }
      ]
    },
    {
      title: 'Separate Reasoning and Answer',
      description: 'For Claude models that mix reasoning-style text with the final answer.',
      prompts: [
        {
          label: 'Copy (English)',
          text: `Please first output your reasoning process normally. After the reasoning is complete, start a new line and output the following blockquote:

> The above is the reasoning process; the following is the final answer.

After that blockquote, output the final answer.`
        },
        {
          label: 'Copy (中文)',
          text: `请先正常输出思考过程，思考结束后另起一行输出引用块：

> 以上是思考过程，以下是正式回答

引用块之后再输出最终回答内容。`
        }
      ]
    }
  ];

  const log = (...args) => {
    if (DEBUG) console.log('[ELM Math Fixer]', ...args);
  };

  const warn = (...args) => {
    if (DEBUG) console.warn('[ELM Math Fixer]', ...args);
  };

  function isFixerEnabled() {
    try {
      const stored = localStorage.getItem(FIXER_ENABLED_STORAGE_KEY);
      return stored === null ? fixerEnabledFallback : stored !== 'false';
    } catch {
      return fixerEnabledFallback;
    }
  }

  function setFixerEnabled(enabled) {
    fixerEnabledFallback = enabled;
    try {
      localStorage.setItem(FIXER_ENABLED_STORAGE_KEY, String(enabled));
    } catch {
      // The current page may block storage; the default enabled state remains usable.
    }
  }

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

  function isMultilineMathEnvironment(name) {
    return MULTILINE_MATH_ENVIRONMENTS.has(name.replace(/\*$/, ''));
  }

  function isKnownLatexCommand(command) {
    if (KNOWN_LATEX_COMMAND_CACHE.has(command)) {
      return KNOWN_LATEX_COMMAND_CACHE.get(command);
    }

    const parser = globalThis.katex;
    if (!parser || typeof parser.__parse !== 'function') return false;

    let isKnown = false;
    try {
      parser.__parse(`\\${command}`, { strict: 'ignore' });
      isKnown = true;
    } catch (error) {
      isKnown =
        error instanceof parser.ParseError &&
        !String(error.message).includes('Undefined control sequence');
    }

    KNOWN_LATEX_COMMAND_CACHE.set(command, isKnown);
    return isKnown;
  }

  function normalizeLatexBackslashes(source) {
    return source.replace(
      /(?<!\\)\\{2}(?=([A-Za-z]+))/g,
      (backslashes, command) => (isKnownLatexCommand(command) ? '\\' : backslashes)
    );
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
        return `$$${normalizeLatexBackslashes(segment.slice(2, -2))}$$`;
      }

      if (segment.startsWith('\\[') || segment.startsWith('\\(')) {
        return `${segment.slice(0, 2)}${normalizeLatexBackslashes(segment.slice(2, -2))}${segment.slice(-2)}`;
      }

      return `$${normalizeLatexBackslashes(segment.slice(1, -1))}$`;
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

  function isSafeMixedTextMath(text) {
    const parser = globalThis.katex;
    if (!parser || typeof parser.__parse !== 'function') return false;

    const segmentPattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
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

      try {
        parser.__parse(normalizedBody, { displayMode, strict: 'error' });
      } catch {
        return false;
      }

      foundMath = true;
    }

    return foundMath;
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
  function getMathAwareClone(el) {
    const clone = el.cloneNode(true);
    const fullText = clone.textContent || '';
    if (!hasMath(fullText)) return clone;

    const mathRanges = getMathBodyRanges(fullText);
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

  function getMathAwareText(el) {
    return getMathAwareClone(el).textContent || '';
  }

  function isLikelyMathFragment(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    return (
      /^[A-Za-z]$/.test(trimmed) ||
      /\\[A-Za-z]+|[_^{}]|\d|[+\-*/<>]|[()[\],]/.test(trimmed)
    );
  }

  // Markdown consumes a standalone "=" as a Setext H1 underline. Infer it only
  // when the remaining DOM has the exact footprint of one split display formula.
  function inferSetextEqualsRepair(group) {
    if (group.length < 2 || group[0].tagName !== 'H1') return null;
    if (group.slice(1).some((node) => node.tagName !== 'P')) return null;

    for (let i = 1; i < group.length; i++) {
      if (
        group[i].parentElement !== group[0].parentElement ||
        group[i - 1].nextElementSibling !== group[i]
      ) {
        return null;
      }
    }

    const fragments = group.map((node) => getMathAwareText(node));
    const headingText = fragments[0].trim();
    const continuationText = fragments.slice(1).join('\n').trim();
    const completeText = fragments.join('\n');

    if (!headingText.startsWith('$$') || !continuationText.endsWith('$$')) return null;
    if ((headingText.match(/\$\$/g) || []).length !== 1) return null;
    if ((completeText.match(/\$\$/g) || []).length !== 2) return null;

    const headingMath = headingText.slice(2).trim();
    const continuationMath = continuationText.slice(0, -2).trim();
    if (!isLikelyMathFragment(headingMath) || !isLikelyMathFragment(continuationMath)) {
      return null;
    }

    const repairedText = `${fragments[0]}\n=\n${fragments.slice(1).join('\n')}`;
    if (!isSafeMixedTextMath(repairedText)) return null;

    return { text: repairedText, reason: 'setext-equals' };
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

  function renderMathInto(el) {
    el.normalize();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) textNodes.push(node);
    textNodes.forEach((textNode) => {
      const normalizedText = normalizeMathBackslashes(textNode.textContent || '');
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
          text = getMathAwareText(el);
        }

        const group = [el];
        let combinedText = text;
        let foundEnd = false;
        let j = i + 1;

        while (j < children.length) {
          const nextEl = children[j];
          if (nextEl.closest('.elm-math-rescued-block')) {
            j++;
            continue;
          }

          if (hasNativeRenderedMath(nextEl)) {
            break;
          }

          const nextHidden = nextEl.querySelector(':scope > .elm-math-hidden-original');
          const nextText = nextHidden ? getMathAwareText(nextHidden) : getMathAwareText(nextEl);

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

          combinedText = group.map((node) => getMathAwareText(node)).join('\n');
          const setextRepair = inferSetextEqualsRepair(group);
          if (setextRepair) combinedText = setextRepair.text;

          const prevSibling = group[0].previousElementSibling;
          if (
            prevSibling &&
            prevSibling.classList.contains('elm-math-rescued-block') &&
            prevSibling.dataset.rawText === combinedText
          ) {
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
            renderMathInto(mathBlock);
            if (!mathBlock.querySelector('.katex') || mathBlock.querySelector('.katex-error')) {
              throw new Error('split display math did not render cleanly');
            }

            group.forEach(hideSplitOriginal);
            group[0].parentNode.insertBefore(mathBlock, group[0]);
          } catch (error) {
            warn('failed to render split display math:', error);
          }
        }
      } else if (hasMath(text)) {
        const cleanedText = text.replace(/\$\s+/g, '$').replace(/\s+\$/g, '$');

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

  function scan() {
    ensurePromptLauncher();
    if (!isFixerEnabled()) {
      restoreAllRescuedMath();
      return;
    }

    if (typeof renderMathInElement !== 'function') {
      warn('KaTeX auto-render is not available. Check manifest paths.');
      return;
    }

    const containers = document.querySelectorAll(CONTAINER_SELECTOR);
    log('matched containers:', containers.length);
    containers.forEach(processContainer);
  }

  function injectPromptStyles() {
    if (document.getElementById(PROMPT_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = PROMPT_STYLE_ID;
    style.textContent = `
      #${PROMPT_BUTTON_ID} {
        align-items: center;
        background: var(--elm-mf-accent, #2f6f59);
        border: 1px solid var(--elm-mf-accent, #2f6f59);
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font: 600 14px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        gap: 6px;
        min-height: 34px;
        margin: 0 8px 0 0;
        padding: 7px 11px;
        position: static;
        flex: 0 0 auto;
        white-space: nowrap;
        z-index: 2147483646;
      }

      #${PROMPT_BUTTON_ID}:hover {
        background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 88%, black);
        border-color: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 88%, black);
      }

      #${PROMPT_BUTTON_ID}.elm-mf-sidebar {
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        color: var(--elm-mf-accent, #2f6f59);
        display: flex;
        justify-content: flex-start;
        margin: 0;
        max-width: 100%;
        position: static;
        text-align: left;
        width: 100%;
        z-index: auto;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-sidebar:hover {
        background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 9%, transparent);
        border-color: transparent;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-sidebar.elm-mf-attention {
        animation: elm-mf-sidebar-pulse 1.4s ease-in-out infinite;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-sidebar .elm-mf-launcher-icon {
        align-items: center;
        display: inline-flex;
        flex: 0 0 auto;
        justify-content: center;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-sidebar .elm-mf-launcher-label {
        display: inline;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-legacy-sidebar {
        align-items: center;
        background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 8%, white);
        border: 1px solid var(--elm-mf-accent, #2f6f59);
        border-radius: 8px;
        box-sizing: border-box;
        box-shadow: none;
        color: var(--elm-mf-accent, #2f6f59);
        display: flex;
        justify-content: center;
        position: static;
        text-align: center;
        z-index: auto;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-legacy-sidebar:hover {
        background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 16%, white);
        border-color: var(--elm-mf-accent, #2f6f59);
      }

      #${PROMPT_BUTTON_ID}.elm-mf-legacy-sidebar.elm-mf-attention {
        animation: elm-mf-sidebar-pulse 1.4s ease-in-out infinite;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-legacy-sidebar .elm-mf-launcher-icon,
      #${PROMPT_BUTTON_ID}.elm-mf-legacy-sidebar .elm-mf-launcher-label {
        display: inline-flex;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-hidden {
        display: none !important;
      }

      #${TOOLS_GUIDE_ID} {
        align-items: center;
        background: #fff;
        border: 1px solid var(--elm-mf-accent, #2f6f59);
        border-radius: 8px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
        color: #1f2933;
        display: flex;
        font: 500 14px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        gap: 10px;
        max-width: min(330px, calc(100vw - 32px));
        padding: 8px 10px;
        position: fixed;
        z-index: 2147483647;
      }

      #${TOOLS_GUIDE_ID} .elm-mf-guide-open {
        background: var(--elm-mf-accent, #2f6f59);
        border: 1px solid var(--elm-mf-accent, #2f6f59);
        border-radius: 6px;
        color: #fff;
        cursor: pointer;
        flex: 0 0 auto;
        font: 650 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 6px 9px;
      }

      #${TOOLS_GUIDE_ID} .elm-mf-guide-close {
        align-items: center;
        background: transparent;
        border: 0;
        color: #c62828;
        cursor: pointer;
        display: inline-flex;
        flex: 0 0 auto;
        font: 700 22px/1 system-ui, sans-serif;
        height: 26px;
        justify-content: center;
        padding: 0;
        width: 26px;
      }

      .elm-mf-tools-attention {
        animation: elm-mf-tools-pulse 1.2s ease-in-out infinite !important;
      }

      #${FIXER_TOGGLE_ID} {
        appearance: none;
        align-items: center;
        background: transparent;
        border: 0;
        border-radius: 999px;
        box-shadow: none;
        cursor: pointer;
        display: inline-flex;
        gap: 8px;
        height: 30px;
        justify-content: center;
        margin: 0 28px 0 0;
        min-height: 30px;
        padding: 0;
        position: static;
        flex: 0 0 auto;
        width: auto;
        z-index: 2147483646;
      }

      #${FIXER_TOGGLE_ID}:focus-visible {
        outline: 3px solid color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 30%, transparent);
        outline-offset: 3px;
      }

      #${FIXER_TOGGLE_ID} .elm-mf-switch-label {
        color: #1f2933;
        font: 500 16px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }

      #${FIXER_TOGGLE_ID} .elm-mf-switch-track {
        align-items: center;
        background: var(--elm-mf-accent, #2f6f59);
        border-radius: 999px;
        box-sizing: border-box;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
        display: flex;
        height: 30px;
        padding: 3px;
        transition: background-color 160ms ease;
        width: 52px;
      }

      #${FIXER_TOGGLE_ID} .elm-mf-switch-thumb {
        align-items: center;
        background: #f7fbf9;
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
        color: var(--elm-mf-accent, #2f6f59);
        display: flex;
        font: 800 14px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        height: 24px;
        justify-content: center;
        transform: translateX(22px);
        transition: color 160ms ease, transform 160ms ease;
        width: 24px;
      }

      #${FIXER_TOGGLE_ID} .elm-mf-switch-thumb::after {
        content: "\\2713";
      }

      #${FIXER_TOGGLE_ID}:hover .elm-mf-switch-track {
        background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 88%, black);
      }

      #${FIXER_TOGGLE_ID}[data-enabled="false"] .elm-mf-switch-track {
        background: var(--elm-mf-off-track, #dce3df);
        box-shadow: inset 0 0 0 1px var(--elm-mf-off-border, #829188);
      }

      #${FIXER_TOGGLE_ID}[data-enabled="false"] .elm-mf-switch-thumb {
        background: var(--elm-mf-off-thumb, #748178);
        color: var(--elm-mf-off-icon, #dfe5e1);
        transform: translateX(0);
      }

      #${FIXER_TOGGLE_ID}[data-enabled="false"] .elm-mf-switch-thumb::after {
        content: "\\2212";
      }

      #${FIXER_TOGGLE_ID}[data-enabled="false"]:hover .elm-mf-switch-track {
        background: color-mix(in srgb, var(--elm-mf-off-track, #dce3df) 90%, black);
      }

      #${FIXER_TOGGLE_ID} .elm-mf-power-icon {
        display: none;
      }

      #${FIXER_TOGGLE_ID}.elm-mf-fallback {
        margin: 0;
        position: fixed;
      }

      #${FIXER_TOGGLE_ID}.elm-mf-compact {
        border: 1px solid var(--elm-mf-accent, #2f6f59);
        border-radius: 8px;
        color: var(--elm-mf-accent, #2f6f59);
        height: 42px;
        min-height: 42px;
        width: 42px;
      }

      #${FIXER_TOGGLE_ID}.elm-mf-compact[data-enabled="false"] {
        border-color: var(--elm-mf-off-border, #829188);
        color: var(--elm-mf-off-thumb, #748178);
      }

      #${FIXER_TOGGLE_ID}.elm-mf-compact .elm-mf-switch-label,
      #${FIXER_TOGGLE_ID}.elm-mf-compact .elm-mf-switch-track {
        display: none;
      }

      #${FIXER_TOGGLE_ID}.elm-mf-compact .elm-mf-power-icon {
        display: inline;
        font: 600 23px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Symbol", sans-serif;
      }

      .elm-mf-launcher-icon {
        display: none;
        font-weight: 750;
        letter-spacing: 0;
      }

      .elm-mf-launcher-label {
        display: inline;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-attention {
        animation: elm-mf-pulse 1.4s ease-in-out infinite;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-fallback {
        margin: 0;
        position: fixed;
        right: 30px;
        top: 22px;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-compact {
        background: transparent;
        border-color: var(--elm-mf-accent, #2f6f59);
        border-radius: 8px;
        box-shadow: none;
        color: var(--elm-mf-accent, #2f6f59);
        height: 42px;
        justify-content: center;
        margin: 0 12px 0 0;
        min-height: 42px;
        padding: 0;
        width: 42px;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-compact:hover {
        background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 10%, transparent);
        border-color: var(--elm-mf-accent, #2f6f59);
        color: var(--elm-mf-accent, #2f6f59);
      }

      #${PROMPT_BUTTON_ID}.elm-mf-compact .elm-mf-launcher-icon {
        display: inline;
        font-size: 16px;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-compact .elm-mf-launcher-label {
        display: none;
      }

      .elm-mf-try-new-look-group {
        align-items: center;
        display: inline-flex;
        flex: 0 0 auto;
        gap: 8px;
        white-space: nowrap;
      }

      @keyframes elm-mf-pulse {
        0%, 100% {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 0 color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 55%, transparent);
          transform: translateY(0);
        }
        50% {
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 0 0 7px color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 0%, transparent);
          transform: translateY(-1px);
        }
      }

      @keyframes elm-mf-sidebar-pulse {
        0%, 100% {
          background: transparent;
          box-shadow: none;
        }
        50% {
          background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 12%, transparent);
          box-shadow: none;
        }
      }

      @keyframes elm-mf-tools-pulse {
        0%, 100% {
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 55%, transparent);
        }
        50% {
          box-shadow: 0 0 0 7px color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 0%, transparent);
        }
      }

      #${PROMPT_PANEL_ID} {
        background: #fff;
        border: 1px solid rgba(47, 111, 89, 0.22);
        border-radius: 10px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
        color: #1f2933;
        font: 15px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        max-width: min(420px, calc(100vw - 32px));
        padding: 12px;
        position: fixed;
        width: 390px;
        z-index: 2147483647;
      }

      #${PROMPT_PANEL_ID}[hidden] {
        display: none;
      }

      .elm-mf-panel-title {
        align-items: center;
        display: flex;
        font-size: 17px;
        font-weight: 700;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .elm-mf-help {
        background: #f4f8f6;
        border: 1px solid #d9e8e0;
        border-radius: 8px;
        color: #3f4e58;
        font-size: 13px;
        margin-bottom: 8px;
        padding: 8px 9px;
      }

      .elm-mf-close {
        background: transparent;
        border: 0;
        border-radius: 6px;
        color: #c62828;
        cursor: pointer;
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
        min-height: 34px;
        min-width: 34px;
        padding: 0 5px 3px;
      }

      .elm-mf-close:hover {
        background: #fde7e7;
        color: #a61717;
      }

      .elm-mf-prompt {
        border-top: 1px solid #e7ecef;
        display: grid;
        gap: 6px;
        padding: 10px 0;
      }

      .elm-mf-prompt:first-of-type {
        border-top: 0;
        padding-top: 0;
      }

      .elm-mf-prompt-title {
        font-size: 15px;
        font-weight: 650;
      }

      .elm-mf-prompt-desc {
        color: #52616b;
        font-size: 13px;
      }

      .elm-mf-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .elm-mf-copy {
        background: #eef6f2;
        border: 1px solid #b8d5c7;
        border-radius: 7px;
        color: #2f6f59;
        cursor: pointer;
        font: 650 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 30px;
        padding: 6px 10px;
      }

      .elm-mf-copy:hover {
        background: #dfeee7;
      }

      @media (max-width: 1120px) {
        #${PROMPT_BUTTON_ID} {
          background: transparent;
          border-color: var(--elm-mf-accent, #2f6f59);
          border-radius: 8px;
          box-shadow: none;
          color: var(--elm-mf-accent, #2f6f59);
          height: 42px;
          justify-content: center;
          margin: 0 12px 0 0;
          min-height: 42px;
          padding: 0;
          width: 42px;
        }

        #${PROMPT_BUTTON_ID}:hover {
          background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 10%, transparent);
          border-color: var(--elm-mf-accent, #2f6f59);
          color: var(--elm-mf-accent, #2f6f59);
        }

        #${PROMPT_BUTTON_ID} .elm-mf-launcher-icon {
          display: inline;
          font-size: 16px;
        }

        #${PROMPT_BUTTON_ID} .elm-mf-launcher-label {
          display: none;
        }

        #${FIXER_TOGGLE_ID} {
          border: 1px solid var(--elm-mf-accent, #2f6f59);
          border-radius: 8px;
          color: var(--elm-mf-accent, #2f6f59);
          height: 42px;
          margin: 0 12px 0 0;
          min-height: 42px;
          width: 42px;
        }

        #${FIXER_TOGGLE_ID}:hover {
          background: color-mix(in srgb, var(--elm-mf-accent, #2f6f59) 10%, transparent);
        }

        #${FIXER_TOGGLE_ID}[data-enabled="false"] {
          border-color: var(--elm-mf-off-border, #829188);
          color: var(--elm-mf-off-thumb, #748178);
        }

        #${FIXER_TOGGLE_ID}[data-enabled="false"]:hover {
          background: color-mix(in srgb, var(--elm-mf-off-track, #dce3df) 45%, transparent);
        }

        #${FIXER_TOGGLE_ID} .elm-mf-switch-label,
        #${FIXER_TOGGLE_ID} .elm-mf-switch-track {
          display: none;
        }

        #${FIXER_TOGGLE_ID} .elm-mf-power-icon {
          display: inline;
          font: 600 23px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Symbol", sans-serif;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isPromptLocationDiscovered() {
    try {
      return localStorage.getItem(PROMPT_DISCOVERED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function markPromptLocationDiscovered() {
    try {
      localStorage.setItem(PROMPT_DISCOVERED_STORAGE_KEY, 'true');
    } catch {
      // Discovery state is optional when storage is unavailable.
    }
  }

  function wasPromptGuideShownThisSession() {
    try {
      return sessionStorage.getItem(PROMPT_GUIDE_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function markPromptGuideShownThisSession() {
    try {
      sessionStorage.setItem(PROMPT_GUIDE_SESSION_KEY, 'true');
    } catch {
      // The guide can still be displayed without session storage.
    }
  }

  function findToolsControl() {
    const labels = Array.from(document.querySelectorAll('button, a, span, div'))
      .filter((node) => {
        if (!isVisible(node) || (node.textContent || '').trim() !== 'Tools') return false;
        const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.top < 110 && rect.left < window.innerWidth * 0.35;
      })
      .sort((a, b) => a.children.length - b.children.length);

    for (const label of labels) {
      const control = label.closest('button, a, [role="button"]') || label;
      if (isVisible(control)) return control;
    }

    return Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((control) => {
        if (isExtensionToolbarControl(control) || !isVisible(control)) return false;
        const rect = control.getBoundingClientRect();
        return rect.top >= 0 && rect.top < 100 && rect.left >= 0 && rect.left < 180 &&
          rect.width >= 24 && rect.width <= 140 && rect.height >= 24 && rect.height <= 64;
      })
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  }

  function positionToolsGuide(guide, toolsControl) {
    const rect = toolsControl.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const margin = 10;
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - guideRect.width - 16));
    const below = rect.bottom + margin;
    const top = below + guideRect.height <= window.innerHeight - 16
      ? below
      : Math.max(16, rect.top - guideRect.height - margin);
    guide.style.left = `${left}px`;
    guide.style.top = `${top}px`;
  }

  function removeToolsGuide() {
    document.getElementById(TOOLS_GUIDE_ID)?.remove();
    document.querySelectorAll('.elm-mf-tools-attention').forEach((control) => {
      control.classList.remove('elm-mf-tools-attention');
      control.style.removeProperty('--elm-mf-accent');
    });
    clearTimeout(toolsAttentionTimer);
  }

  function showPromptLocationGuide(targetControl, messageText, actionText) {
    const existing = document.getElementById(TOOLS_GUIDE_ID);
    if (existing && targetControl) {
      document.querySelectorAll('.elm-mf-tools-attention').forEach((control) => {
        if (control !== targetControl) {
          control.classList.remove('elm-mf-tools-attention');
          control.style.removeProperty('--elm-mf-accent');
        }
      });
      existing._elmTargetControl = targetControl;
      existing.querySelector('.elm-mf-guide-message').textContent = messageText;
      existing.querySelector('.elm-mf-guide-open').textContent = actionText;
      const accent = readElmAccentColor();
      if (accent) targetControl.style.setProperty('--elm-mf-accent', accent);
      targetControl.classList.add('elm-mf-tools-attention');
      positionToolsGuide(existing, targetControl);
      clearTimeout(toolsAttentionTimer);
      toolsAttentionTimer = window.setTimeout(() => {
        targetControl.classList.remove('elm-mf-tools-attention');
        targetControl.style.removeProperty('--elm-mf-accent');
      }, 5000);
      return;
    }
    if (existing || !targetControl || wasPromptGuideShownThisSession()) return;

    markPromptGuideShownThisSession();
    const guide = document.createElement('div');
    guide.id = TOOLS_GUIDE_ID;
    guide.setAttribute('role', 'dialog');
    guide.setAttribute('aria-label', 'Fixer Prompts location');
    guide._elmTargetControl = targetControl;

    const message = document.createElement('span');
    message.className = 'elm-mf-guide-message';
    message.textContent = messageText;
    const openButton = document.createElement('button');
    openButton.className = 'elm-mf-guide-open';
    openButton.type = 'button';
    openButton.textContent = actionText;
    const closeButton = document.createElement('button');
    closeButton.className = 'elm-mf-guide-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Dismiss');
    closeButton.textContent = '\u00d7';

    guide.appendChild(message);
    guide.appendChild(openButton);
    guide.appendChild(closeButton);
    document.body.appendChild(guide);

    const accent = readElmAccentColor();
    if (accent) {
      guide.style.setProperty('--elm-mf-accent', accent);
      targetControl.style.setProperty('--elm-mf-accent', accent);
    }
    targetControl.classList.add('elm-mf-tools-attention');
    positionToolsGuide(guide, targetControl);

    openButton.addEventListener('click', () => {
      const control = guide._elmTargetControl;
      removeToolsGuide();
      control?.click();
      window.setTimeout(ensurePromptLauncher, 180);
    });
    closeButton.addEventListener('click', removeToolsGuide);

    toolsAttentionTimer = window.setTimeout(() => {
      targetControl.classList.remove('elm-mf-tools-attention');
      targetControl.style.removeProperty('--elm-mf-accent');
    }, 5000);
    window.setTimeout(() => {
      document.getElementById(TOOLS_GUIDE_ID)?.remove();
    }, 10000);
  }

  function showToolsGuide() {
    showPromptLocationGuide(findToolsControl(), 'Fixer Prompts is inside Tools.', 'Open Tools');
  }

  function showLegacyPromptsGuide() {
    showPromptLocationGuide(
      findLegacyPromptTabControl(),
      'Fixer Prompts is inside Prompts.',
      'Open Prompts'
    );
  }

  function highlightPromptDiscovery(button) {
    removeToolsGuide();
    if (button.dataset.discoveryHighlighted === 'true') return;

    button.dataset.discoveryHighlighted = 'true';
    button.classList.add('elm-mf-attention');
    clearTimeout(sidebarAttentionTimer);
    sidebarAttentionTimer = window.setTimeout(() => {
      button.classList.remove('elm-mf-attention');
    }, 5000);
  }

  function ensurePromptDiscovery(button) {
    if (isPromptLocationDiscovered()) {
      button.classList.remove('elm-mf-attention');
      removeToolsGuide();
      return;
    }

    if (button.classList.contains('elm-mf-sidebar') || button.classList.contains('elm-mf-legacy-sidebar')) {
      highlightPromptDiscovery(button);
      return;
    }

    button.classList.remove('elm-mf-attention');
    if (isLegacyLayout()) {
      showLegacyPromptsGuide();
    } else {
      showToolsGuide();
    }
  }

  function isExtensionToolbarControl(control) {
    return control.id === PROMPT_BUTTON_ID || control.id === FIXER_TOGGLE_ID;
  }

  function findTopBarPromptAnchor() {
    return Array.from(document.querySelectorAll('span, div, p, label')).find((node) => {
      const text = (node.textContent || '').trim();
      return text === 'Try our new look!' && node.children.length === 0 && isVisible(node);
    });
  }

  function unwrapPromptAnchor(button, anchor) {
    const wrapper = anchor.parentElement;
    if (!wrapper?.classList?.contains('elm-mf-anchor-wrap') || !wrapper.parentElement) return;

    const parent = wrapper.parentElement;
    parent.insertBefore(button, wrapper);
    parent.insertBefore(anchor, wrapper);
    wrapper.remove();
  }

  function findNearbyTryNewLookControl(anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    return Array.from(
      document.querySelectorAll('button, [role="switch"], input[type="checkbox"], mat-slide-toggle, .mat-slide-toggle')
    )
      .filter((control) => {
        if (isExtensionToolbarControl(control) || !isVisible(control)) return false;
        const controlRect = control.getBoundingClientRect();
        return Math.abs(controlRect.top - anchorRect.top) < 48 && Math.abs(controlRect.left - anchorRect.left) < 220;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return Math.abs(aRect.left - anchorRect.left) - Math.abs(bRect.left - anchorRect.left);
      })[0];
  }

  function parseRgbColor(color) {
    if (!color || color === 'transparent') return null;
    const values = color.match(/[\d.]+/g)?.map(Number);
    if (!values || values.length < 3) return null;
    const [r, g, b, a = 1] = values;
    return { r, g, b, a };
  }

  function isLikelyElmGreen(color) {
    return color.a > 0.15 && color.g >= 55 && color.g - color.r >= 18 && color.g - color.b >= 4;
  }

  function readElmAccentColor() {
    const anchor = findTopBarPromptAnchor();
    const nativeSwitch = anchor ? findNearbyTryNewLookControl(anchor) : null;
    const roots = nativeSwitch
      ? [nativeSwitch, nativeSwitch.parentElement].filter(Boolean)
      : getVisibleTopBarControls();
    let best = null;

    roots.forEach((root) => {
      [root, ...root.querySelectorAll('*')].forEach((node) => {
        if (node.closest?.(`#${PROMPT_BUTTON_ID}, #${FIXER_TOGGLE_ID}`)) return;
        const rect = node.getBoundingClientRect();
        [null, '::before', '::after'].forEach((pseudo) => {
          let backgroundColor;
          try {
            backgroundColor = getComputedStyle(node, pseudo).backgroundColor;
          } catch {
            return;
          }

          const rgb = parseRgbColor(backgroundColor);
          if (!rgb || !isLikelyElmGreen(rgb)) return;

          const trackSized = rect.width >= 32 && rect.width <= 90 && rect.height >= 18 && rect.height <= 50;
          const score = (rgb.g - rgb.r) + (rgb.g - rgb.b) + rgb.a * 30 + (trackSized ? 60 : 0);
          if (!best || score > best.score) best = { color: backgroundColor, score };
        });
      });
    });

    return best?.color || null;
  }

  function resolveCssColor(value, context) {
    if (!value || !context) return null;
    const host = context.matches?.('input') ? context.parentElement : context;
    if (!host) return null;

    const probe = document.createElement('span');
    probe.style.cssText = 'all:initial;position:absolute;display:block;width:1px;height:1px;visibility:hidden;pointer-events:none;';
    probe.style.backgroundColor = value.trim();
    host.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return parseRgbColor(color) ? color : null;
  }

  function readNativeSwitchVariable(control, names) {
    const nodes = [control, ...control.querySelectorAll('*')];
    for (const node of nodes) {
      const style = getComputedStyle(node);
      for (const name of names) {
        const value = style.getPropertyValue(name).trim();
        const color = resolveCssColor(value, node);
        if (color) return color;
      }
    }
    return null;
  }

  function sampleNativeSwitchNeutrals(control) {
    const candidates = [];
    [control, ...control.querySelectorAll('*')].forEach((node) => {
      const rect = node.getBoundingClientRect();
      [null, '::before', '::after'].forEach((pseudo) => {
        let style;
        try {
          style = getComputedStyle(node, pseudo);
        } catch {
          return;
        }
        const rgb = parseRgbColor(style.backgroundColor);
        if (!rgb || rgb.a <= 0.15) return;
        const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
        if (spread > 45) return;

        const width = Number.parseFloat(style.width) || rect.width;
        const height = Number.parseFloat(style.height) || rect.height;
        if (width < 14 || height < 14 || width > 110 || height > 60) return;
        candidates.push({
          color: style.backgroundColor,
          border: style.borderStyle !== 'none' && Number.parseFloat(style.borderWidth) > 0 &&
            parseRgbColor(style.borderColor) ? style.borderColor : null,
          foreground: parseRgbColor(style.color) ? style.color : null,
          width,
          height,
          brightness: (rgb.r + rgb.g + rgb.b) / 3
        });
      });
    });

    const tracks = candidates.filter(({ width, height }) => width / height >= 1.35);
    const thumbs = candidates.filter(({ width, height }) => Math.abs(width - height) <= 8 && width <= 42);
    tracks.sort((a, b) => b.brightness - a.brightness);
    thumbs.sort((a, b) => a.brightness - b.brightness);
    return { track: tracks[0] || null, thumb: thumbs[0] || null };
  }

  function readNativeSwitchOffPalette() {
    const anchor = findTopBarPromptAnchor();
    const control = anchor ? findNearbyTryNewLookControl(anchor) : null;
    if (!control) return null;
    if (nativePaletteControl === control && nativePaletteCache) return nativePaletteCache;

    const trackVariables = [
      '--mdc-switch-unselected-track-color',
      '--mat-switch-unselected-track-color',
      '--mat-slide-toggle-bar-color'
    ];
    const thumbVariables = [
      '--mdc-switch-unselected-handle-color',
      '--mat-switch-unselected-handle-color',
      '--mat-slide-toggle-thumb-color'
    ];
    const borderVariables = [
      '--mdc-switch-unselected-track-outline-color',
      '--mat-switch-unselected-track-outline-color'
    ];
    const iconVariables = [
      '--mdc-switch-unselected-icon-color',
      '--mat-switch-unselected-icon-color'
    ];
    const sampled = sampleNativeSwitchNeutrals(control);

    nativePaletteControl = control;
    nativePaletteCache = {
      track: readNativeSwitchVariable(control, trackVariables) || sampled.track?.color || '#dce3df',
      thumb: readNativeSwitchVariable(control, thumbVariables) || sampled.thumb?.color || '#748178',
      border: readNativeSwitchVariable(control, borderVariables) || sampled.track?.border || '#829188',
      icon: readNativeSwitchVariable(control, iconVariables) || sampled.thumb?.foreground || '#dfe5e1'
    };
    return nativePaletteCache;
  }

  function syncElmAccentColor(promptButton, toggle) {
    const accent = readElmAccentColor();
    if (accent) {
      [promptButton, toggle].forEach((control) => {
        if (control.style.getPropertyValue('--elm-mf-accent') !== accent) {
          control.style.setProperty('--elm-mf-accent', accent);
        }
      });
    }

    const offPalette = readNativeSwitchOffPalette();
    if (offPalette) {
      toggle.style.setProperty('--elm-mf-off-track', offPalette.track);
      toggle.style.setProperty('--elm-mf-off-thumb', offPalette.thumb);
      toggle.style.setProperty('--elm-mf-off-border', offPalette.border);
      toggle.style.setProperty('--elm-mf-off-icon', offPalette.icon);
    }

    const nativeLabel = findTopBarPromptAnchor();
    const fixerLabel = toggle.querySelector('.elm-mf-switch-label');
    if (!nativeLabel || !fixerLabel) return;

    const nativeStyle = getComputedStyle(nativeLabel);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].forEach((property) => {
      if (fixerLabel.style[property] !== nativeStyle[property]) {
        fixerLabel.style[property] = nativeStyle[property];
      }
    });
  }

  function findTopBarPromptGroup(anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    let node = anchor.parentElement;

    for (let depth = 0; node && node !== document.body && depth < 6; depth++) {
      const rect = node.getBoundingClientRect();
      const isSmallHeaderGroup = rect.height <= 80 && rect.width <= 340;
      const hasNearbyControl = Array.from(
        node.querySelectorAll('button, [role="switch"], input[type="checkbox"], mat-slide-toggle, .mat-slide-toggle')
      ).some((control) => {
        if (isExtensionToolbarControl(control) || !isVisible(control)) return false;
        const controlRect = control.getBoundingClientRect();
        return Math.abs(controlRect.top - anchorRect.top) < 48 && Math.abs(controlRect.left - anchorRect.left) < 220;
      });

      if (isVisible(node) && isSmallHeaderGroup && hasNearbyControl) return node;
      node = node.parentElement;
    }

    return null;
  }

  function createTryNewLookGroup(anchor) {
    const control = findNearbyTryNewLookControl(anchor);
    if (!control || control.parentElement !== anchor.parentElement || !anchor.parentElement) return anchor;

    const parent = anchor.parentElement;
    const wrapper = document.createElement('span');
    wrapper.className = 'elm-mf-try-new-look-group';

    const anchorRect = anchor.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    const first = anchorRect.left <= controlRect.left ? anchor : control;
    const second = first === anchor ? control : anchor;

    parent.insertBefore(wrapper, first);
    wrapper.appendChild(first);
    wrapper.appendChild(second);
    return wrapper;
  }

  function getVisibleTopBarControls() {
    return Array.from(
      document.querySelectorAll('button, a, [role="button"], [role="switch"], input[type="checkbox"], mat-slide-toggle, .mat-slide-toggle')
    ).filter((control) => {
      if (isExtensionToolbarControl(control) || !isVisible(control)) return false;
      const rect = control.getBoundingClientRect();
      return rect.top >= 0 && rect.top < 100 && rect.height >= 20 && rect.height <= 64 && rect.left > window.innerWidth * 0.38;
    });
  }

  function findCompactTopBarMount() {
    const controls = getVisibleTopBarControls();
    const candidates = [];

    controls.forEach((control) => {
      let node = control.parentElement;
      for (let depth = 0; node && node !== document.body && depth < 6; depth++) {
        if (!candidates.includes(node)) candidates.push(node);
        node = node.parentElement;
      }
    });

    const scored = candidates
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const childControls = controls.filter((control) => node.contains(control));
        return { node, rect, childControls, area: rect.width * rect.height };
      })
      .filter(({ rect, childControls }) => (
        childControls.length >= 2 &&
        rect.top >= 0 &&
        rect.top < 100 &&
        rect.height <= 90 &&
        rect.width <= 560 &&
        rect.right > window.innerWidth * 0.58
      ))
      .sort((a, b) => a.area - b.area);

    const best = scored[0];
    if (best) {
      return {
        mount: best.node,
        before: best.childControls
          .slice()
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
      };
    }

    const rightmost = controls
      .slice()
      .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];

    return rightmost?.parentElement ? { mount: rightmost.parentElement, before: rightmost } : null;
  }

  function positionCompactPromptButton(button) {
    if (button.parentElement !== document.body) {
      document.body.appendChild(button);
    }

    button.classList.add('elm-mf-fallback');
    button.classList.add('elm-mf-compact');

    const controls = getVisibleTopBarControls();
    const leftmost = controls
      .slice()
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];

    if (!leftmost) {
      button.style.left = `${Math.max(8, window.innerWidth - 132)}px`;
      button.style.top = '22px';
      button.style.right = '';
      button.style.bottom = '';
      return;
    }

    const rect = leftmost.getBoundingClientRect();
    const buttonSize = 42;
    const existingToggle = document.getElementById(FIXER_TOGGLE_ID);
    const switchWidth = existingToggle?.getBoundingClientRect().width ||
      (window.matchMedia('(max-width: 1120px)').matches ? 42 : 100);
    const controlGap = 12;
    const nativeGap = 14;
    button.style.left = `${Math.max(8, rect.left - buttonSize - controlGap - switchWidth - nativeGap)}px`;
    button.style.top = `${Math.max(8, rect.top + (rect.height - buttonSize) / 2)}px`;
    button.style.right = '';
    button.style.bottom = '';
  }

  function findSidebarLabel(text) {
    const maxLeft = Math.min(620, window.innerWidth * 0.4);
    return Array.from(document.querySelectorAll('a, button, span, div, p'))
      .filter((node) => {
        if (node.id === PROMPT_BUTTON_ID || !isVisible(node)) return false;
        if ((node.textContent || '').trim() !== text) return false;
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.left < maxLeft && rect.top >= 70 && rect.top < 620 && rect.height <= 72;
      })
      .sort((a, b) => a.children.length - b.children.length)[0] || null;
  }

  function childUnderAncestor(node, ancestor) {
    let branch = node;
    while (branch?.parentElement && branch.parentElement !== ancestor) {
      branch = branch.parentElement;
    }
    return branch?.parentElement === ancestor ? branch : null;
  }

  function findSidebarPromptMount() {
    const promptsLabel = findSidebarLabel('Prompts');
    const modelGuideLabel = findSidebarLabel('Model Guide');
    if (!promptsLabel || !modelGuideLabel) return null;

    const promptsRect = promptsLabel.getBoundingClientRect();
    const modelGuideRect = modelGuideLabel.getBoundingClientRect();
    if (promptsRect.top >= modelGuideRect.top || modelGuideRect.top - promptsRect.bottom > 120) return null;

    let commonParent = promptsLabel.parentElement;
    while (commonParent && commonParent !== document.body && !commonParent.contains(modelGuideLabel)) {
      commonParent = commonParent.parentElement;
    }
    if (!commonParent || commonParent === document.body || commonParent === document.documentElement) return null;

    const promptsItem = childUnderAncestor(promptsLabel, commonParent);
    const modelGuideItem = childUnderAncestor(modelGuideLabel, commonParent);
    if (!promptsItem || !modelGuideItem || promptsItem === modelGuideItem) return null;

    const commonRect = commonParent.getBoundingClientRect();
    const maxRight = Math.min(700, window.innerWidth * 0.46);
    if (commonRect.left > 80 || commonRect.right > maxRight) return null;

    return { commonParent, promptsItem, modelGuideItem, promptsLabel };
  }

  function findLegacyTextLabel(text, startsWith = false) {
    return Array.from(document.querySelectorAll('button, a, span, div, p'))
      .filter((node) => {
        if (node.closest?.(`#${PROMPT_BUTTON_ID}, #${PROMPT_PANEL_ID}`) || !isVisible(node)) return false;
        const content = (node.textContent || '').trim();
        if (startsWith ? !content.startsWith(text) : content !== text) return false;
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.left < Math.min(620, window.innerWidth * 0.4) &&
          rect.top >= 70 && rect.top < window.innerHeight;
      })
      .sort((a, b) => a.children.length - b.children.length)[0] || null;
  }

  function findLegacyControl(text) {
    const label = findLegacyTextLabel(text);
    if (!label) return null;
    const control = label.closest('button, a, [role="button"]') || label;
    return isVisible(control) ? control : null;
  }

  function findLegacyPromptTabControl() {
    const label = findLegacyTextLabel('Prompts');
    if (!label) return null;
    const control = label.closest('button, a, [role="tab"], [role="button"]') || label;
    return isVisible(control) ? control : null;
  }

  function isLegacyLayout() {
    return Boolean(
      findLegacyTextLabel('History') &&
      findLegacyTextLabel('Documents') &&
      findLegacyPromptTabControl()
    );
  }

  function lowestCommonAncestor(first, second) {
    const ancestors = new Set();
    let node = first;
    while (node) {
      ancestors.add(node);
      node = node.parentElement;
    }

    node = second;
    while (node && !ancestors.has(node)) node = node.parentElement;
    return node || null;
  }

  function findLegacyPromptMount() {
    const promptTab = findLegacyTextLabel('Prompts');
    const helpText = findLegacyTextLabel('Select your prompt to change or refine how ELM replies.', true);
    const addControl = findLegacyControl('Add Prompt');
    const editControl = findLegacyControl('Edit');
    const deleteControl = findLegacyControl('Delete');
    if (!promptTab || !helpText || !addControl || !editControl || !deleteControl) return null;

    const actionsGroup = lowestCommonAncestor(editControl, deleteControl);
    if (!actionsGroup || actionsGroup === document.body || !actionsGroup.parentElement) return null;

    const groupRect = actionsGroup.getBoundingClientRect();
    const parentRect = actionsGroup.parentElement.getBoundingClientRect();
    if (groupRect.height > 140 || parentRect.left > 80 || parentRect.right > Math.min(700, window.innerWidth * 0.46)) {
      return null;
    }

    return {
      parent: actionsGroup.parentElement,
      after: actionsGroup,
      addControl
    };
  }

  function findSidebarItemIcon(item, label) {
    const labelRect = label.getBoundingClientRect();
    return Array.from(item.querySelectorAll('*'))
      .filter((node) => {
        if (node === label || !isVisible(node)) return false;
        const rect = node.getBoundingClientRect();
        return rect.right <= labelRect.left && rect.width >= 8 && rect.width <= 40 && rect.height >= 8 && rect.height <= 40;
      })
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0] || null;
  }

  function applySidebarPromptStyle(button, mount) {
    const itemRect = mount.promptsItem.getBoundingClientRect();
    const itemStyle = getComputedStyle(mount.promptsItem);
    const labelStyle = getComputedStyle(mount.promptsLabel);
    const nativeIcon = findSidebarItemIcon(mount.promptsItem, mount.promptsLabel);
    const launcherIcon = button.querySelector('.elm-mf-launcher-icon');

    button.style.height = `${itemRect.height}px`;
    button.style.minHeight = `${itemRect.height}px`;
    button.style.paddingTop = itemStyle.paddingTop;
    button.style.paddingRight = itemStyle.paddingRight;
    button.style.paddingBottom = itemStyle.paddingBottom;
    button.style.paddingLeft = itemStyle.paddingLeft;
    button.style.borderRadius = itemStyle.borderRadius;
    button.style.fontFamily = labelStyle.fontFamily;
    button.style.fontSize = labelStyle.fontSize;
    button.style.fontWeight = labelStyle.fontWeight;
    button.style.lineHeight = labelStyle.lineHeight;
    button.style.letterSpacing = labelStyle.letterSpacing;
    button.style.color = labelStyle.color;

    if (nativeIcon && launcherIcon) {
      const iconRect = nativeIcon.getBoundingClientRect();
      const labelRect = mount.promptsLabel.getBoundingClientRect();
      button.style.paddingLeft = `${Math.max(0, iconRect.left - itemRect.left)}px`;
      button.style.gap = `${Math.max(6, labelRect.left - iconRect.right)}px`;
      launcherIcon.style.width = `${iconRect.width}px`;
      launcherIcon.style.height = `${iconRect.height}px`;
    }
  }

  function applyLegacyPromptStyle(button, mount) {
    const parentRect = mount.parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(mount.parent);
    const addRect = mount.addControl.getBoundingClientRect();
    const addStyle = getComputedStyle(mount.addControl);
    const launcherIcon = button.querySelector('.elm-mf-launcher-icon');

    button.style.height = `${addRect.height}px`;
    button.style.minHeight = `${addRect.height}px`;
    button.style.width = `${addRect.width}px`;
    button.style.marginTop = '16px';
    button.style.marginRight = '0';
    button.style.marginBottom = '0';
    const parentContentLeft = parentRect.left +
      (Number.parseFloat(parentStyle.borderLeftWidth) || 0) +
      (Number.parseFloat(parentStyle.paddingLeft) || 0);
    button.style.marginLeft = `${Math.max(0, addRect.left - parentContentLeft)}px`;
    button.style.borderRadius = addStyle.borderRadius;
    button.style.fontFamily = addStyle.fontFamily;
    button.style.fontSize = addStyle.fontSize;
    button.style.fontWeight = addStyle.fontWeight;
    button.style.lineHeight = addStyle.lineHeight;
    button.style.letterSpacing = addStyle.letterSpacing;
    button.style.gap = '10px';

    if (launcherIcon) {
      launcherIcon.style.width = '22px';
      launcherIcon.style.height = '22px';
    }
  }

  function clearSidebarPromptStyle(button) {
    button.classList.remove('elm-mf-sidebar', 'elm-mf-legacy-sidebar', 'elm-mf-hidden');
    [
      'height', 'min-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
      'color', 'gap', 'width', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
    ].forEach((property) => button.style.removeProperty(property));

    const launcherIcon = button.querySelector('.elm-mf-launcher-icon');
    launcherIcon?.style.removeProperty('width');
    launcherIcon?.style.removeProperty('height');
  }

  function placePromptButton(button) {
    const sidebarMount = findSidebarPromptMount();
    const legacyMount = sidebarMount ? null : findLegacyPromptMount();
    clearSidebarPromptStyle(button);

    if (sidebarMount) {
      button.classList.remove('elm-mf-fallback', 'elm-mf-compact');
      button.classList.add('elm-mf-sidebar');
      button.style.left = '';
      button.style.top = '';
      button.style.right = '';
      button.style.bottom = '';
      if (button.parentElement !== sidebarMount.commonParent || button.nextSibling !== sidebarMount.modelGuideItem) {
        sidebarMount.commonParent.insertBefore(button, sidebarMount.modelGuideItem);
      }
      applySidebarPromptStyle(button, sidebarMount);
      return;
    }

    if (legacyMount) {
      button.classList.remove('elm-mf-fallback', 'elm-mf-compact');
      button.classList.add('elm-mf-legacy-sidebar');
      button.style.left = '';
      button.style.top = '';
      button.style.right = '';
      button.style.bottom = '';
      if (button.parentElement !== legacyMount.parent || button.previousElementSibling !== legacyMount.after) {
        legacyMount.parent.insertBefore(button, legacyMount.after.nextSibling);
      }
      applyLegacyPromptStyle(button, legacyMount);
      return;
    }

    button.classList.remove('elm-mf-fallback', 'elm-mf-compact');
    button.classList.add('elm-mf-hidden');
    button.style.left = '';
    button.style.top = '';
    button.style.right = '';
    button.style.bottom = '';
    if (button.parentElement !== document.body) document.body.appendChild(button);
  }

  function updateFixerToggle(button) {
    const enabled = isFixerEnabled();
    const title = enabled
      ? 'ELM Math Fixer is on. Click to turn it off.'
      : 'ELM Math Fixer is off. Click to turn it on.';

    const enabledText = String(enabled);
    if (button.dataset.enabled !== enabledText) button.dataset.enabled = enabledText;
    if (button.getAttribute('aria-checked') !== enabledText) {
      button.setAttribute('aria-checked', enabledText);
    }
    if (button.getAttribute('aria-label') !== title) button.setAttribute('aria-label', title);
    if (button.title !== title) button.title = title;
  }

  function positionCompactFixerToggle(toggle) {
    if (toggle.parentElement !== document.body) document.body.appendChild(toggle);
    toggle.classList.add('elm-mf-fallback', 'elm-mf-compact');

    const leftmost = getVisibleTopBarControls()
      .slice()
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
    const size = 42;
    const gap = 14;

    if (leftmost) {
      const rect = leftmost.getBoundingClientRect();
      toggle.style.left = `${Math.max(8, rect.left - size - gap)}px`;
      toggle.style.top = `${Math.max(8, rect.top + (rect.height - size) / 2)}px`;
      toggle.style.right = '';
    } else {
      toggle.style.left = '';
      toggle.style.top = '22px';
      toggle.style.right = '30px';
    }
    toggle.style.bottom = '';
  }

  function placeFixerToggle(toggle) {
    const tryNewLook = findTopBarPromptAnchor();
    if (tryNewLook?.parentElement) {
      const promptGroup = findTopBarPromptGroup(tryNewLook) || createTryNewLookGroup(tryNewLook);
      const interactiveAncestor = promptGroup.closest(
        'label, button, [role="switch"], mat-slide-toggle, .mat-slide-toggle'
      );
      const insertionTarget = interactiveAncestor || promptGroup;
      const parent = insertionTarget.parentElement;
      if (parent) {
        toggle.classList.remove('elm-mf-fallback', 'elm-mf-compact');
        toggle.style.left = '';
        toggle.style.top = '';
        toggle.style.right = '';
        toggle.style.bottom = '';
        if (toggle.parentElement !== parent || toggle.nextSibling !== insertionTarget) {
          parent.insertBefore(toggle, insertionTarget);
        }
        return;
      }
    }

    positionCompactFixerToggle(toggle);
  }

  function ensureFixerToggle(promptButton) {
    let toggle = document.getElementById(FIXER_TOGGLE_ID);
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = FIXER_TOGGLE_ID;
      toggle.type = 'button';
      toggle.setAttribute('role', 'switch');

      const label = document.createElement('span');
      label.className = 'elm-mf-switch-label';
      label.textContent = 'Fixer';
      const track = document.createElement('span');
      track.className = 'elm-mf-switch-track';
      track.setAttribute('aria-hidden', 'true');
      const thumb = document.createElement('span');
      thumb.className = 'elm-mf-switch-thumb';
      const powerIcon = document.createElement('span');
      powerIcon.className = 'elm-mf-power-icon';
      powerIcon.setAttribute('aria-hidden', 'true');
      powerIcon.textContent = '\u23fb';
      track.appendChild(thumb);
      toggle.appendChild(label);
      toggle.appendChild(track);
      toggle.appendChild(powerIcon);

      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const enabled = !isFixerEnabled();
        setFixerEnabled(enabled);
        updateFixerToggle(toggle);
        if (enabled) {
          scan();
        } else {
          restoreAllRescuedMath();
        }
      });
    }

    updateFixerToggle(toggle);
    syncElmAccentColor(promptButton, toggle);
    placeFixerToggle(toggle);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
    } finally {
      textarea.remove();
    }
  }

  function positionPromptPanel(panel, button) {
    const rect = button.getBoundingClientRect();
    const margin = 12;
    const panelWidth = Math.min(420, window.innerWidth - 32);
    const estimatedHeight = Math.min(520, panel.scrollHeight || 420);

    if (button.classList.contains('elm-mf-sidebar') || button.classList.contains('elm-mf-legacy-sidebar')) {
      const left = Math.max(16, Math.min(rect.right + margin, window.innerWidth - panelWidth - 16));
      const top = Math.max(16, Math.min(rect.top, window.innerHeight - estimatedHeight - 16));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      return;
    }

    const left = Math.max(16, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 16));
    panel.style.left = `${left}px`;
    const top = rect.top - estimatedHeight - margin;
    panel.style.top = `${top > 16 ? top : rect.bottom + margin}px`;
  }

  function buildPromptPanel(button) {
    const oldPanel = document.getElementById(PROMPT_PANEL_ID);
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement('div');
    panel.id = PROMPT_PANEL_ID;
    panel.hidden = true;

    const title = document.createElement('div');
    title.className = 'elm-mf-panel-title';
    title.textContent = 'Fixer Prompts';

    const closeButton = document.createElement('button');
    closeButton.className = 'elm-mf-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close prompt panel');
    closeButton.textContent = '\u00d7';
    closeButton.addEventListener('click', () => {
      panel.hidden = true;
    });
    title.appendChild(closeButton);
    panel.appendChild(title);

    const help = document.createElement('div');
    help.className = 'elm-mf-help';
    help.textContent = 'Copy a prompt, then open Prompts in the left-hand Tools sidebar, add a new prompt, paste it, and save. Prompts are optional, partial aids; the extension is a complete standalone solution.';
    panel.appendChild(help);

    PROMPT_GROUPS.forEach((group) => {
      const item = document.createElement('div');
      item.className = 'elm-mf-prompt';

      const itemTitle = document.createElement('div');
      itemTitle.className = 'elm-mf-prompt-title';
      itemTitle.textContent = group.title;

      const description = document.createElement('div');
      description.className = 'elm-mf-prompt-desc';
      description.textContent = group.description;

      const actions = document.createElement('div');
      actions.className = 'elm-mf-actions';

      group.prompts.forEach((prompt) => {
        const copyButton = document.createElement('button');
        copyButton.className = 'elm-mf-copy';
        copyButton.type = 'button';
        copyButton.textContent = prompt.label;
        copyButton.addEventListener('click', async () => {
          const original = copyButton.textContent;
          try {
            await copyText(prompt.text);
            copyButton.textContent = 'Copied';
          } catch (error) {
            warn('failed to copy prompt:', error);
            copyButton.textContent = 'Copy failed';
          } finally {
            window.setTimeout(() => {
              copyButton.textContent = original;
            }, 1600);
          }
        });
        actions.appendChild(copyButton);
      });

      item.appendChild(itemTitle);
      item.appendChild(description);
      item.appendChild(actions);
      panel.appendChild(item);
    });

    document.body.appendChild(panel);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      markPromptLocationDiscovered();
      button.classList.remove('elm-mf-attention');
      removeToolsGuide();
      panel.hidden = false;
      positionPromptPanel(panel, button);
    });
  }

  function ensurePromptLauncher() {
    if (!document.body) return;
    const hasElmChatUi = findTopBarPromptAnchor() ||
      document.querySelector(CONTAINER_SELECTOR) ||
      findLegacyTextLabel('Prompts') ||
      findSidebarLabel('Prompts');
    if (!hasElmChatUi) return;

    injectPromptStyles();

    let button = document.getElementById(PROMPT_BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = PROMPT_BUTTON_ID;
      button.type = 'button';
      button.title = 'Fixer Prompts';
      button.setAttribute('aria-label', 'Fixer Prompts');

      const icon = document.createElement('span');
      icon.className = 'elm-mf-launcher-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'fx';

      const label = document.createElement('span');
      label.className = 'elm-mf-launcher-label';
      label.textContent = 'Fixer Prompts';

      button.appendChild(icon);
      button.appendChild(label);
      buildPromptPanel(button);
    }

    placePromptButton(button);
    ensurePromptDiscovery(button);
    ensureFixerToggle(button);
  }

  let debounceTimer = null;
  let layoutTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      observer.disconnect();
      try {
        scan();
      } finally {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }, 300);
  });

  window.addEventListener('resize', () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      ensurePromptLauncher();
      const button = document.getElementById(PROMPT_BUTTON_ID);
      const panel = document.getElementById(PROMPT_PANEL_ID);
      if (button && panel && !panel.hidden) positionPromptPanel(panel, button);
    }, 120);
  });

  log('content script loaded');
  scan();
  observer.observe(document.body, { childList: true, subtree: true });
})();
