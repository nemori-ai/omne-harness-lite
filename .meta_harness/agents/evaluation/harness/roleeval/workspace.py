"""A disposable copy of the repository for one agent run.

A copy is one of two kinds, as the suite's ``workspace.kind`` says.

``material`` (the default): two kinds of paths go into the copy. *Material* paths are
what the role is asked to work on; explicit case fixtures keep those inputs stable
after the design tree moves on. *Subject* paths are what is under test
together with the role (skills, criteria pages, tooling); they come from the working
tree, which has to be clean so that the recorded commit says what was run.

``checkout``: the whole repository at a pinned commit, with its dependencies installed
and built. Installing takes minutes, so it is done once into a *template* kept under
``<work root>/_templates/``; every run copies the real files of the template and
hard-links its dependency directories.

Ground truth never enters a copy: the evaluation directory is not a subject path and
is excluded from every template.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

READY = ".roleeval-ready"
TEMPLATES = "_templates"
BASELINE = ("dispatcher", "dispatcher@invalid")


class WorkspaceError(RuntimeError):
    """The copy could not be built as the suite describes it."""


@dataclass(frozen=True)
class Ran:
    """What one command did: its exit code (None when it ran out of time) and everything it printed."""
    command: list[str]
    code: int | None
    output: str

    @property
    def ok(self) -> bool:
        return self.code == 0


def run(command: list[str], cwd: Path, *, timeout: float | None = None, log: Path | None = None) -> Ran:
    """Run one command of a suite's configuration; stdout and stderr together, as a person would read them."""
    try:
        done = subprocess.run(command, cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                              timeout=timeout)
        ran = Ran(command, done.returncode, done.stdout)
    except subprocess.TimeoutExpired as expired:
        printed = expired.stdout.decode(errors="replace") if isinstance(expired.stdout, bytes) else expired.stdout or ""
        ran = Ran(command, None, printed + f"\n[roleeval: ran out of its {timeout}s]\n")
    if log:
        log.write_text(f"$ {' '.join(command)}\n{ran.output}\n[exit {ran.code}]\n", encoding="utf-8")
    return ran


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


def build(repo: Path, dest: Path, *, fixture: Path, subject_paths: list[str]) -> None:
    """Prepare explicit case inputs without historical Git objects or process records."""
    if dest.exists():
        raise WorkspaceError(f"{dest} already exists; a run never reuses a copy")
    try:
        data = json.loads(fixture.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise WorkspaceError(f"invalid case fixture {fixture}: {error}") from error
    if (not isinstance(data, dict) or set(data) != {"format", "files"}
            or type(data["format"]) is not int or data["format"] != 1
            or not isinstance(data["files"], dict) or not data["files"]):
        raise WorkspaceError("case fixture needs format=1 and a non-empty files map")
    rendered: list[tuple[Path, str]] = []
    for relative, content in data["files"].items():
        if (not isinstance(relative, str) or not relative or Path(relative).is_absolute()
                or any(part in {"..", ".git"} for part in Path(relative).parts)
                or Path(relative).is_relative_to(".meta_harness/design/record")
                or not isinstance(content, str)):
            raise WorkspaceError(f"invalid fixture target: {relative!r}")
        target = dest / relative
        if target.resolve() == dest.resolve() or not target.resolve().is_relative_to(dest.resolve()):
            raise WorkspaceError(f"fixture target escapes copy: {relative}")
        rendered.append((target, content))
    for relative in subject_paths:
        source = repo / relative
        target = dest / relative
        if (Path(relative).is_absolute() or ".." in Path(relative).parts or ".git" in Path(relative).parts
                or not source.resolve().is_relative_to(repo.resolve())
                or not target.resolve().is_relative_to(dest.resolve())):
            raise WorkspaceError(f"subject path escapes repository or copy: {relative}")
        if not source.exists():
            raise WorkspaceError(f"subject path does not exist: {relative}")
    dest.mkdir(parents=True)
    for target, content in rendered:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
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
        elif kind == "append":
            target = dest / op["file"]
            target.write_text(target.read_text(encoding="utf-8") + op["text"], encoding="utf-8")
        elif kind == "copy":
            target = dest / op["to"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(suite / op["from"], target)
        else:
            raise WorkspaceError(f"unknown workspace op {kind!r}")


def commit(dest: Path) -> None:
    """Give the copy a HEAD, so a brief can name 'this checkout's HEAD' as the snapshot under review."""
    git(dest, "init", "-q")
    git(dest, "add", "-A")
    git(dest, "-c", "user.name=dispatcher", "-c", "user.email=dispatcher@invalid", "commit", "-qm",
        "material under review")


# --- checkout copies -----------------------------------------------------------------------------------------

def template_name(flow_id: str, base: str, excludes: list[str], setup: list[list[str]],
                  inputs: list[dict[str, Any]] | None = None) -> str:
    """One template per (base, excludes, setup): change any of them and another template is built."""
    configuration = [base, excludes, setup]
    if inputs:
        configuration.append(inputs)
    key = hashlib.sha256(json.dumps(configuration).encode()).hexdigest()[:8]
    return f"{flow_id}-{base[:12]}-{key}"


def load_case_inputs(repo: Path, dest: Path, base: str, inputs: list[dict[str, Any]]) -> None:
    """Load fixed Git blobs and redirect unique string literals identified by SHA-256."""
    def path(relative: str) -> Path:
        item = Path(relative)
        if item.is_absolute() or not item.parts or any(p in (".", "..") for p in item.parts):
            raise WorkspaceError(f"invalid input path: {relative}")
        target = dest / item
        if any(p.is_symlink() for p in [target, *target.parents] if p.is_relative_to(dest)):
            raise WorkspaceError(f"input path is a symbolic link: {relative}")
        return target

    if not inputs:
        return
    origins: dict[str, list[str]] = {}
    for line in git(repo, "ls-tree", "-r", "-z", base).split("\0"):
        if not line:
            continue
        metadata, relative = line.split("\t", 1)
        _mode, kind, identifier = metadata.split()
        if kind == "blob":
            origins.setdefault(identifier, []).append(relative)
    for entry in inputs:
        identifier = entry["blob"]
        if not re.fullmatch(r"[0-9a-f]{40}", identifier) or identifier not in origins:
            raise WorkspaceError("case input must be a blob in the fixed base")
        if any(p.startswith(".meta_harness/agents/evaluation/") for p in origins[identifier]):
            raise WorkspaceError("evaluation ground truth cannot become a case input")
        target = path(entry["to"])
        if target.exists():
            raise WorkspaceError(f"case input target already exists: {entry['to']}")
        payload = subprocess.run(["git", "-C", str(repo), "cat-file", "blob", identifier],
                                 capture_output=True, check=True).stdout
        for reader in entry["consumers"]:
            file = path(reader["file"])
            text = file.read_text(encoding="utf-8")
            expected = reader["literal_sha256"]
            if not re.fullmatch(r"[0-9a-f]{64}", expected):
                raise WorkspaceError("input reader requires a SHA-256 string literal identity")
            literals = re.finditer(r'''(['"])((?:\\.|(?!\1).)*?)\1''', text)
            matches = [m for m in literals if hashlib.sha256(m[2].encode()).hexdigest() == expected]
            if len(matches) != 1:
                raise WorkspaceError(f"{reader['file']}: input reader must match exactly once")
            match = matches[0]
            replacement = reader["replace"]
            if match[1] in replacement or "\\" in replacement or "\n" in replacement or "\r" in replacement:
                raise WorkspaceError("input reader replacement must be a plain quoted path")
            file.write_text(text[:match.start(2)] + replacement + text[match.end(2):], encoding="utf-8")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)


def template(repo: Path, work: Path, *, flow_id: str, base: str, excludes: list[str],
             setup: list[list[str]], inputs: list[dict[str, Any]] | None = None) -> Path:
    """The installed and built checkout of ``base`` that run copies are taken from; built once, then reused.

    It is built in a sibling directory and renamed into place only after every setup command
    succeeded, so a template that exists is a finished one.
    """
    root = work / TEMPLATES
    final = root / template_name(flow_id, base, excludes, setup, inputs)
    if (final / READY).is_file():
        return final
    if final.exists():
        raise WorkspaceError(f"{final} exists without its ready marker; remove it and build again")
    root.mkdir(parents=True, exist_ok=True)
    building = root / f".building-{final.name}-{os.getpid()}"
    shutil.rmtree(building, ignore_errors=True)
    building.mkdir()
    try:
        _extract(repo, base, building)
        load_case_inputs(repo, building, base, inputs or [])
        for relative in excludes:
            target = building / relative
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            elif target.exists() or target.is_symlink():
                target.unlink()
        for command in setup:
            ran = run(command, building)
            if not ran.ok:
                raise WorkspaceError(f"template setup `{' '.join(command)}` exited {ran.code}:\n{ran.output[-4000:]}")
        (building / READY).write_text(json.dumps({"base": base, "excludes": excludes, "setup": setup,
                                                "inputs": inputs or []}) + "\n",
                                      encoding="utf-8")
        os.rename(building, final)
    except BaseException:
        shutil.rmtree(building, ignore_errors=True)
        raise
    return final


def _extract(repo: Path, base: str, dest: Path) -> None:
    archive = subprocess.Popen(["git", "-C", str(repo), "archive", base], stdout=subprocess.PIPE)
    extract = subprocess.run(["tar", "-x", "-C", str(dest)], stdin=archive.stdout, capture_output=True)
    archive.stdout.close()
    if archive.wait() != 0 or extract.returncode != 0:
        raise WorkspaceError(f"could not extract {base}: {extract.stderr.decode().strip()}")


def checkout(source: Path, dest: Path, *, linked: list[str], drop: list[str]) -> None:
    """A run's copy of a template: real files copied, every ``linked`` directory hard-linked, ``drop`` removed."""
    if dest.exists():
        raise WorkspaceError(f"{dest} already exists; a run never reuses a copy")
    dest.parent.mkdir(parents=True, exist_ok=True)
    excluded = [argument for name in [*linked, READY] for argument in ("--exclude", name)]
    copied = subprocess.run(["rsync", "-a", *excluded, f"{source}/", f"{dest}/"], capture_output=True, text=True)
    if copied.returncode != 0:
        raise WorkspaceError(f"could not copy {source}: {copied.stderr.strip()}")
    for name in linked:
        found = subprocess.run(["find", ".", "-name", name, "-prune"], cwd=str(source), capture_output=True, text=True,
                               check=True).stdout.split()
        for relative in found:
            target = dest / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["cp", "-al", str(source / relative), str(target)], check=True)
    for relative in drop:
        target = dest / relative
        if target.is_symlink() or target.is_file():
            target.unlink()
        elif target.is_dir():
            shutil.rmtree(target)


def baseline(dest: Path) -> str:
    """Make the copy a repository on ``main`` whose only commit is everything in it; return that commit."""
    git(dest, "init", "-q")
    git(dest, "symbolic-ref", "HEAD", "refs/heads/main")
    git(dest, "add", "-A")
    git(dest, "-c", f"user.name={BASELINE[0]}", "-c", f"user.email={BASELINE[1]}", "commit", "-qm", "baseline")
    return head(dest)


def deliver(dest: Path, *, subject: str, trailers: list[str], author: str) -> str:
    """Commit what the copy now holds as an implementer's delivery on top of the baseline; return that commit."""
    name, _, email = author.partition(" <")
    git(dest, "add", "-A")
    git(dest, "-c", f"user.name={name}", "-c", f"user.email={email.rstrip('>')}", "commit", "-qm", subject,
        "-m", "\n".join(trailers))
    return head(dest)


def changed_paths(dest: Path) -> list[tuple[str, str]]:
    """(status, path) of every change against HEAD, untracked files one by one."""
    listed = subprocess.run(["git", "-C", str(dest), "status", "--porcelain", "-uall"], capture_output=True, text=True,
                            check=True).stdout
    return [(line[:2], line[3:].split(" -> ")[-1].strip('"')) for line in listed.splitlines()]


def patch(dest: Path) -> bytes:
    """Every change against HEAD as one diff, new files included."""
    git(dest, "add", "-A", "-N")
    try:
        return subprocess.run(["git", "-C", str(dest), "diff"], capture_output=True, check=True).stdout
    finally:
        git(dest, "reset", "-q")
