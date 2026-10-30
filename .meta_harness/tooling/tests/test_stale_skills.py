"""The declared SessionStart command names old worktree skill copies, prints nothing otherwise, and never fails."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

DECLARED = Path(__file__).parents[2] / "agents/hooks/hooks.yaml"
SCRIPT = Path(__file__).parents[1] / "src/stale-skills.mjs"
RELATIVE = Path(".meta_harness/tooling/src/stale-skills.mjs")
PREFIX = "技能请从当前检出加载；以下工作树里的技能副本可能过期："


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@invalid", *args], cwd=cwd, check=True,
                          capture_output=True, text=True).stdout


def _commit(cwd: Path, message: str) -> None:
    _git(cwd, "commit", "-q", "--allow-empty", "-m", message)


def _session_start(cwd: Path, payload: dict | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
    (hook,) = [entry for entry in yaml.safe_load(DECLARED.read_text(encoding="utf-8"))["hooks"]
               if entry["id"] == "stale-skill-copies"]
    return subprocess.run(["sh", "-c", hook["command"]], cwd=cwd, input=json.dumps(payload or {}),
                          capture_output=True, text=True, encoding="utf-8", check=False, env=env)


def _worktree(main: Path, name: str, *, skills: bool = True) -> Path:
    path = main / ".worktrees" / name
    _git(main, "worktree", "add", "-q", str(path), "-b", f"someone/{name}")
    if skills:
        (path / ".claude/skills/claim").mkdir(parents=True)
        (path / ".claude/skills/claim/SKILL.md").write_text("---\nname: claim\n---\n", encoding="utf-8")
    return path


@pytest.fixture
def main(tmp_path, monkeypatch) -> Path:
    """A main checkout whose first commit lacks the hook script; trees made there run the main checkout's copy."""
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))
    root = tmp_path / "main"
    root.mkdir()
    _git(root, "init", "-q")  # 不用 `init -b`：Git 2.28 才有
    (root / ".gitignore").write_text(".worktrees/\n", encoding="utf-8")
    _git(root, "add", ".gitignore")
    _commit(root, "base")
    return root


def _add_script(main: Path) -> None:
    (main / RELATIVE).parent.mkdir(parents=True)
    shutil.copyfile(SCRIPT, main / RELATIVE)
    _git(main, "add", str(RELATIVE))
    _commit(main, "hook")


def test_old_copies_are_named_once_in_one_line(main):
    old_base = _worktree(main, "old-base")        # on the old base: strictly behind the main checkout
    _worktree(main, "unprojected", skills=False)  # also behind, but it has no skill projection
    _add_script(main)
    _worktree(main, "fresh")                      # at the main checkout's HEAD: its copies are current
    live = _worktree(main, "live")                # has commits of its own
    _commit(live, "work")
    gone = _worktree(main, "gone")
    _git(main, "update-ref", "-d", "refs/heads/someone/gone")
    _worktree(main, "orphan")
    shutil.rmtree(main / ".git/worktrees/orphan")

    expected = (PREFIX + ".worktrees/gone（分支已删除）、.worktrees/old-base（分支头是主检出 HEAD 的祖先）、"
                ".worktrees/orphan（工作树已不在 Git 登记中）\n")
    ran = _session_start(main)
    assert (ran.returncode, ran.stdout, ran.stderr) == (0, expected, "")
    assert gone.is_dir() and (main / ".worktrees/orphan/.claude/skills").is_dir(), "the hook deletes nothing"

    # The session's own checkout is never listed, whether the shell or the payload names it.
    ran = _session_start(old_base)  # this tree lacks the script: the main checkout's copy runs
    assert (ran.returncode, ran.stdout) == (0, PREFIX + ".worktrees/gone（分支已删除）、"
                                            ".worktrees/orphan（工作树已不在 Git 登记中）\n"), ran.stderr
    ran = _session_start(main, {"cwd": str(gone)})
    assert ran.stdout == PREFIX + ".worktrees/old-base（分支头是主检出 HEAD 的祖先）、.worktrees/orphan（工作树已不在 Git 登记中）\n"


def test_the_reason_states_the_ancestry_that_was_checked_not_a_merge(main):
    _add_script(main)
    merged = _worktree(main, "merged")            # has a commit of its own, which the main checkout then takes in
    _commit(merged, "work")
    _git(main, "merge", "-q", "--no-ff", "--no-edit", "someone/merged")
    _worktree(main, "never-committed")            # made at the main checkout's HEAD, with no commit of its own
    _git(main, "worktree", "add", "-q", "--detach", str(main / ".worktrees/detached"), "HEAD~1")
    (main / ".worktrees/detached/.claude/skills").mkdir(parents=True)
    _commit(main, "later")

    ran = _session_start(main)
    assert (ran.returncode, ran.stderr) == (0, "")
    assert ran.stdout == (PREFIX + ".worktrees/detached（分离的 HEAD 是主检出 HEAD 的祖先）、"
                          ".worktrees/merged（分支头是主检出 HEAD 的祖先）、"
                          ".worktrees/never-committed（分支头是主检出 HEAD 的祖先）\n")


def test_nothing_is_printed_when_every_copy_is_current(main):
    _add_script(main)
    _worktree(main, "fresh")
    live = _worktree(main, "live")
    _commit(live, "work")
    for cwd in (main, live):
        ran = _session_start(cwd)
        assert (ran.returncode, ran.stdout, ran.stderr) == (0, "", ""), cwd


def test_a_failing_hook_prints_nothing_and_exits_zero(main, tmp_path):
    _worktree(main, "old-base")
    _add_script(main)
    _worktree(main, "gone")
    _git(main, "update-ref", "-d", "refs/heads/someone/gone")
    assert _session_start(main).stdout == (PREFIX + ".worktrees/gone（分支已删除）、"
                                           ".worktrees/old-base（分支头是主检出 HEAD 的祖先）\n")

    # Git fails after `gone` is found and before `old-base` is decided: no partial list.
    broken = tmp_path / "broken-git.mjs"
    broken.write_text(
        "import cp from 'node:child_process'\nimport { syncBuiltinESMExports } from 'node:module'\n"
        "const real = cp.spawnSync\n"
        "cp.spawnSync = (file, args, options) => {\n"
        "  if (args[0] === 'merge-base') throw new Error('injected')\n"
        "  return real(file, args, options)\n}\n"
        "syncBuiltinESMExports()\n", encoding="utf-8")
    env = {**os.environ, "NODE_OPTIONS": f"--import={broken.as_uri()}"}
    ran = _session_start(main, env=env)
    assert (ran.returncode, ran.stdout, ran.stderr) == (0, "", "")

    # Node itself cannot start.
    env["NODE_OPTIONS"] = "--require=/no/such/preload.cjs"
    ran = _session_start(main, env=env)
    assert (ran.returncode, ran.stdout, ran.stderr) == (0, "", "")

    # Neither this checkout nor the main checkout has the script.
    (main / RELATIVE).unlink()
    ran = _session_start(main)
    assert (ran.returncode, ran.stdout, ran.stderr) == (0, "", "")

    outside = tmp_path / "outside"
    outside.mkdir()
    ran = _session_start(outside)
    assert (ran.returncode, ran.stdout, ran.stderr) == (0, "", "")
