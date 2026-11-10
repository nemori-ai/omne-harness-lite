from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

from host_layout import HOSTS
from git_environment import REPOSITORY_KEYS
from projection import Artifact, UniqueLoader, hook_groups


def json_artifact(value) -> Artifact:
    return Artifact((json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode(), 0o644)


def project_cursor_package(source: Path) -> dict[Path, Artifact]:
    layout = HOSTS["cursor"]
    root = layout.package
    manifest = {"name": "omne-harness", "version": "0.1.0", "description": "OMNE project skills and loop hooks",
                "skills": "./" + str(layout.skills.relative_to(root))}
    outputs = {}
    declaration = source / "hooks/hooks.yaml"
    if declaration.is_file():
        data = yaml.load(declaration.read_text(encoding="utf-8"), Loader=UniqueLoader)
        if not isinstance(data, dict) or set(data) != {"hooks"} or not isinstance(data["hooks"], list):
            raise ValueError("hooks source must contain exactly one hooks list")
        if data["hooks"]:
            outputs.update(cursor_hooks(source / "hooks", data["hooks"]))
            manifest["hooks"] = "./" + str(layout.plugin_hooks.relative_to(root))
    outputs[root / ".cursor-plugin/plugin.json"] = json_artifact(manifest)
    return outputs


def cursor_hooks(source: Path, entries: list) -> dict[Path, Artifact]:
    adapter = yaml.load((source / "cursor.yaml").read_text(encoding="utf-8"), Loader=UniqueLoader)
    if (not isinstance(adapter, dict) or set(adapter) != {"version", "loop_limit", "timeout_grace"}
            or type(adapter["version"]) is not int or adapter["version"] != 1
            or type(adapter["loop_limit"]) is not int or adapter["loop_limit"] < 1
            or type(adapter["timeout_grace"]) is not int or adapter["timeout_grace"] < 1):
        raise ValueError("Cursor hook adapter requires version 1 and positive integer loop_limit/timeout_grace")
    root = HOSTS["cursor"].package
    runtime = root / "runtime"
    outputs = {
        runtime / "cursor-hook.mjs": Artifact(Path(__file__).with_name("cursor-hook.mjs").read_bytes(), 0o644),
    }
    project_hooks, plugin_hooks = {}, {}
    isolate = "unset " + " ".join(REPOSITORY_KEYS) + "; "
    seen = set()
    for entry in entries:
        targets, groups = hook_groups(entry)
        if "cursor" not in targets:
            continue
        events = list(groups)
        identity = entry["id"]
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", identity) or identity in seen:
            raise ValueError(f"Cursor hook id must be unique and portable: {identity}")
        seen.add(identity)
        outputs[runtime / f"{identity}.json"] = json_artifact({**entry, "loop_limit": adapter["loop_limit"]})
        for event in events:
            native = {"Stop": "stop", "SubagentStop": "subagentStop", "SubagentStart": "subagentStart"}[event]
            suffix = f'/runtime/cursor-hook.mjs" {identity} {native}'
            for hooks, prefix in ((project_hooks, f'$(git rev-parse --show-toplevel)/{root.as_posix()}'),
                                  (plugin_hooks, '${CURSOR_PLUGIN_ROOT}')):
                hooks.setdefault(native, []).append({"command": isolate + f'node "{prefix}{suffix}',
                    "timeout": entry["timeout"] + adapter["timeout_grace"], "loop_limit": adapter["loop_limit"]})
    outputs[HOSTS["cursor"].hooks] = json_artifact({"version": 1, "hooks": project_hooks})
    outputs[HOSTS["cursor"].plugin_hooks] = json_artifact({"version": 1, "hooks": plugin_hooks})
    return outputs
