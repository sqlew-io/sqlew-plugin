/**
 * Approach 1: register ADR draft after Write / afterFileEdit.
 *
 * Write = enqueue only (NO DB / NO MCP decision set):
 *   1) `sqlew save` — plan-mode promote (already queue-only); fail-open
 *   2) Local `enqueuePlanlessDraft` → `.sqlew/queue/pending.json`
 *
 * Upsert happens on Stop / QueueWatcher via flush-queue / on-stop.
 */

import { runProcess } from './process.mjs';
import { enqueuePlanlessDraft } from './enqueue-draft.mjs';

const SAVE_TIMEOUT_MS = Number(process.env.SQLEW_HOOK_SAVE_TIMEOUT_MS || 12000);

/**
 * @param {Record<string, unknown>} cursorInput
 * @param {string} filePath absolute or as provided
 * @param {string} relPath
 */
function buildSaveStdin(cursorInput, filePath, relPath) {
  return JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: {
      file_path: filePath || relPath,
      path: filePath || relPath,
    },
    cwd: cursorInput.cwd || process.cwd(),
    session_id: cursorInput.session_id || cursorInput.conversation_id,
    conversation_id: cursorInput.conversation_id || cursorInput.session_id,
    cursor_hook_event: cursorInput.hook_event_name || cursorInput.cursor_hook_event,
    cursor_tool_name: cursorInput.tool_name,
  });
}

/**
 * @param {Record<string, unknown>} cursorInput
 * @param {string} filePath
 * @param {string} relPath
 * @returns {Promise<{ ok: boolean, acted: boolean, detail?: string }>}
 */
export async function runSqlewSaveCli(cursorInput, filePath, relPath) {
  if (process.env.SQLEW_HOOK_SAVE === '0') {
    return { ok: true, acted: false, detail: 'disabled' };
  }

  const cwd = typeof cursorInput.cwd === 'string' ? cursorInput.cwd : process.cwd();
  const stdin = buildSaveStdin(cursorInput, filePath, relPath);
  const result = await runProcess('sqlew', ['save'], {
    stdin,
    cwd,
    timeoutMs: SAVE_TIMEOUT_MS,
  });

  // Missing binary / timeout → fail-open
  if (result.code === null && !result.stdout && !result.stderr) {
    return { ok: false, acted: false, detail: 'sqlew-unavailable' };
  }

  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  // Plan promote OR future plan-less enqueue from core save
  const acted =
    /Implementation started|Queued: decisions|in_progress|enqueued|draft/i.test(text);
  return { ok: true, acted, detail: acted ? 'promoted-or-enqueued' : 'noop' };
}

/**
 * Plan-less draft via local queue file (status: draft). No MCP / No DB.
 * @param {Record<string, unknown>} cursorInput
 * @param {string} relPath
 * @returns {{ ok: boolean, acted: boolean, key?: string, detail?: string }}
 */
export function runEnqueuePlanlessDraft(cursorInput, relPath) {
  // Prefer new flag; honor legacy SQLEW_HOOK_DRAFT_MCP=0 as disable
  if (
    process.env.SQLEW_HOOK_DRAFT_ENQUEUE === '0' ||
    process.env.SQLEW_HOOK_DRAFT_MCP === '0'
  ) {
    return { ok: true, acted: false, detail: 'disabled' };
  }

  const cwd = typeof cursorInput.cwd === 'string' ? cursorInput.cwd : process.cwd();
  return enqueuePlanlessDraft(cwd, relPath, {
    input: cursorInput,
    harness: 'cursor',
  });
}

/**
 * @deprecated Use runEnqueuePlanlessDraft — MCP decision set removed from Write path.
 */
export function runSqlewDraftMcp(cursorInput, relPath) {
  return runEnqueuePlanlessDraft(cursorInput, relPath);
}

/**
 * Run approach-1 save + enqueue. Fail-open.
 * @param {Record<string, unknown>} cursorInput
 * @param {{ filePath: string, relPath: string }} paths
 * @returns {Promise<{ drafted: boolean, save: object, draft: object }>}
 */
export async function runApproach1Draft(cursorInput, paths) {
  /** @type {{ ok: boolean, acted: boolean, detail?: string }} */
  let save = { ok: true, acted: false, detail: 'skipped' };
  /** @type {{ ok: boolean, acted: boolean, key?: string, detail?: string }} */
  let draft = { ok: true, acted: false, detail: 'skipped' };

  try {
    save = await runSqlewSaveCli(cursorInput, paths.filePath, paths.relPath);
  } catch {
    save = { ok: false, acted: false, detail: 'error' };
  }

  try {
    draft = runEnqueuePlanlessDraft(cursorInput, paths.relPath);
  } catch {
    draft = { ok: false, acted: false, detail: 'error' };
  }

  return {
    drafted: Boolean(save.acted || draft.acted),
    save,
    draft,
  };
}

/**
 * Short approach-2 nudge for postToolUse Write when no draft yet.
 * @param {string} relPath
 */
export function approach2Prompt(relPath) {
  const pathBit = relPath ? ` (\`${relPath}\`)` : '';
  return (
    `[sqlew] No ADR draft queued yet for this write${pathBit}. ` +
    `If it encodes a Decision, call MCP \`decision\` action \`set\` with status \`draft\` (key + value), ` +
    `or ensure the Write enqueue path can write \`.sqlew/queue/pending.json\`.`
  );
}
