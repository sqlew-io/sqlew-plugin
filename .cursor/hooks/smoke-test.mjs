#!/usr/bin/env node
/**
 * Local smoke test for Cursor research + Write draft hooks (no Cursor UI / no DB).
 *
 *   node .cursor/hooks/smoke-test.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { clearPendingInject } from './lib/io.mjs';
import { isNoisePath, draftKeyFromPath, extractFilePath } from './lib/paths.mjs';
import { approach2Prompt } from './lib/save-draft.mjs';
import { getQueuePath, enqueuePlanlessDraft } from './lib/enqueue-draft.mjs';
import { readFileSync, existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const postHook = join(root, '.cursor/hooks/post-research-suggest.mjs');
const writeHook = join(root, '.cursor/hooks/post-write-draft.mjs');
const stopHook = join(root, '.cursor/hooks/stop-flush.mjs');
const bspHook = join(root, '.cursor/hooks/before-submit-fallback.mjs');

/**
 * @param {string} script
 * @param {object} stdinObj
 * @param {NodeJS.ProcessEnv} env
 */
function runHook(script, stdinObj, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', reject);
    child.stdin.end(JSON.stringify(stdinObj));
  });
}

const markerId = 'smoke-test-fixed-id';
clearPendingInject(root);
try {
  rmSync(join(root, '.sqlew', 'cursor-bsp-injected'), { recursive: true, force: true });
  rmSync(join(root, '.sqlew', 'cursor-drafted'), { recursive: true, force: true });
  rmSync(join(root, '.sqlew', 'cursor-drafted-paths'), { recursive: true, force: true });
  rmSync(join(root, '.sqlew', 'queue'), { recursive: true, force: true });
} catch {
  // ignore
}

// 1) BSP without pending → continue only (before any postToolUse write)
{
  const { code, stdout } = await runHook(
    bspHook,
    { prompt: 'hello', conversation_id: 'smoke-conv-bsp-empty', cwd: root },
    {},
  );
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.continue, true);
  assert.equal(parsed.additional_context, undefined);
  console.log('ok: beforeSubmitPrompt gated empty');
}

// 2) Marker mode postToolUse research
{
  const { code, stdout, stderr } = await runHook(
    postHook,
    {
      tool_name: 'Grep',
      tool_input: { pattern: 'hooks', path: 'package.json' },
      cwd: root,
      conversation_id: 'smoke-conv-1',
    },
    { SQLEW_HOOK_TEST_MARKER: '1', SQLEW_HOOK_MARKER_ID: markerId },
  );
  assert.equal(code, 0, `post hook exit ${code}: ${stderr}`);
  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.additional_context, `SQLEW_HOOK_MARKER_${markerId}`);
  console.log('ok: postToolUse research marker mode');
}

// 3) Non-matching research tool → empty
{
  const { code, stdout } = await runHook(
    postHook,
    { tool_name: 'Shell', tool_input: { command: 'true' }, cwd: root },
    { SQLEW_HOOK_TEST_MARKER: '1', SQLEW_HOOK_MARKER_ID: markerId },
  );
  assert.equal(code, 0);
  assert.equal(stdout.trim(), '{}');
  console.log('ok: non-research tool empty');
}

// 4) BSP consumes pending once, then stays quiet for same conversation
{
  const first = await runHook(
    bspHook,
    { prompt: 'follow-up', conversation_id: 'smoke-conv-1', cwd: root },
    {},
  );
  assert.equal(first.code, 0);
  const parsed1 = JSON.parse(first.stdout.trim());
  assert.equal(parsed1.continue, true);
  assert.equal(parsed1.additional_context, `SQLEW_HOOK_MARKER_${markerId}`);

  const second = await runHook(
    bspHook,
    { prompt: 'again', conversation_id: 'smoke-conv-1', cwd: root },
    {},
  );
  assert.equal(second.code, 0);
  const parsed2 = JSON.parse(second.stdout.trim());
  assert.equal(parsed2.continue, true);
  assert.equal(parsed2.additional_context, undefined);
  console.log('ok: beforeSubmitPrompt once-per-conversation gate');
}

// 5) Keyword extract unit (inline)
{
  const { extractKeywords } = await import('./lib/keywords.mjs');
  const g = extractKeywords({ pattern: 'additional_context', path: '.cursor/hooks.json' });
  assert.ok(g.tokens.length >= 1);
  const w = extractKeywords({ search_term: 'Cursor Cloud Agents hooks' });
  assert.ok(w.tokens.includes('cursor') || w.key.toLowerCase().includes('cursor'));
  console.log('ok: keyword extraction');
}

// 6) Write marker mode (postToolUse)
{
  const { code, stdout, stderr } = await runHook(
    writeHook,
    {
      tool_name: 'Write',
      tool_input: { path: 'src/example.ts', contents: 'export const x = 1;\n' },
      cwd: root,
      conversation_id: 'smoke-write-1',
    },
    { SQLEW_HOOK_TEST_MARKER: '1', SQLEW_HOOK_MARKER_ID: markerId },
  );
  assert.equal(code, 0, `write hook exit ${code}: ${stderr}`);
  const parsed = JSON.parse(stdout.trim());
  assert.equal(parsed.additional_context, `SQLEW_HOOK_MARKER_WRITE_${markerId}`);
  console.log('ok: postToolUse Write marker mode');
}

// 7) afterFileEdit marker mode → empty (no inject on this event)
{
  const { code, stdout } = await runHook(
    writeHook,
    {
      file_path: join(root, 'src/example.ts'),
      edits: [{ old_string: '', new_string: 'export const x = 1;\n' }],
      cwd: root,
      conversation_id: 'smoke-write-afe',
    },
    { SQLEW_HOOK_TEST_MARKER: '1', SQLEW_HOOK_MARKER_ID: markerId },
  );
  assert.equal(code, 0);
  assert.equal(stdout.trim(), '{}');
  console.log('ok: afterFileEdit marker mode empty');
}

// 8) Write enqueues draft to pending.json (no MCP / no DB)
{
  try {
    rmSync(join(root, '.sqlew', 'cursor-drafted'), { recursive: true, force: true });
    rmSync(join(root, '.sqlew', 'cursor-drafted-paths'), { recursive: true, force: true });
    rmSync(join(root, '.sqlew', 'queue'), { recursive: true, force: true });
  } catch {
    // ignore
  }
  const { code, stdout, stderr } = await runHook(
    writeHook,
    {
      tool_name: 'Write',
      tool_input: { path: 'src/feature/auth.ts', contents: 'export {}\n' },
      cwd: root,
      conversation_id: 'smoke-write-enqueue',
    },
    {
      // sqlew missing is fine — enqueue is local file I/O
      PATH: '/usr/bin:/bin',
      SQLEW_HOOK_APPROACH2: '1',
    },
  );
  assert.equal(code, 0, `write enqueue exit ${code}: ${stderr}`);
  assert.equal(stdout.trim(), '{}', 'enqueue path emits no inject when drafted');
  const queuePath = getQueuePath(root);
  assert.ok(existsSync(queuePath), 'pending.json created');
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
  assert.ok(Array.isArray(queue.items) && queue.items.length >= 1);
  const item = queue.items.find((i) => i?.type === 'decision' && i?.action === 'create');
  assert.ok(item);
  assert.equal(item.data.key, 'cursor/auto/src/feature/auth.ts');
  assert.equal(item.data.status, 'draft');
  console.log('ok: postToolUse Write enqueue → pending.json');
}

// 8b) Write approach-2 when enqueue disabled (fail-open nudge)
{
  try {
    rmSync(join(root, '.sqlew', 'cursor-drafted'), { recursive: true, force: true });
    rmSync(join(root, '.sqlew', 'cursor-drafted-paths'), { recursive: true, force: true });
    rmSync(join(root, '.sqlew', 'queue'), { recursive: true, force: true });
  } catch {
    // ignore
  }
  const { code, stdout, stderr } = await runHook(
    writeHook,
    {
      tool_name: 'Write',
      tool_input: { path: 'src/feature/auth.ts', contents: 'export {}\n' },
      cwd: root,
      conversation_id: 'smoke-write-a2',
    },
    {
      PATH: '/usr/bin:/bin',
      SQLEW_HOOK_APPROACH2: '1',
      SQLEW_HOOK_DRAFT_ENQUEUE: '0',
      SQLEW_HOOK_SAVE: '0',
    },
  );
  assert.equal(code, 0, `write approach2 exit ${code}: ${stderr}`);
  const parsed = JSON.parse(stdout.trim());
  assert.match(String(parsed.additional_context || ''), /No ADR draft queued yet/);
  assert.match(String(parsed.additional_context || ''), /decision/);
  console.log('ok: postToolUse Write approach-2 nudge');
}

// 9) Conversation gate: second Write stays quiet
{
  const { code, stdout } = await runHook(
    writeHook,
    {
      tool_name: 'Write',
      tool_input: { path: 'src/feature/other.ts', contents: 'export {}\n' },
      cwd: root,
      conversation_id: 'smoke-write-a2',
    },
    { PATH: '/usr/bin:/bin', SQLEW_HOOK_APPROACH2: '1' },
  );
  assert.equal(code, 0);
  assert.equal(stdout.trim(), '{}');
  console.log('ok: Write once-per-conversation gate');
}

// 10) Noise paths + draft key helpers
{
  assert.equal(isNoisePath('README.md'), true);
  assert.equal(isNoisePath('docs/guide.ts'), true);
  assert.equal(isNoisePath('package-lock.json'), true);
  assert.equal(isNoisePath('src/hooks/post.ts'), false);
  assert.equal(draftKeyFromPath('src/feature/auth.ts'), 'cursor/auto/src/feature/auth.ts');
  assert.equal(
    extractFilePath({ tool_name: 'Write', tool_input: { path: 'a.ts' } }),
    'a.ts',
  );
  assert.equal(
    extractFilePath({ file_path: '/tmp/x.ts', edits: [] }),
    '/tmp/x.ts',
  );
  assert.match(approach2Prompt('src/a.ts'), /src\/a\.ts/);
  console.log('ok: path gates and draft key');
}

// 11) enqueue helper dedupe + stop-flush fail-open
{
  try {
    rmSync(join(root, '.sqlew', 'queue'), { recursive: true, force: true });
  } catch {
    // ignore
  }
  const first = enqueuePlanlessDraft(root, 'src/dup.ts', { harness: 'cursor' });
  const second = enqueuePlanlessDraft(root, 'src/dup.ts', { harness: 'cursor' });
  assert.equal(first.acted, true);
  assert.equal(second.acted, false);
  assert.equal(second.detail, 'duplicate-skipped');

  const { code, stdout } = await runHook(
    stopHook,
    { status: 'completed', loop_count: 0, cwd: root, conversation_id: 'smoke-stop' },
    { PATH: '/usr/bin:/bin' },
  );
  assert.equal(code, 0);
  assert.equal(stdout.trim(), '{}');
  console.log('ok: enqueue dedupe + stop-flush fail-open');
}

console.log('All smoke tests passed.');
