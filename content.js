(function () {
  'use strict';

  const CONTAINER_SELECTOR = 'markdown, .markdown, .markdown-container, .response-ai, .message-content';
  const DEBUG = false;
  const PROMPT_BUTTON_ID = 'elm-math-fixer-prompt-button';
  const FIXER_TOGGLE_ID = 'elm-math-fixer-toggle';
  const PROMPT_PANEL_ID = 'elm-math-fixer-prompt-panel';
  const TOOLS_GUIDE_ID = 'elm-math-fixer-tools-guide';
  const PROMPT_DISCOVERED_STORAGE_KEY = 'elmMathFixerPromptLocationDiscoveredV2';
  const PROMPT_GUIDE_SESSION_KEY = 'elmMathFixerPromptGuideShown';
  const FIXER_ENABLED_STORAGE_KEY = 'elmMathFixerEnabled';
  let fixerEnabledFallback = true;
  let toolsAttentionTimer = null;
  let sidebarAttentionTimer = null;
  let nativePaletteControl = null;
  let nativePaletteCache = null;

  const PROMPT_GROUPS = globalThis.ELMMathFixerPrompts || [];

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

  const MATH_REPAIR = globalThis.ELMMathFixerRepair;
  if (!MATH_REPAIR) throw new Error('ELM Math Fixer repair engine failed to load.');
  const { restoreAllRescuedMath } = MATH_REPAIR;

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
          setTimeout(() => globalThis.ELMMathFixerRuntime?.scan(), 100);
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
    help.textContent = 'Copy a prompt, then open Prompts in the left-hand Tools sidebar, add a new prompt, paste it, and save. For best results, use the Math Rendering Fix prompt alongside the extension, although it is not required.';
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

  let layoutTimer = null;

  window.addEventListener('resize', () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      ensurePromptLauncher();
      const button = document.getElementById(PROMPT_BUTTON_ID);
      const panel = document.getElementById(PROMPT_PANEL_ID);
      if (button && panel && !panel.hidden) positionPromptPanel(panel, button);
    }, 120);
  });

  globalThis.ELMMathFixerUI = {
    ensurePromptLauncher,
    isFixerEnabled,
    promptButtonId: PROMPT_BUTTON_ID,
    fixerToggleId: FIXER_TOGGLE_ID
  };

  log('UI module loaded');
})();
