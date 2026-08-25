(function () {
  'use strict';

  const CONTAINER_SELECTOR = 'markdown, .markdown, .markdown-container, .response-ai, .message-content';
  const DEBUG = false;
  const PROMPT_BUTTON_ID = 'elm-math-fixer-prompt-button';
  const FIXER_TOGGLE_ID = 'elm-math-fixer-toggle';
  const PROMPT_PANEL_ID = 'elm-math-fixer-prompt-panel';
  const FIXER_ENABLED_STORAGE_KEY = 'elmMathFixerEnabled';
  let fixerEnabledFallback = true;

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

  // Per-tick memoization: ensurePromptLauncher clears this at entry and every
  // helper below reuses its results for the rest of the synchronous tick (the
  // DOM cannot change mid-tick, so the memo is exact). Cleared afterwards so
  // any future out-of-tick caller recomputes against fresh layout.
  let uiTickCache = null;
  // The accent color is purely cosmetic and rarely changes; recompute at most
  // once every 2s to keep getComputedStyle sweeps off the hot path.
  const ACCENT_COLOR_THROTTLE_MS = 2000;
  let accentColorCache = { color: null, at: 0 };

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isExtensionToolbarControl(control) {
    return control.id === PROMPT_BUTTON_ID || control.id === FIXER_TOGGLE_ID;
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
    const now = Date.now();
    if (now - accentColorCache.at < ACCENT_COLOR_THROTTLE_MS) return accentColorCache.color;
    const color = readElmAccentColorUncached();
    accentColorCache = { color, at: now };
    return color;
  }

  function readElmAccentColorUncached() {
    const roots = getVisibleTopBarControls();
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

  function syncElmAccentColor(promptButton, toggle) {
    const accent = readElmAccentColor();
    if (accent) {
      [promptButton, toggle].forEach((control) => {
        if (control.style.getPropertyValue('--elm-mf-accent') !== accent) {
          control.style.setProperty('--elm-mf-accent', accent);
        }
      });
    }
  }

  function syncFixerToggleFont(toggle) {
    // Label is only visible when docked (which implies a native anchor exists);
    // in compact/fallback the label is hidden, so early-return is exact.
    const anchor = getLeftmostTopBarControl();
    if (!anchor) return;
    const font = getComputedStyle(anchor);
    const label = toggle.querySelector('.elm-mf-switch-label');
    if (!label) return;
    label.style.fontFamily = font.fontFamily;
    label.style.fontSize = font.fontSize;
    label.style.fontWeight = font.fontWeight;
    label.style.lineHeight = font.lineHeight;
    label.style.letterSpacing = font.letterSpacing;
  }

  // The top bar (even when a banner pushes it down) always stays within the
  // top half of the viewport, while the chat composer - bottom docked in a
  // conversation or vertically centered on the welcome page - never does.
  function isInTopBarRegion(rect) {
    return rect.top >= 0 && rect.top < window.innerHeight * 0.5;
  }

  // The chat composer input ("Ask anything...") is the only text field that
  // sits in the bottom half of the viewport. Controls at or below its top
  // edge belong to the composer row and must never anchor top bar placement,
  // even when the welcome page centers the composer unusually high.
  function getChatInputRect() {
    if (uiTickCache && 'chatInputRect' in uiTickCache) return uiTickCache.chatInputRect;
    const rect = getChatInputRectUncached();
    if (uiTickCache) uiTickCache.chatInputRect = rect;
    return rect;
  }

  function getChatInputRectUncached() {
    const inputs = document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]');
    for (const input of inputs) {
      const rect = input.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top > window.innerHeight * 0.5) return rect;
    }
    return null;
  }

  // Known ELM top bar labels, in preference order. The row containing one of
  // them is always the real top bar, even when another row (a chat composer
  // or an open menu) holds more controls.
  const TOP_BAR_ANCHOR_PATTERNS = [
    /request\s+an\s+.*api\s+key/i,
    /responsible\s+ai/i,
    /support/i
  ];

  // A banner above the top bar pushes the top bar down and adds its own
  // controls (e.g. a dismiss button). Cluster candidate controls into rows by
  // vertical position, then prefer the row containing a known top bar label;
  // without one, fall back to the row with the most controls (banner rows
  // usually hold one or two controls, the top bar holds more).
  function getVisibleTopBarControls() {
    if (uiTickCache?.topBarControls) return uiTickCache.topBarControls;
    const controls = getVisibleTopBarControlsUncached();
    if (uiTickCache) uiTickCache.topBarControls = controls;
    return controls;
  }

  function getVisibleTopBarControlsUncached() {
    const composerRect = getChatInputRect();
    const candidates = Array.from(
      document.querySelectorAll('button, a, [role="button"], [role="switch"], input[type="checkbox"], mat-slide-toggle, .mat-slide-toggle')
    ).filter((control) => {
      if (isExtensionToolbarControl(control) || !isVisible(control)) return false;
      const rect = control.getBoundingClientRect();
      if (!(isInTopBarRegion(rect) && rect.height >= 20 && rect.height <= 64 && rect.left > window.innerWidth * 0.38)) {
        return false;
      }
      // Controls at or below the composer input belong to the composer row.
      return !composerRect || rect.top < composerRect.top - 8;
    });
    if (candidates.length === 0) return [];

    const bands = [];
    candidates.forEach((control) => {
      const rect = control.getBoundingClientRect();
      const band = bands.find((item) => Math.abs(item.top - rect.top) <= 30);
      if (band) band.controls.push(control);
      else bands.push({ top: rect.top, controls: [control] });
    });

    // A lone banner control (e.g. its dismiss button) must never be treated as
    // a top bar anchor; without at least two controls, fall back to compact
    // positioning instead.
    const viableBands = bands.filter((band) => band.controls.length >= 2);
    if (viableBands.length === 0) return [];

    let topBarBand = null;
    for (const pattern of TOP_BAR_ANCHOR_PATTERNS) {
      const matches = viableBands.filter((band) =>
        band.controls.some((control) => pattern.test((control.textContent || '').trim()))
      );
      if (matches.length > 0) {
        topBarBand = matches.sort((a, b) => b.controls.length - a.controls.length || a.top - b.top)[0];
        break;
      }
    }
    if (!topBarBand) {
      topBarBand = viableBands.sort((a, b) => b.controls.length - a.controls.length || a.top - b.top)[0];
    }

    // Menus and dialogs (e.g. the model picker) can cover part of the top bar
    // row. Anchoring to a covered control would drag the Fixer switch into
    // the overlay or bounce it into compact mode, so anchor only to controls
    // the overlay leaves visible; the overlay then hides the switch naturally,
    // like ELM's own controls. If every control is covered, keep the band so
    // an already docked switch can simply stay where it is.
    const exposed = topBarBand.controls.filter(
      (control) => !isAnchorCoveredByOverlay(control.getBoundingClientRect())
    );
    return exposed.length > 0 ? exposed : topBarBand.controls;
  }

  function getLeftmostTopBarControl() {
    return getVisibleTopBarControls()
      .slice()
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  }

  // Remember the last known top bar anchor (control + position). While a
  // full-page overlay (e.g. the model picker menu) is open, the scan may
  // re-anchor compact controls to overlay items; instead keep them in place so
  // the overlay hides them naturally, like ELM's own controls. The anchor is
  // only kept while its control stays in place; when the top bar moves (e.g. a
  // banner pushes it down mid-layout-transition) the anchor is refreshed so
  // compact controls re-position correctly instead of getting stuck.
  let lastCompactAnchorControl = null;
  let lastCompactAnchorRect = null;

  // Returns the anchor rect to position against, or null to keep the current
  // compact position untouched.
  function updateCompactAnchor(leftmost) {
    if (!leftmost) return null;
    const rect = leftmost.getBoundingClientRect();

    if (lastCompactAnchorControl && lastCompactAnchorRect && isVisible(lastCompactAnchorControl)) {
      const currentRect = lastCompactAnchorControl.getBoundingClientRect();
      const moved =
        Math.abs(currentRect.top - lastCompactAnchorRect.top) > 2 ||
        Math.abs(currentRect.left - lastCompactAnchorRect.left) > 2;
      if (!moved && isAnchorCoveredByOverlay(lastCompactAnchorRect)) return null;
    }

    lastCompactAnchorControl = leftmost;
    lastCompactAnchorRect = rect;
    return rect;
  }

  function isAnchorCoveredByOverlay(rect) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topElement = document.elementsFromPoint(x, y)[0];
    if (!topElement) return true;
    if (topElement.closest(`#${FIXER_TOGGLE_ID}, #${PROMPT_BUTTON_ID}`)) return false;

    let node = topElement;
    for (let depth = 0; node && depth < 10; depth++) {
      if (node === document.body || node === document.documentElement) break;
      const nodeRect = node.getBoundingClientRect();
      const zIndex = Number.parseInt(getComputedStyle(node).zIndex, 10) || 0;
      if (zIndex >= 100 && nodeRect.height > 150 && nodeRect.height > rect.height * 1.8) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
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

    const leftmost = getLeftmostTopBarControl();

    if (!leftmost) {
      button.style.left = `${Math.max(8, window.innerWidth - 132)}px`;
      button.style.top = '22px';
      button.style.right = '';
      button.style.bottom = '';
      return;
    }

    const anchorRect = updateCompactAnchor(leftmost);
    if (!anchorRect) return;
    const rect = anchorRect;
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
    if (uiTickCache?.sidebarLabels?.has(text)) return uiTickCache.sidebarLabels.get(text);
    const label = findSidebarLabelUncached(text);
    if (uiTickCache) {
      if (!uiTickCache.sidebarLabels) uiTickCache.sidebarLabels = new Map();
      uiTickCache.sidebarLabels.set(text, label);
    }
    return label;
  }

  function findSidebarLabelUncached(text) {
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

  function clearSidebarPromptStyle(button) {
    button.classList.remove('elm-mf-sidebar', 'elm-mf-hidden');
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

    const leftmost = getLeftmostTopBarControl();
    const size = 42;
    const gap = 14;

    if (leftmost) {
      const anchorRect = updateCompactAnchor(leftmost);
      if (!anchorRect) return;
      const rect = anchorRect;
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
    const leftmost = getLeftmostTopBarControl();
    const leftmostRect = leftmost?.getBoundingClientRect();
    if (leftmostRect && isInTopBarRegion(leftmostRect)) {
      if (isAnchorCoveredByOverlay(leftmostRect)) {
        // The whole anchor row is covered by an overlay. An already docked
        // switch stays put so the overlay hides it like ELM's own controls;
        // only a switch that is not docked yet falls back to compact mode.
        const isDocked = toggle.parentElement !== document.body &&
          !toggle.classList.contains('elm-mf-fallback');
        if (isDocked) return;
      } else {
        toggle.classList.remove('elm-mf-fallback', 'elm-mf-compact');
        toggle.style.left = '';
        toggle.style.top = '';
        toggle.style.right = '';
        toggle.style.bottom = '';
        const parent = leftmost.parentElement;
        if (toggle.parentElement !== parent || toggle.nextSibling !== leftmost) {
          parent.insertBefore(toggle, leftmost);
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
        // Repaired formulas take different space than raw text, so capture a
        // content anchor at click time and restore the viewport after the
        // transition completes. Only the explicit toggle does this —
        // background scans must never fight the user's scrolling.
        if (enabled) {
          requestAnimationFrame(() => {
            const saved = MATH_REPAIR.captureScrollAnchor?.();
            globalThis.ELMMathFixerRuntime?.scan();
            if (saved) requestAnimationFrame(() => MATH_REPAIR.restoreScrollAnchor?.(saved));
          });
        } else {
          restoreAllRescuedMath({ preserveScroll: true });
        }
      });
    }

    updateFixerToggle(toggle);
    syncElmAccentColor(promptButton, toggle);
    syncFixerToggleFont(toggle);
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

    if (button.classList.contains('elm-mf-sidebar')) {
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
      panel.hidden = false;
      positionPromptPanel(panel, button);
    });
  }

  function ensurePromptLauncher() {
    if (!document.body) return;
    uiTickCache = {};
    try {
      ensurePromptLauncherUncached();
    } finally {
      uiTickCache = null;
    }
  }

  function ensurePromptLauncherUncached() {
    const hasElmChatUi = document.querySelector(CONTAINER_SELECTOR) ||
      findSidebarLabel('Prompts') ||
      getChatInputRect();
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
