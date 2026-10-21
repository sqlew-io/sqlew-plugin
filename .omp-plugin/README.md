# sqlew-omp

oh-my-pi (omp) Extension for [sqlew](https://github.com/sqlew-io/sqlew) ADR automation.

## Features

- **Plan-less by default** — Plan mode is **not required** for suggest / ADR
- **Post `tool_result` suggest inject** — Related Context via camelCase `additionalContext` (peer [sqlew#136](https://github.com/sqlew-io/sqlew/pull/136)+)
- **Write=enqueue / Stop=flush** — write/edit enqueues drafts to `.sqlew/queue/pending.json`; `session_stop` runs flush-queue / on-stop (upsert)
- **Session context injection** — recent decisions + active constraints at session start
- **Plan mode guidance** — 📌/🚫 format reminders while planning (optional; still works)
- **Plan-to-ADR** — extract decisions/constraints on `xd://propose` / `/xdev/propose`
- **save / check-completion / pr-adr / suggest** — CLI side-effect parity with other harnesses

## Prerequisites

```bash
npm i -g sqlew   # version with `sqlew/hooks` export (5.4+)
```

**Peer for Post `tool_result` inject:** sqlew that exports `buildPostToolUseContextOutput` / `sendPostToolUseContext` on `sqlew/hooks` ([sqlew#136](https://github.com/sqlew-io/sqlew/pull/136)+). Older sqlew still runs Plan-to-ADR side-effects; the Extension falls back to returning camelCase `additionalContext` from CLI stdout when present, or no-ops inject when stdout has none.

Project should already discover the sqlew MCP server (`.mcp.json` or this bundle's `mcp.json`).

## Install

```bash
# Dev / local path
omp --extension /path/to/sqlew-plugin/.omp-plugin

# Or plugin install (when published)
omp plugin install /path/to/sqlew-plugin/.omp-plugin

# Or manual copy
# cp extensions/sqlew-omp.ts ~/.omp/agent/extensions/
# cp -r skills/* ~/.omp/agent/skills/
```

Sync skills from the monorepo root skills tree:

```powershell
pwsh ./scripts/sync-omp-skills.ps1
```

## Config

```toml
# .sqlew/config.toml
[hooks]
session_context_budget = 500
omp_require_patterns = true   # block propose without filled 📌/🚫 (default true)
```

## Manual smoke

```bash
cd <project with .mcp.json sqlew>
omp --extension /path/to/sqlew-plugin/.omp-plugin
# 1) session start → snapshot injects once
# 2) plan mode + write local://demo-plan.md with 📌 block
# 3) write xd://propose body demo → queue gains decision
# 4) template-only propose → blocked when omp_require_patterns true
```

## Architecture

See mcp-sqlew `docs/HOOKS_GUIDE.md` (oh-my-pi section) and `docs/HARNESS_COMPATIBILITY.md`.

**Post `tool_result`:** `save` / `check-completion` CLI stdout is awaited (not discarded). When the CLI emits context text, the Extension returns `{ additionalContext }` (omp camel, top-level) — preferring `buildPostToolUseContextOutput(text, 'omp')` when the installed sqlew exports it.

**Plan-less ADR (aligned with [sqlew-plugin#3](https://github.com/sqlew-io/sqlew-plugin/pull/3)):**

```text
tool_result (research / save) → additionalContext suggest when available
write | edit                  → enqueue omp/auto/<rel> → pending.json  (NO DB)
session_stop                  → flush-queue / on-stop → upsert
```

Plan-mode propose / 📌/🚫 extraction still works as before.
