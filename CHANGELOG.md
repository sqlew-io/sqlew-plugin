# Changelog

All notable changes to sqlew-plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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