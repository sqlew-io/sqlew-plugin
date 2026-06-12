# sqlew-plugin

Plugin for [sqlew](https://github.com/sqlew-io/sqlew) — context sharing MCP server with Plan-to-ADR integration. Supports **Claude Code**, **Grok Build** (v5.2+), and **Codex** (v5.2.1+).

## Features

- **Skills**: Auto-triggered guidance for Plan Mode decision/constraint formatting
- **Hooks**: Automatic context suggestion and decision saving

## Installation

### Prerequisites

Install the sqlew MCP server globally:

```bash
npm i -g sqlew
```

### Claude Code

```bash
# Add the marketplace
claude plugin marketplace add sqlew-io/sqlew-plugin

# Install the plugin
claude plugin install sqlew
```

### Grok Build

```bash
grok plugin install sqlew-io/sqlew-plugin --trust
grok plugin update
```

The plugin automatically configures:
- MCP server settings (`.mcp.json`)
- Skills (plan mode guidance, decision format, PR ADR)
- Hooks (plan tracking, decision extraction)

> **Note:** No manual `.mcp.json` or `~/.grok/config.toml` MCP entry required. Do not duplicate hooks in `~/.grok/hooks/`.

### Codex

```bash
npm i -g sqlew
codex plugin marketplace add sqlew-io/sqlew-plugin
codex plugin install sqlew --source sqlew-plugin
```

After install, open `/hooks` in Codex and trust the bundled sqlew hooks.

Enable Plan mode in Codex when needed:

```toml
[features]
collaboration_modes = true
```

The plugin automatically configures:
- MCP server settings (`.mcp.json`)
- Skills (plan mode guidance, decision format, PR ADR)
- Hooks (plan enforcement, PR ADR guard, decision extraction)

> **Note:** Do not manually copy skills into `~/.codex/skills/` or add `[mcp_servers.sqlew]` to `config.toml` when using the plugin (duplicate registration).

## Why Use the Plugin?

- **Automatic Setup**: Skills, Hooks, and MCP config are installed automatically
- **Clean Uninstall**: `claude plugin remove sqlew` removes everything cleanly
- **No Project Clutter**: No files left in your project directories

### Local Development

```bash
git clone https://github.com/sqlew-io/sqlew-plugin.git
cd sqlew-plugin

# Claude Code
claude plugin marketplace add .
claude plugin install sqlew

# Grok Build
grok plugin install . --trust

# Codex
codex plugin marketplace add .
codex plugin install sqlew
```

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `sqlew-decision-format` | Guides Plan Mode decision/constraint formatting with Markdown patterns |
| `sqlew-plan-guidance` | Quick reference for sqlew Plan-to-ADR integration |
| `sqlew-pr-adr` | Enriches PR bodies with ADR context via diff-based decision reverse lookup |

### Hooks

| Event | Action | Description |
|-------|--------|-------------|
| PreToolUse (Task) | `sqlew suggest` | Suggests related decisions before task execution |
| PreToolUse (Write\|EnterPlanMode\|apply_patch) | `sqlew track-plan` | Tracks plan file changes (Grok: injects template into `plan.md`) |
| PreToolUse (Bash\|shell_command\|shell) | `sqlew pr-adr` | Blocks `gh pr create` without ADR markers |
| PostToolUse (ExitPlanMode\|exit_plan_mode) | `sqlew on-exit-plan` | Extracts decisions from plan on exit |
| PostToolUse (Edit\|Write\|apply_patch) | `sqlew save` | Auto-saves decisions from edited files |
| PostToolUse (TodoWrite) | `sqlew check-completion` | Checks task completion status |
| UserPromptSubmit | `sqlew on-prompt` | Injects plan mode enforcement (Claude + Codex) |
| SessionStart | `sqlew on-session-start` | Session startup hooks |
| SubagentStop | `sqlew on-subagent-stop` | Processes subagent results |
| Stop | `sqlew on-stop` / `sqlew on-exit-plan` | Cleanup; Codex plan extraction on stop |

## Uninstallation

```bash
claude plugin remove sqlew
```

## Related

- [sqlew MCP Server](https://github.com/sqlew-io/sqlew) - The MCP server that provides decision/constraint management
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) - Official plugin documentation

## License

Apache-2.0
