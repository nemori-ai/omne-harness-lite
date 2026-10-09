"""Check current design navigation and explicit module owners without a contract registry."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote, urlparse

from omne_harness_lite_spec_tools.doc_support import headings, markdown_links
from source_links import ModuleSources


def check_links(root: Path, source_root: Path | None = None) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    for name in ("spec", "realization", "registry"):
        retired = root / name
        if retired.exists() or retired.is_symlink():
            errors.append(f"retired design root exists: {name}")
    try:
        modules = ModuleSources(source_root)
    except (ValueError, OSError, TypeError) as error:
        return [f"source links: {error}"]
    workspace = root.parent if root.name == "design" and root.parent.name == ".meta_harness" else None
    anchors: dict[Path, set[str]] = {}
    for path in sorted(root.rglob("*.md")):
        if ".templates" in path.parts or path.is_relative_to(root / "record"):
            continue
        for value in markdown_links(path):
            parts = urlparse(value)
            if parts.scheme or value.startswith("//"):
                continue
            raw = unquote(parts.path)
            target = (path.parent / raw).resolve() if raw else path.resolve()
            label = f"{path.relative_to(root)}: "
            if target.is_relative_to(root / "record"):
                errors.append(label + f"process record is not a current owner: {value}")
                continue
            try:
                owned = modules.owns(target)
            except (ValueError, OSError, TypeError) as error:
                errors.append(label + f"invalid module owner: {error}")
                continue
            allowed = target.is_relative_to(root) or owned
            if workspace is not None:
                allowed = allowed or any(target.is_relative_to(workspace / name)
                                         for name in ("agents", "research"))
                allowed = allowed or target in (workspace / "README.md", workspace / "AGENTS.md")
            if not allowed:
                errors.append(label + f"link escapes design root: {value}")
            elif not target.is_file():
                errors.append(label + f"broken local link: {value}")
            elif parts.fragment and target.suffix == ".md":
                if target not in anchors:
                    anchors[target] = headings(target)
                if unquote(parts.fragment) not in anchors[target]:
                    errors.append(label + f"missing Markdown anchor: {value}")
    return errors
