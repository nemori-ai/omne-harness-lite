"""Executable bits in test fixtures, set where the projection reads them.

POSIX keeps the bit in the file mode. NTFS keeps none, so on Windows `projection.file_mode` reads
the mode from the Git index of the nearest checkout and counts a file outside every index as 0o644.
A fixture that needs an executable file there becomes its own checkout whose index records the bit.
The index entries carry no objects, so the fixture stays removable with `shutil.rmtree`.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from projection import _git_index_modes, file_mode

# For tests that write an executable output into a fresh staging directory and then read its mode.
staged_modes = pytest.mark.skipif(
    os.name != "posix",
    reason="NTFS has no executable bit and Windows reads it only from a Git index; "
           "a new output in a staging directory is in no index, so its mode cannot be read back")


def set_executable(root: Path, *paths: Path, executable: bool = True) -> None:
    """Make `paths` executable (or not) as the projection sees it; `root` is the fixture checkout."""
    if os.name == "posix":
        for path in paths:
            path.chmod(0o755 if executable else 0o644)
        return
    root = root.resolve()
    names = [path.resolve().relative_to(root).as_posix() for path in paths]
    if not (root / ".git").exists():
        subprocess.run(["git", "init", "-q", str(root)], check=True)
    subprocess.run(["git", "-C", str(root), "update-index", "--add", "--info-only",
                    f"--chmod={'+' if executable else '-'}x", "--", *names], check=True)
    _git_index_modes.cache_clear()


def copy_tree(source: Path, destination: Path) -> Path:
    """`shutil.copytree` that keeps the executable bits the projection reads from `source`;
    on Windows `destination` becomes the fixture checkout."""
    copied = Path(shutil.copytree(source, destination))
    if os.name != "posix":
        executables = [copied / file.relative_to(source) for file in source.rglob("*")
                       if file.is_file() and file_mode(file) & 0o111]
        if executables:
            set_executable(copied, *executables)
    return copied
