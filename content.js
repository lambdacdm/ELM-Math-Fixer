(function () {
  'use strict';

  const CONTAINER_SELECTOR = '.markdown, .markdown-container, .response-ai, .message-content';
  const TARGET_ELEMENTS = 'p, li, h1, h2, h3, h4, h5, h6';
  const DEBUG = false;
  const PROMPT_BUTTON_ID = 'elm-math-fixer-prompt-button';
  const PROMPT_PANEL_ID = 'elm-math-fixer-prompt-panel';
  const PROMPT_STYLE_ID = 'elm-math-fixer-prompt-style';
  const PROMPT_SEEN_STORAGE_KEY = 'elmMathFixerPromptButtonClicked';

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
        margin: 0 28px 0 0;
        padding: 7px 11px;
        position: static;
        flex: 0 0 auto;
        white-space: nowrap;
        z-index: 2147483646;
      }

      #${PROMPT_BUTTON_ID}:hover {
        background: #285f4c;
        border-color: #285f4c;
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
        border-color: #2f6f59;
        border-radius: 8px;
        box-shadow: none;
        color: #2f6f59;
        height: 42px;
        justify-content: center;
        margin: 0 12px 0 0;
        min-height: 42px;
        padding: 0;
        width: 42px;
      }

      #${PROMPT_BUTTON_ID}.elm-mf-compact:hover {
        background: #edf5f1;
        border-color: #285f4c;
        color: #285f4c;
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
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 0 0 0 rgba(47, 111, 89, 0.55);
          transform: translateY(0);
        }
        50% {
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 0 0 7px rgba(47, 111, 89, 0);
          transform: translateY(-1px);
        }
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

      .elm-mf-help {
        background: #f4f8f6;
        border: 1px solid #d9e8e0;
        border-radius: 8px;
        color: #3f4e58;
        font-size: 12px;
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
        font-weight: 650;
      }

      .elm-mf-prompt-desc {
        color: #52616b;
        font-size: 12px;
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
        font: 650 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 30px;
        padding: 6px 10px;
      }

      .elm-mf-copy:hover {
        background: #dfeee7;
      }

      @media (max-width: 1120px) {
        #${PROMPT_BUTTON_ID} {
          background: transparent;
          border-color: #2f6f59;
          border-radius: 8px;
          box-shadow: none;
          color: #2f6f59;
          height: 42px;
          justify-content: center;
          margin: 0 12px 0 0;
          min-height: 42px;
          padding: 0;
          width: 42px;
        }

        #${PROMPT_BUTTON_ID}:hover {
          background: #edf5f1;
          border-color: #285f4c;
          color: #285f4c;
        }

        #${PROMPT_BUTTON_ID} .elm-mf-launcher-icon {
          display: inline;
          font-size: 16px;
        }

        #${PROMPT_BUTTON_ID} .elm-mf-launcher-label {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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
        if (control.id === PROMPT_BUTTON_ID || !isVisible(control)) return false;
        const controlRect = control.getBoundingClientRect();
        return Math.abs(controlRect.top - anchorRect.top) < 48 && Math.abs(controlRect.left - anchorRect.left) < 220;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return Math.abs(aRect.left - anchorRect.left) - Math.abs(bRect.left - anchorRect.left);
      })[0];
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
        if (control.id === PROMPT_BUTTON_ID || !isVisible(control)) return false;
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
      if (control.id === PROMPT_BUTTON_ID || !isVisible(control)) return false;
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
      button.style.left = '';
      button.style.top = '';
      button.style.right = '';
      button.style.bottom = '';
      return;
    }

    const rect = leftmost.getBoundingClientRect();
    const buttonSize = 42;
    const gap = 14;
    button.style.left = `${Math.max(8, rect.left - buttonSize - gap)}px`;
    button.style.top = `${Math.max(8, rect.top + (rect.height - buttonSize) / 2)}px`;
    button.style.right = '';
    button.style.bottom = '';
  }

  function placePromptButton(button) {
    const tryNewLook = findTopBarPromptAnchor();
    if (tryNewLook?.parentElement) {
      unwrapPromptAnchor(button, tryNewLook);

      button.classList.remove('elm-mf-fallback');
      button.classList.remove('elm-mf-compact');
      button.style.left = '';
      button.style.top = '';
      button.style.right = '';
      button.style.bottom = '';

      const promptGroup = findTopBarPromptGroup(tryNewLook) || createTryNewLookGroup(tryNewLook);
      const parent = promptGroup.parentElement;
      if (!parent) return;

      if (button.parentElement !== parent || button.nextSibling !== promptGroup) {
        parent.insertBefore(button, promptGroup);
      }

      const buttonRect = button.getBoundingClientRect();
      const groupRect = promptGroup.getBoundingClientRect();
      if (buttonRect.left > groupRect.left) {
        parent.insertBefore(button, promptGroup.nextSibling);
      }
      return;
    }

    const compactMount = findCompactTopBarMount();
    if (compactMount?.mount) {
      positionCompactPromptButton(button);
      return;
    }

    positionCompactPromptButton(button);
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
    const left = Math.max(16, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 16));
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
    closeButton.textContent = '\u00d7';
    closeButton.addEventListener('click', () => {
      panel.hidden = true;
    });
    title.appendChild(closeButton);
    panel.appendChild(title);

    const help = document.createElement('div');
    help.className = 'elm-mf-help';
    help.textContent = 'Copy a prompt, then open Prompts from the ELM left toolbar (Tools), create a new prompt, paste it, and save. 复制后请到 ELM 左侧工具栏（Tools）里的 Prompts 新建提示词，粘贴并保存；插件只负责复制文本。';
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
      event.stopPropagation();
      localStorage.setItem(PROMPT_SEEN_STORAGE_KEY, 'true');
      button.classList.remove('elm-mf-attention');
      panel.hidden = false;
      positionPromptPanel(panel, button);
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
      button.title = 'Math Fixer Prompts';
      button.setAttribute('aria-label', 'Math Fixer Prompts');

      const icon = document.createElement('span');
      icon.className = 'elm-mf-launcher-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'fx';

      const label = document.createElement('span');
      label.className = 'elm-mf-launcher-label';
      label.textContent = 'Math Fixer Prompts';

      button.appendChild(icon);
      button.appendChild(label);
      if (localStorage.getItem(PROMPT_SEEN_STORAGE_KEY) !== 'true') {
        button.classList.add('elm-mf-attention');
        window.setTimeout(() => {
          button.classList.remove('elm-mf-attention');
          localStorage.setItem(PROMPT_SEEN_STORAGE_KEY, 'true');
        }, 5000);
      }
      buildPromptPanel(button);
    }

    placePromptButton(button);
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
