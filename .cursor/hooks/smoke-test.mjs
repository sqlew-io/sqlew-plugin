#!/usr/bin/env node
/**
 * Local smoke test for Cursor research hooks (no Cursor UI / no DB required).
 *
 *   node .cursor/hooks/smoke-test.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { clearPendingInject } from './lib/io.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const postHook = join(root, '.cursor/hooks/post-research-suggest.mjs');
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

// 2) Marker mode postToolUse
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
  console.log('ok: postToolUse marker mode');
}

// 3) Non-matching tool → empty
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

console.log('All smoke tests passed.');
