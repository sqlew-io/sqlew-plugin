# sqlew-plugin

Plugin for [sqlew](https://github.com/sqlew-io/sqlew) — context sharing MCP server with Plan-to-ADR integration. Supports **Claude Code**, **Grok Build** (v5.2+), **Codex** (v5.2.1+), and **Hermes** (v5.3.0+).

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

**Install:**

```bash
claude plugin marketplace add sqlew-io/sqlew-plugin
claude plugin install sqlew
```

**Uninstall:**

```bash
claude plugin remove sqlew
```

### Grok Build

**Install:**

```bash
grok plugin install sqlew-io/sqlew-plugin --trust
grok plugin update
```

Configures MCP (`.mcp.json`), skills, and hooks (plan tracking, decision extraction).

> Do not duplicate hooks in `~/.grok/hooks/` or add `[mcp_servers.sqlew]` to `~/.grok/config.toml`.

**Uninstall:**

```bash
grok plugin remove sqlew
```

### Codex

**Install:**

```bash
codex plugin marketplace add sqlew-io/sqlew-plugin
codex plugin install sqlew --source sqlew-plugin
```

After install, open `/hooks` in Codex and trust the bundled sqlew hooks. Enable Plan mode when needed:

```toml
[features]
collaboration_modes = true
```

> Do not copy skills into `~/.codex/skills/` or add `[mcp_servers.sqlew]` to `config.toml` when using the plugin.

**Uninstall:**

```bash
codex plugin remove sqlew
```

### Hermes (Claude Code / Nous)

Requires sqlew MCP server **>= 5.3.0**. Uses the `.hermes-plugin/` bundle — separate from the Claude/Codex/Grok plugin manifests.

**Install:**

```bash
hermes plugins install sqlew-io/sqlew-plugin/.hermes-plugin
hermes plugins enable sqlew
```

On enable, the bundle registers `mcp_servers.sqlew`, wires shell hooks (`pre_llm_call`, `pre_tool_call`, `post_tool_call`, …), and copies skills to `~/.hermes/skills/`.

Verify:

```bash
hermes hooks list
hermes hooks test pre_tool_call --for-tool terminal
```

> Hermes has no native plan permission mode. Plan guidance is injected every turn via `pre_llm_call`. Plans live in `.hermes/plans/*.md`. See [HERMES_HOOKS.md](https://github.com/sqlew-io/sqlew/blob/main/docs/HERMES_HOOKS.md).

**Uninstall:**

```bash
hermes plugins remove sqlew
```

Removes the plugin from `~/.hermes/plugins/`. Merged `config.yaml` entries and copied skills are not removed automatically — edit `~/.hermes/config.yaml` and delete `~/.hermes/skills/sqlew-*` if you want a full cleanup.

**Local development:**

```bash
hermes plugins install ./.hermes-plugin
```

## Why Use the Plugin?

- **Automatic Setup**: Skills, Hooks, and MCP config are installed per client
- **Clean Uninstall**: Each client has its own remove command (see sections above)
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

# Hermes
hermes plugins install ./.hermes-plugin
hermes plugins enable sqlew
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
| UserPromptSubmit / `pre_llm_call` | `sqlew on-prompt` | Injects plan guidance (Claude, Codex, Hermes) |
| SessionStart | `sqlew on-session-start` | Session startup hooks |
| SubagentStop | `sqlew on-subagent-stop` | Processes subagent results |
| Stop | `sqlew on-stop` / `sqlew on-exit-plan` | Cleanup; Codex plan extraction on stop |

## Version

Current version: **5.3.1** (pairs with sqlew MCP server >= 5.3.0 for Hermes support).

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Related

- [sqlew MCP Server](https://github.com/sqlew-io/sqlew) - The MCP server that provides decision/constraint management
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) - Official plugin documentation

## License

Apache-2.0
