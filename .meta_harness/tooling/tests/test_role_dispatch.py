import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

AGENTS = Path(__file__).parents[2] / "agents"
ROLES = AGENTS / "roles"
SCRIPT = AGENTS / "skills/design-subagents/canonical/scripts/render_pair.py"
sys.path.insert(0, str(SCRIPT.parent))
spec = importlib.util.spec_from_file_location("dispatch_renderer", SCRIPT)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
VERSION = json.loads((ROLES / "dispatch-policy.json").read_text(encoding="utf-8"))["version"]


def resolve(role, host="codex", work="product", **kwargs):
    return renderer.resolve_dispatch(ROLES / role, host, work, policy_version=VERSION, **kwargs)


@pytest.mark.parametrize("role,work,codex,claude,effort", [
    ("developer", "product", "gpt-6.1-sol", "claude-opus-5-5", "high"),
    ("qa", "non-interactive", "gpt-6.1-sol", "claude-sonnet-5-5", "high"),
    ("diagnostician", "terminal", "gpt-6.1-sol", "claude-opus-5-5", "high"),
    ("implementation-reviewer", "implementation", "gpt-6-astra", "claude-fable-5-1", "high"),
    ("design-reviewer", "choice", "gpt-6-astra", "claude-fable-5-1", "xhigh"),
    ("product-design-drafter", "product", "gpt-6-astra", "claude-opus-5-5", "xhigh"),
    ("product-design-reviewer", "product", "gpt-6-astra", "claude-fable-5-1", "xhigh"),
])
@pytest.mark.parametrize("host", ["codex", "claude_code"])
def test_seven_roles_have_exact_models_and_native_parameters(role, work, codex, claude, effort, host):
    result = resolve(role, host, work)
    model = codex if host == "codex" else claude
    assert result["requested"] == {"model": model, "effort": effort}
    assert result["observed"] == {"model": "unknown", "effort": "unknown"}
    assert len(result["role_source_revision"]) == 64
    assert result["selection"]["model_source_revision"]
    assert result["policy_version"] == VERSION
    if host == "codex":
        assert result["native"] == {"agent_type": role, "model": model, "reasoning_effort": effort}
    else:
        native = result["native"][role]
        rendered = renderer.native_config(renderer.render(ROLES / role), host)
        assert native == {key: value for key, value in {**rendered, "model": model, "effort": effort}.items() if key != "name"}


@pytest.mark.parametrize("work", ["terminal", "verification", "single-module-application"])
def test_economical_developer_variants(work):
    assert resolve("developer", "claude", work)["requested"] == {"model": "claude-sonnet-5-5", "effort": "high"}
    assert resolve("developer", "codex", work)["requested"] == {"model": "gpt-6.1-sol", "effort": "high"}


@pytest.mark.parametrize("role,work,risk", [
    ("developer", "kernel", None),
    ("developer", "provider", "security-sensitive"),
    ("developer", "application", "multi-package"),
    ("developer", "application", "whole-assembly"),
    ("developer", "capability", "underspecified-contract"),
    ("developer", "terminal", "cross-module-lifecycle"),
    ("developer", "verification", "cross-process-faults"),
    ("developer", "verification", "release-gate"),
    ("qa", "terminal", None),
    ("qa", "non-interactive", "terminal-matrix"),
    ("qa", "non-interactive", "multi-service"),
    ("qa", "non-interactive", "release-gate"),
])
@pytest.mark.parametrize("host,model", [("codex", "gpt-6-astra"), ("claude", "claude-fable-5-1")])
def test_risky_work_uses_top_tier_and_cannot_be_downgraded(role, work, risk, host, model):
    if role == "qa" and host == "claude":
        model = "claude-opus-5-5"
    risks = () if risk is None else (risk,)
    result = resolve(role, host, work, risks=risks)
    assert result["requested"] == {"model": model, "effort": "xhigh"}
    with pytest.raises(ValueError, match="at least xhigh"):
        resolve(role, host, work, risks=risks, overrides={"effort": "high"})
    lower = "gpt-6.1-sol" if host == "codex" else "claude-sonnet-5-5"
    with pytest.raises(ValueError, match="top-tier"):
        resolve(role, host, work, risks=risks, overrides={"model": lower})


def test_qa_claude_top_tier_follows_qa_contract():
    assert resolve("qa", "claude", "terminal")["requested"]["model"] == "claude-opus-5-5"


def test_expression_review_selects_its_validated_claude_variant():
    result = resolve("design-reviewer", "claude", "expression")
    assert result["requested"] == {"model": "claude-opus-5-5", "effort": "xhigh"}
    assert result["selection"]["model_source_role"] == "product-design-drafter"
    with pytest.raises(ValueError, match="fixed model"):
        resolve("design-reviewer", "claude", "expression", overrides={"model": "claude-fable-5-1"})


@pytest.mark.parametrize("role,work", [("product-design-reviewer", "product"), ("design-reviewer", "plan")])
@pytest.mark.parametrize("host,model", [("codex", "gpt-6.1-sol"), ("claude", "claude-sonnet-5-5")])
def test_fixed_role_constraints_reject_even_supported_overrides(role, work, host, model):
    with pytest.raises(ValueError, match="fixed model"):
        resolve(role, host, work, overrides={"model": model})
    with pytest.raises(ValueError, match="fixed effort"):
        resolve(role, host, work, overrides={"effort": "high"})


def test_legal_overrides_win_over_role_defaults_and_fallbacks():
    result = resolve("developer", overrides={"model": "gpt-6-astra", "effort": "medium"},
                     pstack_defaults={"model": "gpt-6-luna", "effort": "low"},
                     host_defaults={"model": "gpt-5.6-sol", "effort": "low"})
    assert result["requested"] == {"model": "gpt-6-astra", "effort": "medium"}
    assert result["selection"]["model"] == result["selection"]["effort"] == "task-override"
    assert result["selection"]["model_source_role"] is None
    defaults = resolve("developer", pstack_defaults={"model": "gpt-6-luna", "effort": "low"})
    assert defaults["requested"] == {"model": "gpt-6.1-sol", "effort": "high"}
    assert defaults["selection"]["model"] == "role-work"


@pytest.mark.parametrize("overrides", [{"model": None}, {"model": ""}, {"model": "inherit"},
                                         {"model": "made-up-model"}, {"effort": None},
                                         {"effort": "session"}, {"effort": "low"}, {"effort": "max"},
                                         {"observed_model": "gpt-6-astra"}])
def test_invalid_or_nonexact_task_values_fail(overrides):
    with pytest.raises(ValueError):
        resolve("developer", overrides=overrides)


def test_qa_effort_floor_is_enforced():
    with pytest.raises(ValueError, match="at least high"):
        resolve("qa", work="non-interactive", overrides={"effort": "medium"})


@pytest.mark.parametrize("host,work,risks", [("cursor", "product", ()), ("codex", "", ()),
                                              ("codex", "product", ("guess",)),
                                              ("codex", "product", ([],))])
def test_unknown_inputs_fail(host, work, risks):
    with pytest.raises(ValueError):
        resolve("developer", host, work, risks=risks)


def test_missing_source_policy_and_version_fail(tmp_path):
    with pytest.raises(ValueError, match="version mismatch"):
        renderer.resolve_dispatch(ROLES / "developer", "codex", "product", policy_version="old")
    with pytest.raises(OSError):
        renderer.resolve_dispatch(tmp_path / "developer", "codex", "product", policy_version=VERSION)


def test_unknown_role_is_rejected(tmp_path):
    shutil.copytree(ROLES, tmp_path / "roles")
    role = tmp_path / "roles/developer"
    for filename in ("codex.toml", "claude.yaml"):
        path = role / filename
        path.write_text(path.read_text(encoding="utf-8").replace('name = "developer"', 'name = "unknown"').replace("name: developer", "name: unknown"), encoding="utf-8")
    with pytest.raises(ValueError, match="unknown dispatch role"):
        renderer.resolve_dispatch(role, "codex", "product", policy_version=VERSION)


def test_missing_required_model_and_fallback_priority(tmp_path):
    shutil.copytree(ROLES, tmp_path / "roles")
    role = tmp_path / "roles/diagnostician"
    path = role / "codex.toml"
    path.write_text(path.read_text(encoding="utf-8").replace('model = "gpt-6.1-sol"\n', ""), encoding="utf-8")
    with pytest.raises(ValueError, match="nonempty model"):
        renderer.resolve_dispatch(role, "codex", "terminal", policy_version=VERSION)
    result = renderer.resolve_dispatch(role, "codex", "terminal", policy_version=VERSION,
                                       pstack_defaults={"model": "gpt-6-astra"}, host_defaults={"model": "gpt-6-luna"})
    assert result["requested"]["model"] == "gpt-6-astra"
    assert result["selection"]["model"] == "pstack"
    result = renderer.resolve_dispatch(role, "codex", "terminal", policy_version=VERSION,
                                       host_defaults={"model": "gpt-6-luna"})
    assert result["selection"]["model"] == "host-default"


def test_resolution_is_readonly_and_source_hash_tracks_shared_prompt(tmp_path):
    shutil.copytree(ROLES, tmp_path / "roles")
    role = tmp_path / "roles/developer"
    before = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in role.parent.rglob("*") if path.is_file()}
    first = renderer.resolve_dispatch(role, "codex", "product", policy_version=VERSION)
    after = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in role.parent.rglob("*") if path.is_file()}
    assert before == after
    common = role.parent / "project-frame.md"
    common.write_text(common.read_text(encoding="utf-8") + "\nChanged source input.\n", encoding="utf-8")
    second = renderer.resolve_dispatch(role, "codex", "product", policy_version=VERSION)
    assert first["role_source_revision"] != second["role_source_revision"]
    assert first["policy_revision"] == second["policy_revision"]


def test_cli_prints_complete_json_and_failure_never_prints_dispatch(capsys):
    args = ["--source", str(ROLES / "developer"), "--resolve", "codex", "--work-kind", "kernel", "--policy-version", VERSION]
    assert renderer.main(args) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["native"]["model"] == "gpt-6-astra"
    assert renderer.main(args + ["--model", "gpt-6.1-sol"]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "top-tier" in captured.err
