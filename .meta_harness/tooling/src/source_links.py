"""Explicit module ownership and byte-locked historical link recovery."""
from __future__ import annotations

import fnmatch
import hashlib
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


class RetiredSources:
    def __init__(self, root: Path, manifest: Path) -> None:
        self.root = root
        self.targets: dict[Path, Path] = {}
        self.references: set[tuple[Path, Path, str]] = set()
        if not manifest.exists():
            return
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or set(data) != {"format", "targets", "references"} or type(data["format"]) is not int or data["format"] != 1:
            raise ValueError("invalid retired-sources manifest")
        if not isinstance(data["targets"], list) or not isinstance(data["references"], list):
            raise ValueError("retired sources must contain target and reference lists")
        for row in data["targets"]:
            if not isinstance(row, dict) or set(row) != {"path", "snapshot", "sha256", "commit"}:
                raise ValueError("invalid retired source target")
            target = relative_file(root, row["path"])
            snapshot = relative_file(root, row["snapshot"])
            if not target.is_relative_to(root / "realization") or target.exists() or target in self.targets:
                raise ValueError("retired target is not a unique absent realization source")
            if not snapshot.is_relative_to(root / "record/evidence") or snapshot.suffix != ".txt":
                raise ValueError("historical snapshots must be non-authoritative record/evidence text")
            if not isinstance(row["commit"], str) or re.fullmatch(r"[0-9a-f]{40}", row["commit"]) is None:
                raise ValueError("retired source commit must be an exact object id")
            if hashlib.sha256(snapshot.read_bytes()).hexdigest() != row["sha256"]:
                raise ValueError("retired source snapshot hash differs")
            self.targets[target] = snapshot
        seen: set[Path] = set()
        for row in data["references"]:
            if not isinstance(row, dict) or set(row) != {"source", "sha256", "links"} or not isinstance(row["links"], list):
                raise ValueError("invalid retired source consumer")
            source = relative_file(root, row["source"])
            if not (source.is_relative_to(root / "record") or source.is_relative_to(root / "realization/retired")):
                raise ValueError("only frozen historical consumers can recover retired links")
            if source in seen or hashlib.sha256(source.read_bytes()).hexdigest() != row["sha256"]:
                raise ValueError("historical consumer hash differs or is duplicated")
            seen.add(source)
            for link in row["links"]:
                if not isinstance(link, dict) or set(link) != {"target", "fragment"} or not isinstance(link["fragment"], str):
                    raise ValueError("invalid historical source link")
                target = relative_file(root, link["target"])
                if target not in self.targets:
                    raise ValueError("historical reference has no retired target")
                self.references.add((source, target, link["fragment"]))

    def recover(self, source: Path, target: Path, fragment: str) -> Path | None:
        return self.targets.get(target) if (source, target, fragment) in self.references else None
