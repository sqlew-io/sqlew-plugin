import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractContextTextFromHookStdout,
  ompAdditionalContextReturn,
} from './omp-post-context.ts';

describe('omp-post-context', () => {
  it('extracts omp/Codex camelCase additionalContext from CLI stdout', () => {
    const text = extractContextTextFromHookStdout(
      JSON.stringify({ continue: true, additionalContext: 'hello omp' }),
    );
    assert.equal(text, 'hello omp');
  });

  it('extracts Cursor snake_case additional_context', () => {
    const text = extractContextTextFromHookStdout(
      JSON.stringify({ additional_context: 'cursor ctx' }),
    );
    assert.equal(text, 'cursor ctx');
  });

  it('extracts Claude/Grok nested hookSpecificOutput.additionalContext', () => {
    const text = extractContextTextFromHookStdout(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: 'nested',
        },
      }),
    );
    assert.equal(text, 'nested');
  });

  it('returns undefined for empty / continue-only stdout', () => {
    assert.equal(extractContextTextFromHookStdout(''), undefined);
    assert.equal(
      extractContextTextFromHookStdout(JSON.stringify({ continue: true })),
      undefined,
    );
  });

  it('ompAdditionalContextReturn uses builder when available', () => {
    const out = ompAdditionalContextReturn(
      {
        buildPostToolUseContextOutput: (t, client) => {
          assert.equal(client, 'omp');
          return { continue: true, additionalContext: `shaped:${t}` };
        },
      },
      'raw',
    );
    assert.deepEqual(out, { additionalContext: 'shaped:raw' });
  });

  it('ompAdditionalContextReturn falls back without builder (peer older sqlew)', () => {
    const out = ompAdditionalContextReturn({}, 'legacy text');
    assert.deepEqual(out, { additionalContext: 'legacy text' });
  });

  it('ompAdditionalContextReturn skips hermes-shaped builder output', () => {
    const out = ompAdditionalContextReturn(
      {
        buildPostToolUseContextOutput: () => ({ continue: true }),
      },
      'ignored',
    );
    assert.equal(out, undefined);
  });
});
