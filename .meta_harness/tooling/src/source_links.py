"""Explicit module ownership for current maintained sources."""
from __future__ import annotations

import fnmatch
import json
import re
from pathlib import Path, PurePosixPath


def relative_file(root: Path, value: object) -> Path:
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError("expected a nonempty relative file path")
    parts = PurePosixPath(value)
    if parts.is_absolute() or parts.as_posix() != value or any(p in (".", "..") for p in parts.parts):
        raise ValueError(f"invalid relative file path: {value}")
    target = (root / value).resolve()
    if not target.is_relative_to(root):
        raise ValueError(f"file escapes its declared root: {value}")
    return target


class ModuleSources:
    def __init__(self, root: Path | None) -> None:
        self.root = None if root is None else root.resolve()
        self.patterns: list[str] = []
        if self.root is None:
            return
        text = (self.root / "pnpm-workspace.yaml").read_text(encoding="utf-8")
        # The adopted workspace uses a block list. Unsupported declarations fail closed.
        block = re.search(r"(?m)^packages:\s*\n((?:[ \t]+[^\n]*\n|\n)+)", text)
        if block is None:
            raise ValueError("source-root has no supported workspace packages block list")
        for line in block.group(1).splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            match = re.fullmatch(r"\s+-\s+(['\"]?)([A-Za-z0-9_/*.!-]+)\1\s*", line)
            if match is None:
                raise ValueError("unsupported workspace member declaration")
            self.patterns.append(match.group(2))

    def owns(self, target: Path) -> bool:
        if self.root is None or not target.is_relative_to(self.root):
            return False
        parts = target.relative_to(self.root).parts
        size = 3 if parts[0:1] == ("packages",) else 2 if parts[0:1] == ("apps",) else 0
        if size == 0 or len(parts) <= size:
            return False
        member = "/".join(parts[:size])
        def matches(pattern: str) -> bool:
            return len(pattern.split("/")) == size and fnmatch.fnmatchcase(member, pattern)
        if not any(matches(p) for p in self.patterns if not p.startswith("!")):
            return False
        if any(matches(p[1:]) for p in self.patterns if p.startswith("!")):
            return False
        manifest = self.root.joinpath(*parts[:size], "package.json")
        if not manifest.is_file() or not manifest.resolve().is_relative_to(self.root):
            return False
        data = json.loads(manifest.read_text(encoding="utf-8"))
        return isinstance(data, dict) and isinstance(data.get("name"), str) and bool(data["name"])
