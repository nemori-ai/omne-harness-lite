#!/usr/bin/env python3
"""Pin the pqw-skills consumer contract version; read skill text from the newest release that keeps it.

The submodule commit is the floor. Releases with the same contract version are extracted beside it,
outside the tracked tree, so a new pqw-skills release needs no commit here unless the contract changes.
"""
from __future__ import annotations

import argparse
import io
import json
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

VENDOR = Path(".meta_harness/agents/vendor/pqw-skills")
FLOAT = Path(".meta_harness/.vendor-float/pqw-skills")
PINNED = Path(".meta_harness/agents/pqw/contract-version")
CONTRACT = Path("design/consumer-contract.json")
ENTRY = Path("AGENTS.md")
SLOT_SECTION = "## pqw-skills 接入"
CARD_TEMPLATE = Path(".github/ISSUE_TEMPLATE/card.md")
FLOAT_TAG = ".float-tag"


def pinned(project: Path) -> int | None:
    """The contract version this project satisfies, or None when the project does not pin one."""
    path = project / PINNED
    return int(path.read_text(encoding="utf-8").strip()) if path.is_file() else None


def contract(root: Path) -> dict | None:
    path = root / CONTRACT
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def root(project: Path) -> Path:
    """Where pqw-skills is read from: the floated release when it has the pinned contract, else the submodule."""
    floated = contract(project / FLOAT)
    version = pinned(project)
    if floated is not None and version is not None and floated.get("version") == version:
        return project / FLOAT
    return project / VENDOR


def source_root(agents: Path) -> Path:
    """The same choice for a caller that holds the agents source directory (`<project>/.meta_harness/agents`)."""
    return root(agents.parents[1]) if agents.parent.name == ".meta_harness" else agents / "vendor" / VENDOR.name


def _git(vendor: Path, *args: str, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(vendor), *args], capture_output=True, text=text, check=False)


def _newest_release(vendor: Path, version: int) -> str | None:
    """The highest tag that has the pinned contract and is ahead of the submodule commit."""
    for tag in _git(vendor, "tag", "--list", "v*", "--sort=-v:refname").stdout.split():
        shown = _git(vendor, "show", f"{tag}:{CONTRACT.as_posix()}")
        if shown.returncode != 0 or json.loads(shown.stdout).get("version") != version:
            continue
        ahead = _git(vendor, "merge-base", "--is-ancestor", "HEAD", tag).returncode == 0
        same = _git(vendor, "rev-parse", "HEAD").stdout == _git(vendor, "rev-parse", f"{tag}^{{commit}}").stdout
        return tag if ahead and not same else None
    return None


def advance(project: Path, fetch: bool = True) -> str | None:
    """Extract the newest compatible release beside the submodule; return its tag, or None when the submodule is it."""
    vendor, floated, version = project / VENDOR, project / FLOAT, pinned(project)
    if version is None or _git(vendor, "rev-parse", "--git-dir").returncode != 0:
        return None
    if fetch:
        _git(vendor, "fetch", "--tags", "--quiet", "origin")  # offline: keep what is already here
    tag = _newest_release(vendor, version)
    marker = floated / FLOAT_TAG
    if tag is not None and marker.is_file() and marker.read_text(encoding="utf-8") == tag:
        return tag
    shutil.rmtree(floated, ignore_errors=True)
    if tag is None:
        return None
    archive = _git(vendor, "archive", "--format=tar", tag, text=False)
    if archive.returncode != 0:
        raise ValueError(f"cannot read pqw-skills {tag}: {archive.stderr.decode(errors='replace').strip()}")
    floated.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
        tar.extractall(floated, filter="data")
    marker.write_text(tag, encoding="utf-8")
    return tag


def _slots(entry: str) -> list[str]:
    """First-column names of the slot table in the entry file's pqw-skills section."""
    lines = entry.splitlines()
    if SLOT_SECTION not in lines:
        return []
    names = []
    for line in lines[lines.index(SLOT_SECTION) + 1:]:
        if line.startswith("## "):
            break
        if line.startswith("| ") and not line.startswith("| ---"):
            names.append(line.split("|")[1].strip())
    return names[1:]


def problems(project: Path) -> list[str]:
    """Every way the project fails the contract it pins; empty when it satisfies it."""
    version = pinned(project)
    if version is None:
        return [f"missing {PINNED}: write the consumer contract version this project satisfies"]
    floor = contract(project / VENDOR)
    if floor is None:
        return [f"the vendored pqw-skills has no {CONTRACT}; pin a release that has one"]
    found = []
    if floor.get("version") != version:
        found.append(f"the vendored pqw-skills has consumer contract version {floor.get('version')}, "
                     f"the project pins {version} in {PINNED}")
    current = contract(root(project))
    slots = _slots((project / ENTRY).read_text(encoding="utf-8"))
    found += [f"{ENTRY}「pqw-skills 接入」lacks the slot「{slot}」" for slot in current["slots"] if slot not in slots]
    sections = [line[3:].strip() for line in (project / CARD_TEMPLATE).read_text(encoding="utf-8").splitlines()
                if line.startswith("## ")]
    if sections != current["handoffSections"]:
        found.append(f"{CARD_TEMPLATE} has the sections {'、'.join(sections)}; "
                     f"the contract asks for {'、'.join(current['handoffSections'])}")
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Read-only check that the project satisfies the pinned contract")
    parser.add_argument("--offline", action="store_true", help="Do not fetch new release tags")
    args = parser.parse_args(argv)
    project = args.project_root.absolute()
    try:
        if args.check:
            found = problems(project)
            for problem in found:
                print(f"ERROR: {problem}", file=sys.stderr)
            if found:
                return 1
            print(f"PASS: the project satisfies pqw-skills consumer contract version {pinned(project)}.")
            return 0
        tag = advance(project, fetch=not args.offline)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"pqw-skills: reading {tag} (same consumer contract as the pinned commit)." if tag
          else "pqw-skills: reading the pinned commit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
