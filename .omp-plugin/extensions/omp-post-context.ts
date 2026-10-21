/**
 * omp tool_result Post context helpers.
 *
 * sqlew CLI / `buildPostToolUseContextOutput` emit harness-shaped JSON;
 * the Extension must return omp-native `{ additionalContext }` (not discard stdout).
 *
 * @since v5.4.3
 */

export type PostContextBuilder = (
  additionalContext: string,
  client?: string | null,
) =>
  | { additional_context: string }
  | { continue: true; additionalContext: string }
  | {
      continue: true;
      hookSpecificOutput: {
        hookEventName: 'PostToolUse';
        additionalContext: string;
      };
    }
  | { continue: true };

/**
 * Pull model-visible context text from sqlew CLI stdout JSON (fail-open).
 * Accepts omp/Codex camel, Cursor snake, and Claude/Grok nested shapes.
 */
export function extractContextTextFromHookStdout(stdout: string): string | undefined {
  const text = String(stdout || '').trim();
  if (!text) return undefined;

  const tryObj = (obj: Record<string, unknown>): string | undefined => {
    const camel = obj.additionalContext;
    if (typeof camel === 'string' && camel.trim()) return camel.trim();
    const snake = obj.additional_context;
    if (typeof snake === 'string' && snake.trim()) return snake.trim();
    const nested = obj.hookSpecificOutput;
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>;
      if (typeof n.additionalContext === 'string' && n.additionalContext.trim()) {
        return n.additionalContext.trim();
      }
    }
    return undefined;
  };

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') {
      const hit = tryObj(parsed as Record<string, unknown>);
      if (hit) return hit;
    }
  } catch {
    // try line-wise / first object
  }

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === 'object') {
        const hit = tryObj(parsed as Record<string, unknown>);
        if (hit) return hit;
      }
    } catch {
      // continue
    }
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object') {
        return tryObj(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

/**
 * omp tool_result return: top-level camelCase `additionalContext`.
 * Prefer sqlew/hooks builder when present (PR #136+); else pass text through.
 */
export function ompAdditionalContextReturn(
  hooks: { buildPostToolUseContextOutput?: PostContextBuilder },
  text: string | undefined,
): { additionalContext: string } | undefined {
  if (!text || !text.trim()) return undefined;
  const trimmed = text.trim();

  if (typeof hooks.buildPostToolUseContextOutput === 'function') {
    try {
      const shaped = hooks.buildPostToolUseContextOutput(trimmed, 'omp');
      if (
        shaped &&
        typeof shaped === 'object' &&
        'additionalContext' in shaped &&
        typeof shaped.additionalContext === 'string' &&
        shaped.additionalContext.trim()
      ) {
        return { additionalContext: shaped.additionalContext.trim() };
      }
      // Hermes-shaped / empty — no inject
      return undefined;
    } catch {
      // fall through to raw text
    }
  }

  // Older sqlew without builder: still return omp-native camelCase.
  return { additionalContext: trimmed };
}
