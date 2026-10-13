from __future__ import annotations

import re
import tomllib
from pathlib import Path

import yaml


class UniqueLoader(yaml.SafeLoader):
    pass


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


def assembly_inputs(source: Path) -> tuple[str, str | None]:
    raw = source_text(source, "assembly.toml", optional=True)
    if not raw:
        return "", None
    data = tomllib.loads(raw)
    if data.keys() - {"shared_prompts", "default_effort"}:
        raise ValueError("assembly.toml: unknown field")
    parts = []
    if "shared_prompts" in data:
        entries = data["shared_prompts"]
        if not isinstance(entries, list) or not entries:
            raise ValueError("assembly: shared_prompts must be a nonempty array")
        collection = source.parent.resolve()
        seen = set()
        for relative in entries:
            if not isinstance(relative, str) or not relative.strip():
                raise ValueError("assembly: shared_prompts entries must be nonempty strings")
            target = (source / relative).resolve()
            if (Path(relative).is_absolute() or not target.is_relative_to(collection)
                    or target == (source / "role.md").resolve() or target.suffix != ".md"):
                raise ValueError("shared prompt must be Markdown within the role collection")
            if target in seen:
                raise ValueError(f"assembly: duplicate shared prompt: {relative}")
            seen.add(target)
            parts.append(source_text(collection, str(target.relative_to(collection))))
    shared = "\n\n".join(parts)
    effort = data.get("default_effort")
    if "default_effort" in data and effort not in ("medium", "high", "xhigh"):
        raise ValueError("default_effort must be medium, high or xhigh")
    return shared, effort


def assemble_prompt(source: Path) -> tuple[str, str | None]:
    core = source_text(source, "role.md")
    shared, effort = assembly_inputs(source)
    return core + ("\n\n" + shared if shared else ""), effort
