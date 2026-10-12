#!/usr/bin/env python3
"""Resolve explicit host strategies into runtime artifacts without writing outputs."""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import NamedTuple

import yaml

from host_layout import HOSTS

IGNORED = {"__pycache__", ".pytest_cache", ".git", ".venv"}
SKILL_TARGETS = {host: layout.skills for host, layout in HOSTS.items()}
ROLE_TARGETS = tuple(HOSTS[host].agents for host in ("codex", "claude-code"))
RUNTIME_EXCLUDES = {"AGENTS.md", "CLAUDE.md", ".design", "evals"}
# Host-neutral hooks become each host's project hook file. Both hosts read the same
# `{"hooks": {<event>: [{"matcher"?, "hooks": [handler]}]}}` shape for these two events.
HOOK_TARGETS = {host: layout.hooks for host, layout in HOSTS.items()}
HOOK_EVENTS = ("Stop", "SubagentStop")
HOOK_FIELDS = {"id", "events", "subagent_types", "command", "timeout"}
# Matchers made only of these characters are exact names on both hosts, never a regex.
AGENT_TYPE = re.compile(r"[A-Za-z0-9_-]+")
SLOT = re.compile(r"\{\{[A-Z][A-Z0-9_]*\}\}")
DEFAULT_RENDERER = (
    Path(__file__).resolve().parents[2]
    / "agents/skills/design-subagents/canonical/scripts/render_pair.py"
)


class Artifact(NamedTuple):
    content: bytes
    mode: int


class UniqueLoader(yaml.SafeLoader):
    """Reject ambiguous frontmatter rather than retaining the last value."""


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in result:
            raise ValueError(f"duplicate or non-string frontmatter key: {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def no_symlinks(path: Path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise ValueError(f"symlink is not a compilation path: {item}")


def source_files(directory: Path):
    for item in sorted(directory.iterdir()):
        if item.name in IGNORED:
            continue
        no_symlinks(item)
        if item.is_dir():
            yield from source_files(item)
        elif item.is_file():
            if item.suffix not in {".pyc", ".pyo"}:
                yield item
        else:
            raise ValueError(f"unsupported source entry: {item}")


def members(area: Path):
    if not area.is_dir():
        raise ValueError(f"missing source collection: {area}")
    for item in sorted(area.iterdir()):
        if item.name in IGNORED:
            continue
        no_symlinks(item)
        if item.is_dir():
            yield item


def validate_skill(text: str, name: str):
    match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", text, re.DOTALL)
    if not match:
        raise ValueError(f"missing skill frontmatter: {name}")
    data = yaml.load(match[1], Loader=UniqueLoader)
    if not isinstance(data, dict):
        raise ValueError(f"skill frontmatter must be a mapping: {name}")
    if (len(name) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)
            or data.get("name") != name):
        raise ValueError(f"skill name must match its portable directory name: {name}")
    if not isinstance(data.get("description"), str) or not data["description"].strip():
        raise ValueError(f"skill description is required: {name}")
    if not text[match.end():].strip():
        raise ValueError(f"skill body is empty: {name}")


def project_skill(skill: Path, host: str) -> dict[Path, Artifact]:
    adapter = skill / "adapters" / host
    strategy_path = adapter / "strategy.yaml"
    strategy = yaml.load(strategy_path.read_text(encoding="utf-8"), Loader=UniqueLoader)
    if not isinstance(strategy, dict) or strategy.keys() - {"version", "host", "skill", "mode", "slots", "reason"}:
        raise ValueError(f"invalid or unknown strategy fields: {strategy_path}")
    if (type(strategy.get("version")) is not int or strategy["version"] != 1
            or strategy.get("host") != host or strategy.get("skill") != skill.name):
        raise ValueError(f"strategy identity/version mismatch: {strategy_path}")
    if strategy.get("mode") == "unsupported":
        reason = strategy.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError(f"unsupported strategy requires a reason: {strategy_path}")
        raise ValueError(f"unsupported skill {skill.name} on {host}: {reason}")
    if strategy.get("mode") != "copy":
        raise ValueError(f"unimplemented strategy mode: {strategy_path}")
    if "reason" in strategy:
        raise ValueError(f"reason is only valid for unsupported mode: {strategy_path}")
    slots = strategy.get("slots", {})
    if not isinstance(slots, dict):
        raise ValueError(f"slots must be a mapping: {strategy_path}")
    replacements = {}
    for token, relative in slots.items():
        if not isinstance(token, str) or not SLOT.fullmatch(token) or not isinstance(relative, str):
            raise ValueError(f"invalid slot declaration: {strategy_path}")
        path = adapter / relative
        if Path(relative).is_absolute() or not path.resolve().is_relative_to(adapter.resolve()):
            raise ValueError(f"slot file escapes adapter: {relative}")
        no_symlinks(path)
        replacements[token] = path.read_text(encoding="utf-8").rstrip("\r\n")
    canonical = skill / "canonical"
    if not (canonical / "SKILL.md").is_file():
        raise ValueError(f"missing canonical SKILL.md: {skill}")
    outputs, used = {}, set()
    for file in source_files(canonical):
        relative = file.relative_to(canonical)
        if any(part in RUNTIME_EXCLUDES for part in relative.parts):
            continue
        content = file.read_bytes()
        if file.suffix == ".md":
            text = content.decode("utf-8")
            tokens = set(SLOT.findall(text))
            missing = tokens - replacements.keys()
            if missing:
                raise ValueError(f"unresolved adapter slots {sorted(missing)}: {file}")
            used.update(tokens)
            text = SLOT.sub(lambda match: replacements[match[0]], text)
            if SLOT.search(text):
                raise ValueError(f"nested/unresolved adapter slot: {file}")
            content = text.encode("utf-8")
        if relative == Path("SKILL.md"):
            validate_skill(content.decode("utf-8"), skill.name)
        mode = 0o755 if file.stat().st_mode & 0o111 else 0o644
        outputs[SKILL_TARGETS[host] / skill.name / relative] = Artifact(content, mode)
    if replacements.keys() - used:
        raise ValueError(f"unused adapter slots: {sorted(replacements.keys() - used)}")
    return outputs


def load_module(path: Path):
    module_spec = importlib.util.spec_from_file_location("meta_harness_role_renderer", path)
    if module_spec is None or module_spec.loader is None:
        raise ValueError(f"cannot load role renderer: {path}")
    module = importlib.util.module_from_spec(module_spec)
    previous = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        sys.path.insert(0, str(path.parent))
        try:
            module_spec.loader.exec_module(module)
        finally:
            sys.path.pop(0)
    finally:
        sys.dont_write_bytecode = previous
    return module


def load_renderer(path: Path):
    module = load_module(path)
    if not callable(getattr(module, "render", None)):
        raise ValueError(f"role renderer must expose render(source): {path}")
    return module.render


def hook_groups(entry, roles: set[str]) -> tuple[list[str], dict]:
    """Validate one hook declaration; return its events and its command handler."""
    hook_id = entry.get("id") if isinstance(entry, dict) else None
    if not isinstance(hook_id, str) or not hook_id.strip():
        raise ValueError(f"every hook needs a non-empty string id: {entry!r}")
    unknown = entry.keys() - HOOK_FIELDS
    if unknown:
        raise ValueError(f"unknown hook fields {sorted(unknown)}: {hook_id}")
    events = entry.get("events")
    if (not isinstance(events, list) or not events or len(set(events)) != len(events)
            or any(event not in HOOK_EVENTS for event in events)):
        raise ValueError(f"hook events must be distinct names from {list(HOOK_EVENTS)}, "
                         f"got {events!r}: {hook_id}")
    command = entry.get("command")
    if not isinstance(command, str) or not command.strip():
        raise ValueError(f"hook command must be a non-empty string: {hook_id}")
    timeout = entry.get("timeout")
    if type(timeout) is not int or timeout <= 0:
        raise ValueError(f"hook timeout must be a positive integer of seconds: {hook_id}")
    types = entry.get("subagent_types")
    if types is not None and (not isinstance(types, list) or not types or any(
            not isinstance(name, str) or not AGENT_TYPE.fullmatch(name) or name not in roles
            for name in types)):
        raise ValueError(f"subagent_types must name existing roles, got {types!r}: {hook_id}")
    handler = {"type": "command", "command": command, "timeout": timeout}
    return events, {"matcher": "|".join(types), "hooks": [handler]} if types else {"hooks": [handler]}


def project_hooks(directory: Path, hosts: tuple[str, ...], roles: set[str]) -> dict[Path, Artifact]:
    """Render `hooks/hooks.yaml` into each selected host's project hook file.

    No `hooks.yaml`, or an empty list, produces nothing. `Stop` takes no matcher on either
    host, so `subagent_types` only narrows `SubagentStop`.
    """
    source = directory / "hooks.yaml"
    if not source.is_file():
        return {}
    data = yaml.load(source.read_text(encoding="utf-8"), Loader=UniqueLoader)
    if not isinstance(data, dict) or set(data) != {"hooks"} or not isinstance(data["hooks"], list):
        raise ValueError(f"hooks source must be a mapping with exactly one list `hooks`: {source}")
    by_event: dict[str, list[dict]] = {}
    seen = set()
    for entry in data["hooks"]:
        events, group = hook_groups(entry, roles)
        if entry["id"] in seen:
            raise ValueError(f"duplicate hook id: {entry['id']}")
        seen.add(entry["id"])
        for event in events:
            by_event.setdefault(event, []).append(
                {"hooks": group["hooks"]} if event == "Stop" else group)
    if not by_event:
        return {}
    text = json.dumps({"hooks": by_event}, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    return {HOOK_TARGETS[host]: Artifact(text.encode("utf-8"), 0o644) for host in hosts}


def compile_sources(source: Path, renderer_path: Path = DEFAULT_RENDERER,
                    hosts: tuple[str, ...] = ("claude-code", "codex")) -> dict[Path, Artifact]:
    no_symlinks(source.absolute())
    source = source.resolve()
    # Validate the entire tree before loading trusted compiler code or producing output.
    list(source_files(source))
    if not hosts or len(set(hosts)) != len(hosts) or set(hosts) - SKILL_TARGETS.keys():
        raise ValueError("select distinct supported hosts")
    outputs = {}

    def add(relative, artifact):
        if not isinstance(relative, Path) or relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"invalid output path: {relative}")
        if relative in outputs:
            raise ValueError(f"duplicate output: {relative}")
        outputs[relative] = artifact

    for skill in members(source / "skills"):
        for host in hosts:
            for relative, artifact in project_skill(skill, host).items():
                add(relative, artifact)

    role_sources = list(members(source / "roles"))
    old_hosts = tuple(host for host in hosts if host != "cursor")
    render = load_renderer(renderer_path) if role_sources and old_hosts else None
    if "cursor" in hosts:
        from cursor_projection import project_cursor_role
        for role in role_sources:
            relative, text = project_cursor_role(role)
            add(relative, Artifact(text.encode("utf-8"), 0o644))
    for role in role_sources if old_hosts else ():
        rendered = render(role)
        if not isinstance(rendered, dict) or len(rendered) != 2:
            raise ValueError(f"role renderer must produce two native files: {role}")
        if {path.parent for path in rendered} != set(ROLE_TARGETS):
            raise ValueError(f"role renderer returned unexpected target directories: {role}")
        for relative, text in rendered.items():
            if not isinstance(text, str):
                raise ValueError(f"role renderer must return text: {relative}")
            host = "codex" if relative.parent == Path(".codex/agents") else "claude-code"
            if host in hosts:
                add(relative, Artifact(text.encode("utf-8"), 0o644))

    hooks = source / "hooks"
    if hooks.exists() and not hooks.is_dir():
        raise ValueError(f"hooks source must be a directory: {hooks}")
    if hooks.is_dir():
        for relative, artifact in project_hooks(hooks, old_hosts, {role.name for role in role_sources}).items():
            add(relative, artifact)
    if "cursor" in hosts:
        from cursor_projection import project_cursor_package
        for relative, artifact in project_cursor_package(source, {role.name for role in role_sources}).items():
            add(relative, artifact)
    return outputs
