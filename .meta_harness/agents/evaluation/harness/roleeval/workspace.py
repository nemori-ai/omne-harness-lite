"""A disposable copy of the repository for one agent run.

Two kinds of paths go into a copy. *Material* paths are what the role is asked to
work on; they come from a pinned commit, so a case stays the same input after the
design tree moves on. *Subject* paths are what is under test together with the role
(skills, criteria pages, tooling); they come from the working tree, which has to be
clean so that the recorded commit says what was run.

Ground truth never enters a copy: the evaluation directory is not a subject path.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


class WorkspaceError(RuntimeError):
    """The copy could not be built as the suite describes it."""


def tree_hash(root: Path) -> str:
    """Content hash of every file under ``root`` outside ``.git``."""
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if relative.parts[0] == ".git" or not path.is_file():
            continue
        digest.update(str(relative).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def git(repo: Path, *args: str) -> str:
    done = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if done.returncode != 0:
        raise WorkspaceError(f"git {' '.join(args)}: {done.stderr.strip()}")
    return done.stdout.strip()


def head(repo: Path) -> str:
    return git(repo, "rev-parse", "HEAD")


def dirty(repo: Path, paths: list[str]) -> list[str]:
    """Tracked or untracked changes under ``paths``, as ``git status`` prints them."""
    return [line for line in git(repo, "status", "--porcelain", "--", *paths).splitlines() if line.strip()]


def is_ancestor(repo: Path, commit: str) -> bool:
    done = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", commit, "HEAD"],
                          capture_output=True, text=True)
    return done.returncode == 0


def build(repo: Path, dest: Path, *, base: str, material_paths: list[str], material_excludes: list[str],
          subject_paths: list[str]) -> None:
    """Material from ``base``, subject from the working tree, into a fresh ``dest``."""
    if dest.exists():
        raise WorkspaceError(f"{dest} already exists; a run never reuses a copy")
    dest.mkdir(parents=True)
    archive = subprocess.Popen(["git", "-C", str(repo), "archive", base, "--", *material_paths], stdout=subprocess.PIPE)
    extract = subprocess.run(["tar", "-x", "-C", str(dest), *[f"--exclude={path}" for path in material_excludes]],
                             stdin=archive.stdout, capture_output=True)
    archive.stdout.close()
    if archive.wait() != 0 or extract.returncode != 0:
        raise WorkspaceError(f"could not extract {material_paths} at {base}: {extract.stderr.decode().strip()}")
    for relative in subject_paths:
        source, target = repo / relative, dest / relative
        if not source.exists():
            raise WorkspaceError(f"subject path {relative} does not exist")
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_dir():
            shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__"), dirs_exist_ok=True)
        else:
            shutil.copyfile(source, target)


def apply(dest: Path, ops: list[dict[str, Any]], *, suite: Path) -> None:
    """Edit the copy: seed defects and present the material as the brief describes it."""
    for op in ops:
        kind = op["op"]
        if kind == "replace":
            target = dest / op["file"]
            text = target.read_text(encoding="utf-8")
            if text.count(op["find"]) != 1:
                raise WorkspaceError(f"{op.get('id', op['file'])}: expected the text to replace exactly once, "
                                     f"found it {text.count(op['find'])} times")
            target.write_text(text.replace(op["find"], op["replace"]), encoding="utf-8")
        elif kind == "copy":
            target = dest / op["to"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(suite / op["from"], target)
        elif kind == "catalog-candidate":
            _candidate(dest / op["registry"], op["contract_id"], op["version"])
        elif kind == "catalog-add-clause":
            _add_clause(dest / op["registry"], op["contract_id"], op["version"], op["dependency"], op["clause"])
        else:
            raise WorkspaceError(f"unknown workspace op {kind!r}")


def commit(dest: Path) -> None:
    """Give the copy a HEAD, so a brief can name 'this checkout's HEAD' as the snapshot under review."""
    git(dest, "init", "-q")
    git(dest, "add", "-A")
    git(dest, "-c", "user.name=dispatcher", "-c", "user.email=dispatcher@invalid", "commit", "-qm",
        "material under review")


def _entry(catalog: dict[str, Any], contract_id: str, version: int) -> dict[str, Any]:
    for item in catalog["contracts"]:
        coordinate = item["coordinate"]
        if coordinate["contract_id"] == contract_id and coordinate["version"] == version:
            return item
    raise WorkspaceError(f"coordinate {contract_id} v{version} is not in the catalog")


def _candidate(registry: Path, contract_id: str, version: int) -> None:
    """Present an accepted contract as an unfrozen candidate, so the edit itself is not the finding."""
    catalog = json.loads((registry / "catalog.json").read_text(encoding="utf-8"))
    item = _entry(catalog, contract_id, version)
    item["status"] = "candidate"
    item.pop("acceptance", None)
    _write(registry / "catalog.json", catalog)
    frozen = json.loads((registry / "frozen.json").read_text(encoding="utf-8"))
    frozen["files"] = {path: digest for path, digest in frozen["files"].items() if path not in item["resources"]}
    _write(registry / "frozen.json", frozen)


def _add_clause(registry: Path, contract_id: str, version: int, dependency: dict[str, Any], clause: str) -> None:
    catalog = json.loads((registry / "catalog.json").read_text(encoding="utf-8"))
    item = _entry(catalog, contract_id, version)
    for declared in item["dependencies"]:
        coordinate = declared["coordinate"]
        if coordinate["contract_id"] == dependency["contract_id"] and coordinate["version"] == dependency["version"]:
            declared["clauses"].append(clause)
            _write(registry / "catalog.json", catalog)
            return
    raise WorkspaceError(f"{contract_id} v{version} declares no dependency on {dependency}")


def _write(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
