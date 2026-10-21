/**
 * Approach 1: register / promote ADR draft after Write / afterFileEdit.
 *
 * 1) `sqlew save` — Claude-shaped PostToolUse stdin (plan-mode promote; no-op if no plan)
 * 2) MCP `decision` set status=draft — plan-less draft from file path (fail-open)
 */

import { runProcess, parseJsonLoose } from './process.mjs';
import { draftKeyFromPath } from './paths.mjs';

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
  const acted = /Implementation started|Queued: decisions|in_progress/i.test(text);
  return { ok: true, acted, detail: acted ? 'promoted' : 'noop' };
}

/**
 * Build draft value from path + optional edits snippet.
 * @param {string} relPath
 * @param {Record<string, unknown>} cursorInput
 */
function buildDraftValue(relPath, cursorInput) {
  const parts = [
    `Auto-draft from Cursor Write/edit: \`${relPath}\`.`,
    'Captured at first implementation write (plan-less). Refine via MCP decision set.',
  ];

  const edits = Array.isArray(cursorInput.edits) ? cursorInput.edits : null;
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
 * Plan-less draft via MCP decision set (status: draft).
 * @param {Record<string, unknown>} cursorInput
 * @param {string} relPath
 * @returns {Promise<{ ok: boolean, acted: boolean, key?: string, detail?: string }>}
 */
export async function runSqlewDraftMcp(cursorInput, relPath) {
  if (process.env.SQLEW_HOOK_DRAFT_MCP === '0') {
    return { ok: true, acted: false, detail: 'disabled' };
  }

  const cwd = typeof cursorInput.cwd === 'string' ? cursorInput.cwd : process.cwd();
  const key = draftKeyFromPath(relPath);
  const value = buildDraftValue(relPath, cursorInput);
  const conversationId = String(
    cursorInput.conversation_id || cursorInput.session_id || '',
  ).slice(0, 40);

  const frames = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'sqlew-cursor-hooks', version: '0.1.0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'decision',
        arguments: {
          action: 'set',
          key,
          value,
          status: 'draft',
          tags: ['cursor', 'auto-draft', conversationId || 'session'].filter(Boolean),
          agent: 'cursor-cloud-hook',
        },
      },
    },
  ];

  const stdin = frames.map((f) => JSON.stringify(f)).join('\n') + '\n';
  const result = await runProcess('sqlew', [], {
    stdin,
    cwd,
    timeoutMs: Math.min(SAVE_TIMEOUT_MS, 10000),
    env: { ...process.env, SQLEW_HOOK_CLIENT: 'cursor' },
    earlyExit: (stdout) => {
      for (const line of stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        try {
          const msg = JSON.parse(t);
          if (msg?.id === 2) return true;
        } catch {
          // ignore
        }
      }
      return false;
    },
  });

  let acted = false;
  let detail = 'no-response';
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg?.id !== 2) continue;
      if (msg.error) {
        detail = String(msg.error.message || msg.error).slice(0, 120);
        return { ok: false, acted: false, key, detail };
      }
      const textBlocks = msg?.result?.content;
      let payload = msg?.result;
      if (Array.isArray(textBlocks)) {
        for (const block of textBlocks) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            payload = parseJsonLoose(block.text) ?? block.text;
          }
        }
      }
      const obj =
        payload && typeof payload === 'object'
          ? /** @type {Record<string, unknown>} */ (payload)
          : {};
      acted = obj.success === true || obj.key === key || /success|set/i.test(String(payload));
      detail = acted ? 'draft-set' : 'unexpected-shape';
      return { ok: true, acted, key, detail };
    } catch {
      // continue
    }
  }

  return { ok: false, acted: false, key, detail };
}

/**
 * Run approach-1 save + draft. Fail-open.
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
    draft = await runSqlewDraftMcp(cursorInput, paths.relPath);
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
    `[sqlew] No ADR draft yet for this write${pathBit}. ` +
    `If it encodes a Decision, call MCP \`decision\` action \`set\` with status \`draft\` (key + value).`
  );
}
