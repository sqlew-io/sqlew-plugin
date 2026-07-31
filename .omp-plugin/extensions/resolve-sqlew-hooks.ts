/**
 * Resolve on-disk path to sqlew's hooks-api.js for omp Extension load.
 * Bun does not resolve npm-global packages from the plugin directory.
 *
 * @since v5.4.1
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

function tryNpmRootGlobal(): string | null {
  try {
    const out = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function tryWhichSqlewBins(): string[] {
  try {
    const isWin = process.platform === 'win32';
    const out = isWin
      ? execFileSync('where.exe', ['sqlew'], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        })
      : execFileSync('which', ['-a', 'sqlew'], {
          encoding: 'utf8',
          timeout: 5000,
        });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

/**
 * Ordered candidate absolute paths for dist/hooks-api.js (may not exist yet).
 */
export function collectSqlewHooksApiCandidates(cwd: string = process.cwd()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (p: string | null | undefined): void => {
    if (!p || p.length === 0) return;
    const key = norm(p);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  const npmRoot = tryNpmRootGlobal();
  if (npmRoot) {
    push(join(npmRoot, 'sqlew', 'dist', 'hooks-api.js'));
  }

  for (const bin of tryWhichSqlewBins()) {
    const binDir = dirname(bin);
    push(join(binDir, 'node_modules', 'sqlew', 'dist', 'hooks-api.js'));
    push(join(binDir, '..', 'lib', 'node_modules', 'sqlew', 'dist', 'hooks-api.js'));
  }

  let dir = cwd;
  for (let i = 0; i < 12; i++) {
    push(join(dir, 'node_modules', 'sqlew', 'dist', 'hooks-api.js'));
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { name?: unknown };
        if (pkg.name === 'sqlew') {
          push(join(dir, 'dist', 'hooks-api.js'));
        }
      } catch {
        // skip monorepo candidate for this dir
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  push(
    join(
      homedir(),
      '.bun',
      'install',
      'global',
      'node_modules',
      'sqlew',
      'dist',
      'hooks-api.js',
    ),
  );

  return out;
}

/**
 * First existing hooks-api.js among candidates, or null.
 */
export function resolveSqlewHooksApiPath(cwd: string = process.cwd()): string | null {
  for (const p of collectSqlewHooksApiCandidates(cwd)) {
    if (existsSync(p)) return p;
  }
  return null;
}
