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
    (root / "role.md").write_text('职责：只读。\n引号 """ 与 \'\'\'，反斜杠 \\ 和换行。\n')
    (root / "codex.toml").write_text('name = "evidence-reader"\ndescription = "Read evidence"\n[mcp_servers.docs]\nurl = "https://example.org/mcp"\n')
    (root / "claude.yaml").write_text('name: evidence-reader\ndescription: Read evidence\nmodel: inherit\ntools: Read, Grep, Glob\n')
    return root


def bodies(outputs):
    codex_text = next(v for p, v in outputs.items() if p.suffix == ".toml")
    claude_text = next(v for p, v in outputs.items() if p.suffix == ".md")
    front, claude_body = claude_text.split("---\n", 2)[1:]
    return tomllib.loads(codex_text), yaml.safe_load(front), claude_body.lstrip("\n")


def test_quotes_unicode_tables_and_shared_body_survive(source):
    codex, claude, body = bodies(renderer.render(source))
    assert codex["developer_instructions"] == body == (source / "role.md").read_text()
    assert codex["mcp_servers"]["docs"]["url"] == "https://example.org/mcp"
    assert codex["description"] == claude["description"]


def test_model_overlay_keeps_shared_core(source):
    p = source / "codex.toml"
    p.write_text('model = "gpt-5.6-terra"\n' + p.read_text())
    (source / "codex-adaptation.md").write_text("保留必要证据，精简重复叙述。")
    codex, _, claude_body = bodies(renderer.render(source))
    assert codex["developer_instructions"].startswith(claude_body)
    assert "精简重复叙述" not in claude_body


def test_inherited_model_cannot_claim_targeted_overlay(source):
    (source / "claude-adaptation.md").write_text("精确模型适配")
    with pytest.raises(ValueError, match="exact supported model"):
        renderer.render(source)


@pytest.mark.parametrize("extra", ['model = "gpt-5.2"', 'effort = "high"'])
def test_unconfirmed_model_and_wrong_host_field_fail(source, extra):
    p = source / "codex.toml"
    p.write_text(extra + "\n" + p.read_text())
    with pytest.raises(ValueError):
        renderer.render(source)


def test_codex_effort_matches_actual_catalog(source):
    p = source / "codex.toml"
    p.write_text('model = "gpt-5.5"\nmodel_reasoning_effort = "ultra"\n' + p.read_text())
    with pytest.raises(ValueError, match="unsupported effort"):
        renderer.render(source)


@pytest.mark.parametrize("extra", ['name: overwritten', 'tools: true', 'maxTurns: false', 'skills: architecture-design'])
def test_ambiguous_yaml_and_wrong_types_fail(source, extra):
    p = source / "claude.yaml"
    p.write_text(p.read_text() + extra + "\n")
    with pytest.raises(ValueError):
        renderer.render(source)


def test_dispatch_scope_must_match(source):
    p = source / "claude.yaml"
    p.write_text(p.read_text().replace("Read evidence", "Implement changes"))
    with pytest.raises(ValueError, match="description differs"):
        renderer.render(source)


def test_no_partial_write_when_second_output_conflicts(source, tmp_path):
    out = tmp_path / "out"
    conflict = out / ".claude/agents/evidence-reader.md"
    conflict.parent.mkdir(parents=True)
    conflict.write_text("user-owned content")
    with pytest.raises(ValueError, match="output differs"):
        renderer.deliver(renderer.render(source), out)
    assert not (out / ".codex").exists()
    assert conflict.read_text() == "user-owned content"


def test_check_is_read_only_and_detects_drift(source, tmp_path):
    out = tmp_path / "out"
    outputs = renderer.render(source)
    with pytest.raises(ValueError, match="missing generated"):
        renderer.deliver(outputs, out, check=True)
    assert not out.exists()
    renderer.deliver(outputs, out)
    renderer.deliver(outputs, out, check=True)
    (out / next(iter(outputs))).write_text("drift")
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
    (source / "role.md").write_text("你是 {{role_name}}")
    with pytest.raises(ValueError, match="unfilled"):
        renderer.render(source)
