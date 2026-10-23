# sqlew for Hermes — installed

## What was configured

- **MCP server** — `sqlew` added to `mcp_servers` in `~/.hermes/config.yaml`
- **Shell hooks** — Plan-to-ADR, PR ADR guard, decision extraction (see `config-fragment.yaml`)
- **Skills** — `sqlew-decision-format`, `sqlew-plan-guidance`, `sqlew-pr-adr` copied to `~/.hermes/skills/`

## Prerequisites

```bash
npm i -g sqlew   # requires >= 5.3.0
```

## Enable the plugin

```bash
hermes plugins enable sqlew
hermes gateway restart   # if using the gateway
```

## Verify

```bash
hermes hooks list
hermes hooks test pre_tool_call --for-tool terminal
```

First hook run may prompt for allowlist approval. For non-interactive use:

```yaml
# ~/.hermes/config.yaml
hooks_auto_accept: true
```

Or set `HERMES_ACCEPT_HOOKS=1`.

## Plan-less vs plan mode on Hermes

**Plan mode is not required** for suggest / ADR. On Cursor Cloud, that auto path needs **sqlew-plugin Cursor hooks** (`.cursor/hooks.json`) plus MCP `@sqlew/pg` via `.cursor/mcp.json` — MCP alone is not enough. On omp, Claude, Grok, and Codex, research hooks inject Related Context and Write enqueues drafts (Stop flushes). **Hermes cannot do that automatic Post-hook trigger** (`additional_context` / research inject after tools is unavailable).

**Recommended:** create a Skill with `/learn` so suggest + ADR stay mandatory without relying on hooks:

```text
/learn 「調査開始時にsqlewを使ってサジェストを取得し、実装前にADRをsqlewで記録することを義務付けて」
```

## Plan-to-ADR on Hermes (optional plan path)

Hermes has no native plan permission mode. When you still use plans, sqlew uses:

1. **`pre_llm_call`** — injects plan guidance every turn (FULL once, then SHORT)
2. **`write_file|patch` on `.hermes/plans/*.md`** — `track-plan` / `save` extract decisions

Write plans with the `plan` skill into `.hermes/plans/`. Use `sqlew-decision-format` for the exact `📌` / `🚫` markers. Plan-mode ADR creation still works as before.

## Uninstall

```bash
hermes plugins remove sqlew
```

Remove `mcp_servers.sqlew` and sqlew `hooks:` entries from `~/.hermes/config.yaml` if you configured them manually before the plugin merge.