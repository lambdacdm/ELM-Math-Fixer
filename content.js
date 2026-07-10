(function () {
  'use strict';

  const CONTAINER_SELECTOR = '.markdown, .markdown-container, .response-ai, .message-content';
  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6';
  const DEBUG = false;
  const PROMPT_BUTTON_ID = 'elm-math-fixer-prompt-button';
  const PROMPT_PANEL_ID = 'elm-math-fixer-prompt-panel';
  const PROMPT_STYLE_ID = 'elm-math-fixer-prompt-style';

  const PROMPTS = [
    {
      title: 'Math Rendering Fix (中文)',
      description: '避免展示公式内部换行导致 KaTeX 渲染失败。',
      text: `生成数学公式（$...$ 或 $$...$$）时，必须遵守以下规则，否则公式会渲染失败或完全不被识别：

【最重要】一条 $$...$$ 公式内部绝对不能换行或有空行。从开头 $$ 到结尾 $$ 之间必须是连续的一整段文本，中间不能敲回车——哪怕公式很长也要写在同一行/同一段落里，否则平台会把公式从中间切断，导致完全不渲染。需要分行展示时，用 aligned/array/gathered 环境配合 \\\\ 处理，不要在文本层面换行。`
    },
    {
      title: 'Math Rendering Fix (English)',
      description: 'Prevents display formulas from being split before KaTeX rendering.',
      text: `When generating mathematical formulas ($...$ or $$...$$), you must follow these rules, or the formula will fail to render or won't be recognized at all:

[MOST IMPORTANT] Never include a line break or blank line inside a $$...$$ formula. Everything from the opening $$ to the closing $$ must be one continuous, unbroken block of text — no line breaks in between, even for long formulas; keep it all on the same line/paragraph. Otherwise the platform will split the formula partway through and it won't render at all. If you need multi-line display, use an aligned/array/gathered environment with \\\\ line breaks inside the LaTeX itself — never insert a literal line break at the text level.`
    },
    {
      title: 'Separate Reasoning and Answer (中文)',
      description: '用于 Claude 模型，将思考过程和正式回答分隔开。',
      text: `请先正常输出思考过程，思考结束后另起一行输出引用块：
> 以上是思考过程，以下是正式回答

引用块之后再输出最终回答内容。`
    },
    {
      title: 'Separate Reasoning and Answer (English)',
      description: 'For Claude models that mix reasoning-style text with the final answer.',
      text: `Please first output your reasoning process normally. After the reasoning is complete, start a new line and output the following blockquote:

> The above is the reasoning process; the following is the final answer.

After that blockquote, output the final answer.`
    }
  ];

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
    ensurePromptLauncher();
  }

  function injectPromptStyles() {
    if (document.getElementById(PROMPT_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = PROMPT_STYLE_ID;
    style.textContent = `
      #${PROMPT_BUTTON_ID} {
        align-items: center;
        background: #2f6f59;
        border: 1px solid #2f6f59;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        color: #fff;
        cursor: pointer;
        display: inline-flex;
        font: 600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        gap: 6px;
        min-height: 34px;
        padding: 7px 11px;
        white-space: nowrap;
        z-index: 2147483646;
      }

      #${PROMPT_BUTTON_ID}:hover {
        background: #285f4c;
        border-color: #285f4c;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-floating {
        bottom: 92px;
        position: fixed;
        right: 30px;
      }

      #${PROMPT_PANEL_ID} {
        background: #fff;
        border: 1px solid rgba(47, 111, 89, 0.22);
        border-radius: 10px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
        color: #1f2933;
        font: 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
        font-weight: 700;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .elm-mf-close {
        background: transparent;
        border: 0;
        color: #52616b;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        padding: 2px 4px;
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
        font-weight: 650;
      }

      .elm-mf-prompt-desc {
        color: #52616b;
        font-size: 12px;
      }

      .elm-mf-copy {
        background: #eef6f2;
        border: 1px solid #b8d5c7;
        border-radius: 7px;
        color: #2f6f59;
        cursor: pointer;
        font: 650 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        justify-self: start;
        min-height: 30px;
        padding: 6px 10px;
      }

      .elm-mf-copy:hover {
        background: #dfeee7;
      }
    `;
    document.head.appendChild(style);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findPromptMount() {
    const buttons = Array.from(document.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.bottom > window.innerHeight - 220 && rect.top < window.innerHeight && isVisible(button);
    });

    const candidates = [];
    buttons.forEach((button) => {
      let node = button.parentElement;
      for (let depth = 0; node && depth < 5; depth++) {
        if (!candidates.includes(node)) candidates.push(node);
        node = node.parentElement;
      }
    });

    return candidates.find((node) => {
      const rect = node.getBoundingClientRect();
      const visibleButtons = Array.from(node.querySelectorAll('button')).filter(isVisible);
      return (
        node !== document.body &&
        rect.width >= 300 &&
        rect.height <= 180 &&
        rect.bottom > window.innerHeight - 240 &&
        visibleButtons.length >= 2
      );
    });
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
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - panelWidth - 16));
    panel.style.left = `${left}px`;

    const estimatedHeight = Math.min(520, panel.scrollHeight || 420);
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
    title.textContent = 'ELM Math Fixer Prompts';

    const closeButton = document.createElement('button');
    closeButton.className = 'elm-mf-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close prompt panel');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => {
      panel.hidden = true;
    });
    title.appendChild(closeButton);
    panel.appendChild(title);

    PROMPTS.forEach((prompt) => {
      const item = document.createElement('div');
      item.className = 'elm-mf-prompt';

      const itemTitle = document.createElement('div');
      itemTitle.className = 'elm-mf-prompt-title';
      itemTitle.textContent = prompt.title;

      const description = document.createElement('div');
      description.className = 'elm-mf-prompt-desc';
      description.textContent = prompt.description;

      const copyButton = document.createElement('button');
      copyButton.className = 'elm-mf-copy';
      copyButton.type = 'button';
      copyButton.textContent = 'Copy';
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

      item.appendChild(itemTitle);
      item.appendChild(description);
      item.appendChild(copyButton);
      panel.appendChild(item);
    });

    document.body.appendChild(panel);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) positionPromptPanel(panel, button);
    });

    document.addEventListener('click', (event) => {
      if (!panel.hidden && !panel.contains(event.target) && event.target !== button) {
        panel.hidden = true;
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') panel.hidden = true;
    });
  }

  function ensurePromptLauncher() {
    if (!document.body || !location.pathname.includes('/elm-new')) return;

    injectPromptStyles();

    let button = document.getElementById(PROMPT_BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = PROMPT_BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Math Fixer Prompts';
      buildPromptPanel(button);
    }

    const mount = findPromptMount();
    if (mount && button.parentElement !== mount) {
      button.classList.remove('elm-mf-floating');
      mount.appendChild(button);
    } else if (!mount && button.parentElement !== document.body) {
      button.classList.add('elm-mf-floating');
      document.body.appendChild(button);
    } else if (!mount) {
      button.classList.add('elm-mf-floating');
    }
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
