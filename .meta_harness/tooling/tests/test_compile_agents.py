"""Verify four-output composition and non-destructive staging against real role rendering."""
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import compile_agents as compiler
from executable_bits import staged_modes
from qualification_test_support import qualify_roles


@pytest.fixture
def source(tmp_path):
    root = tmp_path / "agents"
    skill = root / "skills/evidence-reading/canonical"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(
        "---\nname: evidence-reading\ndescription: Read evidence\n---\n\n"
        "Read [reference](references/input.md).\n", encoding="utf-8"
    )
    (skill / "references").mkdir()
    (skill / "references/input.md").write_text("实际证据\n", encoding="utf-8")
    (skill / "sample.bin").write_bytes(bytes(range(256)))
    for host in ("codex", "claude-code", "cursor"):
        adapter = skill.parent / "adapters" / host
        adapter.mkdir(parents=True)
        (adapter / "strategy.yaml").write_text(yaml.safe_dump({
            "version": 1, "host": host, "skill": "evidence-reading", "mode": "copy"
        }), encoding="utf-8")
    role = root / "roles/evidence-reader"
    role.mkdir(parents=True)
    (role / "role.md").write_text('只读证据。保留 "引号" 与 \\ 路径。\n', encoding="utf-8")
    (role / "codex.toml").write_text(
        'name = "evidence-reader"\ndescription = "Read evidence"\n'
        'sandbox_mode = "read-only"\n', encoding="utf-8"
    )
    (role / "claude.yaml").write_text(
        "name: evidence-reader\ndescription: Read evidence\ntools: Read, Glob\n",
        encoding="utf-8"
    )
    (role / "cursor.yaml").write_text("name: evidence-reader\ndescription: Read evidence\nmodel: claude-sonnet-5-5-high\nreadonly: true\nis_background: false\n", encoding="utf-8")
    qualify_roles(root)
    return root


def test_four_outputs_preserve_resources_and_native_permissions(source, tmp_path):
    output = tmp_path / "preview"
    arguments = ["--source", str(source), "--output", str(output)]
    assert compiler.main(arguments) == 0
    assert compiler.main(arguments) == 0
    assert compiler.main(arguments + ["--check"]) == 0
    for file in (source / "skills/evidence-reading/canonical").rglob("*"):
        if file.is_file():
            relative = Path("evidence-reading") / file.relative_to(source / "skills/evidence-reading/canonical")
            assert (output / ".agents/skills" / relative).read_bytes() == file.read_bytes()
            assert (output / ".claude/skills" / relative).read_bytes() == file.read_bytes()
    codex = tomllib.loads((output / ".codex/agents/evidence-reader.toml").read_text(encoding="utf-8"))
    front, body = (output / ".claude/agents/evidence-reader.md").read_text(encoding="utf-8").split("---\n", 2)[1:]
    assert codex["developer_instructions"] == body.lstrip("\n")
    assert codex["sandbox_mode"] == "read-only"
    assert yaml.safe_load(front)["tools"] == "Read, Glob"
    assert (output / ".agents/skills/evidence-reading/references/input.md").is_file()


def test_default_renderer_survives_workspace_relocation(source, tmp_path):
    original = Path(__file__).resolve().parents[2]
    relocated = tmp_path / "unrelated" / ".meta_harness"
    shutil.copytree(original / "tooling/src", relocated / "tooling/src")
    renderer_package = Path("agents/skills/design-subagents/canonical")
    shutil.copytree(original / renderer_package, relocated / renderer_package)
    shutil.copytree(source, relocated / "source")
    command = [
        sys.executable, str(relocated / "tooling/src/compile_agents.py"),
        "--source", str(relocated / "source"), "--output", str(relocated),
    ]
    for extra in ([], ["--check"]):
        result = subprocess.run(command + extra, cwd=tmp_path, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
    codex = tomllib.loads((relocated / ".codex/agents/evidence-reader.toml").read_text(encoding="utf-8"))
    claude = (relocated / ".claude/agents/evidence-reader.md").read_text(encoding="utf-8")
    assert codex["sandbox_mode"] == "read-only"
    assert codex["developer_instructions"] in claude
    assert not (relocated.parent / ".agents").exists()


def test_invalid_late_role_does_not_write_valid_skills(source, tmp_path):
    (source / "roles/evidence-reader/claude.yaml").unlink()
    output = tmp_path / "preview"
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert not output.exists()


def test_output_conflict_preflights_all_files_and_preserves_user_content(source, tmp_path):
    output = tmp_path / "preview"
    conflict = output / ".claude/agents/evidence-reader.md"
    conflict.parent.mkdir(parents=True)
    conflict.write_text("user content", encoding="utf-8")
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert conflict.read_text(encoding="utf-8") == "user content"
    assert not (output / ".agents").exists()
    assert not (output / ".codex").exists()


def test_check_missing_and_drift_are_read_only(source, tmp_path):
    output = tmp_path / "preview"
    args = ["--source", str(source), "--output", str(output)]
    assert compiler.main(args + ["--check"]) == 1
    assert not output.exists()
    assert compiler.main(args) == 0
    target = output / ".agents/skills/evidence-reading/SKILL.md"
    target.write_text("local edit", encoding="utf-8")
    assert compiler.main(args + ["--check"]) == 1
    assert target.read_text(encoding="utf-8") == "local edit"


@pytest.mark.parametrize("kind", ["source-file", "source-root", "target-parent", "target-root"])
def test_symlinks_rejected(source, tmp_path, kind):
    output = tmp_path / "preview"
    outside = tmp_path / "outside"
    outside.mkdir()
    if kind == "source-file":
        (source / "skills/evidence-reading/escape").symlink_to(outside, target_is_directory=True)
    elif kind == "source-root":
        link = tmp_path / "linked-source"
        link.symlink_to(source, target_is_directory=True)
        source = link
    elif kind == "target-parent":
        output.mkdir()
        (output / ".agents").symlink_to(outside, target_is_directory=True)
    else:
        output.symlink_to(outside, target_is_directory=True)
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert list(outside.iterdir()) == []


def test_duplicate_roles_fail_instead_of_last_writer_wins(source):
    import shutil
    shutil.copytree(source / "roles/evidence-reader", source / "roles/another-reader")
    with pytest.raises(ValueError, match="duplicate output"):
        compiler.compile_sources(source)


@pytest.mark.parametrize("change", ["name", "duplicate-key", "missing-entry"])
def test_malformed_skill_fails(source, change):
    entry = source / "skills/evidence-reading/canonical/SKILL.md"
    if change == "name":
        entry.write_text(entry.read_text(encoding="utf-8").replace("name: evidence-reading", "name: different"), encoding="utf-8")
    elif change == "duplicate-key":
        entry.write_text(entry.read_text(encoding="utf-8").replace("description:", "name: evidence-reading\ndescription:"), encoding="utf-8")
    else:
        entry.unlink()
    with pytest.raises((ValueError, OSError)):
        compiler.compile_sources(source)


def test_skills_only_do_not_require_role_renderer(source, tmp_path):
    import shutil
    shutil.rmtree(source / "roles/evidence-reader")
    outputs = compiler.compile_sources(source, tmp_path / "missing-renderer.py")
    assert len(outputs) == 6


@pytest.mark.parametrize("destination", ["source", "child"])
def test_overlapping_roots_rejected(source, destination):
    output = {"source": source, "child": source / "output", "parent": source.parent}[destination]
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1


def test_meta_root_can_contain_source_and_generated_siblings(source):
    args = ["--source", str(source), "--output", str(source.parent)]
    assert compiler.main(args) == 0
    assert compiler.main(args + ["--check"]) == 0
    assert (source.parent / ".codex/agents/evidence-reader.toml").is_file()


def test_blocked_output_parent_rejected_before_any_write(source, tmp_path):
    output = tmp_path / "preview"
    output.mkdir()
    (output / ".codex").write_text("ordinary file", encoding="utf-8")
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert not (output / ".agents").exists()
    assert (output / ".codex").read_text(encoding="utf-8") == "ordinary file"


def test_host_slots_keep_common_text_and_exclude_maintainer_material(source):
    skill = source / "skills/evidence-reading"
    entry = skill / "canonical/SKILL.md"
    entry.write_text(entry.read_text(encoding="utf-8") + "Host invocation: {{INVOKE}}\n", encoding="utf-8")
    (skill / "canonical/AGENTS.md").write_text("maintainer-only", encoding="utf-8")
    (skill / ".design").mkdir()
    (skill / ".design/review.md").write_text("private review", encoding="utf-8")
    for host, invocation in (("codex", "codex-specific-call"), ("claude-code", "claude-specific-call"),
                             ("cursor", "cursor-specific-call")):
        adapter = skill / "adapters" / host
        strategy = yaml.safe_load((adapter / "strategy.yaml").read_text(encoding="utf-8"))
        strategy["slots"] = {"{{INVOKE}}": "invoke.md"}
        (adapter / "strategy.yaml").write_text(yaml.safe_dump(strategy), encoding="utf-8")
        (adapter / "invoke.md").write_text(invocation, encoding="utf-8")
    outputs = compiler.compile_sources(source, hosts=("codex", "claude-code", "cursor"))
    codex = outputs[Path(".agents/skills/evidence-reading/SKILL.md")].content.decode()
    claude = outputs[Path(".claude/skills/evidence-reading/SKILL.md")].content.decode()
    cursor = outputs[Path(".cursor/skills/evidence-reading/SKILL.md")].content.decode()
    assert codex.replace("codex-specific-call", "HOST") == claude.replace("claude-specific-call", "HOST")
    assert codex.replace("codex-specific-call", "HOST") == cursor.replace("cursor-specific-call", "HOST")
    assert all(not any(part in {"adapters", ".design", "AGENTS.md"} for part in p.parts) for p in outputs)


@pytest.mark.parametrize("kind", ["missing", "unknown-field", "unknown-mode", "wrong-host", "unresolved", "unused", "escape", "nested", "unsupported"])
def test_invalid_host_strategy_fails_before_writing(source, tmp_path, capsys, kind):
    adapter = source / "skills/evidence-reading/adapters/codex"
    path = adapter / "strategy.yaml"
    strategy = yaml.safe_load(path.read_text(encoding="utf-8"))
    if kind == "missing":
        path.unlink()
    else:
        if kind == "unknown-field":
            strategy["magic"] = True
        elif kind == "unknown-mode":
            strategy["mode"] = "partial_overlay"
        elif kind == "wrong-host":
            strategy["host"] = "claude-code"
        elif kind == "unsupported":
            strategy.update(mode="unsupported", reason="No verified implementation")
        else:
            entry = source / "skills/evidence-reading/canonical/SKILL.md"
            if kind != "unused":
                entry.write_text(entry.read_text(encoding="utf-8") + "{{INVOKE}}\n", encoding="utf-8")
            if kind != "unresolved":
                strategy["slots"] = {"{{INVOKE}}": "../outside.md" if kind == "escape" else "invoke.md"}
                (adapter / "invoke.md").write_text("{{ANOTHER}}" if kind == "nested" else "invoke", encoding="utf-8")
        path.write_text(yaml.safe_dump(strategy), encoding="utf-8")
    output = tmp_path / "preview"
    assert compiler.main(["--source", str(source), "--output", str(output), "--host", "codex"]) == 1
    expected = {
        "missing": "No such file", "unknown-field": "unknown strategy fields",
        "unknown-mode": "unimplemented strategy mode", "wrong-host": "identity/version mismatch",
        "unresolved": "unresolved adapter slots", "unused": "unused adapter slots",
        "escape": "slot file escapes", "nested": "nested/unresolved", "unsupported": "No verified implementation",
    }
    assert expected[kind] in capsys.readouterr().err
    assert not output.exists()


def test_single_host_does_not_require_other_skill_strategy(source, tmp_path):
    (source / "skills/evidence-reading/adapters/claude-code/strategy.yaml").unlink()
    output = tmp_path / "preview"
    assert compiler.main(["--source", str(source), "--output", str(output), "--host", "codex"]) == 0
    assert (output / ".codex/agents/evidence-reader.toml").is_file()
    assert not (output / ".claude").exists()


@staged_modes
@pytest.mark.parametrize("host,root", [("codex", ".agents"), ("claude-code", ".claude"), ("cursor", ".cursor")])
def test_executable_resource_is_preserved_and_mode_drift_detected(source, tmp_path, host, root):
    script = source / "skills/evidence-reading/canonical/run.sh"
    script.write_text("#!/bin/sh\nprintf 'resource works\\n'\n", encoding="utf-8")
    script.chmod(0o755)
    output = tmp_path / "preview"
    args = ["--source", str(source), "--output", str(output), "--host", host]
    assert compiler.main(args) == 0
    target = output / root / "skills/evidence-reading/run.sh"
    import subprocess
    assert subprocess.run([str(target)], check=True, capture_output=True, text=True).stdout == "resource works\n"
    target.chmod(0o644)
    assert compiler.main(args + ["--check"]) == 1


def test_generated_collection_cannot_contain_source(tmp_path):
    source = tmp_path / ".agents/skills/source"
    (source / "skills").mkdir(parents=True)
    (source / "roles").mkdir()
    assert compiler.main(["--source", str(source), "--output", str(tmp_path)]) == 1


def test_file_created_after_preflight_is_a_conflict_not_success(source, tmp_path, monkeypatch, capsys):
    output = tmp_path / "preview"
    conflict = output / ".agents/skills/evidence-reading/SKILL.md"
    original_mkdir = Path.mkdir
    injected = False

    def mkdir_with_concurrent_writer(path, *args, **kwargs):
        nonlocal injected
        result = original_mkdir(path, *args, **kwargs)
        if path == output / ".agents/skills" and not injected:
            injected = True
            conflict.parent.mkdir(parents=True, exist_ok=True)
            conflict.write_text("concurrent writer", encoding="utf-8")
        return result

    monkeypatch.setattr(Path, "mkdir", mkdir_with_concurrent_writer)
    assert compiler.main(["--source", str(source), "--output", str(output)]) == 1
    assert injected and conflict.read_text(encoding="utf-8") == "concurrent writer"
    captured = capsys.readouterr()
    assert "PASS" not in captured.out
    assert "File exists" in captured.err
