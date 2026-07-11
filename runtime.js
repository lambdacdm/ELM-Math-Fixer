(function () {
  'use strict';

  const CONTAINER_SELECTOR = '.markdown, .markdown-container, .response-ai, .message-content';
  const DEBUG = false;
  const SCAN_DELAY_MS = 180;
  const MATH_REPAIR = globalThis.ELMMathFixerRepair;
  const UI = globalThis.ELMMathFixerUI;

  if (!MATH_REPAIR) throw new Error('ELM Math Fixer repair engine failed to load.');
  if (!UI) throw new Error('ELM Math Fixer UI module failed to load.');

  const { processContainer, restoreAllRescuedMath } = MATH_REPAIR;
  const log = (...args) => {
    if (DEBUG) console.log('[ELM Math Fixer]', ...args);
  };
  const warn = (...args) => {
    if (DEBUG) console.warn('[ELM Math Fixer]', ...args);
  };

  function getRootElement(root) {
    if (!root || root === document) return root;
    return root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
  }

  function collectScanJobs(roots) {
    const containers = new Set();
    const fullScan = roots.includes(document);

    roots.forEach((root) => {
      if (!root) return;
      if (root === document) {
        document.querySelectorAll(CONTAINER_SELECTOR).forEach((container) => containers.add(container));
        return;
      }

      const element = getRootElement(root);
      if (!element?.isConnected) return;
      const closest = element.closest?.(CONTAINER_SELECTOR);
      if (closest) containers.add(closest);
      if (element.matches?.(CONTAINER_SELECTOR)) containers.add(element);
      element.querySelectorAll?.(CONTAINER_SELECTOR).forEach((container) => containers.add(container));
    });

    const allContainers = Array.from(containers);
    const containerList = allContainers.filter(
      (container) =>
        !allContainers.some(
          (other) => other !== container && container.contains(other)
        )
    );

    return containerList.map((container) => ({
      container,
      roots: fullScan
        ? null
        : roots.filter((root) => {
          const element = getRootElement(root);
          return Boolean(
            element &&
            (element === container || container.contains(element) || element.contains?.(container))
          );
        })
    }));
  }

  function scan(roots = [document], refreshUi = true) {
    if (refreshUi) UI.ensurePromptLauncher();
    if (!UI.isFixerEnabled()) {
      restoreAllRescuedMath();
      return;
    }

    if (typeof renderMathInElement !== 'function') {
      warn('KaTeX auto-render is not available. Check manifest paths.');
      return;
    }

    const jobs = collectScanJobs(roots);
    log('matched scan jobs:', jobs.length);
    jobs.forEach(({ container, roots: affectedRoots }) => {
      processContainer(container, affectedRoots);
    });
  }

  let debounceTimer = null;
  const pendingScanRoots = new Set();
  let pendingUiRefresh = false;

  function isInsideMathContent(node) {
    const element = getRootElement(node);
    return Boolean(element?.closest?.(CONTAINER_SELECTOR));
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData') {
        pendingScanRoots.add(mutation.target);
      } else if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => pendingScanRoots.add(node));
      } else {
        pendingScanRoots.add(mutation.target);
      }

      if (!isInsideMathContent(mutation.target)) pendingUiRefresh = true;
      mutation.addedNodes.forEach((node) => {
        if (!isInsideMathContent(node)) pendingUiRefresh = true;
      });
    });

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const roots = Array.from(pendingScanRoots);
      pendingScanRoots.clear();
      const refreshUi =
        pendingUiRefresh ||
        !document.getElementById(UI.promptButtonId) ||
        !document.getElementById(UI.fixerToggleId);
      pendingUiRefresh = false;
      observer.disconnect();
      try {
        scan(roots, refreshUi);
      } finally {
        observer.observe(document.body, { childList: true, characterData: true, subtree: true });
      }
    }, SCAN_DELAY_MS);
  });

  globalThis.ELMMathFixerRuntime = { scan };
  log('runtime module loaded');
  scan();
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
})();
