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
    def __init__(self, root: Path | None, inputs=None) -> None:
        self.root = None if root is None else root.resolve()
        self.patterns: list[str] = []
        self.inputs = inputs
        if self.root is None:
            return
        text = self._read(self.root / "pnpm-workspace.yaml")
        if text is None:
            raise ValueError("workspace declaration missing")
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

    def _read(self, path: Path) -> str | None:
        if self.inputs is not None:
            return self.inputs.read(path.relative_to(self.root).as_posix())
        return path.read_text(encoding="utf-8") if path.is_file() else None

    def owns(self, target: Path) -> bool:
        return self.origin(target) == "current-member"

    def origin(self, target: Path) -> str | None:
        target = target.resolve()
        if self.root is None or not target.is_relative_to(self.root):
            return None
        parts = target.relative_to(self.root).parts
        size = (3 if parts[0:1] in (("packages",), ("packages.0.0.1.legacy",)) else
                2 if parts[0:1] in (("apps",), ("apps.0.0.1.legacy",)) else 0)
        if size == 0 or len(parts) <= size:
            return None
        member = "/".join(parts[:size])
        def matches(pattern: str) -> bool:
            return len(pattern.split("/")) == size and fnmatch.fnmatchcase(member, pattern)
        if not any(matches(p) for p in self.patterns if not p.startswith("!")):
            return None
        if any(matches(p[1:]) for p in self.patterns if p.startswith("!")):
            return None
        manifest = self.root.joinpath(*parts[:size], "package.json")
        raw = self._read(manifest)
        if raw is None:
            return None
        data = json.loads(raw)
        if not isinstance(data, dict) or not isinstance(data.get("name"), str) or not data["name"]:
            return None
        return "archived-member" if parts[0].endswith(".0.0.1.legacy") else "current-member"
