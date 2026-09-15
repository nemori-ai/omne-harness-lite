"""Link the compiled tree without replacing existing project-owned content."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import link_agents as linker


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "project"
    for name, children in linker.TARGETS.items():
        for child in children:
            (root / ".meta_harness" / name / child).mkdir(parents=True, exist_ok=True)
    (root / ".meta_harness/.agents/skills/example.txt").write_text("source product")
    return root


def test_relative_links_idempotent_and_relocatable(project, tmp_path):
    args = ["--project-root", str(project)]
    assert linker.main(args) == 0
    assert linker.main(args) == 0
    assert linker.main(args + ["--check"]) == 0
    for name in linker.TARGETS:
        assert (project / name).readlink() == Path(".meta_harness") / name
    moved = tmp_path / "moved"
    project.rename(moved)
    assert linker.main(["--project-root", str(moved), "--check"]) == 0
    assert (moved / ".agents/skills/example.txt").read_text() == "source product"


@pytest.mark.parametrize("kind", ["directory", "file", "foreign-link"])
def test_real_paths_and_foreign_links_are_preserved_without_partial_linking(project, kind):
    path = project / ".codex"
    if kind == "directory":
        path.mkdir()
        (path / "keep.txt").write_text("keep")
    elif kind == "file":
        path.write_text("keep")
    else:
        path.symlink_to("somewhere-else")
    assert linker.main(["--project-root", str(project)]) == 1
    assert not (project / ".claude").exists()
    assert not (project / ".agents").exists()
    if kind == "directory":
        assert (path / "keep.txt").read_text() == "keep"
    elif kind == "file":
        assert path.read_text() == "keep"
    else:
        assert path.readlink() == Path("somewhere-else")


def test_check_does_not_create_missing_links(project):
    assert linker.main(["--project-root", str(project), "--check"]) == 1
    assert not (project / ".claude").exists()


def test_missing_compiled_collection_fails_before_linking(project):
    (project / ".meta_harness/.codex/agents").rmdir()
    assert linker.main(["--project-root", str(project)]) == 1
    assert not (project / ".claude").exists()


def test_compiled_symlink_target_is_rejected(project, tmp_path):
    (project / ".meta_harness/.codex/agents").rmdir()
    (project / ".meta_harness/.codex").rmdir()
    outside = tmp_path / "outside"
    (outside / "agents").mkdir(parents=True)
    (project / ".meta_harness/.codex").symlink_to(outside, target_is_directory=True)
    assert linker.main(["--project-root", str(project)]) == 1
    assert not (project / ".claude").exists()
