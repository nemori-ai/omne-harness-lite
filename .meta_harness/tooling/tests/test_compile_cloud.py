"""Host cloud sources project from agents/cloud/<host> into that host's package root."""
import json
import shutil
import stat
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import compile_agents as compiler
from projection import compile_sources


def source_tree(tmp_path: Path) -> Path:
    root = tmp_path / "agents"
    (root / "skills").mkdir(parents=True)
    (root / "roles").mkdir()
    cloud = root / "cloud" / "cursor"
    cloud.mkdir(parents=True)
    (root / "cloud/README.md").write_text("host index\n", encoding="utf-8")
    (cloud / "Dockerfile").write_text("FROM ubuntu:24.04\n", encoding="utf-8")
    (cloud / "environment.json").write_text(json.dumps({
        "build": {"dockerfile": "Dockerfile"},
        "install": "sh .cursor/install.sh",
    }), encoding="utf-8")
    install = cloud / "install.sh"
    install.write_text("#!/bin/sh\nset -eu\n", encoding="utf-8")
    install.chmod(0o755)
    (cloud / "README.md").write_text("maintainer note\n", encoding="utf-8")
    return root


def test_cloud_projection_copies_runtime_files_and_keeps_install_executable(tmp_path):
    source = source_tree(tmp_path)
    output = tmp_path / "preview"
    args = ["--source", str(source), "--output", str(output)]
    assert compiler.main(args) == 0
    assert compiler.main(args + ["--check"]) == 0
    assert (output / ".cursor/Dockerfile").read_text() == "FROM ubuntu:24.04\n"
    assert "README.md" not in {path.name for path in (output / ".cursor").iterdir()}
    mode = stat.S_IMODE((output / ".cursor/install.sh").stat().st_mode)
    assert mode == 0o755
    assert Path(".cursor/environment.json") in compile_sources(source, hosts=("cursor",))


def test_absent_cloud_source_adds_no_cursor_output(tmp_path):
    source = source_tree(tmp_path)
    shutil.rmtree(source / "cloud")
    outputs = compile_sources(source, hosts=("cursor",))
    assert not any(path.name in {"Dockerfile", "environment.json", "install.sh"} for path in outputs)


def test_flat_cloud_file_is_rejected(tmp_path):
    source = source_tree(tmp_path)
    (source / "cloud/Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
    output = tmp_path / "preview"
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert not output.exists()


def test_unmapped_cloud_host_is_rejected(tmp_path):
    source = source_tree(tmp_path)
    (source / "cloud/codex").mkdir()
    output = tmp_path / "preview"
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert not output.exists()


@pytest.mark.parametrize("mutation", ["extra", "unexecutable", "dockerfile"])
def test_invalid_cloud_source_fails_before_writing(tmp_path, mutation):
    source = source_tree(tmp_path)
    if mutation == "extra":
        (source / "cloud/cursor/notes.txt").write_text("x\n", encoding="utf-8")
    elif mutation == "unexecutable":
        (source / "cloud/cursor/install.sh").chmod(0o644)
    else:
        (source / "cloud/cursor/environment.json").write_text(
            '{"build": {"dockerfile": "Other"}, "install": "true"}\n', encoding="utf-8"
        )
    output = tmp_path / "preview"
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert not output.exists()
