/**
 * First-write / path dedupe gates for Cursor ADR draft hooks.
 * State lives under `.sqlew/` (gitignored).
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * @param {string} conversationId
 */
function safeId(conversationId) {
  return String(conversationId || 'unknown')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 120);
}

/**
 * Once-per-conversation: first meaningful Write already drafted.
 * @param {string} cwd
 * @param {string} conversationId
 */
export function conversationDraftPath(cwd, conversationId) {
  return join(
    cwd || process.cwd(),
    '.sqlew',
    'cursor-drafted',
    `${safeId(conversationId)}.marker`,
  );
}

/**
 * Per-path marker within a conversation (dedupe afterFileEdit + postToolUse).
 * @param {string} cwd
 * @param {string} conversationId
 * @param {string} relPath
 */
export function pathDraftMarkerPath(cwd, conversationId, relPath) {
  const pathSafe = String(relPath || 'file')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 160);
  return join(
    cwd || process.cwd(),
    '.sqlew',
    'cursor-drafted-paths',
    safeId(conversationId),
    `${pathSafe}.marker`,
  );
}

/**
 * @param {string} cwd
 * @param {string} conversationId
 */
export function hasConversationDraft(cwd, conversationId) {
  if (!conversationId) return false;
  try {
    return existsSync(conversationDraftPath(cwd, conversationId));
  } catch {
    return false;
  }
}

/**
 * @param {string} cwd
 * @param {string} conversationId
 * @param {{ key?: string, file?: string, via?: string }} [meta]
 */
export function markConversationDraft(cwd, conversationId, meta = {}) {
  if (!conversationId) return;
  try {
    const path = conversationDraftPath(cwd, conversationId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ ...meta, at: new Date().toISOString() })}\n`,
      'utf8',
    );
  } catch {
    // fail-open
  }
}

/**
 * @param {string} cwd
 * @param {string} conversationId
 * @param {string} relPath
 */
export function hasPathDraft(cwd, conversationId, relPath) {
  if (!conversationId || !relPath) return false;
  try {
    return existsSync(pathDraftMarkerPath(cwd, conversationId, relPath));
  } catch {
    return false;
  }
}

/**
 * @param {string} cwd
 * @param {string} conversationId
 * @param {string} relPath
 */
export function markPathDraft(cwd, conversationId, relPath) {
  if (!conversationId || !relPath) return;
  try {
    const path = pathDraftMarkerPath(cwd, conversationId, relPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${new Date().toISOString()}\n`, 'utf8');
  } catch {
    // fail-open
  }
}

/**
 * Read conversation draft marker payload if present.
 * @param {string} cwd
 * @param {string} conversationId
 * @returns {Record<string, unknown> | null}
 */
export function readConversationDraft(cwd, conversationId) {
  if (!conversationId) return null;
  try {
    const path = conversationDraftPath(cwd, conversationId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
