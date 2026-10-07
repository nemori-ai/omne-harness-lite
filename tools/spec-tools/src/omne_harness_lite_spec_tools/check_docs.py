#!/usr/bin/env python3
"""Check repository-wide Markdown navigation and the generated Codex/Claude skill mirrors.

Design-chain identities, catalog registrations, frozen versions and formal tasks are checked by
`.meta_harness/tooling/src/check_design.py`; this checker does not duplicate them.
"""
from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

import yaml
from .doc_support import headings, local_target, markdown_links, repository_root, validate_link

ROOTS = ("README.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", "docs", "packages", "apps",
         "tools", "scripts", ".agents", ".claude", ".codex", ".meta_harness")
IGNORED_DIRECTORIES = {".git", ".venv", "node_modules", ".dist", "dist", "build",
                       "__pycache__", ".pytest_cache", "tmp", ".worktrees"}

# Retained originals keep the relative links they were written with, by design: rewriting them
# would falsify the record of what the source actually said. Their own entries explain this.
RETAINED = ("{meta}/design_legacy", "{meta}/research/legacy_backup")

def collect(root: Path) -> list[Path]:
    retained = [root / pattern.format(meta=".meta_harness") for pattern in RETAINED]
    files: list[Path] = []
    for name in ROOTS:
        path = root / name
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            for directory, children, names in os.walk(path):
                children[:] = [child for child in children if child not in IGNORED_DIRECTORIES
                              and (Path(directory) / child).resolve() != (root / ".meta_harness/design/record").resolve()]
                files.extend(Path(directory) / name for name in names if name.endswith(".md"))
    # `.templates/` holds placeholders such as `{{YYYY-MM-DD-topic}}.md`; they are meant to be
    # filled in when a topic is created, so they cannot resolve where they sit.
    return [p for p in files
            if ".templates" not in p.parts
            and not any(p.is_relative_to(area) for area in retained)]


def check_skill_mirrors(root: Path, errors: list[str]) -> None:
    left, right = root / ".agents/skills", root / ".claude/skills"
    if not left.is_dir() and not right.is_dir():
        return  # A checkout without compiled agent artefacts has nothing to mirror.
    if not left.is_dir() or not right.is_dir():
        errors.append("only one of the generated skill directories exists; run the agent compiler")
        return
    left_files = {p.relative_to(left) for p in left.rglob("*") if p.is_file()}
    right_files = {p.relative_to(right) for p in right.rglob("*") if p.is_file()}
    if left_files != right_files:
        errors.append("Codex/Claude skill inventory differs")
    for relative in sorted(left_files & right_files):
        if (left / relative).read_bytes() != (right / relative).read_bytes():
            errors.append(f"skill mirror differs: {relative}")



def check(root: Path):
    errors: list[str] = []
    record = root / ".meta_harness/design/record"
    repository = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"],
                                capture_output=True, text=True)
    if repository.returncode == 0 and Path(repository.stdout.strip()).resolve() == root:
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--", ".meta_harness/design/record"],
                                 capture_output=True, text=True, check=True)
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
    print("NOTE: retained originals are excluded by design; design-chain registrations are checked "
          "by the meta-harness design checker, not here.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
