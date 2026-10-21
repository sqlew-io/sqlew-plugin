/**
 * Compact Related Context formatter (decisions + constraints).
 * Keeps payloads small: score threshold, max items, dedupe.
 */

/**
 * @typedef {{ kind: 'decision' | 'constraint', id: string, title: string, body: string, score: number }} RelatedItem
 */

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize heterogeneous suggest JSON into RelatedItem[].
 * Accepts MCP suggest tool shapes and best-effort Claude hook stdout.
 * @param {unknown} payload
 * @returns {RelatedItem[]}
 */
export function normalizeSuggestPayload(payload) {
  /** @type {RelatedItem[]} */
  const items = [];
  if (payload == null) return items;

  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      return items;
    }
  }

  if (typeof data !== 'object' || data === null) return items;
  const root = /** @type {Record<string, unknown>} */ (data);

  // Claude-style hook output — only useful if already formatted text
  const ac = root.additionalContext || root.additional_context;
  if (typeof ac === 'string' && /Related Context/i.test(ac)) {
    return items; // caller may pass text through separately
  }

  const lists = [];
  if (Array.isArray(root.suggestions)) lists.push({ list: root.suggestions, kindHint: null });
  if (Array.isArray(root.decisions)) lists.push({ list: root.decisions, kindHint: 'decision' });
  if (Array.isArray(root.constraints)) lists.push({ list: root.constraints, kindHint: 'constraint' });
  if (root.result && typeof root.result === 'object') {
    const r = /** @type {Record<string, unknown>} */ (root.result);
    if (Array.isArray(r.suggestions)) lists.push({ list: r.suggestions, kindHint: null });
  }

  for (const { list, kindHint } of lists) {
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const s = /** @type {Record<string, unknown>} */ (row);
      const score = num(s.score, 0);
      const key = typeof s.key === 'string' ? s.key : '';
      const value = s.value != null ? String(s.value) : '';
      const rule =
        s.constraint_text != null
          ? String(s.constraint_text)
          : s.rule != null
            ? String(s.rule)
            : '';
      const category = typeof s.category === 'string' ? s.category : '';
      const id =
        key ||
        (s.id != null ? String(s.id) : '') ||
        (s.constraint_id != null ? String(s.constraint_id) : '') ||
        '';

      if (key || value) {
        items.push({
          kind: kindHint === 'constraint' ? 'constraint' : 'decision',
          id: id || key || value.slice(0, 40),
          title: key || id || 'decision',
          body: value.slice(0, 160),
          score,
        });
        continue;
      }

      if (rule || category) {
        items.push({
          kind: 'constraint',
          id: id || category || rule.slice(0, 40),
          title: category || 'constraint',
          body: rule.slice(0, 160),
          score,
        });
      }
    }
  }

  return items;
}

/**
 * @param {RelatedItem[]} items
 * @param {{ minScore?: number, maxItems?: number }} [opts]
 * @returns {RelatedItem[]}
 */
export function filterDedupeLimit(items, opts = {}) {
  const minScore = opts.minScore ?? Number(process.env.SQLEW_HOOK_MIN_SCORE || 35);
  const maxItems = opts.maxItems ?? Number(process.env.SQLEW_HOOK_MAX_ITEMS || 5);

  const filtered = items
    .filter((i) => i.score >= minScore || i.score === 0)
    // score===0 kept only when suggest omitted scores; drop after prefer scored
    .sort((a, b) => b.score - a.score);

  const scored = filtered.filter((i) => i.score > 0);
  const pool = scored.length > 0 ? scored : filtered.filter((i) => i.score === 0);

  /** @type {RelatedItem[]} */
  const out = [];
  const seen = new Set();
  for (const item of pool) {
    const dedupeKey = `${item.kind}:${item.id.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * @param {RelatedItem[]} items
 * @param {{ keywords?: string }} [meta]
 * @returns {string}
 */
export function formatRelatedContext(items, meta = {}) {
  if (!items.length) return '';

  const lines = ['## Related Context (from sqlew)', ''];
  if (meta.keywords) {
    lines.push(`_keywords: ${meta.keywords}_`, '');
  }

  const decisions = items.filter((i) => i.kind === 'decision');
  const constraints = items.filter((i) => i.kind === 'constraint');

  if (decisions.length) {
    lines.push('### Decisions');
    for (const d of decisions) {
      const scoreBit = d.score > 0 ? ` (score ${Math.round(d.score)})` : '';
      lines.push(`- **${d.title}**: ${d.body}${scoreBit}`);
    }
    lines.push('');
  }

  if (constraints.length) {
    lines.push('### Constraints');
    for (const c of constraints) {
      const scoreBit = c.score > 0 ? ` (score ${Math.round(c.score)})` : '';
      lines.push(`- **${c.title}**: ${c.body}${scoreBit}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
