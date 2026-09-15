#!/usr/bin/env python3
"""Check navigation, requirement identities, decision provenance and historical hashes."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

import yaml
from .doc_support import (checked_path, digest, format_errors, frontmatter, load_json, repository_root,
                         markdown_links, validate_link)

ROOTS = ("README.md", "CONTRIBUTING.md", "AGENTS.md", "CLAUDE.md", "docs", "spec", "packages", "apps",
         "tools", "scripts", ".agents", ".claude", ".codex", ".meta_harness")
IGNORED_DIRECTORIES = {".git", ".venv", "node_modules", ".dist", "dist", "build",
                       "__pycache__", ".pytest_cache", "tmp", ".worktrees"}


def check_requirements(root: Path, errors: list[str]):
    area = root / "docs/requirements"
    identities, features = {}, {}
    dimensions = ("environment", "user", "agent")
    for section, kind in (("system", "system-requirement"), ("product", "product-feature")):
        for path in sorted((area / section).rglob("*.md")):
            if path.name == "README.md":
                continue
            data = frontmatter(path)
            problems = format_errors("requirement.schema.json", data)
            if problems:
                errors.extend(f"{path.relative_to(root)}: {p}" for p in problems)
                continue
            if data["kind"] != kind:
                errors.append(f"requirement kind disagrees with directory: {path.relative_to(root)}")
                continue
            ids = data["ids"] if section == "system" else [data["id"]]
            for identity in ids:
                if identity in identities:
                    errors.append(f"duplicate requirement id: {identity} in {path.relative_to(root)} "
                                  f"and {identities[identity].relative_to(root)}")
                identities[identity] = path
            if section == "system":
                continue
            primary = data["primary_dimension"]
            secondary = data["secondary_dimensions"]
            if path.relative_to(area / section).parts[0] != primary:
                errors.append(f"requirement primary dimension disagrees with directory: {data['id']}")
            if not path.name.startswith(data["id"] + "-"):
                errors.append(f"requirement filename disagrees with id: {data['id']}")
            if primary in secondary:
                errors.append(f"requirement primary repeated as secondary: {data['id']}")
            features[path] = (data["id"], {primary, *secondary})

    # Check both directions so a stale index cannot silently invent a secondary dimension.
    if not (area / "product").exists():
        return
    for dimension in dimensions:
        index = area / "product" / dimension / "README.md"
        if not index.is_file():
            errors.append(f"missing requirement dimension index: {dimension}")
            continue
        targets = set()
        for raw in markdown_links(index):
            try:
                targets.add(validate_link(index, raw, root))
            except ValueError:
                # The general navigation check reports malformed and broken links.
                continue
        for path, (identity, declared) in features.items():
            if dimension in declared and path not in targets:
                errors.append(f"missing requirement dimension reference: {dimension} -> {identity}")
            elif dimension not in declared and path in targets:
                errors.append(f"undeclared requirement dimension reference: {dimension} -> {identity}")


def check_decisions(root: Path, errors: list[str]):
    graph = {}
    for path in sorted((root / "docs/decisions").glob("D-*.md")):
        data = frontmatter(path)
        problems = format_errors("decision.schema.json", data)
        if problems:
            errors.extend(f"{path.relative_to(root)}: {p}" for p in problems)
            continue
        identity = data["id"]
        if not path.name.startswith(identity + "-") and path.name != identity + ".md":
            errors.append(f"decision filename disagrees with id: {identity}")
        if identity in graph:
            errors.append(f"duplicate decision id: {identity}")
        graph[identity] = [entry["id"] for entry in data["supersedes"]]
        eligible = False
        for value in data["sources"]:
            try:
                target = validate_link(path, value, root, local_required=True)
                if target.is_file() and any(target.is_relative_to(root / "docs" / area)
                                             for area in ("proposals", "research")):
                    eligible = True
            except ValueError as error:
                errors.append(f"{identity} source: {error}")
        if not eligible:
            errors.append(f"decision has no proposal/research source: {identity}")
        links = {"acceptance": data["acceptance"]}
        if data["supersedes"]:
            basis = data.get("change_basis", {})
            links.update({key: basis.get(key, "") for key in ("reproduction", "verification")})
        for name, value in links.items():
            try:
                target = validate_link(path, value, root, local_required=True)
                if not target.is_file():
                    raise ValueError("a specific evidence file is required")
            except ValueError as error:
                errors.append(f"{identity} {name}: {error}")
    active, done = set(), set()

    def visit(node):
        if node in active:
            errors.append(f"supersedes cycle: {node}")
            return
        if node in done:
            return
        active.add(node)
        for target in graph[node]:
            if target not in graph:
                errors.append(f"supersedes unknown decision: {node} -> {target}")
            else:
                visit(target)
        active.remove(node)
        done.add(node)

    for node in graph:
        visit(node)


def check_frozen(root: Path, baseline: str | None, errors: list[str]):
    manifest = load_json(root / "spec/frozen.json")
    problems = format_errors("frozen.schema.json", manifest)
    errors.extend(problems)
    if problems:
        return
    expected = dict(manifest["files"])
    if baseline:
        run = subprocess.run(["git", "-C", str(root), "show", f"{baseline}:spec/frozen.json"],
                             capture_output=True, text=True)
        if run.returncode:
            errors.append(f"cannot read frozen baseline: {baseline}")
        else:
            old = json.loads(run.stdout)
            problems = format_errors("frozen.schema.json", old)
            errors.extend(problems)
            if not problems:
                for relative, value in old["files"].items():
                    if manifest["files"].get(relative) != value:
                        errors.append(f"baseline frozen registration changed or removed: {relative}")
                expected.update(old["files"])
    for relative, value in expected.items():
        path = checked_path(root, relative)
        if not path.is_file() or digest(path) != value:
            errors.append(f"frozen file changed: {relative}")


def check_archive(root: Path, errors: list[str]):
    path = root / "spec/archive/ddd-models/manifest.json"
    if not path.exists():
        return
    data = load_json(path)
    problems = format_errors("archive.schema.json", data)
    errors.extend(problems)
    if problems:
        return
    seen, originals = set(), set()
    for item in data["files"]:
        if item["path"] in seen or item["original"] in originals:
            errors.append(f"duplicate archive entry: {item['path']}")
        seen.add(item["path"])
        originals.add(item["original"])
        target = checked_path(path.parent, item["path"])
        if not target.is_file() or digest(target) != item["sha256"]:
            errors.append(f"archived source hash mismatch: {item['path']}")
    actual = {p.relative_to(path.parent).as_posix() for p in (path.parent / "domain").rglob("*") if p.is_file()}
    if actual != seen:
        errors.append("archive inventory differs from historical files")


def check(root: Path, baseline=None):
    errors = []
    files = []
    for name in ROOTS:
        path = root / name
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            for directory, children, names in os.walk(path):
                children[:] = [name for name in children if name not in IGNORED_DIRECTORIES]
                files.extend(Path(directory) / name for name in names if name.endswith(".md"))
    # Historical sources retain their original relative links. Outer indexes are current.
    files = [p for p in files if not p.is_relative_to(root / "spec/archive/ddd-models/domain")]
    for path in sorted(files):
        for raw in markdown_links(path):
            try:
                validate_link(path, raw, root)
            except ValueError as error:
                errors.append(f"{path.relative_to(root)}: {error}")
    check_requirements(root, errors)
    check_decisions(root, errors)
    left, right = root / ".agents/skills", root / ".claude/skills"
    left_files = {p.relative_to(left) for p in left.rglob("*") if p.is_file()}
    right_files = {p.relative_to(right) for p in right.rglob("*") if p.is_file()}
    if left_files != right_files:
        errors.append("Codex/Claude skill inventory differs")
    for relative in left_files & right_files:
        if (left / relative).read_bytes() != (right / relative).read_bytes():
            errors.append(f"skill mirror differs: {relative}")
    check_frozen(root, baseline, errors)
    check_archive(root, errors)
    return errors, len(files)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="Checkout to inspect; otherwise discover from cwd")
    parser.add_argument("--baseline", help="Git ref whose frozen registrations cannot be removed or changed")
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve() if args.root else repository_root()
        errors, count = check(root, args.baseline)
    except (OSError, ValueError, yaml.YAMLError) as error:
        errors, count = [str(error)], 0
    for error in errors:
        print(f"ERROR: {error}")
    if not errors:
        print(f"PASS: {count} Markdown files; requirement identities/dimensions, decision provenance, "
              "skill mirrors, frozen versions and archive hashes.")
    print("NOTE: structural evidence checks do not establish the sufficiency of causal reasoning.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
