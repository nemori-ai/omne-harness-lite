#!/usr/bin/env python3
"""Expose compiled meta-harness directories through non-replacing relative symlinks."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from projection import no_symlinks
from host_layout import HOSTS, project_targets

TARGETS = project_targets()


def link(project: Path, check=False, hosts=tuple(HOSTS)):
    no_symlinks(project.absolute())
    project = project.resolve()
    if not project.is_dir():
        raise ValueError(f"project root does not exist: {project}")
    pending = []
    for name, children in project_targets(hosts).items():
        relative = Path(".meta_harness") / name
        target = project / relative
        no_symlinks(target)
        for child in children:
            no_symlinks(target / child)
            if not (target / child).is_dir():
                raise ValueError(f"missing compiled directory: {relative / child}")
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
    if not check:
        for destination, relative in pending:
            destination.symlink_to(relative, target_is_directory=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Read-only check of selected project links")
    parser.add_argument("--host", choices=(*HOSTS, "all"), default="all")
    args = parser.parse_args(argv)
    try:
        link(args.project_root, args.check, tuple(HOSTS) if args.host == "all" else (args.host,))
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("PASS: selected relative project links checked." if args.check
          else "PASS: selected relative project links present; existing paths were not replaced.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
