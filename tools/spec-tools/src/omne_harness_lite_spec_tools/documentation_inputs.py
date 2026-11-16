from __future__ import annotations

import hashlib
from pathlib import Path, PurePosixPath

from .doc_support import navigation_path

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
    resolved = path.resolve().relative_to(root.resolve()).as_posix()
    if any(part in IGNORED for part in PurePosixPath(resolved).parts) or resolved.startswith(
            ".meta_harness/design/record/"):
        raise ValueError(f"temporary/process inventory source: {relative}")
    return path


class Inputs:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.files: dict[str, dict] = {}
        self._identities: dict[str, Path] = {}
        self._navigation: set[str] = set()

    def read_bytes(self, relative: str, *, navigation=False) -> bytes | None:
        path = navigation_path(self.root, self.root / relative) if navigation else safe_path(self.root, relative)
        identity = path.resolve()
        if relative in self._identities and self._identities[relative] != identity:
            raise ValueError(f"input changed actual path: {relative}")
        self._identities[relative] = identity
        if navigation:
            self._navigation.add(relative)
        if path.exists() and not path.is_file():
            raise ValueError(f"inventory input is not a file: {relative}")
        data = path.read_bytes() if path.exists() else None
        record = {"path": relative, "sha256": hashlib.sha256(data).hexdigest()
                  if data is not None else None, "exists": data is not None}
        if relative in self.files and self.files[relative] != record:
            raise ValueError(f"input changed during inventory: {relative}")
        self.files[relative] = record
        return data

    def read(self, relative: str) -> str | None:
        data = self.read_bytes(relative)
        return data.decode("utf-8") if data is not None else None

    def verify(self) -> None:
        for relative in list(self.files):
            self.read_bytes(relative, navigation=relative in self._navigation)
