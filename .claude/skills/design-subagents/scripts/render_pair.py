#!/usr/bin/env python3
"""Render a shared role into staged Codex/Claude definitions; never invoke a model."""
from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

import yaml


class UniqueLoader(yaml.SafeLoader):
    """Reject ambiguous YAML mappings instead of silently keeping the last key."""


def unique_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in mapping:
            raise ValueError(f"duplicate or non-string YAML key: {key!r}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def source_text(source: Path, name: str, optional=False) -> str:
    path = source / name
    if not path.resolve().is_relative_to(source.resolve()):
        raise ValueError(f"source file escapes the source directory: {name}")
    if optional and not path.exists() and not path.is_symlink():
        return ""
    content = path.read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError(f"empty source: {name}; omit an unused optional file")
    if re.search(r"\{\{[a-z][a-z0-9_]*\}\}", content):
        raise ValueError(f"unfilled template variable in {name}")
    return content


def required_string(data: dict, key: str, host: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{host}: {key} must be a nonempty string")
    return value


def validate_target(config: dict, host: str, overlay: str, support: dict):
    model = config.get("model")
    aliases = {"inherit", "sonnet", "opus", "haiku", "fable"} if host == "claude_code" else set()
    models = {m["id"]: m for m in support[host]["models"]}
    if model is not None:
        if not isinstance(model, str) or model not in models.keys() | aliases:
            raise ValueError(f"{host}: model lacks bundled host-support evidence: {model!r}")
    if overlay and model not in models:
        raise ValueError(f"{host}: a model adaptation requires an exact supported model, not inheritance/alias")
    effort_key = "model_reasoning_effort" if host == "codex" else "effort"
    if effort_key in config:
        effort = required_string(config, effort_key, host)
        if host == "codex" and model in models and effort not in models[model]["effort_values"]:
            raise ValueError(f"codex: unsupported effort in recorded model evidence: {effort}")


def render(source: Path) -> dict[Path, str]:
    core = source_text(source, "role.md")
    codex_raw = source_text(source, "codex.toml")
    claude_raw = source_text(source, "claude.yaml")
    codex = tomllib.loads(codex_raw)
    claude = yaml.load(claude_raw, Loader=UniqueLoader)
    if not isinstance(claude, dict):
        raise ValueError("claude.yaml must be a frontmatter mapping")
    forbidden_codex = {"developer_instructions", "disallowedTools", "permissionMode", "effort", "maxTurns", "mcpServers"}
    forbidden_claude = {"developer_instructions", "model_reasoning_effort", "sandbox_mode", "mcp_servers"}
    if forbidden_codex & codex.keys():
        raise ValueError(f"codex source contains generated or Claude-only fields: {sorted(forbidden_codex & codex.keys())}")
    if forbidden_claude & claude.keys():
        raise ValueError(f"Claude source contains Codex-only fields: {sorted(forbidden_claude & claude.keys())}")
    if "skills" in codex and not isinstance(codex["skills"], dict):
        raise ValueError("Codex skills configuration is not Claude's preload array")
    if "tools" in codex and not isinstance(codex["tools"], dict):
        raise ValueError("do not copy Claude's tools allowlist into Codex configuration")
    for key in ("name", "description"):
        if required_string(codex, key, "codex") != required_string(claude, key, "claude"):
            raise ValueError(f"paired {key} differs")
    name = codex["name"]
    # A deliberately narrow portable naming convention, not a full host name schema.
    if not re.fullmatch(r"[a-z]+(?:-[a-z]+)*", name):
        raise ValueError("use a portable lowercase hyphenated role name")
    for key in ("tools", "disallowedTools"):
        if key in claude:
            value = claude[key]
            if not (isinstance(value, str) or (isinstance(value, list) and all(isinstance(v, str) for v in value))):
                raise ValueError(f"claude: {key} must contain tool/skill names")
    if "skills" in claude and not (isinstance(claude["skills"], list) and all(isinstance(v, str) for v in claude["skills"])):
        raise ValueError("claude: skills must be an array of skill names")
    if "maxTurns" in claude and (type(claude["maxTurns"]) is not int or claude["maxTurns"] < 1):
        raise ValueError("claude: maxTurns must be a positive integer")
    if "background" in claude and type(claude["background"]) is not bool:
        raise ValueError("claude: background must be a boolean")
    support = json.loads((Path(__file__).resolve().parents[1] / "references/model-support.json").read_text())
    prompts = {}
    for host, filename, config in (("codex", "codex-adaptation.md", codex), ("claude_code", "claude-adaptation.md", claude)):
        overlay = source_text(source, filename, optional=True)
        validate_target(config, host, overlay, support)
        prompts[host] = core + ("\n\n" + overlay if overlay else "") + "\n"
    # Prepend the generated root field so TOML tables in the source keep their scope.
    codex_result = "developer_instructions = " + json.dumps(prompts["codex"], ensure_ascii=False) + "\n" + codex_raw + "\n"
    if tomllib.loads(codex_result) != {**codex, "developer_instructions": prompts["codex"]}:
        raise ValueError("TOML round trip changed the source configuration")
    claude_result = "---\n" + yaml.safe_dump(claude, allow_unicode=True, sort_keys=False).rstrip() + "\n---\n\n" + prompts["claude_code"]
    return {Path(".codex/agents") / f"{name}.toml": codex_result,
            Path(".claude/agents") / f"{name}.md": claude_result}


def deliver(outputs: dict[Path, str], output: Path, check=False):
    root = output.resolve()
    targets = []
    for relative, content in outputs.items():
        target = root / relative
        if target.is_symlink() or not target.resolve().is_relative_to(root):
            raise ValueError(f"output path escapes staging root or is a symlink: {relative}")
        if target.exists():
            if not target.is_file() or target.read_text(encoding="utf-8") != content:
                raise ValueError(f"output differs; compare in a fresh staging directory: {relative}")
        elif check:
            raise ValueError(f"missing generated file: {relative}")
        targets.append((target, content))
    if check:
        return
    # Preflight both paths before any mutation. Exclusive creation never overwrites.
    for target, content in targets:
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("x", encoding="utf-8") as handle:
                handle.write(content)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Read-only comparison with generated outputs")
    args = parser.parse_args(argv)
    try:
        outputs = render(args.source.resolve())
        deliver(outputs, args.output, args.check)
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: paired output syntax and source consistency; host loading, permissions and model behavior not tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
