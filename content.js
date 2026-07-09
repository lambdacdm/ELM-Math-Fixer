(function () {
  'use strict';

  const CONTAINER_SELECTOR = '.markdown, .markdown-container, .response-ai, .message-content';
  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6';
  const DEBUG = false;

  const log = (...args) => {
    if (DEBUG) console.log('[ELM Math Fixer]', ...args);
  };

  const warn = (...args) => {
    if (DEBUG) console.warn('[ELM Math Fixer]', ...args);
  };

  const hasMath = (text) => text.includes('$') || text.includes('\\(') || text.includes('\\[');

  function hasNativeRenderedMath(el) {
    const wrapper = el.querySelector(':scope > .elm-math-rescued-wrapper');
    return !wrapper && Boolean(el.querySelector('.katex, .katex-display'));
  }

  // ELM appears to parse Markdown before KaTeX. In math text, that can turn
  // subscript underscores into <em>/<strong> markup and remove the original
  // underscore characters. Clone the DOM and reverse that local Markdown markup
  // before handing the text back to KaTeX.
  function getMathAwareText(el) {
    const raw = el.textContent || '';
    if (!hasMath(raw)) return raw;

    const clone = el.cloneNode(true);

    clone.querySelectorAll('em, i').forEach((node) => {
      node.replaceWith(document.createTextNode(`_${node.textContent}_`));
    });

    clone.querySelectorAll('strong, b').forEach((node) => {
      node.replaceWith(document.createTextNode(`__${node.textContent}__`));
    });

    return clone.textContent || '';
  }

  function renderMathInto(el) {
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
  }

  function processContainer(container) {
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
          const prevSibling = group[0].previousElementSibling;
          if (
            prevSibling &&
            prevSibling.classList.contains('elm-math-rescued-block') &&
            prevSibling.dataset.rawText === combinedText
          ) {
            group.forEach((node) => {
              node.style.display = 'none';
            });
            i++;
            continue;
          }

          if (prevSibling && prevSibling.classList.contains('elm-math-rescued-block')) {
            prevSibling.remove();
          }

          group.forEach((node) => {
            const hidden = node.querySelector(':scope > .elm-math-hidden-original');
            const oldWrapper = node.querySelector(':scope > .elm-math-rescued-wrapper');
            if (hidden) restoreSingleLineElement(node, hidden, oldWrapper);
          });

          combinedText = group.map((node) => getMathAwareText(node)).join('\n');

          const mathBlock = document.createElement('div');
          mathBlock.className = 'elm-math-rescued-block';
          mathBlock.dataset.rawText = combinedText;
          mathBlock.style.margin = '1em 0';
          mathBlock.textContent = combinedText;

          try {
            renderMathInto(mathBlock);

            group.forEach((node) => {
              node.style.display = 'none';
            });
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

        const freshText = getMathAwareText(el).replace(/\$\s+/g, '$').replace(/\s+\$/g, '$');
        const mathWrapper = document.createElement('span');
        mathWrapper.className = 'elm-math-rescued-wrapper';
        mathWrapper.dataset.rawText = freshText;
        mathWrapper.textContent = freshText;

        try {
          renderMathInto(mathWrapper);

          const newHiddenOriginal = document.createElement('span');
          newHiddenOriginal.className = 'elm-math-hidden-original';
          newHiddenOriginal.style.display = 'none';

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
        el.style.display = '';
      }

      i++;
    }
  }

  function scan() {
    if (typeof renderMathInElement !== 'function') {
      warn('KaTeX auto-render is not available. Check manifest paths.');
      return;
    }

    const containers = document.querySelectorAll(CONTAINER_SELECTOR);
    log('matched containers:', containers.length);
    containers.forEach(processContainer);
  }

  let debounceTimer = null;
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

  log('content script loaded');
  scan();
  observer.observe(document.body, { childList: true, subtree: true });
})();
