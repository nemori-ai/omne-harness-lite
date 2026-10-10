"""Load inventory bindings and freeze all inspected local inputs."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath

from jsonschema import Draft202012Validator

from .doc_support import headings

SCHEMA_PATH = Path(__file__).parent / "formats/documentation-bindings.schema.json"
IGNORED = {".git", ".venv", "node_modules", "dist", "build", "__pycache__",
           ".pytest_cache", "tmp", ".worktrees", ".templates"}


def safe_path(root: Path, relative: str) -> Path:
    parts = PurePosixPath(relative).parts
    if (not parts or PurePosixPath(relative).as_posix() != relative
            or any(ord(char) < 32 for char in relative)
            or relative.startswith("/") or "\\" in relative or ":" in relative
            or ".." in parts or any(part in IGNORED for part in parts)
            or relative.startswith(".meta_harness/design/record/")):
        raise ValueError(f"invalid inventory source path: {relative}")
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"inventory path escapes root: {relative}")
    # Reject aliases into temporary/process materials even when the link stays inside root.
    resolved = path.resolve().relative_to(root.resolve()).as_posix()
    if any(part in IGNORED for part in PurePosixPath(resolved).parts) or resolved.startswith(
            ".meta_harness/design/record/"):
        raise ValueError(f"temporary/process inventory source: {relative}")
    return path


class Inputs:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.files: dict[str, dict] = {}

    def read(self, relative: str) -> str | None:
        path = safe_path(self.root, relative)
        if path.exists() and not path.is_file():
            raise ValueError(f"inventory input is not a file: {relative}")
        data = path.read_bytes() if path.exists() else None
        record = {"path": relative, "sha256": hashlib.sha256(data).hexdigest()
                  if data is not None else None, "exists": data is not None}
        if relative in self.files and self.files[relative] != record:
            raise ValueError(f"input changed during inventory: {relative}")
        self.files[relative] = record
        return data.decode("utf-8") if data is not None else None

    def source(self, reference: dict) -> None:
        path = reference["path"]
        if self.read(path) is None:
            raise ValueError(f"required basis source missing: {path}")
        headings.cache_clear()
        if reference.get("anchor") and reference["anchor"] not in headings(
                safe_path(self.root, path)):
            raise ValueError(f"required basis anchor missing: {path}#{reference['anchor']}")

    def verify(self) -> None:
        for relative in list(self.files):
            self.read(relative)


def discover(root: Path) -> list[str]:
    result = ["docs/documentation.json"]
    for prefix in ("docs/domains", "packages", "apps", "tools"):
        for directory, children, files in os.walk(root / prefix):
            children[:] = sorted(child for child in children if child not in IGNORED
                                 and not (Path(directory) / child).is_symlink())
            if "documentation.json" in files:
                result.append((Path(directory) / "documentation.json").relative_to(root).as_posix())
    return sorted(set(result))


def load(inputs: Inputs, registries: list[str]) -> tuple[list[dict], str]:
    schema_bytes = SCHEMA_PATH.read_bytes()
    schema = json.loads(schema_bytes)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    documents, ids, paths, owners = [], set(), set(), set()
    for registry in registries:
        raw = inputs.read(registry)
        if raw is None:
            raise ValueError(f"registry missing: {registry}")
        value = json.loads(raw)
        errors = sorted(validator.iter_errors(value), key=lambda e: str(list(e.path)))
        if errors:
            raise ValueError(f"registry {registry}: {errors[0].message}")
        owner = value["owner"]
        if owner["id"] in owners:
            raise ValueError(f"duplicate owner id: {owner['id']}")
        owners.add(owner["id"])
        inputs.source(owner["source"])
        for document in value["documents"]:
            identity = (owner["id"], document["id"])
            target = safe_path(inputs.root, document["path"]).resolve()
            if identity in ids or target in paths:
                raise ValueError(f"duplicate document identity/path: {identity}")
            ids.add(identity)
            paths.add(target)
            if not document["path"].endswith(".md"):
                raise ValueError(f"Markdown target required: {document['path']}")
            section_ids = [item["id"] for item in document["requiredSections"]]
            anchors = [item["anchor"] for item in document["requiredSections"]]
            if len(set(section_ids)) != len(section_ids) or len(set(anchors)) != len(anchors):
                raise ValueError(f"duplicate section identity/anchor: {identity}")
            inputs.source(document["expectationSource"])
            if "gapAllowanceSource" in document:
                inputs.source(document["gapAllowanceSource"])
            documents.append({**document, "owner": owner, "registry": registry})
    return documents, hashlib.sha256(schema_bytes).hexdigest()
