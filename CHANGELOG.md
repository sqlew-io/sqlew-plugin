# Changelog

All notable changes to sqlew-plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Changed

**Docs: Cursor Cloud Agents setup (hooks + `@sqlew/pg`)**

- Plan-less ADR on Cursor Cloud needs **this plugin's** `.cursor/hooks.json` — MCP alone is not enough
- Cloud MCP: per-repo `.cursor/mcp.json` → `npx -y @sqlew/pg`
- Secrets: `SQLEW_DATABASE_URL` / `DATABASE_URL` from Cloud Environment Secrets
- Project name: optional `SQLEW_PROJECT_NAME`; else git repo name; config last (**env > git > config**)
- Brief Write=enqueue / Stop=flush / Post research inject (aligned with existing plan-less docs)
- Updated: README Cursor section, `skills/sqlew-plan-guidance` (+ Hermes/omp copies), `.hermes-plugin/after-install.md`

**Docs: plan-less harness workflow messaging**

- Plan mode is **not required** for ADR / suggest (Cursor, Claude Code, Grok Build, Codex, omp)
- Research PostToolUse / `tool_result` → Related Context; Write=enqueue → `.sqlew/queue/pending.json`; Stop / on-stop / flush → upsert
- Plan-mode ADR creation still documented as working as before
- Hermes: hooks automatic trigger unavailable; recommend Skill via `/learn` (Japanese prompt in README / after-install / skills)
- Updated: README, `skills/sqlew-plan-guidance`, `skills/sqlew-decision-format`, `.hermes-plugin/after-install.md`, `.omp-plugin/README.md`, synced Hermes/omp skill copies

---

## [5.4.4] - 2026-10-21

### Changed

**Write=enqueue / Stop=flush (no per-Write DB/MCP set)**

- Cursor `postToolUse` Write / `afterFileEdit` → enqueue draft to `.sqlew/queue/pending.json` only (removed MCP `decision set` from Write path)
- Cursor `stop` → `stop-flush.mjs` calls `sqlew flush-queue` (fallback `on-stop`) for Cloud without QueueWatcher
- omp `tool_result` write/edit → same enqueue helper (`omp/auto/<rel>`); `session_stop` → flush-queue / on-stop
- Docs ADR DB section: Write=enqueue, Stop/watcher=upsert

### Notes

- Peer: sqlew core `flush-queue` / plan-less `save` enqueue when available; plugin file helper works without them
- Disable enqueue: `SQLEW_HOOK_DRAFT_ENQUEUE=0` (legacy `SQLEW_HOOK_DRAFT_MCP=0` still honored)

---

## [5.4.3] - 2026-10-21

### Added

**Cursor Cloud Post Write / afterFileEdit ADR draft (Post-only lock)**

- `postToolUse` matcher `Write` + `afterFileEdit` → `post-write-draft.mjs`
  - Approach 1: `sqlew save` (plan promote) + MCP `decision` `set` `status=draft` (plan-less) — superseded by 5.4.4 enqueue
  - Approach 2: short `additional_context` nudge on Write when no draft yet
  - Gates: noise paths, path dedupe, once-per-conversation; fail-open
- Marker: `SQLEW_HOOK_MARKER_WRITE_<id>` for Write inject E2E
- Docs: Post-only product path; BSP explicitly **not for Cloud**

**omp Extension: Post `tool_result` additionalContext**

- Await `sqlew save` / `check-completion` and return `{ additionalContext }` (camel top-level) instead of discarding stdout
- Prefer `buildPostToolUseContextOutput(..., 'omp')` from `sqlew/hooks` when present ([sqlew#136](https://github.com/sqlew-io/sqlew/pull/136)+); fallback parses CLI stdout / returns text on older peers
- Helpers + tests: `omp-post-context.ts`

### Notes

- Hermes remains Skill-only for suggest/ADR (no Post inject chase).
- Shared `lib/process.mjs` for CLI/MCP spawn.
- omp Post inject peer: sqlew with `buildPostToolUseContextOutput` on `sqlew/hooks` (documented in `.omp-plugin/README.md`).

---

## [5.4.2] - 2026-10-21

### Added

**Cursor Cloud research hooks (experimental, plan-less)**

- **`.cursor/hooks.json`** — Cloud Agents load project command hooks from this path
  - Primary: `postToolUse` matcher `Grep|WebSearch|WebFetch` → `node .cursor/hooks/post-research-suggest.mjs`
  - Optional: `beforeSubmitPrompt` → `before-submit-fallback.mjs` (gated; **Cloud does not deliver** `additional_context` here — verified 2026-10-21)
- Hook scripts extract keywords from `tool_input`, call `sqlew suggest` (CLI) + MCP `suggest by_context`, return compact Related Context in `{ additional_context }` (score threshold, max 5, dedupe)
- **Marker mode:** `SQLEW_HOOK_TEST_MARKER=1` injects `SQLEW_HOOK_MARKER_<uuid>` without DB (Cloud E2E)
- **`.cursor-plugin/plugin.json`** — Cursor plugin manifest pointing at `.cursor/hooks.json` + skills + MCP
- Smoke: `node .cursor/hooks/smoke-test.mjs`

### Notes

- Fail-open on CLI/MCP errors (empty context; never block the agent).
- Cloud does not run `beforeMCPExecution` / `sessionStart`; do not depend on them.
- No LLM project picking — uses cwd / existing sqlew project resolution only.

---

## [5.4.1] - 2026-07-31

### Changed

**omp Extension: session-local plan_path (requires sqlew >= 5.3.7)**

- Track `local://*-plan.md` via `resolveOmpPlanFsPath` + `sessionFile` (no default project `.sqlew/plans` copy)
- `materializeOmpPlan` callers pass absolute `planPath`
- Hooks load: bare `import('sqlew/hooks')` or filesystem resolve of `dist/hooks-api.js` (`resolve-sqlew-hooks.ts`)

### Added

- `resolve-sqlew-hooks.ts` (+ unit test) for multi-candidate hooks-api path resolution


## [5.3.2] - 2026-07-11

### Fixed

**Grok Build Plan-to-ADR reliability** (requires matching sqlew CLI with multi-trigger file injection)

- **`hooks/hooks.json`** — Expand `track-plan` matchers for Grok tools (`write`, `search_replace`) and wire:
  - PreToolUse: `EnterPlanMode` / `ExitPlanMode` (exit gate when `hooks.grok_require_patterns` is true)
  - PostToolUse: re-run `track-plan` after plan.md edits so template wipe is repaired
- **`sqlew-plan-guidance` / `sqlew-decision-format` skills** — Document multi-trigger plan.md template seeding (`enter_plan_mode`, plan-mode `UserPromptSubmit`, post-edit re-inject) and the exit gate / N/A escape hatch
- **Hermes skills** — Synced from root `skills/` via release process

### Notes

Template injection and `exit_plan_mode` deny are implemented in the **sqlew** CLI (`track-plan`, `on-prompt`). This plugin release only updates hook wiring and skill docs. Install/update both:

```bash
npm i -g sqlew   # CLI with Grok multi-trigger inject + exit gate
grok plugin install sqlew-io/sqlew-plugin --trust
grok plugin update
```

---

## [5.3.1] - 2026-06-29

### Changed

- **Version alignment** — Bumped plugin manifests to 5.3.1 to track the sqlew MCP server 5.3.1 release. No plugin code changes.

### Notes

sqlew MCP server 5.3.1 adds tool-call-level project resolution for desktop AI agents (Claude Desktop, Hermes Desktop): a per-call `_sqlew_project` parameter (root/name/ref) and a new `project` tool (`current`/`resolve`/`list`/`validate`). These are exposed automatically via dynamic MCP tool discovery — no plugin change is required to use them. The minimum sqlew requirement remains `>= 5.3.0`; install `sqlew@5.3.1` to use the desktop project features.

---

## [5.3.0] - 2026-06-27

### Added

**Hermes (Claude Code / Nous) plugin bundle** (requires sqlew MCP server >= 5.3.0)

- **`.hermes-plugin/`** — Installable via `hermes plugins install sqlew-io/sqlew-plugin/.hermes-plugin`
  - `plugin.yaml` — Hermes plugin manifest
  - `__init__.py` — On enable: copies skills to `~/.hermes/skills/`, merges `mcp_servers` + `hooks` into `~/.hermes/config.yaml`, registers shell hooks
  - `config-fragment.yaml` — Reference hooks block (`pre_llm_call`, `pre_tool_call`, `post_tool_call`, …)
  - `after-install.md` — Post-install instructions
  - `skills/` — Bundled `sqlew-decision-format`, `sqlew-plan-guidance`, `sqlew-pr-adr`
- **`scripts/sync-hermes-skills.ps1`** — Sync root `skills/` into `.hermes-plugin/skills/` before release

### Changed

- **`sqlew-plan-guidance` skill** — Added Hermes Notes section (`.hermes/plans/`, every-turn `pre_llm_call` guidance, no `ExitPlanMode`)
- **README** — Hermes install section and supported-clients table
- **Plugin manifests** — `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.hermes-plugin/plugin.yaml` bumped to 5.3.0

### Install

```bash
npm i -g sqlew@5.3.0
hermes plugins install sqlew-io/sqlew-plugin/.hermes-plugin
hermes plugins enable sqlew
```

---

## [5.2.2] - 2026-06-13

- Constraint `reason` field support in `sqlew-decision-format` skill (`- **Reason**:` in 🚫 blocks)

## [5.2.1] - 2026-06-12

- Codex plugin support (`.codex-plugin`, marketplace, hook matchers for `shell_command` / `apply_patch`)

## [5.2.0] - 2026-06-11

- Grok Build plugin support (hook matchers, skills-based plan guidance)