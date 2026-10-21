/**
 * Extract compact search keywords from Cursor research tool_input.
 * Tools: Grep, WebSearch, WebFetch (and casing variants).
 */

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'by',
  'is', 'are', 'was', 'were', 'be', 'with', 'from', 'as', 'into', 'via',
  'this', 'that', 'these', 'those', 'it', 'its', 'http', 'https', 'www',
  'com', 'org', 'io', 'net', 'html', 'true', 'false', 'null', 'undefined',
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function asString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/_.-]+/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[_./-]+|[_./-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * Pull textual fields commonly present on Grep / WebSearch / WebFetch inputs.
 * @param {Record<string, unknown> | undefined} toolInput
 * @returns {string[]}
 */
export function extractKeywordCandidates(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];

  const fields = [
    'pattern',
    'search_term',
    'searchTerm',
    'query',
    'url',
    'path',
    'glob',
    'file_path',
    'filePath',
    'explanation',
    'prompt',
    'description',
  ];

  /** @type {string[]} */
  const parts = [];
  for (const key of fields) {
    const v = asString(toolInput[key]).trim();
    if (v) parts.push(v);
  }

  // Nested / alternate shapes
  if (Array.isArray(toolInput.paths)) {
    for (const p of toolInput.paths) {
      const s = asString(p).trim();
      if (s) parts.push(s);
    }
  }

  return parts;
}

/**
 * @param {Record<string, unknown> | undefined} toolInput
 * @param {{ maxTokens?: number }} [opts]
 * @returns {{ key: string, tokens: string[], raw: string }}
 */
export function extractKeywords(toolInput, opts = {}) {
  const maxTokens = opts.maxTokens ?? 8;
  const rawParts = extractKeywordCandidates(toolInput);
  const raw = rawParts.join(' ').trim();

  /** @type {string[]} */
  const tokens = [];
  const seen = new Set();
  for (const part of rawParts) {
    for (const t of tokenize(part)) {
      if (seen.has(t)) continue;
      seen.add(t);
      tokens.push(t);
      if (tokens.length >= maxTokens) break;
    }
    if (tokens.length >= maxTokens) break;
  }

  // Prefer a path-ish or pattern-ish key when available
  const pattern = asString(toolInput?.pattern).trim();
  const searchTerm = asString(toolInput?.search_term || toolInput?.searchTerm).trim();
  const path = asString(toolInput?.path || toolInput?.file_path).trim();
  const keySource = pattern || searchTerm || path || tokens.slice(0, 4).join('-') || raw;
  const key = keySource
    .replace(/\s+/g, '-')
    .replace(/[^\w./:-]+/g, '')
    .slice(0, 80) || 'research';

  return { key, tokens, raw: raw.slice(0, 240) };
}
