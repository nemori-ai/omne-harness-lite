#!/usr/bin/env python3
"""Check repository-wide Markdown navigation and the generated Codex/Claude skill mirrors.

This checker validates links and mirrors, not behavior, acceptance or model results.
"""
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

import yaml
from .doc_support import headings, local_target, markdown_links, repository_root, validate_link
from .git_environment import repository_env

ROOTS = ("README.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", "docs", "packages", "apps",
         "tools", "scripts", ".agents", ".claude", ".codex", ".meta_harness")
IGNORED_DIRECTORIES = {".git", ".venv", "node_modules", ".dist", "dist", "build",
                       "__pycache__", ".pytest_cache", "tmp", ".worktrees",
                       "packages.0.0.1.legacy", "apps.0.0.1.legacy"}


def _git(root: Path, *args: str, stdin: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", "-C", str(root), *args], env=repository_env(os.environ),
                          input=stdin, capture_output=True, text=True, encoding="utf-8")


def ignored_directories(root: Path) -> set[str]:
    """Root-relative POSIX paths of directories that Git ignores; empty outside a checkout root.

    Two steps, as in `tools/repo-toolchain/src/core/git.ts`: list the candidate directories,
    then let `git check-ignore` confirm each one. Only confirmed directories are skipped.
    """
    top = _git(root, "rev-parse", "--show-toplevel")
    if top.returncode != 0 or Path(top.stdout.strip()).resolve() != root:
        return set()
    listed = _git(root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z")
    if listed.returncode != 0:
        raise ValueError(f"git ls-files failed: {listed.stderr.strip()}")
    candidates = [path for path in listed.stdout.split("\x00") if path.endswith("/")]
    if not candidates:
        return set()
    checked = _git(root, "check-ignore", "--stdin", "-z", stdin="\x00".join(candidates))
    if checked.returncode == 1:  # Exit 1 means "none matched", not a failure.
        return set()
    if checked.returncode != 0:
        raise ValueError(f"git check-ignore failed: {checked.stderr.strip()}")
    return {path.rstrip("/") for path in checked.stdout.split("\x00") if path}


def collect(root: Path) -> list[Path]:
    files: list[Path] = []
    ignored = ignored_directories(root)
    for name in ROOTS:
        path = root / name
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            for directory, children, names in os.walk(path):
                children[:] = [child for child in children if child not in IGNORED_DIRECTORIES
                              and not child.endswith(".legacy")
                              and (Path(directory) / child).relative_to(root).as_posix() not in ignored
                              and (Path(directory) / child).resolve() != (root / ".meta_harness/design/record").resolve()]
                files.extend(Path(directory) / name for name in names if name.endswith(".md"))
    # `.templates/` holds placeholders such as `{{YYYY-MM-DD-topic}}.md`; they are meant to be
    # filled in when a topic is created, so they cannot resolve where they sit.
    return [p for p in files
            if ".templates" not in p.parts]


def mirror_files(root: Path) -> set[Path]:
    files: set[Path] = set()
    for directory, children, names in os.walk(root):
        children[:] = [child for child in children if not child.endswith(".legacy")]
        files.update((Path(directory) / name).relative_to(root) for name in names
                     if (Path(directory) / name).is_file())
    return files


def check_skill_mirrors(root: Path, errors: list[str]) -> None:
    left, right = root / ".agents/skills", root / ".claude/skills"
    if not left.is_dir() and not right.is_dir():
        return  # A checkout without compiled agent artefacts has nothing to mirror.
    if not left.is_dir() or not right.is_dir():
        errors.append("only one of the generated skill directories exists; run the agent compiler")
        return
    left_files = mirror_files(left)
    right_files = mirror_files(right)
    if left_files != right_files:
        errors.append("Codex/Claude skill inventory differs")
    for relative in sorted(left_files & right_files):
        if (left / relative).read_bytes() != (right / relative).read_bytes():
            errors.append(f"skill mirror differs: {relative}")



def check(root: Path):
    errors: list[str] = []
    record = root / ".meta_harness/design/record"
    repository = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"],
                                env=repository_env(os.environ),
                                capture_output=True, text=True, encoding="utf-8")
    if repository.returncode == 0 and Path(repository.stdout.strip()).resolve() == root:
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--", ".meta_harness/design/record"],
                                 env=repository_env(os.environ),
                                 capture_output=True, text=True, encoding="utf-8", check=True)
        if tracked.stdout.strip():
            errors.append("process record files must not be tracked in Git")
    files = collect(root)
    for path in sorted(files):
        for raw in markdown_links(path):
            try:
                target, fragment = local_target(path, raw, root)
                if target is not None and target.resolve().is_relative_to(record.resolve()):
                    raise ValueError("process record is not a current owner")
                validate_link(path, raw, root)
            except ValueError as error:
                errors.append(f"{path.relative_to(root)}: {error}")
    check_skill_mirrors(root, errors)
    return errors, len(files)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="Checkout to inspect; otherwise discover from cwd")
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve() if args.root else repository_root()
        errors, count = check(root)
    except (OSError, ValueError, yaml.YAMLError) as error:
        errors, count = [str(error)], 0
    for error in errors:
        print(f"ERROR: {error}")
    if not errors:
        print(f"PASS: {count} Markdown files; local links and skill mirrors.")
    print("NOTE: Navigation and mirror consistency do not establish semantic correctness.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
