#!/usr/bin/env node
/**
 * Cursor `stop` → flush pending queue to DB (Cloud-safe).
 *
 * Write hooks only enqueue to `.sqlew/queue/pending.json`.
 * MCP QueueWatcher may be absent on Cloud, so stop must flush:
 *   1) `sqlew flush-queue` (preferred when core ships it)
 *   2) fallback `sqlew on-stop`
 *
 * Fail-open. Never emits followup_message (no agent loop).
 */

import { readStdinJson, emptyPostToolUse } from './lib/io.mjs';
import { runProcess } from './lib/process.mjs';

const FLUSH_TIMEOUT_MS = Number(process.env.SQLEW_HOOK_FLUSH_TIMEOUT_MS || 20000);

/**
 * @param {string} cwd
 * @param {Record<string, unknown>} input
 * @param {string} cmd
 * @returns {Promise<{ ok: boolean, detail: string, stdout: string }>}
 */
async function runFlushCmd(cwd, input, cmd) {
  const stdin = JSON.stringify({
    ...input,
    hook_event_name: cmd === 'on-stop' ? 'Stop' : 'stop',
    cwd,
    client: 'cursor',
  });
  const result = await runProcess('sqlew', [cmd], {
    stdin,
    cwd,
    timeoutMs: FLUSH_TIMEOUT_MS,
  });

  if (result.code === null && !result.stdout && !result.stderr) {
    return { ok: false, detail: 'sqlew-unavailable', stdout: '' };
  }

  // Unknown subcommand (older sqlew without flush-queue)
  const errText = `${result.stderr || ''}\n${result.stdout || ''}`;
  if (
    result.code !== 0 &&
    /unknown|not found|invalid|unrecognized|Usage:/i.test(errText) &&
    cmd === 'flush-queue'
  ) {
    return { ok: false, detail: 'flush-queue-missing', stdout: result.stdout || '' };
  }

  return {
    ok: true,
    detail: result.code === 0 ? 'ok' : `exit-${result.code}`,
    stdout: result.stdout || '',
  };
}

async function main() {
  try {
    if (process.env.SQLEW_HOOK_FLUSH === '0') {
      emptyPostToolUse();
      return;
    }

    const input = await readStdinJson();
    const cwd =
      (typeof input.cwd === 'string' && input.cwd) ||
      (Array.isArray(input.workspace_roots) &&
        typeof input.workspace_roots[0] === 'string' &&
        input.workspace_roots[0]) ||
      process.cwd();

    // Prefer dedicated flush; fall back to on-stop for older peers
    let flush = await runFlushCmd(cwd, input, 'flush-queue');
    if (!flush.ok && flush.detail === 'flush-queue-missing') {
      flush = await runFlushCmd(cwd, input, 'on-stop');
    } else if (!flush.ok && flush.detail === 'sqlew-unavailable') {
      // try on-stop once in case PATH resolves differently (unlikely)
      flush = await runFlushCmd(cwd, input, 'on-stop');
    }

    if (!flush.ok && process.env.SQLEW_HOOK_DEBUG === '1') {
      console.error(`[sqlew cursor stop-flush] ${flush.detail}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sqlew cursor stop-flush] ${message}`);
  }

  // stop hooks: empty JSON is fine (no followup)
  emptyPostToolUse();
}

await main();
