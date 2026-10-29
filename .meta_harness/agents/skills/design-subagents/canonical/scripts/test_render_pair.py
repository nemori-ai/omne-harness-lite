"""Behavioral checks for serialization, staging safety and supported-model boundaries."""
import importlib.util
import tomllib
from pathlib import Path

import pytest
import yaml

spec = importlib.util.spec_from_file_location("render_pair", Path(__file__).with_name("render_pair.py"))
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


@pytest.fixture
def source(tmp_path):
    root = tmp_path / "source"
    root.mkdir()
    (root / "role.md").write_text('职责：只读。\n引号 """ 与 \'\'\'，反斜杠 \\ 和换行。\n', encoding="utf-8")
    (root / "codex.toml").write_text('name = "evidence-reader"\ndescription = "Read evidence"\n[mcp_servers.docs]\nurl = "https://example.org/mcp"\n', encoding="utf-8")
    (root / "claude.yaml").write_text('name: evidence-reader\ndescription: Read evidence\nmodel: inherit\ntools: Read, Grep, Glob\n', encoding="utf-8")
    return root


def bodies(outputs):
    codex_text = next(v for p, v in outputs.items() if p.suffix == ".toml")
    claude_text = next(v for p, v in outputs.items() if p.suffix == ".md")
    front, claude_body = claude_text.split("---\n", 2)[1:]
    return tomllib.loads(codex_text), yaml.safe_load(front), claude_body.lstrip("\n")


def test_quotes_unicode_tables_and_shared_body_survive(source):
    codex, claude, body = bodies(renderer.render(source))
    assert codex["developer_instructions"] == body == (source / "role.md").read_text(encoding="utf-8")
    assert codex["mcp_servers"]["docs"]["url"] == "https://example.org/mcp"
    assert codex["description"] == claude["description"]


def test_model_overlay_keeps_shared_core(source):
    p = source / "codex.toml"
    p.write_text('model = "gpt-5.6-terra"\n' + p.read_text(encoding="utf-8"), encoding="utf-8")
    (source / "codex-adaptation.md").write_text("保留必要证据，精简重复叙述。", encoding="utf-8")
    codex, _, claude_body = bodies(renderer.render(source))
    assert codex["developer_instructions"].startswith(claude_body)
    assert "精简重复叙述" not in claude_body


def test_inherited_model_cannot_claim_targeted_overlay(source):
    (source / "claude-adaptation.md").write_text("精确模型适配", encoding="utf-8")
    with pytest.raises(ValueError, match="exact supported model"):
        renderer.render(source)


@pytest.mark.parametrize("extra", ['model = "gpt-5.2"', 'effort = "high"'])
def test_unconfirmed_model_and_wrong_host_field_fail(source, extra):
    p = source / "codex.toml"
    p.write_text(extra + "\n" + p.read_text(encoding="utf-8"), encoding="utf-8")
    with pytest.raises(ValueError):
        renderer.render(source)


def test_codex_effort_matches_actual_catalog(source):
    p = source / "codex.toml"
    p.write_text('model = "gpt-5.5"\nmodel_reasoning_effort = "ultra"\n' + p.read_text(encoding="utf-8"), encoding="utf-8")
    with pytest.raises(ValueError, match="unsupported effort"):
        renderer.render(source)


@pytest.mark.parametrize("extra", ['name: overwritten', 'tools: true', 'maxTurns: false', 'skills: architecture-design'])
def test_ambiguous_yaml_and_wrong_types_fail(source, extra):
    p = source / "claude.yaml"
    p.write_text(p.read_text(encoding="utf-8") + extra + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        renderer.render(source)


def test_dispatch_scope_must_match(source):
    p = source / "claude.yaml"
    p.write_text(p.read_text(encoding="utf-8").replace("Read evidence", "Implement changes"), encoding="utf-8")
    with pytest.raises(ValueError, match="description differs"):
        renderer.render(source)


def test_no_partial_write_when_second_output_conflicts(source, tmp_path):
    out = tmp_path / "out"
    conflict = out / ".claude/agents/evidence-reader.md"
    conflict.parent.mkdir(parents=True)
    conflict.write_text("user-owned content", encoding="utf-8")
    with pytest.raises(ValueError, match="output differs"):
        renderer.deliver(renderer.render(source), out)
    assert not (out / ".codex").exists()
    assert conflict.read_text(encoding="utf-8") == "user-owned content"


def test_check_is_read_only_and_detects_drift(source, tmp_path):
    out = tmp_path / "out"
    outputs = renderer.render(source)
    with pytest.raises(ValueError, match="missing generated"):
        renderer.deliver(outputs, out, check=True)
    assert not out.exists()
    renderer.deliver(outputs, out)
    renderer.deliver(outputs, out, check=True)
    (out / next(iter(outputs))).write_text("drift", encoding="utf-8")
    with pytest.raises(ValueError, match="output differs"):
        renderer.deliver(outputs, out, check=True)


def test_symlink_cannot_escape_staging_root(source, tmp_path):
    out, outside = tmp_path / "out", tmp_path / "outside"
    out.mkdir(); outside.mkdir()
    (out / ".codex").symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="escapes"):
        renderer.deliver(renderer.render(source), out)
    assert list(outside.iterdir()) == []


def test_unfilled_template_is_not_generated(source):
    (source / "role.md").write_text("你是 {{role_name}}", encoding="utf-8")
    with pytest.raises(ValueError, match="unfilled"):
        renderer.render(source)


def test_shared_prompt_is_inlined_and_drift_is_detected(source, tmp_path):
    common = source.parent / "common.md"
    common.write_text("你必须取得实施规格与施工计划才能开工。\n", encoding="utf-8")
    (source / "assembly.toml").write_text('shared_prompts = ["../common.md"]\n', encoding="utf-8")
    (source.parent / "task.md").write_text("这是给派发者的任务模板。", encoding="utf-8")
    outputs = renderer.render(source)
    codex, _, body = bodies(outputs)
    assert body == (source / "role.md").read_text(encoding="utf-8").strip() + "\n\n" + common.read_text(encoding="utf-8")
    assert codex["developer_instructions"] == body
    assert "任务模板" not in body
    out = tmp_path / "out"
    renderer.deliver(outputs, out)
    common.write_text("新的明确边界。\n", encoding="utf-8")
    with pytest.raises(ValueError, match="output differs"):
        renderer.deliver(renderer.render(source), out, check=True)


@pytest.mark.parametrize("kind", ["missing", "escape", "symlink", "self", "placeholder"])
def test_invalid_shared_prompt_cannot_be_silently_omitted(source, tmp_path, kind):
    common = source.parent / "common.md"
    target = "../common.md"
    if kind == "escape":
        target = "../../outside.md"
    elif kind == "symlink":
        common.symlink_to(tmp_path.parent / "outside.md")
    elif kind == "self":
        target = "role.md"
    elif kind == "placeholder":
        common.write_text("{{required_contract}}", encoding="utf-8")
    (source / "assembly.toml").write_text(f'shared_prompts = ["{target}"]\n', encoding="utf-8")
    with pytest.raises((ValueError, OSError)):
        renderer.render(source)


def test_shared_prompts_are_inlined_in_declared_order(source):
    (source.parent / "taste.md").write_text("# 品味\n先保护不变量。\n", encoding="utf-8")
    (source.parent / "contract.md").write_text("# 边界\n只改授权路径。\n", encoding="utf-8")
    (source / "assembly.toml").write_text('shared_prompts = ["../taste.md", "../contract.md"]\n', encoding="utf-8")
    codex, _, body = bodies(renderer.render(source))
    assert body == ((source / "role.md").read_text(encoding="utf-8").strip() + "\n\n# 品味\n先保护不变量。"
                    + "\n\n# 边界\n只改授权路径。\n")
    assert codex["developer_instructions"] == body


@pytest.mark.parametrize("assembly", [
    'shared_prompts = []\n',
    'shared_prompts = "../common.md"\n',
    'shared_prompts = ["../common.md", "../common.md"]\n',
    'shared_prompts = ["../common.md", "./../common.md"]\n',
    'shared_prompts = [""]\n',
    'shared_prompt = "../common.md"\n',
])
def test_malformed_shared_prompt_lists_are_rejected(source, assembly):
    (source.parent / "common.md").write_text("共同边界。\n", encoding="utf-8")
    (source / "assembly.toml").write_text(assembly, encoding="utf-8")
    with pytest.raises(ValueError):
        renderer.render(source)


@pytest.fixture
def adjustable(source):
    description = "Implement scoped work. " + renderer.effort_description("high")
    (source / "codex.toml").write_text(f'name = "bounded-developer"\ndescription = "{description}"\nmodel = "gpt-5.6-sol"\n[agents]\nenabled = false\n', encoding="utf-8")
    (source / "claude.yaml").write_text(yaml.safe_dump({
        "name": "bounded-developer", "description": description, "model": "opus",
        "tools": "Read, Edit, Bash", "permissionMode": "default"}), encoding="utf-8")
    (source / "assembly.toml").write_text('default_effort = "high"\n', encoding="utf-8")
    return source


def test_adjustable_defaults_and_task_overrides_preserve_prompt_and_permissions(adjustable):
    before = {p.name: p.read_bytes() for p in adjustable.iterdir()}
    codex, claude, body = bodies(renderer.render(adjustable))
    assert "model_reasoning_effort" not in codex
    assert claude["effort"] == "high"
    assert renderer.dispatch_settings(adjustable, "codex")["reasoning_effort"] == "high"
    for effort in ("medium", "high", "xhigh"):
        settings = renderer.dispatch_settings(adjustable, "codex", effort)
        assert settings == {"agent_type": "bounded-developer", "model": "gpt-5.6-sol", "reasoning_effort": effort}
        native = renderer.dispatch_settings(adjustable, "claude", effort)["bounded-developer"]
        assert native == {**{k: v for k, v in claude.items() if k != "name"},
                          "tools": ["Read", "Edit", "Bash"], "effort": effort, "prompt": body}
    assert {p.name: p.read_bytes() for p in adjustable.iterdir()} == before


@pytest.mark.parametrize("mutation", ["codex_fixed", "claude_fixed", "description_drift", "unknown_field", "invalid_default"])
def test_conflicting_or_misleading_dispatch_configuration_fails(adjustable, mutation):
    if mutation == "codex_fixed":
        p = adjustable / "codex.toml"
        p.write_text('model_reasoning_effort = "high"\n' + p.read_text(encoding="utf-8"), encoding="utf-8")
    elif mutation == "claude_fixed":
        p = adjustable / "claude.yaml"
        p.write_text(p.read_text(encoding="utf-8") + 'effort: high\n', encoding="utf-8")
    elif mutation == "description_drift":
        p = adjustable / "assembly.toml"
        p.write_text('default_effort = "medium"\n', encoding="utf-8")
    elif mutation == "unknown_field":
        p = adjustable / "assembly.toml"
        p.write_text(p.read_text(encoding="utf-8") + 'surprise = true\n', encoding="utf-8")
    else:
        (adjustable / "assembly.toml").write_text('default_effort = "ultra"\n', encoding="utf-8")
    with pytest.raises(ValueError):
        renderer.render(adjustable)


def test_fixed_role_cannot_be_overridden_and_dispatch_cli_is_json(adjustable, capsys):
    assert renderer.main(["--source", str(adjustable), "--dispatch", "codex", "--effort", "medium"]) == 0
    import json
    assert json.loads(capsys.readouterr().out)["reasoning_effort"] == "medium"
    (adjustable / "assembly.toml").unlink()
    with pytest.raises(ValueError, match="does not declare adjustable"):
        renderer.dispatch_settings(adjustable, "codex", "medium")
