/**
 * sqlew omp Extension — session context injection + Plan-to-ADR.
 *
 * Requires globally installed `sqlew` with `sqlew/hooks` export.
 * Hooks never open the DB; they read .sqlew/session-context.json and enqueue
 * via .sqlew/queue/pending.json (same rules as Claude/Hermes hooks).
 *
 * @since v5.4.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';

/**
 * Runtime-selected: `sqlew` is a global peer package, not a dep of this plugin
 * bundle. Static import would fail plugin load when sqlew is not yet installed.
 */
type SqlewHooks = {
  buildSessionContext: (projectPath: string) => Promise<string | null>;
  shouldInjectOnPrompt: (projectPath: string, sessionId: string | undefined) => boolean;
  saveSessionContextMarker: (
    projectPath: string,
    marker: { session_id?: string; injected_at: string; harness: string },
  ) => void;
  loadCurrentPlan: (projectPath: string) => {
    plan_id: string;
    plan_file: string;
    plan_path?: string;
    plan_updated_at: string;
    recorded: boolean;
    decision_pending?: boolean;
    enforcement_shown_at?: string;
  } | null;
  saveCurrentPlan: (
    projectPath: string,
    info: {
      plan_id: string;
      plan_file: string;
      plan_path?: string;
      plan_updated_at: string;
      recorded: boolean;
      decision_pending?: boolean;
      enforcement_shown_at?: string;
    },
  ) => void;
  processPlanPatterns: (projectPath: string) => {
    processed: boolean;
    confirmationMessage?: string;
  };
  hasFilledPatterns: (content: string) => boolean;
  resolveOmpRequirePatterns: (projectPath?: string) => boolean;
  isOmpPlanPath: (filePath: string | undefined) => boolean;
  extractSlugFromOmpPlanPath: (filePath: string) => string | null;
  ensureOmpPlanTemplate: (content: string) => { content: string; injected: boolean };
  materializeOmpPlan: (opts: {
    projectPath: string;
    slug: string;
    content: string;
    sessionId?: string;
  }) => { planPath: string };
  trackOmpPlanFromPath: (opts: {
    projectPath: string;
    filePath: string;
    content?: string;
    sessionId?: string;
  }) => unknown;
  ENFORCEMENT_FULL: string;
  ENFORCEMENT_SHORT: string;
};

const OMP_EXIT_PLAN_DENY_REASON =
  '[sqlew] Plan has no filled Decision/Constraint blocks. ' +
  'Add ### 📌 Decision: / ### 🚫 Constraint: with real values (not template placeholders), ' +
  'or set Value/Rule to "N/A" if none apply. ' +
  'Disable: hooks.omp_require_patterns = false in config.toml';

type SessionBranchEntry = {
  type?: string;
  mode?: string;
  planFile?: string;
  data?: { mode?: string; planFile?: string };
};

type HandlerCtx = {
  cwd: string;
  hasUI?: boolean;
  ui?: { notify: (msg: string, level: string) => void };
  sessionManager?: {
    getSessionFile?: () => string | undefined;
    getBranch?: () => SessionBranchEntry[];
  };
};

type State = {
  projectPath: string;
  sessionId: string | undefined;
  sessionContextInjected: boolean;
  planMode: boolean;
  enforcementShown: boolean;
  lastPlanSlug?: string;
  pendingSessionContext?: string;
  hooks: SqlewHooks | null;
  hooksLoadFailed: boolean;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function isProposePath(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const p = normalizePath(filePath);
  return (
    p === 'xd://propose' ||
    p === '/xdev/propose' ||
    p.endsWith('/xdev/propose')
  );
}

function toolInputPath(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const path = input.path ?? input.file_path;
  return typeof path === 'string' ? path : undefined;
}

function toolInputContent(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  return typeof input.content === 'string' ? input.content : undefined;
}

function parseSessionIdFromPath(sessionFile: string | undefined): string | undefined {
  if (!sessionFile) return undefined;
  const base = basename(sessionFile);
  const m = /^[^_]+_(.+)\.jsonl$/i.exec(base);
  if (m?.[1]) return m[1];
  return createHash('sha256').update(sessionFile).digest('hex').slice(0, 16);
}

function resolveSessionId(ctx: HandlerCtx): string | undefined {
  try {
    const file =
      typeof ctx.sessionManager?.getSessionFile === 'function'
        ? ctx.sessionManager.getSessionFile()
        : undefined;
    return parseSessionIdFromPath(file);
  } catch {
    return undefined;
  }
}

function detectPlanMode(
  ctx: HandlerCtx,
  hooks: SqlewHooks | null,
  projectPath: string,
): boolean {
  try {
    const branch = ctx.sessionManager?.getBranch?.() ?? [];
    for (let i = branch.length - 1; i >= 0; i--) {
      const entry = branch[i];
      if (entry?.type === 'mode_change') {
        const mode = String(entry.mode ?? entry.data?.mode ?? '');
        return mode === 'plan';
      }
    }
  } catch {
    // fall through
  }

  if (hooks) {
    try {
      const plan = hooks.loadCurrentPlan(projectPath);
      if (plan?.decision_pending && plan.plan_path && existsSync(plan.plan_path)) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function trackModeChangePlanFile(
  hooks: SqlewHooks,
  projectPath: string,
  sessionId: string | undefined,
  ctx: HandlerCtx,
): void {
  try {
    const branch = ctx.sessionManager?.getBranch?.() ?? [];
    for (let i = branch.length - 1; i >= 0; i--) {
      const entry = branch[i];
      if (entry?.type !== 'mode_change') continue;
      const planFile = entry.data?.planFile ?? entry.planFile;
      if (planFile && existsSync(planFile)) {
        hooks.trackOmpPlanFromPath({
          projectPath,
          filePath: planFile,
          sessionId,
        });
      }
      return;
    }
  } catch {
    // ignore
  }
}

function runSqlewHook(
  cmd: string,
  payload: object,
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { promise, resolve } = Promise.withResolvers<{
    stdout: string;
    stderr: string;
    code: number | null;
  }>();

  const child = spawn('sqlew', [cmd], {
    cwd,
    env: { ...process.env, OMP_PROJECT_ROOT: cwd },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill();
    resolve({ stdout, stderr, code: null });
  }, 30_000);
  child.stdout?.on('data', (d: Buffer) => {
    stdout += d.toString('utf8');
  });
  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString('utf8');
  });
  child.on('error', () => {
    clearTimeout(timer);
    resolve({ stdout, stderr, code: 1 });
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ stdout, stderr, code });
  });
  child.stdin?.write(JSON.stringify(payload));
  child.stdin?.end();
  return promise;
}

function mapToolName(ompName: string): string {
  const map: Record<string, string> = {
    write: 'Write',
    edit: 'Edit',
    bash: 'Bash',
    todo: 'TodoWrite',
    task: 'Task',
    read: 'Read',
  };
  return map[ompName] ?? ompName;
}

function isImplementationPath(filePath: string | undefined): boolean {
  if (!filePath) return false;
  const normalized = normalizePath(filePath).toLowerCase();
  if (normalized.endsWith('.md')) return false;
  if (
    normalized.includes('.claude/plans/') ||
    normalized.includes('.hermes/plans/') ||
    normalized.includes('.sqlew/plans/')
  ) {
    return false;
  }
  if (normalized.includes('/docs/')) return false;
  if (normalized.endsWith('.json') && !normalized.includes('/src/')) return false;
  if (normalized.startsWith('local://') || isProposePath(filePath)) return false;
  return true;
}

async function loadHooks(pi: ExtensionAPI): Promise<SqlewHooks | null> {
  try {
    // Runtime-selected peer: global `sqlew` package (see type comment above).
    const mod: unknown = await import('sqlew/hooks');
    return mod as SqlewHooks;
  } catch (err) {
    pi.logger?.error?.(`[sqlew-omp] failed to import sqlew/hooks: ${String(err)}`);
    return null;
  }
}

export default function sqlewOmp(pi: ExtensionAPI): void {
  const state: State = {
    projectPath: '',
    sessionId: undefined,
    sessionContextInjected: false,
    planMode: false,
    enforcementShown: false,
    hooks: null,
    hooksLoadFailed: false,
  };

  async function ensureHooks(): Promise<SqlewHooks | null> {
    if (state.hooks) return state.hooks;
    if (state.hooksLoadFailed) return null;
    const hooks = await loadHooks(pi);
    if (!hooks) {
      state.hooksLoadFailed = true;
      return null;
    }
    state.hooks = hooks;
    return hooks;
  }

  function refreshProject(ctx: HandlerCtx): void {
    state.projectPath = normalizePath(ctx.cwd);
    process.env.OMP_PROJECT_ROOT = state.projectPath;
    state.sessionId = resolveSessionId(ctx);
  }

  pi.on('session_start', async (_event, ctx) => {
    try {
      refreshProject(ctx as HandlerCtx);
      state.sessionContextInjected = false;
      state.planMode = false;
      state.enforcementShown = false;
      state.pendingSessionContext = undefined;
      state.lastPlanSlug = undefined;

      const hooks = await ensureHooks();
      if (!hooks || !state.projectPath) return;

      const context = await hooks.buildSessionContext(state.projectPath);
      if (context && hooks.shouldInjectOnPrompt(state.projectPath, state.sessionId)) {
        state.pendingSessionContext = context;
        hooks.saveSessionContextMarker(state.projectPath, {
          session_id: state.sessionId,
          injected_at: new Date().toISOString(),
          harness: 'omp',
        });
        const hctx = ctx as HandlerCtx;
        if (hctx.hasUI && hctx.ui) {
          hctx.ui.notify('[sqlew] session context ready', 'info');
        }
      }
    } catch (err) {
      pi.logger?.error?.(`[sqlew-omp] session_start: ${String(err)}`);
    }
  });

  pi.on('before_agent_start', async (_event, ctx) => {
    try {
      refreshProject(ctx as HandlerCtx);
      const hooks = await ensureHooks();
      if (!hooks) return;

      if (!state.pendingSessionContext && !state.sessionContextInjected) {
        const context = await hooks.buildSessionContext(state.projectPath);
        if (context && hooks.shouldInjectOnPrompt(state.projectPath, state.sessionId)) {
          state.pendingSessionContext = context;
          hooks.saveSessionContextMarker(state.projectPath, {
            session_id: state.sessionId,
            injected_at: new Date().toISOString(),
            harness: 'omp',
          });
        }
      }

      if (state.pendingSessionContext && !state.sessionContextInjected) {
        const content = state.pendingSessionContext;
        state.pendingSessionContext = undefined;
        state.sessionContextInjected = true;
        return {
          message: {
            customType: 'sqlew-session-context',
            content,
            display: false,
            attribution: 'agent' as const,
          },
        };
      }

      state.planMode = detectPlanMode(ctx as HandlerCtx, hooks, state.projectPath);
    } catch (err) {
      pi.logger?.error?.(`[sqlew-omp] before_agent_start: ${String(err)}`);
    }
  });

  pi.on('turn_start', async (_event, ctx) => {
    try {
      const hctx = ctx as HandlerCtx;
      refreshProject(hctx);
      const hooks = await ensureHooks();
      if (!hooks || !state.projectPath) return;

      state.planMode = detectPlanMode(hctx, hooks, state.projectPath);
      trackModeChangePlanFile(hooks, state.projectPath, state.sessionId, hctx);

      if (!state.planMode) return;

      const planInfo = hooks.loadCurrentPlan(state.projectPath);
      let content: string;
      if (!state.enforcementShown && !planInfo?.enforcement_shown_at) {
        content = hooks.ENFORCEMENT_FULL;
        state.enforcementShown = true;
        if (planInfo) {
          planInfo.enforcement_shown_at = new Date().toISOString();
          hooks.saveCurrentPlan(state.projectPath, planInfo);
        } else {
          hooks.saveCurrentPlan(state.projectPath, {
            plan_id: randomUUID(),
            plan_file: 'omp-plan.md',
            plan_updated_at: new Date().toISOString(),
            recorded: false,
            decision_pending: true,
            enforcement_shown_at: new Date().toISOString(),
          });
        }
      } else {
        content = hooks.ENFORCEMENT_SHORT;
        state.enforcementShown = true;
      }

      pi.sendMessage(
        {
          customType: 'sqlew-plan-guidance',
          content,
          display: false,
          attribution: 'agent',
        },
        { deliverAs: 'nextTurn' },
      );
    } catch (err) {
      pi.logger?.error?.(`[sqlew-omp] turn_start: ${String(err)}`);
    }
  });

  pi.on('tool_call', async (event, ctx) => {
    try {
      const hctx = ctx as HandlerCtx;
      refreshProject(hctx);
      const hooks = await ensureHooks();
      if (!hooks || !state.projectPath) return;

      state.planMode = detectPlanMode(hctx, hooks, state.projectPath);
      const toolName = String((event as { toolName?: string }).toolName ?? '');
      const input = ((event as { input?: Record<string, unknown> }).input ?? {}) as Record<
        string,
        unknown
      >;
      const path = toolInputPath(input);

      if (toolName === 'write' && isProposePath(path)) {
        let slug = String(input.content ?? path ?? '').trim();
        if (slug.includes('\n')) slug = slug.split('\n')[0]!.trim();
        slug = slug
          .replace(/^local:\/\//i, '')
          .replace(/-plan\.md$/i, '')
          .replace(/\.md$/i, '');
        if (!slug || slug === 'xd://propose' || slug.includes('propose')) {
          slug = state.lastPlanSlug ?? 'plan';
        }

        const plan = hooks.loadCurrentPlan(state.projectPath);
        let planContent = '';
        if (plan?.plan_path && existsSync(plan.plan_path)) {
          planContent = readFileSync(plan.plan_path, 'utf-8');
        } else {
          const tryPath = `${state.projectPath}/.sqlew/plans/${slug}-plan.md`;
          if (existsSync(tryPath)) {
            planContent = readFileSync(tryPath, 'utf-8');
            hooks.trackOmpPlanFromPath({
              projectPath: state.projectPath,
              filePath: tryPath,
              content: planContent,
              sessionId: state.sessionId,
            });
          }
        }

        if (hooks.resolveOmpRequirePatterns(state.projectPath)) {
          if (!planContent || !hooks.hasFilledPatterns(planContent)) {
            return { block: true, reason: OMP_EXIT_PLAN_DENY_REASON };
          }
        }

        const result = hooks.processPlanPatterns(state.projectPath);
        if (result.processed && result.confirmationMessage) {
          pi.sendMessage(
            {
              customType: 'sqlew-plan-adr',
              content: result.confirmationMessage,
              display: true,
              attribution: 'agent',
            },
            { deliverAs: 'followUp' },
          );
        }
        return;
      }

      if (
        (toolName === 'write' || toolName === 'edit') &&
        path &&
        hooks.isOmpPlanPath(path) &&
        !isProposePath(path)
      ) {
        let content = toolInputContent(input) ?? '';
        if (toolName === 'write') {
          const ensured = hooks.ensureOmpPlanTemplate(content);
          content = ensured.content;
          const slug = hooks.extractSlugFromOmpPlanPath(path) ?? 'plan';
          state.lastPlanSlug = slug;
          hooks.materializeOmpPlan({
            projectPath: state.projectPath,
            slug,
            content,
            sessionId: state.sessionId,
          });
          if (ensured.injected) {
            return { input: { ...input, content } };
          }
        } else {
          const slug = hooks.extractSlugFromOmpPlanPath(path) ?? 'plan';
          state.lastPlanSlug = slug;
          if (content) {
            hooks.materializeOmpPlan({
              projectPath: state.projectPath,
              slug,
              content,
              sessionId: state.sessionId,
            });
          } else {
            hooks.trackOmpPlanFromPath({
              projectPath: state.projectPath,
              filePath: path,
              sessionId: state.sessionId,
            });
          }
        }
        return;
      }

      if (toolName === 'bash') {
        const command = String(input.command ?? '');
        if (/\bgh\s+pr\s+create\b/.test(command)) {
          const payload = {
            client: 'omp',
            cwd: state.projectPath,
            session_id: state.sessionId,
            hook_event_name: 'PreToolUse',
            tool_name: 'Bash',
            tool_input: { command },
          };
          const { stdout, code } = await runSqlewHook('pr-adr', payload, state.projectPath);
          if (code === 2 || /deny|block/i.test(stdout)) {
            const reason = stdout.trim() || '[sqlew] pr-adr blocked';
            return { block: true, reason };
          }
        }
        return;
      }

      if (toolName === 'task') {
        const payload = {
          client: 'omp',
          cwd: state.projectPath,
          session_id: state.sessionId,
          hook_event_name: 'PreToolUse',
          tool_name: 'Task',
          tool_input: input,
        };
        void runSqlewHook('suggest', payload, state.projectPath);
      }
    } catch (err) {
      pi.logger?.error?.(`[sqlew-omp] tool_call: ${String(err)}`);
    }
  });

  pi.on('tool_result', async (event, ctx) => {
    try {
      const hctx = ctx as HandlerCtx;
      refreshProject(hctx);
      const hooks = await ensureHooks();
      if (!hooks || !state.projectPath) return;

      const toolName = String((event as { toolName?: string }).toolName ?? '');
      const input = ((event as { input?: Record<string, unknown> }).input ?? {}) as Record<
        string,
        unknown
      >;
      const path = toolInputPath(input);

      if ((toolName === 'write' || toolName === 'edit') && path) {
        if (hooks.isOmpPlanPath(path) && !isProposePath(path)) {
          const content = toolInputContent(input);
          const slug = hooks.extractSlugFromOmpPlanPath(path) ?? state.lastPlanSlug ?? 'plan';
          state.lastPlanSlug = slug;
          if (content !== undefined) {
            const ensured = hooks.ensureOmpPlanTemplate(content);
            hooks.materializeOmpPlan({
              projectPath: state.projectPath,
              slug,
              content: ensured.content,
              sessionId: state.sessionId,
            });
          } else {
            hooks.trackOmpPlanFromPath({
              projectPath: state.projectPath,
              filePath: path,
              sessionId: state.sessionId,
            });
          }
          return;
        }

        if (isImplementationPath(path)) {
          const plan = hooks.loadCurrentPlan(state.projectPath);
          if (plan?.decision_pending && !plan.recorded) {
            hooks.processPlanPatterns(state.projectPath);
          }
          const payload = {
            client: 'omp',
            cwd: state.projectPath,
            session_id: state.sessionId,
            hook_event_name: 'PostToolUse',
            tool_name: mapToolName(toolName),
            tool_input: { file_path: path, ...input },
          };
          void runSqlewHook('save', payload, state.projectPath);
        }
        return;
      }

      if (toolName === 'todo') {
        const payload = {
          client: 'omp',
          cwd: state.projectPath,
          session_id: state.sessionId,
          hook_event_name: 'PostToolUse',
          tool_name: 'TodoWrite',
          tool_input: input,
        };
        void runSqlewHook('check-completion', payload, state.projectPath);
      }
    } catch (err) {
      pi.logger?.error?.(`[sqlew-omp] tool_result: ${String(err)}`);
    }
  });

  pi.on('session_stop', async (_event, ctx) => {
    try {
      refreshProject(ctx as HandlerCtx);
      const hooks = await ensureHooks();
      if (!hooks || !state.projectPath) return;

      const plan = hooks.loadCurrentPlan(state.projectPath);
      if (plan?.decision_pending && !plan.recorded) {
        const result = hooks.processPlanPatterns(state.projectPath);
        if (result.processed && result.confirmationMessage) {
          pi.logger?.info?.(`[sqlew-omp] ${result.confirmationMessage}`);
        }
      }
    } catch (err) {
      pi.logger?.error?.(`[sqlew-omp] session_stop: ${String(err)}`);
    }
  });
}
