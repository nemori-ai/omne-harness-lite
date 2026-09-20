#!/usr/bin/env python3
"""Copy selected source resources into a new design lineage using explicit rewrites."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath
from typing import Any


class RebaseError(ValueError):
    pass


def checked(root: Path, value: Any, where: str) -> Path:
    if not isinstance(value, str) or not value:
        raise RebaseError(f"{where} must be a non-empty relative path")
    pure = PurePosixPath(value)
    if pure.is_absolute() or ".." in pure.parts or value != pure.as_posix():
        raise RebaseError(f"{where} must be a normalized relative path: {value!r}")
    path = root.joinpath(*pure.parts)
    try:
        path.resolve(strict=False).relative_to(root.resolve())
    except ValueError as error:
        raise RebaseError(f"{where} escapes its root: {value!r}") from error
    return path


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def render(source: bytes, replacements: Any, where: str) -> bytes:
    if not isinstance(replacements, list):
        raise RebaseError(f"{where}.replacements must be an array")
    if not replacements:
        return source
    try:
        text = source.decode("utf-8")
    except UnicodeDecodeError as error:
        raise RebaseError(f"{where} uses text replacements on a non-UTF-8 resource") from error
    for index, raw in enumerate(replacements):
        item_where = f"{where}.replacements[{index}]"
        if not isinstance(raw, dict) or set(raw) != {"from", "to", "count"}:
            raise RebaseError(f"{item_where} must contain exactly from/to/count")
        old, new, count = raw["from"], raw["to"], raw["count"]
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise RebaseError(f"{item_where}.from/to must be strings and from must be non-empty")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise RebaseError(f"{item_where}.count must be a positive integer")
        actual = text.count(old)
        if actual != count:
            raise RebaseError(f"{item_where} expected {count} occurrence(s), found {actual}: {old!r}")
        text = text.replace(old, new)
    return text.encode("utf-8")


def plan(source_root: Path, design_root: Path, manifest_path: Path) -> dict[Path, bytes]:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RebaseError(f"cannot load rebase manifest {manifest_path}: {error}") from error
    if not isinstance(manifest, dict) or manifest.get("format") != 1 or not isinstance(manifest.get("files"), list):
        raise RebaseError("rebase manifest must have format=1 and a files array")
    outputs: dict[Path, bytes] = {}
    sources: set[Path] = set()
    for index, raw in enumerate(manifest["files"]):
        where = f"files[{index}]"
        if not isinstance(raw, dict):
            raise RebaseError(f"{where} must be an object")
        missing = {"source", "target", "source_sha256", "replacements"} - raw.keys()
        if missing:
            raise RebaseError(f"{where} is missing keys: {', '.join(sorted(missing))}")
        source = checked(source_root, raw["source"], f"{where}.source")
        target = checked(design_root, raw["target"], f"{where}.target")
        if source in sources:
            raise RebaseError(f"source appears more than once: {raw['source']}")
        if target in outputs:
            raise RebaseError(f"target collision: {raw['target']}")
        sources.add(source)
        if not source.is_file():
            raise RebaseError(f"source is missing: {raw['source']}")
        content = source.read_bytes()
        expected = raw["source_sha256"]
        if not isinstance(expected, str) or sha(content) != expected:
            raise RebaseError(f"source SHA-256 mismatch: {raw['source']}")
        outputs[target] = render(content, raw["replacements"], where)
    for target, content in outputs.items():
        if target.exists() and (not target.is_file() or target.read_bytes() != content):
            raise RebaseError(f"target exists with different content: {target.relative_to(design_root)}")
    return outputs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--design-root", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--check", action="store_true",
                        help="Verify sources and require every rendered target to already match")
    args = parser.parse_args(argv)
    try:
        outputs = plan(args.source_root.resolve(), args.design_root.resolve(), args.manifest.resolve())
        if args.check:
            missing = [path for path, content in outputs.items()
                       if not path.is_file() or path.read_bytes() != content]
            if missing:
                raise RebaseError("rendered targets are missing: " +
                                  ", ".join(str(path.relative_to(args.design_root.resolve())) for path in missing))
        else:
            for path, content in outputs.items():
                if path.exists():
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
        print(f"PASS: {len(outputs)} explicitly mapped resource(s) {'checked' if args.check else 'rendered'}.")
        return 0
    except (OSError, RebaseError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
