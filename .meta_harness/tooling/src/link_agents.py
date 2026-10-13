#!/usr/bin/env python3
"""Expose compiled meta-harness directories through non-replacing relative symlinks."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from projection import no_symlinks

DIRECTORY_LINKS = {".claude": ("skills", "agents"), ".agents": ("skills",), ".codex": ("agents",)}
FILE_LINKS = {".cursor": ("Dockerfile", "environment.json", "install.sh")}


def _queue_link(project: Path, name: str, relative: Path, pending: list, check: bool):
    destination = project / name
    if destination.is_symlink():
        if destination.readlink() != relative:
            raise ValueError(f"existing link has another target: {destination}")
    elif destination.exists():
        raise ValueError(f"existing real path; migration is required before linking: {destination}")
    elif check:
        raise ValueError(f"missing project link: {destination}")
    else:
        pending.append((destination, relative))


def link(project: Path, check=False):
    no_symlinks(project.absolute())
    project = project.resolve()
    if not project.is_dir():
        raise ValueError(f"project root does not exist: {project}")
    pending = []
    for name, children in DIRECTORY_LINKS.items():
        relative = Path(".meta_harness") / name
        target = project / relative
        no_symlinks(target)
        for child in children:
            no_symlinks(target / child)
            if not (target / child).is_dir():
                raise ValueError(f"missing compiled directory: {relative / child}")
        _queue_link(project, name, relative, pending, check)
    for name, files in FILE_LINKS.items():
        relative = Path(".meta_harness") / name
        target = project / relative
        no_symlinks(target)
        if not target.is_dir():
            raise ValueError(f"missing compiled directory: {relative}")
        for child in files:
            file = target / child
            no_symlinks(file)
            if not file.is_file():
                raise ValueError(f"missing compiled file: {relative / child}")
        _queue_link(project, name, relative, pending, check)
    if not check:
        # Preflight every link first. A concurrent creator still fails rather than being replaced.
        for destination, relative in pending:
            destination.symlink_to(relative, target_is_directory=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Read-only check of the project links")
    args = parser.parse_args(argv)
    try:
        link(args.project_root, args.check)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: relative project links checked." if args.check
          else "PASS: relative project links present; existing paths were not replaced.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
