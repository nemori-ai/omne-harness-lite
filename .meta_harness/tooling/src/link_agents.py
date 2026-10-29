#!/usr/bin/env python3
"""Expose compiled meta-harness directories through non-replacing relative symlinks."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from host_layout import HOSTS, project_targets
from projection import CLOUD_RUNTIME, no_symlinks


def directory_links(hosts=tuple(HOSTS)) -> dict[str, tuple[str, ...]]:
    """Directory children that must exist before a host root is linked.

    `.cursor` is one symlink to the whole projection. Its committed Cloud
    Agent files are checked separately, so generated skills are not required
    before Cursor can read the checkout.
    """
    return {
        name: children
        for name, children in project_targets(hosts).items()
        if name != ".cursor"
    }


DIRECTORY_LINKS = directory_links()
FILE_LINKS = {".cursor": CLOUD_RUNTIME}


def _traversable(link: Path) -> bool:
    """Whether a link opens as a directory. Windows answers a file link to a directory with EACCES."""
    try:
        return link.is_dir()
    except OSError:
        return False


def _queue_link(project: Path, name: str, relative: Path, pending: list, check: bool):
    destination = project / name
    if destination.is_symlink():
        if destination.readlink() != relative:
            raise ValueError(f"existing link has another target: {destination}")
        if os.name == "nt" and not _traversable(destination) and (project / relative).is_dir():
            # Git for Windows checks a link out as a file link when its target does not exist yet,
            # and Windows cannot traverse a file link into a directory. Recreate it as a directory link.
            if check:
                raise ValueError(f"project link is a file link to a directory: {destination}")
            destination.unlink()
            pending.append((destination, relative))
    elif destination.exists():
        raise ValueError(f"existing real path; migration is required before linking: {destination}")
    elif check:
        raise ValueError(f"missing project link: {destination}")
    else:
        pending.append((destination, relative))


def link(project: Path, check=False, hosts=tuple(HOSTS)):
    no_symlinks(project.absolute())
    project = project.resolve()
    if not project.is_dir():
        raise ValueError(f"project root does not exist: {project}")
    pending = []
    for name, children in directory_links(hosts).items():
        relative = Path(".meta_harness") / name
        target = project / relative
        no_symlinks(target)
        for child in children:
            no_symlinks(target / child)
            if not (target / child).is_dir():
                raise ValueError(f"missing compiled directory: {relative / child}")
        _queue_link(project, name, relative, pending, check)
    if "cursor" in hosts:
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
