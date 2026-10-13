"""Host cloud sources project from agents/cloud/<host> into that host's package root."""
import base64
import json
import os
import re
import shutil
import stat
import subprocess
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


def test_image_pins_matt_revision_and_resets_cursor_agent_identity(tmp_path):
    repo = Path(__file__).resolve().parents[3]
    dockerfile = (repo / ".meta_harness/agents/cloud/cursor/Dockerfile").read_text(encoding="utf-8")
    skills = (repo / "docs/engineering/skills.md").read_text(encoding="utf-8")
    revision = "b0618bc436ad893b3c5e84e55fba86586d34a404"
    name = "潘其威(William)"
    email = "46810637+PanQiWei@users.noreply.github.com"
    assert f"ARG MATT_SKILLS_REVISION={revision}" in dockerfile
    assert revision in skills
    assert "-a cursor -g -s '*' -y --copy" in dockerfile
    assert f"ARG GIT_HUMAN_NAME={name}" in dockerfile
    assert f"ARG GIT_HUMAN_EMAIL={email}" in dockerfile

    match = re.search(r'base64\.b64decode\("([A-Za-z0-9+/=]+)"\)', dockerfile)
    assert match is not None
    script = base64.b64decode(match.group(1)).decode()
    assert script.startswith("#!/bin/sh\n")
    identity = tmp_path / "git-human-identity"
    identity.write_text(f"{name}\n{email}\n", encoding="utf-8")
    wrapper = tmp_path / "git"
    wrapper.write_text(script.replace("/etc/git-human-identity", str(identity)), encoding="utf-8")
    wrapper.chmod(0o755)

    home = tmp_path / "home"
    home.mkdir()
    (home / ".gitconfig").write_text(
        "[user]\n"
        "\temail = cursoragent@cursor.com\n"
        "\tname = Cursor Agent\n"
        "[commit]\n"
        "\tgpgsign = true\n"
        '[url "https://example.invalid/token/"]\n'
        "\tinsteadOf = https://github.com/\n",
        encoding="utf-8",
    )
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env["HOME"] = str(home)
    env["GIT_CONFIG_NOSYSTEM"] = "1"

    def wrapped(*args):
        return subprocess.run(
            [str(wrapper), *args], check=True, capture_output=True, text=True, env=env
        )

    assert wrapped("config", "--global", "--get", "user.name").stdout.strip() == name
    assert wrapped("config", "--global", "--get", "user.email").stdout.strip() == email
    assert wrapped("config", "--global", "--bool", "--get", "commit.gpgsign").stdout.strip() == "false"
    saved = (home / ".gitconfig").read_text(encoding="utf-8")
    assert "insteadOf = https://github.com/" in saved
    assert "cursoragent@cursor.com" not in saved

    subprocess.run(
        ["/usr/bin/git", "config", "--global", "user.name", "Cursor Agent"],
        check=True, env=env,
    )
    subprocess.run(
        ["/usr/bin/git", "config", "--global", "user.email", "cursoragent@cursor.com"],
        check=True, env=env,
    )
    repo_dir = tmp_path / "repo"
    subprocess.run(["/usr/bin/git", "init", str(repo_dir)], check=True, env=env, capture_output=True)
    (repo_dir / "file").write_text("x\n", encoding="utf-8")
    subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "add", "file"], check=True, env=env
    )
    wrapped("-C", str(repo_dir), "-c", "user.name=Cursor Agent", "commit", "-m", "identity")
    author = subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "log", "-1", "--format=%an <%ae>%n%cn <%ce>"],
        check=True, capture_output=True, text=True, env=env,
    ).stdout.strip().splitlines()
    assert author == [f"{name} <{email}>", f"{name} <{email}>"]

    direct = dict(env)
    direct.update({
        "GIT_AUTHOR_NAME": name,
        "GIT_AUTHOR_EMAIL": email,
        "GIT_COMMITTER_NAME": name,
        "GIT_COMMITTER_EMAIL": email,
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "commit.gpgsign",
        "GIT_CONFIG_VALUE_0": "false",
    })
    subprocess.run(
        ["/usr/bin/git", "config", "--global", "user.name", "Cursor Agent"],
        check=True, env=env,
    )
    subprocess.run(
        ["/usr/bin/git", "config", "--global", "user.email", "cursoragent@cursor.com"],
        check=True, env=env,
    )
    (repo_dir / "file").write_text("y\n", encoding="utf-8")
    subprocess.run(["/usr/bin/git", "-C", str(repo_dir), "add", "file"], check=True, env=direct)
    subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "-c", "user.name=Cursor Agent", "commit", "-m", "direct"],
        check=True, env=direct, capture_output=True,
    )
    direct_author = subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "log", "-1", "--format=%an <%ae>%n%cn <%ce>"],
        check=True, capture_output=True, text=True, env=env,
    ).stdout.strip().splitlines()
    assert direct_author == [f"{name} <{email}>", f"{name} <{email}>"]
