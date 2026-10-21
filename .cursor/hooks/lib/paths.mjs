/**
 * Path helpers for Cursor Write / afterFileEdit draft gates.
 * Aligns with sqlew save noise filters + Cloud-friendly extras.
 */

import { relative, isAbsolute, normalize } from 'node:path';

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
 * Extract file path from afterFileEdit or postToolUse Write payloads.
 * @param {Record<string, unknown>} input
 * @returns {string}
 */
export function extractFilePath(input) {
  if (!input || typeof input !== 'object') return '';

  const top = asString(input.file_path || input.filePath).trim();
  if (top) return top;

  const toolInput =
    input.tool_input && typeof input.tool_input === 'object'
      ? /** @type {Record<string, unknown>} */ (input.tool_input)
      : {};

  return asString(
    toolInput.path ||
      toolInput.file_path ||
      toolInput.filePath ||
      toolInput.target_file ||
      toolInput.targetFile,
  ).trim();
}

/**
 * @param {string} filePath
 * @param {string} cwd
 * @returns {string}
 */
export function toRelativePath(filePath, cwd) {
  if (!filePath) return '';
  const base = cwd || process.cwd();
  try {
    if (isAbsolute(filePath)) {
      const rel = relative(base, filePath);
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.replace(/\\/g, '/');
    }
  } catch {
    // fall through
  }
  return normalize(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Skip noise / non-implementation paths (fail-open → treat as skip).
 * @param {string} filePath
 * @returns {boolean}
 */
export function isNoisePath(filePath) {
  if (!filePath) return true;
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  // Markdown / plans / docs
  if (normalized.endsWith('.md')) return true;
  if (/(^|\/)docs\//.test(normalized)) return true;
  if (normalized.includes('.claude/plans/')) return true;
  if (normalized.includes('.hermes/plans/')) return true;
  if (normalized.includes('.sqlew/plans/')) return true;
  if (/(^|\/)\.sqlew\//.test(normalized)) return true;
  if (/(^|\/)\.cursor\/hooks\//.test(normalized)) return true;

  // Lockfiles / generated / VCS
  if (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|cargo\.lock|composer\.lock|poetry\.lock|go\.sum)$/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (normalized.includes('/node_modules/')) return true;
  if (normalized.includes('/.git/')) return true;
  if (normalized.includes('/dist/') || normalized.includes('/build/') || normalized.includes('/coverage/')) {
    return true;
  }

  // Root-ish JSON config (same heuristic as sqlew save) — not under src/
  if (normalized.endsWith('.json') && !normalized.includes('/src/')) return true;

  // Pure format-noise extensions that rarely encode decisions
  if (/\.(map|min\.js|min\.css|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Build a stable draft key from a relative path.
 * @param {string} relPath
 * @returns {string}
 */
export function draftKeyFromPath(relPath) {
  const clean = String(relPath || 'change')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/[^a-zA-Z0-9/_.-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
    .slice(0, 100);
  return `cursor/auto/${clean || 'change'}`;
}
