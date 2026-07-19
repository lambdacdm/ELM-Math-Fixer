(function () {
  'use strict';

  const MULTILINE_MATH_ENVIRONMENTS = new Set([
    'align', 'aligned', 'alignedat', 'alignat', 'array', 'bmatrix', 'Bmatrix',
    'cases', 'dcases', 'flalign', 'gather', 'gathered', 'matrix', 'multline',
    'pmatrix', 'rcases', 'split', 'Vmatrix', 'vmatrix'
  ]);
  const KNOWN_LATEX_COMMAND_CACHE = new Map();
  const VALIDATION_CACHE_LIMIT = 500;
  const VALIDATION_CACHE = new Map();

  function validateLatex(source, options = {}) {
    const renderer = globalThis.katex;
    if (!renderer || typeof renderer.renderToString !== 'function') {
      return { ok: false, error: null };
    }
    try {
      renderer.renderToString(source, { throwOnError: true, strict: 'error', ...options });
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function getUndefinedCommand(error) {
    return String(error?.message || '').match(/Undefined control sequence:\s*(\\[A-Za-z]+)/)?.[1] || null;
  }

  function literalUnknownCommandMacro(command) {
    return `\\mathord{\\backslash\\mathrm{${command.slice(1)}}}`;
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
    if (KNOWN_LATEX_COMMAND_CACHE.has(command)) return KNOWN_LATEX_COMMAND_CACHE.get(command);
    const result = validateLatex(`\\${command}`, { strict: 'ignore' });
    const known = result.ok ||
      Boolean(result.error && !String(result.error.message).includes('Undefined control sequence'));
    KNOWN_LATEX_COMMAND_CACHE.set(command, known);
    return known;
  }

  function isInsideMultilineEnvironmentAt(source, position) {
    const pattern = /\\(begin|end)\{([^{}]+)\}/g;
    const stack = [];
    let match;
    while ((match = pattern.exec(source)) !== null && match.index < position) {
      const [, command, name] = match;
      if (command === 'begin') stack.push(name);
      else {
        const index = stack.lastIndexOf(name);
        if (index !== -1) stack.splice(index, 1);
      }
    }
    return stack.some(isMultilineMathEnvironment);
  }

  function normalizePairedEscapedSetBraces(source) {
    return source.replace(
      /(?<!\\)\\{2}\{([\s\S]*?)(?<!\\)\\{2}\}/g,
      (match, body, offset) =>
        isInsideMultilineEnvironmentAt(source, offset) ? match : `\\{${body}\\}`
    );
  }

  function normalizeLatexBackslashes(source) {
    const commands = source.replace(
      /(?<!\\)\\{2}(?=([A-Za-z]+))/g,
      (slashes, command) => (isKnownLatexCommand(command) ? '\\' : slashes)
    );
    return normalizePairedEscapedSetBraces(commands);
  }

  function unwrapEscapedLatexLayer(source) {
    const runs = [];
    let knownCommands = 0;
    for (let i = 0; i < source.length;) {
      if (source[i] !== '\\') { i++; continue; }
      const start = i;
      while (source[i] === '\\') i++;
      const length = i - start;
      runs.push({ start, length });
      if (length === 2) {
        const command = source.slice(i).match(/^([A-Za-z]+)/)?.[1];
        if (command && isKnownLatexCommand(command)) knownCommands++;
      }
    }
    if (runs.length < 3 || knownCommands < 3 || runs.some((run) => run.length % 2 !== 0)) {
      return source;
    }
    let candidate = '';
    let cursor = 0;
    runs.forEach(({ start, length }) => {
      candidate += source.slice(cursor, start) + '\\'.repeat(length / 2);
      cursor = start + length;
    });
    candidate += source.slice(cursor);
    return validateWithLiteralUnknownCommands(candidate).ok ? candidate : source;
  }

  function hasUnresolvedDoubledBackslash(source) {
    const pattern = /\\+(begin|end)\{([^{}]+)\}/g;
    const stack = [];
    let cursor = 0;
    let match;
    const unsafe = (segment) =>
      !stack.some(isMultilineMathEnvironment) && /\\{2,}(?=\S)/.test(segment);
    while ((match = pattern.exec(source)) !== null) {
      if (unsafe(source.slice(cursor, match.index))) return true;
      const [, command, name] = match;
      if (command === 'begin') stack.push(name);
      else {
        const index = stack.lastIndexOf(name);
        if (index !== -1) stack.splice(index, 1);
      }
      cursor = pattern.lastIndex;
    }
    return unsafe(source.slice(cursor));
  }

  function normalizeMathBackslashes(text) {
    const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\r\n]*?\$/g;
    return text.replace(pattern, (segment) => {
      if (segment.startsWith('$$')) {
        return `$$${normalizeLatexBackslashes(unwrapEscapedLatexLayer(segment.slice(2, -2)))}$$`;
      }
      if (segment.startsWith('\\[') || segment.startsWith('\\(')) {
        return `${segment.slice(0, 2)}${normalizeLatexBackslashes(unwrapEscapedLatexLayer(segment.slice(2, -2)))}${segment.slice(-2)}`;
      }
      return `$${normalizeLatexBackslashes(unwrapEscapedLatexLayer(segment.slice(1, -1)))}$`;
    });
  }

  function normalizeMathDelimiterWhitespace(text) {
    const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
    return text.replace(pattern, (segment) => {
      const length = segment.startsWith('$$') ? 2 : 1;
      if (segment.startsWith('\\[') || segment.startsWith('\\(')) {
        return `${segment.slice(0, 2)}${segment.slice(2, -2).trim()}${segment.slice(-2)}`;
      }
      return `${segment.slice(0, length)}${segment.slice(length, -length).trim()}${segment.slice(-length)}`;
    });
  }

  function protectMathBoundaryWhitespace(text) {
    const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
    const characters = text.split('');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const before = match.index - 1;
      const after = match.index + match[0].length;
      if (before >= 0 && /[ \t]/.test(characters[before])) characters[before] = '\u00a0';
      if (after < characters.length && /[ \t]/.test(characters[after])) characters[after] = '\u00a0';
    }
    return characters.join('');
  }

  function isEscapedAt(text, index) {
    let count = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) count++;
    return count % 2 === 1;
  }

  function getMathSegmentDetails(segment) {
    if (segment.startsWith('$$') || segment.startsWith('\\[')) {
      return { body: segment.slice(2, -2), displayMode: true };
    }
    if (segment.startsWith('\\(')) {
      return { body: segment.slice(2, -2), displayMode: false };
    }
    return { body: segment.slice(1, -1), displayMode: false };
  }

  function isSafeMixedTextMath(text, options = {}) {
    const { allowUndefinedCommands = false } = options;
    const cacheKey = text + '\u0000' + (allowUndefinedCommands ? '1' : '0');
    if (VALIDATION_CACHE.has(cacheKey)) {
      const cached = VALIDATION_CACHE.get(cacheKey);
      VALIDATION_CACHE.delete(cacheKey);
      VALIDATION_CACHE.set(cacheKey, cached);
      return cached;
    }

    const result = (() => {
      if (!globalThis.katex?.renderToString) return false;
      const pattern = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?!\$)[^$\r\n]+?\$/g;
      const ranges = [];
      let found = false;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const segment = match[0];
        const closing = match.index + segment.length - 1;
        const singleDollar = segment.startsWith('$') && !segment.startsWith('$$');
        if (segment.startsWith('$') && (isEscapedAt(text, match.index) || isEscapedAt(text, closing))) return false;
        const { body, displayMode } = getMathSegmentDetails(segment);
        if (!body.trim()) return false;
        const following = text[match.index + segment.length] || '';
        if (singleDollar && /^\d/.test(body.trim()) && /^\d/.test(following)) return false;
        const normalized = getMathSegmentDetails(normalizeMathBackslashes(segment)).body;
        if (hasUnresolvedDoubledBackslash(normalized)) return false;
        const validation = allowUndefinedCommands
          ? validateWithLiteralUnknownCommands(normalized, { displayMode })
          : validateLatex(normalized, { displayMode });
        if (!validation.ok) return false;
        ranges.push({ start: match.index, end: match.index + segment.length });
        found = true;
      }
      if (!found) return false;
      let rangeIndex = 0;
      for (let i = 0; i < text.length; i++) {
        while (ranges[rangeIndex]?.end <= i) rangeIndex++;
        const range = ranges[rangeIndex];
        if (range && i >= range.start && i < range.end) { i = range.end - 1; continue; }
        if (text[i] === '$' && !isEscapedAt(text, i)) return false;
        if (text[i] === '\\' && ['(', '['].includes(text[i + 1]) && !isEscapedAt(text, i)) return false;
      }
      return true;
    })();

    VALIDATION_CACHE.set(cacheKey, result);
    if (VALIDATION_CACHE.size > VALIDATION_CACHE_LIMIT) {
      const firstKey = VALIDATION_CACHE.keys().next().value;
      VALIDATION_CACHE.delete(firstKey);
    }
    return result;
  }

  globalThis.ELMMathFixerCore = {
    validateWithLiteralUnknownCommands,
    normalizePairedEscapedSetBraces,
    normalizeMathBackslashes,
    normalizeMathDelimiterWhitespace,
    protectMathBoundaryWhitespace,
    isEscapedAt,
    getMathSegmentDetails,
    isSafeMixedTextMath
  };
})();
