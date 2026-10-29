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


def add_claude_code_setup(source: Path, mode: int = 0o755) -> Path:
    directory = source / "cloud/claude-code"
    directory.mkdir()
    (directory / "README.md").write_text("maintainer note\n", encoding="utf-8")
    for name in ("setup.sh", "session-start.sh"):
        script = directory / name
        script.write_text("#!/bin/bash\nset -euo pipefail\n", encoding="utf-8")
        script.chmod(mode)
    return directory


def test_claude_code_setup_is_checked_but_not_projected(tmp_path):
    source = source_tree(tmp_path)
    add_claude_code_setup(source)
    output = tmp_path / "preview"
    args = ["--source", str(source), "--output", str(output)]
    assert compiler.main(args) == 0
    assert compiler.main(args + ["--check"]) == 0
    assert not any(path.name in {"setup.sh", "session-start.sh"} for path in output.rglob("*"))
    outputs = compile_sources(source, hosts=("claude-code",))
    assert not any(path.name in {"setup.sh", "session-start.sh", "Dockerfile"} for path in outputs)


@pytest.mark.parametrize("mutation", ["extra", "unexecutable", "missing"])
def test_invalid_claude_code_setup_fails_before_writing(tmp_path, mutation):
    source = source_tree(tmp_path)
    directory = add_claude_code_setup(source, 0o644 if mutation == "unexecutable" else 0o755)
    if mutation == "extra":
        (directory / "Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
    elif mutation == "missing":
        (directory / "session-start.sh").unlink()
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


@pytest.mark.parametrize("configuration", [
    {},
    {"GIT_CONFIG_COUNT": "0"},
    {
        "GIT_CONFIG_COUNT": "2",
        "GIT_CONFIG_KEY_0": "http.extraHeader",
        "GIT_CONFIG_VALUE_0": "X-Test-Auth: fake-token",
        "GIT_CONFIG_KEY_1": "core.hooksPath",
        "GIT_CONFIG_VALUE_1": "/isolated/hooks with spaces",
    },
    {
        "GIT_CONFIG_COUNT": "3",
        "GIT_CONFIG_KEY_0": "http.extraHeader",
        "GIT_CONFIG_VALUE_0": "X-Test-Order: first",
        "GIT_CONFIG_KEY_1": "http.extraHeader",
        "GIT_CONFIG_VALUE_1": "X-Test-Order: second\nwith trailing space ",
        "GIT_CONFIG_KEY_2": "core.hooksPath",
        "GIT_CONFIG_VALUE_2": "",
    },
], ids=["unset", "zero", "authentication-and-hooks", "repeated-keys"])
def test_git_wrapper_preserves_caller_configuration_at_exec(tmp_path, configuration):
    repo = Path(__file__).resolve().parents[3]
    dockerfile = (repo / ".meta_harness/agents/cloud/cursor/Dockerfile").read_text(encoding="utf-8")
    match = re.search(r'base64\.b64decode\("([A-Za-z0-9+/=]+)"\)', dockerfile)
    assert match is not None
    script = base64.b64decode(match.group(1)).decode()
    identity = tmp_path / "identity"
    identity.write_text("Test Human\nhuman@example.invalid\n", encoding="utf-8")
    recorder = tmp_path / "recorder"
    recorder.write_text(
        f"#!{sys.executable}\n"
        "import json, os, sys\n"
        "if sys.argv[-1:] == ['probe']:\n"
        "    print(json.dumps({'args': sys.argv[1:], 'config': {\n"
        "        key: value for key, value in os.environ.items()\n"
        "        if key.startswith('GIT_CONFIG_')}}))\n",
        encoding="utf-8",
    )
    recorder.chmod(0o755)
    wrapper = tmp_path / "git"
    wrapper.write_text(
        script.replace("/etc/git-human-identity", str(identity))
        .replace("real=/usr/bin/git", f'real="{recorder}"'),
        encoding="utf-8",
    )
    wrapper.chmod(0o755)
    home = tmp_path / "home"
    home.mkdir()
    env = {"HOME": str(home), "PATH": "/usr/bin:/bin", **configuration}
    result = subprocess.run(
        [str(wrapper), "probe"], check=True, capture_output=True, text=True, env=env
    )
    observed = json.loads(result.stdout)
    assert observed["config"] == configuration
    assert observed["args"] == ["-c", "commit.gpgsign=false", "probe"]


def test_image_pins_matt_revision_and_resets_cursor_agent_identity(tmp_path):
    repo = Path(__file__).resolve().parents[3]
    dockerfile = (repo / ".meta_harness/agents/cloud/cursor/Dockerfile").read_text(encoding="utf-8")
    skills = (repo / "docs/engineering/skills.md").read_text(encoding="utf-8")
    revision = "b0618bc436ad893b3c5e84e55fba86586d34a404"
    name = "潘其威(William)"
    email = "46810637+PanQiWei@users.noreply.github.com"
    assert f"ARG MATT_SKILLS_REVISION={revision}" in dockerfile
    assert revision in skills
    ub_mode_revision = "57a8bdd28e45ed41900ace0bafa2ff76dd9ed70f"
    assert f"ARG UB_MODE_REVISION={ub_mode_revision}" in dockerfile
    assert f"unclebob/ub-mode@{ub_mode_revision}" in skills
    install = (repo / ".meta_harness/agents/cloud/cursor/install.sh").read_text(encoding="utf-8")
    assert "unclebob/ub-mode/${UB_MODE_REVISION}/SKILL.md" in dockerfile
    assert "unclebob/ub-mode/${ub_mode_revision}/SKILL.md" in install
    assert "unclebob/ub-mode/master" not in dockerfile + install
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
    env["GIT_CONFIG_SYSTEM"] = str(tmp_path / "system.gitconfig")
    env["XDG_CONFIG_HOME"] = str(tmp_path / "xdg")

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
    subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "config", "commit.gpgsign", "true"],
        check=True, env=env,
    )
    subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "config", "gpg.program", "/bin/false"],
        check=True, env=env,
    )
    env.update({
        "GIT_AUTHOR_NAME": "Cursor Agent",
        "GIT_AUTHOR_EMAIL": "cursoragent@cursor.com",
        "GIT_COMMITTER_NAME": "Cursor Agent",
        "GIT_COMMITTER_EMAIL": "cursoragent@cursor.com",
    })
    assert wrapped("-C", str(repo_dir), "config", "--bool", "--get", "commit.gpgsign").stdout.strip() == "false"
    assert wrapped("-c", "commit.gpgsign=true", "config", "--bool", "--get", "commit.gpgsign").stdout.strip() == "true"
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
        ["/usr/bin/git", "-C", str(repo_dir), "-c", "user.name=Cursor Agent",
         "-c", "commit.gpgsign=false", "commit", "-m", "direct"],
        check=True, env=direct, capture_output=True,
    )
    direct_author = subprocess.run(
        ["/usr/bin/git", "-C", str(repo_dir), "log", "-1", "--format=%an <%ae>%n%cn <%ce>"],
        check=True, capture_output=True, text=True, env=env,
    ).stdout.strip().splitlines()
    assert direct_author == [f"{name} <{email}>", f"{name} <{email}>"]
