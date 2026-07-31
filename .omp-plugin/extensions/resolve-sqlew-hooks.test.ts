import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collectSqlewHooksApiCandidates,
  resolveSqlewHooksApiPath,
} from './resolve-sqlew-hooks.ts';

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

describe('resolve-sqlew-hooks', () => {
  it('includes monorepo dist candidate when package name is sqlew', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sqlew-hooks-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'sqlew' }), 'utf8');
      const candidates = collectSqlewHooksApiCandidates(tmp);
      const expected = norm(join(tmp, 'dist', 'hooks-api.js'));
      assert.ok(
        candidates.some((p) => norm(p) === expected),
        `expected monorepo candidate ${expected} in ${candidates.map(norm).join(', ')}`,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not include monorepo dist candidate for other package names', () => {
    const tmp2 = mkdtempSync(join(tmpdir(), 'sqlew-hooks-other-'));
    try {
      writeFileSync(join(tmp2, 'package.json'), JSON.stringify({ name: 'other' }), 'utf8');
      const candidates = collectSqlewHooksApiCandidates(tmp2);
      const unexpected = norm(join(tmp2, 'dist', 'hooks-api.js'));
      assert.ok(
        !candidates.some((p) => norm(p) === unexpected),
        `should not include ${unexpected}`,
      );
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('tmp-scoped exists filter finds written hooks-api.js', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sqlew-hooks-file-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'sqlew' }), 'utf8');
      mkdirSync(join(tmp, 'dist'), { recursive: true });
      writeFileSync(join(tmp, 'dist', 'hooks-api.js'), 'export {}\n', 'utf8');
      const expected = join(tmp, 'dist', 'hooks-api.js');
      const found = collectSqlewHooksApiCandidates(tmp).filter(
        (p) => norm(p).startsWith(norm(tmp)) && existsSync(p),
      );
      assert.equal(found.length, 1);
      assert.equal(norm(found[0]!), norm(expected));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('resolveSqlewHooksApiPath returns null or existing hooks-api.js', () => {
    const r = resolveSqlewHooksApiPath(process.cwd());
    assert.ok(r === null || existsSync(r));
    if (typeof r === 'string') {
      assert.ok(norm(r).endsWith('dist/hooks-api.js'));
    }
  });
});
