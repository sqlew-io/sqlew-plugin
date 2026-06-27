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

## Plan-to-ADR on Hermes

Hermes has no native plan permission mode. sqlew uses:

1. **`pre_llm_call`** — injects plan guidance every turn (FULL once, then SHORT)
2. **`write_file|patch` on `.hermes/plans/*.md`** — `track-plan` / `save` extract decisions

Write plans with the `plan` skill into `.hermes/plans/`. Use `sqlew-decision-format` for the exact `📌` / `🚫` markers.

## Uninstall

```bash
hermes plugins remove sqlew
```

Remove `mcp_servers.sqlew` and sqlew `hooks:` entries from `~/.hermes/config.yaml` if you configured them manually before the plugin merge.