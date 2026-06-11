# sqlew-plugin

Plugin for [sqlew](https://github.com/sqlew-io/sqlew) — context sharing MCP server with Plan-to-ADR integration. Supports **Claude Code** and **Grok Build** (v5.2+).

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
| PreToolUse (Write\|EnterPlanMode\|enter_plan_mode) | `sqlew track-plan` | Tracks plan file changes (Grok: injects template into `plan.md`) |
| PostToolUse (ExitPlanMode\|exit_plan_mode) | `sqlew on-exit-plan` | Extracts decisions from plan on exit |
| PostToolUse (Edit\|Write) | `sqlew save` | Auto-saves decisions from edited files |
| PostToolUse (TodoWrite) | `sqlew check-completion` | Checks task completion status |
| SubagentStop | `sqlew on-subagent-stop` | Processes subagent results |
| Stop | `sqlew on-stop` | Cleanup on session stop |

## Uninstallation

```bash
claude plugin remove sqlew
```

## Related

- [sqlew MCP Server](https://github.com/sqlew-io/sqlew) - The MCP server that provides decision/constraint management
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) - Official plugin documentation

## License

Apache-2.0
