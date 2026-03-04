# sqlew-plugin

Claude Code plugin for [sqlew](https://github.com/sqlew-io/sqlew) - Context sharing MCP server with Plan-to-ADR integration.

## Features

- **Skills**: Auto-triggered guidance for Plan Mode decision/constraint formatting
- **Hooks**: Automatic context suggestion and decision saving

## Installation

### Prerequisites

Install the sqlew MCP server globally:

```bash
npm i -g sqlew
```

### Install Plugin

```bash
# Add the marketplace
claude plugin marketplace add sqlew-io/sqlew-plugin

# Install the plugin
claude plugin install sqlew
```

The plugin automatically configures:
- MCP server settings (`.mcp.json`)
- Claude Code Skills
- Claude Code Hooks

> **Note:** No manual `.mcp.json` editing required!

## Why Use the Plugin?

- **Automatic Setup**: Skills, Hooks, and MCP config are installed automatically
- **Clean Uninstall**: `claude plugin remove sqlew` removes everything cleanly
- **No Project Clutter**: No files left in your project directories

### Local Development

```bash
# Clone this repository
git clone https://github.com/sqlew-io/sqlew-plugin.git

# Install from local path
claude plugin add ./path/to/sqlew-plugin
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
| PreToolUse (Write\|EnterPlanMode) | `sqlew track-plan` | Tracks plan file changes |
| PostToolUse (Edit\|Write) | `sqlew save` | Auto-saves decisions from edited files |
| PostToolUse (TodoWrite) | `sqlew check-completion` | Checks task completion status |
| PostToolUse (ExitPlanMode) | `sqlew on-exit-plan` | Extracts decisions from plan on exit |
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
