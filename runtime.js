(function () {
  'use strict';

  const CONTAINER_SELECTOR = 'markdown, .markdown, .markdown-container, .response-ai, .message-content';
  const DEBUG = false;
  const SCAN_DELAY_MS = 180;
  const SETTLE_SCAN_DELAY_MS = 700;
  // Silent streaming gate (no UI change): content mutations within this window
  // mean the page is still growing; scroll-correcting restores wait for quiet.
  const QUIET_MS = 1500;
  const QUIET_POLL_MS = 200;
  const QUIET_MAX_WAIT_MS = 8000;
  const SELF_MUTATION_SELECTOR = '.elm-math-rescued-block, .elm-math-rescued-wrapper, .elm-math-rescued-code, .elm-math-rescued-text, .elm-math-hidden-original, .elm-math-split-original, .elm-math-rescued-container, .elm-math-code-unescaped, .elm-math-local-chain, .elm-math-native-brace-repair, .elm-math-boundary-space, .elm-math-local-original';
  const OBSERVER_OPTIONS = {
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style', 'aria-hidden'],
    subtree: true
  };
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
    return runUnobserved(() => {
      if (refreshUi) UI.ensurePromptLauncher();
      if (!UI.isFixerEnabled()) {
        // During active streaming, per-tick restores would thrash on every token;
        // skip here and let the toggle's quiet-gated restore do a single
        // scroll-correcting pass once the page settles.
        if (!isMathQuiet()) return;
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
    });
  }

  let debounceTimer = null;
  let settleTimer = null;
  const pendingScanRoots = new Set();
  let pendingUiRefresh = false;
  let pendingSettleScan = false;
  let pendingFullScan = false;
  let lastObservedUrl = location.href;
  // Sustained-growth signal (not single bursts): timestamps of math-content
  // text/child mutations in the recent window. A lone history restore or test
  // setup append must stay "quiet" (immediate toggle); only continuous token
  // growth counts as active streaming.
  const MATH_ACTIVITY_WINDOW_MS = 2000;
  const MATH_ACTIVITY_THRESHOLD = 4;
  let mathMutationTimes = [];

  function pruneMathMutationTimes(now) {
    while (mathMutationTimes.length > 0 && now - mathMutationTimes[0] > MATH_ACTIVITY_WINDOW_MS) {
      mathMutationTimes.shift();
    }
  }

  function noteMathContentMutation() {
    const now = Date.now();
    mathMutationTimes.push(now);
    pruneMathMutationTimes(now);
  }

  function isSelfMutationNode(node) {
    const element = getRootElement(node);
    return Boolean(element?.closest?.(SELF_MUTATION_SELECTOR));
  }

  function isMathQuiet(now = Date.now()) {
    pruneMathMutationTimes(now);
    // Single bursts stay quiet: require both recency AND sustained frequency.
    if (mathMutationTimes.length < MATH_ACTIVITY_THRESHOLD) return true;
    return now - mathMutationTimes[mathMutationTimes.length - 1] >= QUIET_MS;
  }

  // Runs callback once math content has been quiet for QUIET_MS (or after a
  // bounded wait so long streams cannot park work forever). Executes
  // synchronously when already quiet, preserving existing toggle timing.
  function runWhenMathQuiet(callback) {
    if (isMathQuiet()) {
      callback();
      return;
    }
    const start = Date.now();
    const poll = () => {
      if (isMathQuiet() || Date.now() - start >= QUIET_MAX_WAIT_MS) {
        callback();
        return;
      }
      setTimeout(poll, QUIET_POLL_MS);
    };
    setTimeout(poll, QUIET_POLL_MS);
  }

  // Settle-quiet: no pending debounce/settle scan work. Used by the toggle's
  // second-pass scroll verification so re-correction lands after our own
  // follow-up scans (180ms debounce + 700ms settle) instead of between them.
  const SETTLED_POLL_MS = 100;
  const SETTLED_MAX_WAIT_MS = 3000;

  function isScanSettled() {
    return debounceTimer === null && settleTimer === null &&
      pendingScanRoots.size === 0 && !pendingSettleScan && !pendingFullScan;
  }

  function runWhenScanSettled(callback) {
    if (isScanSettled()) {
      callback();
      return;
    }
    const start = Date.now();
    const poll = () => {
      if (isScanSettled() || Date.now() - start >= SETTLED_MAX_WAIT_MS) {
        callback();
        return;
      }
      setTimeout(poll, SETTLED_POLL_MS);
    };
    setTimeout(poll, SETTLED_POLL_MS);
  }

  function isInsideMathContent(node) {
    const element = getRootElement(node);
    return Boolean(element?.closest?.(CONTAINER_SELECTOR));
  }

  function affectsMathVisibility(node) {
    const element = getRootElement(node);
    return Boolean(
      element?.matches?.(CONTAINER_SELECTOR) ||
      element?.closest?.(CONTAINER_SELECTOR)
    );
  }

  function affectsMathContainerBoundary(node) {
    const element = getRootElement(node);
    return Boolean(
      element?.matches?.(CONTAINER_SELECTOR) ||
      element?.querySelector?.(CONTAINER_SELECTOR)
    );
  }

  function observePage() {
    observer.observe(document.body, OBSERVER_OPTIONS);
  }

  // Runs fn with the page observer disconnected so our own synchronous DOM
  // work — repairs AND restores (restores move original plain nodes, which no
  // node filter can distinguish from genuine edits) — is never observed: it
  // must neither schedule redundant re-scans nor feed the streaming quiet
  // gate. Genuine records queued before the call are still processed first.
  // Safe to nest (the debounce caller also disconnects around scan()).
  function runUnobserved(fn) {
    observer.takeRecords().forEach(handleMutation);
    observer.disconnect();
    try {
      return fn();
    } finally {
      observePage();
    }
  }

  function handleMutation(mutation) {
    pendingScanRoots.add(mutation.target);
    if (mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => pendingScanRoots.add(node));
    }
    // Streaming growth signal: text/child growth inside math content, excluding
    // our own repair DOM so scans do not self-trigger the quiet gate.
    // Attribute mutations (top-bar re-renders, hidden toggles) are excluded.
    // Both added AND removed nodes are checked: toggle-off dismantles our own
    // rescued spans (removals with empty addedNodes), which must not count as
    // page growth either, or one toggle would defer the next toggle's work.
    if (mutation.type === 'childList' || mutation.type === 'characterData') {
      if (isInsideMathContent(mutation.target) && !isSelfMutationNode(mutation.target)) {
        const isSelfDomNode = (node) => node.nodeType === Node.ELEMENT_NODE &&
          (node.matches?.(SELF_MUTATION_SELECTOR) || isSelfMutationNode(node));
        let selfChanged = false;
        mutation.addedNodes.forEach((node) => { if (isSelfDomNode(node)) selfChanged = true; });
        mutation.removedNodes.forEach((node) => { if (isSelfDomNode(node)) selfChanged = true; });
        if (!selfChanged) noteMathContentMutation();
      }
    }
    if (mutation.type === 'attributes' && affectsMathVisibility(mutation.target)) {
      pendingSettleScan = true;
      if (
        mutation.attributeName === 'hidden' ||
        mutation.attributeName === 'aria-hidden' ||
        affectsMathContainerBoundary(mutation.target)
      ) {
        pendingFullScan = true;
      }
    }

    if (!isInsideMathContent(mutation.target)) pendingUiRefresh = true;
    mutation.addedNodes.forEach((node) => {
      if (!isInsideMathContent(node)) pendingUiRefresh = true;
    });
  }

  const observer = new MutationObserver((mutations) => {
    clearTimeout(settleTimer);
    settleTimer = null;
    if (location.href !== lastObservedUrl) {
      lastObservedUrl = location.href;
      pendingFullScan = true;
      pendingSettleScan = true;
    }

    mutations.forEach(handleMutation);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      observer.takeRecords().forEach(handleMutation);
      const roots = pendingFullScan ? [document] : Array.from(pendingScanRoots);
      const shouldSettle = pendingSettleScan || !pendingFullScan;
      const settleRoots = roots.includes(document)
        ? roots
        : collectScanJobs(roots).map((job) => job.container);
      pendingScanRoots.clear();
      const refreshUi =
        pendingUiRefresh ||
        !document.getElementById(UI.promptButtonId) ||
        !document.getElementById(UI.fixerToggleId);
      pendingUiRefresh = false;
      pendingFullScan = false;
      pendingSettleScan = false;
      observer.disconnect();
      try {
        scan(roots, refreshUi);
      } finally {
        observePage();
      }

      if (shouldSettle) {
        settleTimer = setTimeout(() => {
          settleTimer = null;
          observer.takeRecords().forEach(handleMutation);
          observer.disconnect();
          try {
            scan(settleRoots, false);
          } finally {
            observePage();
          }
        }, SETTLE_SCAN_DELAY_MS);
      }
    }, SCAN_DELAY_MS);
  });

  globalThis.ELMMathFixerRuntime = { scan, isMathQuiet, runWhenMathQuiet, isScanSettled, runWhenScanSettled, runUnobserved };
  log('runtime module loaded');
  scan();
  observePage();

  // The Fixer UI is normally created by the first mutation-driven scan, but a
  // quiet SPA bootstrap (network wait, framework init) can delay that by
  // seconds. Poll briefly until both toolbar controls exist so the switch
  // appears as soon as ELM renders its composer/container. Each poll is the
  // same idempotent scan(); it stops early once the controls exist.
  let startupPollCount = 0;
  const startupPollTimer = setInterval(() => {
    const ready =
      document.getElementById(UI.promptButtonId) &&
      document.getElementById(UI.fixerToggleId);
    if (ready || startupPollCount >= 40) {
      clearInterval(startupPollTimer);
      return;
    }
    startupPollCount++;
    scan();
  }, 300);
})();
