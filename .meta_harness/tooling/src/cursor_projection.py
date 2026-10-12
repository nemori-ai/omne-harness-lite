from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

from host_layout import HOSTS
from cursor_qualification import require_qualification
from projection import Artifact, DEFAULT_RENDERER, UniqueLoader, hook_groups, load_module


def json_artifact(value) -> Artifact:
    return Artifact((json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode(), 0o644)


def cursor_role_prompt(source: Path) -> str:
    shared = load_module(DEFAULT_RENDERER.with_name("role_source.py"))
    core, _ = shared.assemble_prompt(source)
    common = shared.source_text(source.parent, "cursor-adaptation.md", optional=True)
    overlay = shared.source_text(source, "cursor-adaptation.md", optional=True)
    return core + ("\n\n" + common if common else "") + ("\n\n" + overlay if overlay else "")


def project_cursor_role(source: Path) -> tuple[Path, str]:
    shared = load_module(DEFAULT_RENDERER.with_name("role_source.py"))
    required_string, source_text = shared.required_string, shared.source_text

    config = yaml.load(source_text(source, "cursor.yaml"), Loader=UniqueLoader)
    fields = {"name", "description", "model", "readonly", "is_background"}
    if not isinstance(config, dict) or set(config) != fields:
        raise ValueError(f"cursor.yaml must contain exactly native fields {sorted(fields)}: {source}")
    name = required_string(config, "name", "cursor")
    if name != source.name or not re.fullmatch(r"[a-z]+(?:-[a-z]+)*", name):
        raise ValueError("cursor role name must match its portable source directory")
    required_string(config, "description", "cursor")
    model = required_string(config, "model", "cursor")
    support = json.loads((DEFAULT_RENDERER.parent.parent / "references/model-support.json").read_text())
    if model not in {entry["id"] for entry in support["cursor"]["models"]}:
        raise ValueError(f"cursor: model lacks bundled host-support evidence: {model}")
    for field in ("readonly", "is_background"):
        if type(config[field]) is not bool:
            raise ValueError(f"cursor: {field} must be a boolean")
    prompt = cursor_role_prompt(source)
    qualification = require_qualification(source, (source / "cursor.yaml").read_bytes(), prompt)
    # CLI 2026.08.04-aaa8809 parses frontmatter one scalar line at a time.
    front = yaml.safe_dump(config, allow_unicode=True, sort_keys=False, width=100000).rstrip()
    return (HOSTS["cursor"].agents / f"{name}.md",
            "---\n" + front + "\n---\n\n" + prompt + qualification + "\n")


def project_cursor_package(source: Path, roles: set[str]) -> dict[Path, Artifact]:
    layout = HOSTS["cursor"]
    root = layout.package
    manifest = {"name": "omne-harness", "version": "0.1.0", "description": "OMNE project skills, roles and loop hooks",
                "skills": "./" + str(layout.skills.relative_to(root)),
                "agents": "./" + str(layout.agents.relative_to(root))}
    outputs = {}
    declaration = source / "hooks/hooks.yaml"
    if declaration.is_file():
        data = yaml.load(declaration.read_text(), Loader=UniqueLoader)
        if not isinstance(data, dict) or set(data) != {"hooks"} or not isinstance(data["hooks"], list):
            raise ValueError("hooks source must contain exactly one hooks list")
        if data["hooks"]:
            outputs.update(cursor_hooks(source / "hooks", data["hooks"], roles))
            manifest["hooks"] = "./" + str(layout.plugin_hooks.relative_to(root))
    outputs[root / ".cursor-plugin/plugin.json"] = json_artifact(manifest)
    return outputs


def cursor_hooks(source: Path, entries: list, roles: set[str]) -> dict[Path, Artifact]:
    adapter = yaml.load((source / "cursor.yaml").read_text(), Loader=UniqueLoader)
    if (not isinstance(adapter, dict) or set(adapter) != {"version", "loop_limit", "timeout_grace"}
            or type(adapter["version"]) is not int or adapter["version"] != 1
            or type(adapter["loop_limit"]) is not int or adapter["loop_limit"] < 1
            or type(adapter["timeout_grace"]) is not int or adapter["timeout_grace"] < 1):
        raise ValueError("Cursor hook adapter requires version 1 and positive integer loop_limit/timeout_grace")
    root = HOSTS["cursor"].package
    runtime = root / "runtime"
    outputs = {runtime / "cursor-hook.mjs": Artifact(Path(__file__).with_name("cursor-hook.mjs").read_bytes(), 0o644)}
    project_hooks, plugin_hooks = {}, {}
    seen = set()
    for entry in entries:
        events, _ = hook_groups(entry, roles)
        identity = entry["id"]
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", identity) or identity in seen:
            raise ValueError(f"Cursor hook id must be unique and portable: {identity}")
        seen.add(identity)
        outputs[runtime / f"{identity}.json"] = json_artifact({**entry, "loop_limit": adapter["loop_limit"]})
        for event in events:
            native = {"Stop": "stop", "SubagentStop": "subagentStop"}[event]
            suffix = f'/runtime/cursor-hook.mjs" {identity} {native}'
            for hooks, prefix in ((project_hooks, f'$(git rev-parse --show-toplevel)/{root.as_posix()}'),
                                  (plugin_hooks, '${CURSOR_PLUGIN_ROOT}')):
                hooks.setdefault(native, []).append({"command": f'node "{prefix}{suffix}',
                    "timeout": entry["timeout"] + adapter["timeout_grace"], "loop_limit": adapter["loop_limit"]})
    outputs[HOSTS["cursor"].hooks] = json_artifact({"version": 1, "hooks": project_hooks})
    outputs[HOSTS["cursor"].plugin_hooks] = json_artifact({"version": 1, "hooks": plugin_hooks})
    return outputs
