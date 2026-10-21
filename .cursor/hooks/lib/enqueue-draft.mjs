/**
 * Plan-less ADR draft → `.sqlew/queue/pending.json` (NO DB / NO MCP).
 * Same shape as sqlew `enqueueDecisionCreate` (hook-queue.ts).
 *
 * Upsert to DB happens later via QueueWatcher or `sqlew flush-queue` / `on-stop`.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { draftKeyFromPath } from './paths.mjs';

const QUEUE_DIR = '.sqlew/queue';
const QUEUE_FILE = 'pending.json';

/**
 * @param {string} projectPath
 * @returns {string}
 */
export function getQueuePath(projectPath) {
  return join(projectPath, QUEUE_DIR, QUEUE_FILE);
}

/**
 * @param {string} projectPath
 * @returns {{ items: object[] }}
 */
function readQueue(projectPath) {
  const queuePath = getQueuePath(projectPath);
  if (!existsSync(queuePath)) return { items: [] };
  try {
    const parsed = JSON.parse(readFileSync(queuePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

/**
 * Atomic write of pending.json.
 * @param {string} projectPath
 * @param {{ items: object[] }} queue
 */
function writeQueue(projectPath, queue) {
  const dir = join(projectPath, QUEUE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const queuePath = getQueuePath(projectPath);
  const tempPath = `${queuePath}.tmp`;
  const content = JSON.stringify(queue, null, 2);
  writeFileSync(tempPath, content, 'utf8');
  try {
    renameSync(tempPath, queuePath);
  } catch {
    writeFileSync(queuePath, content, 'utf8');
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore
    }
  }
}

/**
 * Build draft value from path + optional edits snippet.
 * @param {string} relPath
 * @param {Record<string, unknown>} [input]
 */
export function buildDraftValue(relPath, input = {}) {
  const parts = [
    `Auto-draft from Write/edit: \`${relPath}\`.`,
    'Captured at first implementation write (plan-less). Queued for upsert; refine via MCP decision set.',
  ];

  const edits = Array.isArray(input.edits) ? input.edits : null;
  if (edits && edits.length > 0) {
    const first = edits[0];
    if (first && typeof first === 'object') {
      const neu = /** @type {Record<string, unknown>} */ (first).new_string;
      if (typeof neu === 'string' && neu.trim()) {
        parts.push(`Snippet:\n\`\`\`\n${neu.trim().slice(0, 280)}\n\`\`\``);
      }
    }
  }

  return parts.join(' ').slice(0, 1200);
}

/**
 * Enqueue a draft decision create (file-only; skip if same key already pending).
 *
 * @param {string} projectPath
 * @param {{
 *   key: string,
 *   value: string,
 *   status?: string,
 *   layer?: string,
 *   tags?: string[],
 * }} data
 * @returns {{ ok: boolean, acted: boolean, key: string, detail: string }}
 */
export function enqueueDecisionCreate(projectPath, data) {
  const key = String(data.key || '').trim();
  if (!projectPath || !key) {
    return { ok: false, acted: false, key, detail: 'missing-key-or-path' };
  }

  try {
    const queue = readQueue(projectPath);
    const existing = queue.items.find(
      (i) =>
        i &&
        i.type === 'decision' &&
        i.data &&
        typeof i.data === 'object' &&
        /** @type {{ key?: string }} */ (i.data).key === key,
    );
    if (existing) {
      return { ok: true, acted: false, key, detail: 'duplicate-skipped' };
    }

    queue.items.push({
      type: 'decision',
      action: 'create',
      timestamp: new Date().toISOString(),
      data: {
        key,
        value: String(data.value || ''),
        status: data.status || 'draft',
        layer: data.layer || 'cross-cutting',
        tags: Array.isArray(data.tags) ? data.tags : [],
      },
    });
    writeQueue(projectPath, queue);
    return { ok: true, acted: true, key, detail: 'enqueued' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, acted: false, key, detail: message.slice(0, 120) };
  }
}

/**
 * Plan-less draft from a relative file path (Cursor / omp Write).
 * Keys: `cursor/auto/<rel>` or `omp/auto/<rel>`.
 *
 * @param {string} projectPath
 * @param {string} relPath
 * @param {{
 *   input?: Record<string, unknown>,
 *   tags?: string[],
 *   harness?: string,
 * }} [opts]
 * @returns {{ ok: boolean, acted: boolean, key: string, detail: string }}
 */
export function enqueuePlanlessDraft(projectPath, relPath, opts = {}) {
  const harness = opts.harness || 'cursor';
  const key =
    harness === 'cursor'
      ? draftKeyFromPath(relPath)
      : draftKeyFromPath(relPath).replace(/^cursor\//, `${harness}/`);

  const conversationId = String(
    opts.input?.conversation_id || opts.input?.session_id || '',
  ).slice(0, 40);

  const tags =
    opts.tags ||
    [harness, 'auto-draft', conversationId || 'session'].filter(Boolean);

  return enqueueDecisionCreate(projectPath, {
    key,
    value: buildDraftValue(relPath, opts.input || {}),
    status: 'draft',
    layer: 'cross-cutting',
    tags,
  });
}
