#!/usr/bin/env python3
"""Project explicit host adapters into a staging root.

Every path the sources produce belongs to this tool, and so do the host skill directories:
delivery replaces drifted files and deletes what the sources no longer produce under the
skill directories and in retired directories. Paths the sources do not produce outside those
directories (files a host writes beside them) are never read, replaced, or deleted.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

import yaml

from host_layout import HOSTS, RETIRED
from projection import Artifact, compile_sources, file_mode, no_symlinks


def stale_paths(root: Path, outputs, directories, retired) -> list[Path]:
    """Entries under the owned directories that the sources do not produce, plus retired ones."""
    keep = {parent for relative in outputs for parent in (relative, *relative.parents)}
    stale = [relative for relative in retired if (root / relative).exists() or (root / relative).is_symlink()]
    for relative in directories:
        base = root / relative
        if not base.is_dir():
            continue
        for current, dirnames, filenames in os.walk(base):
            here = Path(current).relative_to(root)
            stale.extend(here / name for name in sorted(dirnames) if here / name not in keep)
            dirnames[:] = [name for name in dirnames if here / name in keep]
            stale.extend(here / name for name in sorted(filenames) if here / name not in keep)
    return stale


def remove(path: Path):
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def replace(target: Path, artifact: Artifact):
    staged = target.with_name(f".{target.name}.staged")
    with staged.open("xb") as handle:
        handle.write(artifact.content)
    staged.chmod(artifact.mode)
    os.replace(staged, target)


def deliver(outputs: dict[Path, Artifact], output: Path, check=False, directories=(), owned=(), retired=()):
    no_symlinks(output.absolute())
    root = output.resolve()
    targets = []
    problems = []
    for relative in directories:
        directory = root / relative
        no_symlinks(directory)
        if directory.exists() and not directory.is_dir():
            raise ValueError(f"output parent is not a directory: {directory}")
        for parent in directory.parents:
            if parent.exists() and not parent.is_dir():
                raise ValueError(f"output parent is not a directory: {parent}")
        if check and not directory.is_dir():
            problems.append(f"missing generated directory: {relative}")
    for relative, artifact in outputs.items():
        target = root / relative
        no_symlinks(target)
        if relative.is_absolute() or not target.resolve().is_relative_to(root):
            raise ValueError(f"output escapes staging root: {relative}")
        existed = target.exists()
        drifted = existed and (not target.is_file() or target.read_bytes() != artifact.content
                               or file_mode(target) != artifact.mode)
        if drifted and check:
            problems.append(f"output differs; regenerate: {relative}")
        elif drifted and not target.is_file():
            raise ValueError(f"generated path is not a file: {relative}")
        if not existed and check:
            problems.append(f"missing generated file: {relative}")
        for parent in target.parents:
            if parent.exists() and not parent.is_dir():
                raise ValueError(f"output parent is not a directory: {parent}")
        targets.append((target, artifact, existed, drifted))
    stale = stale_paths(root, outputs, owned, retired)
    for relative in stale:
        no_symlinks((root / relative).parent)
    if check:
        problems.extend(f"stale generated path: {relative}" for relative in stale)
        if problems:
            raise ValueError("\n".join(problems))
        return
    for relative in stale:
        remove(root / relative)
    for relative in directories:
        (root / relative).mkdir(parents=True, exist_ok=True)
    for target, artifact, existed, drifted in targets:
        if drifted:
            replace(target, artifact)
        elif not existed:
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as handle:
                handle.write(artifact.content)
            target.chmod(artifact.mode)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Shared agents source root")
    parser.add_argument("--output", required=True, type=Path, help="Explicit staging root")
    parser.add_argument("--host", choices=(*HOSTS, "all"), default="all")
    parser.add_argument("--check", action="store_true", help="Read-only expected-file comparison")
    args = parser.parse_args(argv)
    try:
        source, output = args.source.resolve(), args.output.resolve()
        if output.is_relative_to(source):
            raise ValueError("output root must not be inside the source")
        hosts = tuple(HOSTS) if args.host == "all" else (args.host,)
        outputs = compile_sources(args.source, hosts)
        owned = [directory for host in hosts for directory in HOSTS[host].directories]
        directories = list(owned)
        if any(relative.parts[:1] == (".cursor",) for relative in outputs):
            directories.append(Path(".cursor"))
        retired = [directory for host in hosts for directory in RETIRED[host]]
        for relative in (*directories, *retired, *outputs):
            target = (output / relative).resolve()
            if source.is_relative_to(target) or target.is_relative_to(source):
                raise ValueError("generated paths must not overlap the source")
        deliver(outputs, args.output, args.check, directories, owned, retired)
    except (OSError, ValueError, yaml.YAMLError) as error:
        for line in str(error).splitlines():
            print(f"ERROR: {line}", file=sys.stderr)
        return 1
    action = "checked" if args.check else "staged"
    print(f"PASS: {action} {len(outputs)} files for {args.host}; host loading and model behavior not tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
