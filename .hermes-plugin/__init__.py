"""sqlew Hermes plugin — wires MCP, shell hooks, and planning skills.

On register():
  1. Copies bundled skills into ~/.hermes/skills/ (idempotent update).
  2. Merges config-fragment.yaml (mcp_servers + hooks) into ~/.hermes/config.yaml.
  3. Registers shell hooks via Hermes' shell-hook loader.

Requires sqlew >= 5.3.0 globally installed (``npm i -g sqlew``).
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any, Dict, List

import yaml

logger = logging.getLogger(__name__)

_SKILL_NAMES = (
    "sqlew-decision-format",
    "sqlew-plan-guidance",
    "sqlew-pr-adr",
)


def _plugin_dir(ctx) -> Path:
    path = getattr(ctx.manifest, "path", None)
    if not path:
        raise RuntimeError("sqlew plugin manifest.path is missing")
    return Path(path)


def _install_skills(plugin_dir: Path) -> None:
    from hermes_constants import get_hermes_home

    src_root = plugin_dir / "skills"
    dest_root = get_hermes_home() / "skills"
    dest_root.mkdir(parents=True, exist_ok=True)

    if not src_root.is_dir():
        logger.warning("sqlew plugin: skills directory missing at %s", src_root)
        return

    for name in _SKILL_NAMES:
        src = src_root / name
        if not src.is_dir():
            logger.warning("sqlew plugin: skill %s not bundled", name)
            continue
        dest = dest_root / name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
        logger.info("sqlew plugin: installed skill %s", name)


def _deep_merge_list(base: List[Any], extra: List[Any], key_fields: tuple[str, ...]) -> List[Any]:
    """Append hook entries that are not already present (match on key_fields)."""
    seen = set()
    for item in base:
        if isinstance(item, dict):
            seen.add(tuple(item.get(k) for k in key_fields))
    for item in extra:
        if not isinstance(item, dict):
            base.append(item)
            continue
        sig = tuple(item.get(k) for k in key_fields)
        if sig not in seen:
            base.append(item)
            seen.add(sig)
    return base


def _merge_hooks(existing: Dict[str, Any], fragment: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    for event, entries in fragment.items():
        if not isinstance(entries, list):
            continue
        current = merged.get(event)
        if not isinstance(current, list):
            merged[event] = list(entries)
            continue
        merged[event] = _deep_merge_list(current, entries, ("matcher", "command"))
    return merged


def _merge_config(plugin_dir: Path) -> None:
    fragment_path = plugin_dir / "config-fragment.yaml"
    if not fragment_path.exists():
        logger.warning("sqlew plugin: config-fragment.yaml missing")
        return

    with open(fragment_path, encoding="utf-8") as f:
        fragment = yaml.safe_load(f) or {}

    from hermes_cli.config import load_config, save_config

    cfg = load_config()

    mcp_fragment = fragment.get("mcp_servers") or {}
    if isinstance(mcp_fragment, dict):
        servers = cfg.get("mcp_servers")
        if not isinstance(servers, dict):
            servers = {}
        for name, spec in mcp_fragment.items():
            if name not in servers:
                servers[name] = spec
        cfg["mcp_servers"] = servers

    hooks_fragment = fragment.get("hooks") or {}
    if isinstance(hooks_fragment, dict):
        hooks = cfg.get("hooks")
        if not isinstance(hooks, dict):
            hooks = {}
        cfg["hooks"] = _merge_hooks(hooks, hooks_fragment)

    save_config(cfg)
    logger.info("sqlew plugin: merged MCP + hooks into Hermes config")


def _register_shell_hooks(ctx) -> None:
    from hermes_cli.config import load_config
    from agent.shell_hooks import register_from_config

    cfg = load_config()
    registered = register_from_config(cfg, accept_hooks=True)
    logger.info("sqlew plugin: registered %d shell hook(s)", len(registered))


def register(ctx) -> None:
    """Hermes plugin entry point."""
    plugin_dir = _plugin_dir(ctx)
    _install_skills(plugin_dir)
    _merge_config(plugin_dir)
    _register_shell_hooks(ctx)