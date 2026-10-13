#!/usr/bin/env python3
"""Project explicit host adapters into a non-overwriting staging root."""
from __future__ import annotations

import argparse
import stat
import sys
from pathlib import Path

import yaml

from host_layout import HOSTS
from projection import Artifact, DEFAULT_RENDERER, compile_sources, no_symlinks


def deliver(outputs: dict[Path, Artifact], output: Path, check=False, directories=()):
    no_symlinks(output.absolute())
    root = output.resolve()
    targets = []
    for relative in directories:
        directory = root / relative
        no_symlinks(directory)
        if directory.exists() and not directory.is_dir():
            raise ValueError(f"output parent is not a directory: {directory}")
        for parent in directory.parents:
            if parent.exists() and not parent.is_dir():
                raise ValueError(f"output parent is not a directory: {parent}")
        if check and not directory.is_dir():
            raise ValueError(f"missing generated directory: {relative}")
    for relative, artifact in outputs.items():
        target = root / relative
        no_symlinks(target)
        if relative.is_absolute() or not target.resolve().is_relative_to(root):
            raise ValueError(f"output escapes staging root: {relative}")
        existed = target.exists()
        if existed:
            if (not target.is_file() or target.read_bytes() != artifact.content
                    or stat.S_IMODE(target.stat().st_mode) != artifact.mode):
                raise ValueError(f"output differs; use a fresh staging directory: {relative}")
        elif check:
            raise ValueError(f"missing generated file: {relative}")
        for parent in target.parents:
            if parent.exists() and not parent.is_dir():
                raise ValueError(f"output parent is not a directory: {parent}")
        targets.append((target, artifact, existed))
    if check:
        return
    for relative in directories:
        (root / relative).mkdir(parents=True, exist_ok=True)
    for target, artifact, existed in targets:
        if not existed:
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as handle:
                handle.write(artifact.content)
            target.chmod(artifact.mode)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Shared agents source root")
    parser.add_argument("--output", required=True, type=Path, help="Explicit staging root")
    parser.add_argument("--host", choices=(*HOSTS, "all"), default="all")
    parser.add_argument("--role-renderer", type=Path, default=DEFAULT_RENDERER,
                        help="Trusted Python module providing render(source)")
    parser.add_argument("--check", action="store_true", help="Read-only expected-file comparison")
    args = parser.parse_args(argv)
    try:
        source, output = args.source.resolve(), args.output.resolve()
        if output.is_relative_to(source):
            raise ValueError("output root must not be inside the source")
        hosts = tuple(HOSTS) if args.host == "all" else (args.host,)
        outputs = compile_sources(args.source, args.role_renderer, hosts)
        directories = [directory for host in hosts for directory in HOSTS[host].directories]
        if any(relative.parts[:1] == (".cursor",) for relative in outputs):
            directories.append(Path(".cursor"))
        for relative in (*directories, *outputs):
            target = (output / relative).resolve()
            if source.is_relative_to(target) or target.is_relative_to(source):
                raise ValueError("generated paths must not overlap the source")
        deliver(outputs, args.output, args.check, directories)
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    action = "checked" if args.check else "staged"
    print(f"PASS: {action} {len(outputs)} files for {args.host}; host loading and model behavior not tested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
