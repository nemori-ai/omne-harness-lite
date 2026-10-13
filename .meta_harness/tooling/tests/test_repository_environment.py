import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "agents/evaluation/harness"))
from roleeval import cli, workspace
from git_environment import repository_env


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), "-c", "user.name=fixture", "-c", "user.email=fixture@invalid", *args],
                                   env=repository_env(os.environ), text=True).strip()


def test_roleeval_reads_archives_and_writes_only_the_explicit_repository(tmp_path, monkeypatch):
    target, foreign = tmp_path / "target", tmp_path / "foreign"
    for root in (target, foreign):
        root.mkdir()
        git(root, "init", "-q")
        (root / "marker").write_text(root.name)
        git(root, "add", ".")
        git(root, "commit", "-qm", root.name)
    original, other = workspace.head(target), workspace.head(foreign)
    index = (foreign / ".git/index").read_bytes()
    for key, value in {"GIT_DIR": foreign / ".git", "GIT_WORK_TREE": foreign, "GIT_INDEX_FILE": foreign / ".git/index",
                       "GIT_OBJECT_DIRECTORY": foreign / ".git/objects"}.items():
        monkeypatch.setenv(key, str(value))
    assert workspace.head(target) == original
    assert workspace.is_ancestor(target, original)
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))
    assert cli.work_root(tmp_path / "outside") == tmp_path / "outside"
    archived = workspace.template(target, tmp_path / "templates", flow_id="env", base=original, excludes=[], setup=[])
    assert (archived / "marker").read_text() == "target"
    (target / "marker").write_text("changed")
    assert workspace.dirty(target, ["marker"])
    assert workspace.changed_paths(target) == [(" M", "marker")]
    assert b"+changed" in workspace.patch(target)
    assert workspace.run(["git", "rev-parse", "HEAD"], target).output.strip() == original
    delivered = workspace.deliver(target, subject="change", trailers=[], author="fixture <fixture@invalid>")
    assert delivered != original
    assert git(target, "show", "HEAD:marker") == "changed"
    assert git(foreign, "rev-parse", "HEAD") == other
    assert (foreign / ".git/index").read_bytes() == index
    assert (foreign / "marker").read_text() == "foreign"
