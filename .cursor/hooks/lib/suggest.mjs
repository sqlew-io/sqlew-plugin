/**
 * Invoke sqlew suggest (CLI) and optional MCP by_context lookup.
 * Always fail-open: errors → empty items.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  normalizeSuggestPayload,
  filterDedupeLimit,
  formatRelatedContext,
} from './related-context.mjs';

const DEFAULT_TIMEOUT_MS = Number(process.env.SQLEW_HOOK_SUGGEST_TIMEOUT_MS || 10000);

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{
 *   stdin?: string,
 *   cwd?: string,
 *   timeoutMs?: number,
 *   env?: NodeJS.ProcessEnv,
 *   earlyExit?: (stdout: string) => boolean,
 * }} opts
 * @returns {Promise<{ stdout: string, stderr: string, code: number | null }>}
 */
function runProcess(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve({ stdout, stderr, code });
    };

    child.stdout.on('data', (d) => {
      stdout += d;
      if (opts.earlyExit && opts.earlyExit(stdout)) {
        finish(0);
      }
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });

    const timer = setTimeout(() => finish(null), timeoutMs);

    child.on('error', () => finish(null));
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    if (opts.stdin != null) {
      child.stdin.end(opts.stdin);
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Test marker mode — no DB / CLI required.
 * @returns {string}
 */
export function buildTestMarker() {
  const id = process.env.SQLEW_HOOK_MARKER_ID || randomUUID();
  return `SQLEW_HOOK_MARKER_${id}`;
}

/**
 * Claude-compatible PreToolUse Task payload so `sqlew suggest` runs its CLI path.
 * @param {{ key: string, tokens: string[], raw: string }} keywords
 * @param {Record<string, unknown>} cursorInput
 */
function buildSuggestStdin(keywords, cursorInput) {
  const prompt = [keywords.key, keywords.tokens.join(' '), keywords.raw]
    .filter(Boolean)
    .join('\n')
    .slice(0, 500);

  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Task',
    tool_input: {
      description: `sqlew cursor research suggest: ${keywords.key}`.slice(0, 200),
      prompt,
      subagent_type: 'generalPurpose',
    },
    cwd: cursorInput.cwd || process.cwd(),
    session_id: cursorInput.session_id || cursorInput.conversation_id,
    conversation_id: cursorInput.conversation_id || cursorInput.session_id,
    // Cursor-native fields (ignored by sqlew if unknown)
    cursor_tool_name: cursorInput.tool_name,
    cursor_tool_input: cursorInput.tool_input,
  });
}

/**
 * Parse first JSON object from CLI stdout (ignore trailing noise).
 * @param {string} stdout
 * @returns {unknown}
 */
function parseJsonLoose(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Call `sqlew suggest` CLI (required contract). Fail-open.
 * @param {{ key: string, tokens: string[], raw: string }} keywords
 * @param {Record<string, unknown>} cursorInput
 */
export async function runSqlewSuggestCli(keywords, cursorInput) {
  const stdin = buildSuggestStdin(keywords, cursorInput);
  const cwd = typeof cursorInput.cwd === 'string' ? cursorInput.cwd : process.cwd();
  const result = await runProcess('sqlew', ['suggest'], {
    stdin,
    cwd,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  return parseJsonLoose(result.stdout);
}

/**
 * One-shot MCP tools/call for suggest by_context (decisions) + constraint by_context.
 * Uses the same `sqlew` binary Cloud/local installs on PATH.
 * @param {{ key: string, tokens: string[], raw: string }} keywords
 * @param {string} cwd
 */
export async function runSqlewSuggestMcp(keywords, cursorInput) {
  const cwd = typeof cursorInput.cwd === 'string' ? cursorInput.cwd : process.cwd();
  const minScore = Number(process.env.SQLEW_HOOK_MIN_SCORE || 35);
  const limit = Number(process.env.SQLEW_HOOK_MAX_ITEMS || 5);

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
    {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'suggest',
        arguments: {
          action: 'by_context',
          key: keywords.key,
          tags: keywords.tokens.slice(0, 5),
          limit,
          min_score: minScore,
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'suggest',
        arguments: {
          action: 'by_context',
          target: 'constraint',
          text: keywords.tokens.slice(0, 6).join(' ') || keywords.key,
          tags: keywords.tokens.slice(0, 5),
          limit,
          min_score: minScore,
        },
      },
    },
  ];

  // MCP stdio: one JSON-RPC message per line
  const stdin = frames.map((f) => JSON.stringify(f)).join('\n') + '\n';
  const result = await runProcess('sqlew', [], {
    stdin,
    cwd,
    // MCP server may stay up; exit once both tool calls answered or timeout.
    timeoutMs: Math.min(DEFAULT_TIMEOUT_MS, 8000),
    env: {
      ...process.env,
      SQLEW_HOOK_CLIENT: 'cursor',
    },
    earlyExit: (stdout) => {
      const ids = new Set();
      for (const line of stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        try {
          const msg = JSON.parse(t);
          if (msg?.id === 2 || msg?.id === 3) ids.add(msg.id);
        } catch {
          // ignore
        }
      }
      return ids.has(2) && ids.has(3);
    },
  });

  /** @type {unknown[]} */
  const payloads = [];
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg?.result?.content) {
        for (const block of msg.result.content) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            payloads.push(parseJsonLoose(block.text) ?? block.text);
          }
        }
      } else if (msg?.result && (msg.result.suggestions || msg.result.count != null)) {
        payloads.push(msg.result);
      }
    } catch {
      // skip non-json lines
    }
  }
  return payloads;
}

/**
 * Build additional_context string for Cursor postToolUse.
 * @param {Record<string, unknown>} cursorInput
 * @returns {Promise<string>}
 */
export async function buildAdditionalContext(cursorInput) {
  if (process.env.SQLEW_HOOK_TEST_MARKER === '1') {
    return buildTestMarker();
  }

  const toolInput =
    cursorInput.tool_input && typeof cursorInput.tool_input === 'object'
      ? /** @type {Record<string, unknown>} */ (cursorInput.tool_input)
      : {};

  const { extractKeywords } = await import('./keywords.mjs');
  const keywords = extractKeywords(toolInput);
  if (!keywords.key && keywords.tokens.length === 0) {
    return '';
  }

  /** @type {import('./related-context.mjs').RelatedItem[]} */
  let items = [];

  // 1) CLI contract: always attempt `sqlew suggest`
  try {
    const cliOut = await runSqlewSuggestCli(keywords, cursorInput);
    if (cliOut && typeof cliOut === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (cliOut);
      const text = obj.additionalContext || obj.additional_context;
      if (typeof text === 'string' && text.trim() && /Related Context|📌|Decision|Constraint/i.test(text)) {
        return text.trim().slice(0, 4000);
      }
      items = items.concat(normalizeSuggestPayload(cliOut));
    }
  } catch {
    // fail-open
  }

  // 2) MCP suggest by_context for real ADR hits (plan-less path)
  try {
    const mcpPayloads = await runSqlewSuggestMcp(keywords, cursorInput);
    for (const p of mcpPayloads) {
      items = items.concat(normalizeSuggestPayload(p));
    }
  } catch {
    // fail-open
  }

  const compact = filterDedupeLimit(items);
  return formatRelatedContext(compact, {
    keywords: keywords.tokens.slice(0, 6).join(', ') || keywords.key,
  }).slice(0, 4000);
}
