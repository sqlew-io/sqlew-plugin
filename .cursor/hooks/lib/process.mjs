/**
 * Shared child-process runner for Cursor hooks (fail-open).
 */

import { spawn } from 'node:child_process';

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
export function runProcess(command, args, opts = {}) {
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
 * Parse first JSON object from CLI/MCP stdout (ignore trailing noise).
 * @param {string} stdout
 * @returns {unknown}
 */
export function parseJsonLoose(stdout) {
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
