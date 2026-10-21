/**
 * Cursor hook I/O helpers (Cloud Agents: command hooks only).
 * Fail-open: never throw to the agent loop.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} obj
 */
export function writeStdoutJson(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

/**
 * Empty / allow response for postToolUse (no injection).
 */
export function emptyPostToolUse() {
  writeStdoutJson({});
}

/**
 * @param {string} additionalContext
 */
export function postToolUseContext(additionalContext) {
  if (!additionalContext || !String(additionalContext).trim()) {
    emptyPostToolUse();
    return;
  }
  writeStdoutJson({ additional_context: String(additionalContext) });
}

/**
 * beforeSubmitPrompt: always continue; optionally attach context.
 * @param {string} [additionalContext]
 */
export function beforeSubmitContinue(additionalContext) {
  const out = { continue: true };
  if (additionalContext && String(additionalContext).trim()) {
    out.additional_context = String(additionalContext);
  }
  writeStdoutJson(out);
}

/**
 * Pending inject file for optional beforeSubmitPrompt fallback.
 * @param {string} cwd
 */
export function pendingInjectPath(cwd) {
  return join(cwd || process.cwd(), '.sqlew', 'cursor-pending-inject.json');
}

/**
 * @param {string} cwd
 * @param {{ conversation_id?: string, additional_context: string, written_at: string }} payload
 */
export function writePendingInject(cwd, payload) {
  try {
    const path = pendingInjectPath(cwd);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // fail-open
  }
}

/**
 * @param {string} cwd
 * @returns {{ conversation_id?: string, additional_context: string, written_at: string } | null}
 */
export function readPendingInject(cwd) {
  try {
    const path = pendingInjectPath(cwd);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} cwd
 */
export function clearPendingInject(cwd) {
  try {
    const path = pendingInjectPath(cwd);
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // fail-open
  }
}

/**
 * Once-per-conversation marker (BSP spam gate).
 * @param {string} cwd
 * @param {string} conversationId
 */
export function conversationInjectedPath(cwd, conversationId) {
  const safe = String(conversationId || 'unknown').replace(/[^\w.-]+/g, '_').slice(0, 120);
  return join(cwd || process.cwd(), '.sqlew', 'cursor-bsp-injected', `${safe}.marker`);
}

/**
 * @param {string} cwd
 * @param {string} conversationId
 */
export function hasInjectedConversation(cwd, conversationId) {
  if (!conversationId) return false;
  try {
    return existsSync(conversationInjectedPath(cwd, conversationId));
  } catch {
    return false;
  }
}

/**
 * @param {string} cwd
 * @param {string} conversationId
 */
export function markInjectedConversation(cwd, conversationId) {
  if (!conversationId) return;
  try {
    const path = conversationInjectedPath(cwd, conversationId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${new Date().toISOString()}\n`, 'utf8');
  } catch {
    // fail-open
  }
}
