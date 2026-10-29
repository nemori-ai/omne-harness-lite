import sys
import copy
import json
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from compile_agents import main
from cursor_projection import cursor_role_prompt, project_cursor_role
from cursor_qualification import CLAIMS, digest, require_dispatch
from executable_bits import copy_tree, staged_modes
from projection import compile_sources
from qualification_test_support import adopt, limited_record, pending_record, qualify_roles, write_record

SOURCE = Path(__file__).parents[2] / "agents"


ROLES = {"design-reviewer", "developer", "diagnostician", "implementation-reviewer",
         "product-design-drafter", "product-design-reviewer", "qa"}


def test_proved_production_roles_are_formally_dispatchable(tmp_path):
    source = copy_tree(SOURCE, tmp_path / "source")
    output = tmp_path / "output"
    assert main(["--source", str(source), "--output", str(output), "--host", "cursor"]) == 0
    agents = output / ".cursor/agents"
    assert {path.name for path in agents.glob("*.md")} == {f"{name}.md" for name in ROLES}
    assert "Status: proved." in (agents / "developer.md").read_text()
    assert "accepted-role-duty" in (agents / "developer.md").read_text()
    gate = json.loads((output / ".cursor/runtime/role-gate.json").read_text())
    assert set(gate["managed"]) == set(gate["summaries"]) == ROLES
    developer = source / "roles/developer"
    require_dispatch(developer, (developer / "cursor.yaml").read_bytes(), cursor_role_prompt(developer), {
        "environment": "ide", "deployment": "project", "version": "3.24.12",
        "mode": "agent", "purpose": "accepted-role-duty"})
    reviewer = source / "roles/design-reviewer"
    require_dispatch(reviewer, (reviewer / "cursor.yaml").read_bytes(), cursor_role_prompt(reviewer), {
        "environment": "ide", "deployment": "project", "version": "3.24.12",
        "mode": "ask", "purpose": "accepted-role-duty"})


def test_pending_role_file_stays_out_of_the_dispatch_gate(source, tmp_path):
    role = source / "roles/developer"
    write_record(role, pending_record(role))
    output = tmp_path / "output"
    assert main(["--source", str(source), "--output", str(output), "--host", "cursor"]) == 0
    names = {path.name for path in (output / ".cursor/agents").glob("*.md")}
    assert names == {f"{name}.md" for name in ROLES}
    assert "Status: pending." in (output / ".cursor/agents/developer.md").read_text()
    gate = json.loads((output / ".cursor/runtime/role-gate.json").read_text())
    assert "developer" not in gate["summaries"] and "qa" in gate["summaries"]


@pytest.fixture
def source(tmp_path):
    root = copy_tree(SOURCE, tmp_path / "source")
    qualify_roles(root)
    return root


def test_private_limited_fixture_generates_and_restricts_dispatch(source):
    role = source / "roles/developer"
    native, prompt = (role / "cursor.yaml").read_bytes(), cursor_role_prompt(role)
    record = limited_record(role)
    write_record(role, record)
    projected = project_cursor_role(role)
    assert projected.dispatch_qualified
    path, text = projected.path, projected.text
    front = yaml.safe_load(text.split("---", 2)[1])
    assert set(front) == {"name", "description", "model", "readonly", "is_background"}
    assert path == Path(".cursor/agents/developer.md")
    assert "fixture-cli" in text and "host access control" in text
    scope = record["scope"]["dispatch"][0]
    require_dispatch(role, native, prompt, scope)
    for field, value in [("deployment", "plugin"), ("mode", "headless"),
                         ("purpose", "accepted-role-duty"), ("environment", "ide")]:
        denied = {**scope, field: value}
        with pytest.raises(ValueError, match="dispatch scope"):
            require_dispatch(role, native, prompt, denied)


@pytest.mark.parametrize("status", ["pending", "unsupported"])
def test_unadopted_states_refuse_direct_projection(source, status):
    role = source / "roles/developer"
    record = pending_record(role)
    record["status"] = status
    write_record(role, record)
    if status == "pending":
        projected = project_cursor_role(role)
        assert projected.path == Path(".cursor/agents/developer.md")
        assert not projected.dispatch_qualified
        assert "Status: pending. Owner decision: none." in projected.text
        return
    with pytest.raises(ValueError, match="cursor qualification developer: unsupported"):
        project_cursor_role(role)


@pytest.mark.parametrize("mutation,error", [
    (lambda r: r.update(status=[]), "invalid status"),
    (lambda r: r.update(unknown=True), "invalid schema"),
    (lambda r: r.update(version=True), "invalid schema"),
    (lambda r: r.update(role="other"), "invalid schema"),
    (lambda r: r.update(adoption=None), "owner adoption"),
    (lambda r: r["adoption"].update(owner="Reviewer"), "owner adoption"),
    (lambda r: r["scope"]["generation"].pop(), "generation must cover"),
    (lambda r: r["scope"].update(dispatch=[]), "bounded qualification-probe"),
    (lambda r: r["scope"]["dispatch"][0].update(environment=[]), "scope shape"),
    (lambda r: r["scope"]["dispatch"][0].update(version="new-cli"), "unversioned"),
    (lambda r: r["host_versions"].update(cli=[{}]), "versions"),
    (lambda r: r.update(missing=[]), "gaps and bounded"),
    (lambda r: r["scope"]["dispatch"][0].update(purpose="accepted-role-duty"), "bounded qualification-probe"),
])
def test_invalid_records_fail_with_value_errors(source, mutation, error):
    role = source / "roles/developer"
    record = limited_record(role)
    mutation(record)
    if record.get("adoption") is not None:
        from cursor_qualification import subject_digest
        record["adoption"]["subject_sha256"] = subject_digest(record)
    write_record(role, record)
    with pytest.raises(ValueError, match=error):
        project_cursor_role(role)


def test_scope_or_version_change_invalidates_exact_adoption(source):
    role = source / "roles/developer"
    record = limited_record(role)
    record["host_versions"]["cli"].append("new-cli")
    write_record(role, record)
    with pytest.raises(ValueError, match="owner adoption"):
        project_cursor_role(role)


@pytest.mark.parametrize("file", ["developer/role.md", "developer/cursor.yaml", "project-frame.md",
                                 "engineering-taste.md", "cursor-adaptation.md"])
def test_role_native_shared_or_overlay_source_change_reprojects_without_dispatch(source, file):
    path = source / "roles" / file
    marker = "\n# changed native bytes\n" if file.endswith("yaml") else "\nChanged source.\n"
    path.write_text(path.read_text() + marker)
    role = source / "roles/developer"
    projected = project_cursor_role(role)
    assert projected.path == Path(".cursor/agents/developer.md")
    assert not projected.dispatch_qualified
    if file == "developer/role.md":
        assert "Changed source." in projected.text
    with pytest.raises(ValueError, match="source binding is stale"):
        require_dispatch(role, (role / "cursor.yaml").read_bytes(), cursor_role_prompt(role), {
            "environment": "cli", "deployment": "project", "version": "fixture-cli",
            "mode": "interactive", "purpose": "qualification-probe"})


@staged_modes
def test_next_compile_refreshes_every_cursor_agent_and_check_rejects_the_old_tree(tmp_path):
    source = copy_tree(SOURCE, tmp_path / "source")
    first = tmp_path / "first"
    assert main(["--source", str(source), "--output", str(first), "--host", "cursor"]) == 0
    assert {path.name for path in (first / ".cursor/agents").glob("*.md")} == {f"{name}.md" for name in ROLES}
    (source / "roles/qa/role.md").write_text(
        (source / "roles/qa/role.md").read_text() + "\nProjection sync marker.\n")
    assert main(["--source", str(source), "--output", str(first), "--host", "cursor", "--check"]) == 1
    second = tmp_path / "second"
    assert main(["--source", str(source), "--output", str(second), "--host", "cursor"]) == 0
    assert "Projection sync marker." in (second / ".cursor/agents/qa.md").read_text()
    assert main(["--source", str(source), "--output", str(second), "--host", "cursor", "--check"]) == 0


def test_one_late_missing_role_rejects_mixed_build_before_writes(source, tmp_path, capsys):
    last = sorted((source / "roles").glob("*/cursor-qualification.yaml"))[-1]
    last.unlink()
    output = tmp_path / "output"
    keep = output / ".codex/keep"
    keep.parent.mkdir(parents=True)
    keep.write_bytes(b"unchanged")
    keep.chmod(0o600)
    before = {p.relative_to(output): (p.read_bytes(), p.stat().st_mode) for p in output.rglob("*") if p.is_file()}
    assert main(["--source", str(source), "--output", str(output)]) == 1
    assert f"cursor qualification {last.parent.name}: missing" in capsys.readouterr().err
    after = {p.relative_to(output): (p.read_bytes(), p.stat().st_mode) for p in output.rglob("*") if p.is_file()}
    assert before == after and not (output / ".cursor").exists()


def test_old_hosts_do_not_read_malformed_cursor_qualification(source):
    for path in (source / "roles").glob("*/cursor-qualification.yaml"):
        path.write_text("broken: [yaml")
    old = compile_sources(source, hosts=("codex", "claude-code"))
    assert old and all(path.parts[0] != ".cursor" for path in old)


def test_duplicate_keys_are_not_last_writer_wins(source):
    path = source / "roles/developer/cursor-qualification.yaml"
    path.write_text(path.read_text() + "status: limited\n")
    with pytest.raises(ValueError, match="duplicate"):
        project_cursor_role(path.parent)


def test_proved_fixture_accepts_formal_duty_and_rejects_probe_or_stale_evidence(source):
    role = source / "roles/developer"
    record = limited_record(role)
    record.update(status="proved", missing=[], evidence=[])
    record["scope"]["dispatch"][0]["purpose"] = "accepted-role-duty"
    write_record(role, adopt(record))
    projected = project_cursor_role(role)
    assert projected.dispatch_qualified and "Status: proved" in projected.text
    record["scope"]["dispatch"][0]["purpose"] = "qualification-probe"
    write_record(role, adopt(record))
    with pytest.raises(ValueError, match="accepted-role-duty"):
        project_cursor_role(role)
    record["scope"]["dispatch"][0]["purpose"] = "accepted-role-duty"
    report = source / "qualification-evidence/fixture.json"
    report.parent.mkdir()
    report.write_text(json.dumps({"synthetic": True}))
    scope = record["scope"]["dispatch"][0]
    record["evidence"] = [{"reference": "qualification-evidence/fixture.json", "sha256": digest(report.read_bytes()),
                           "claims": ["structure"], "dispatch": [copy.deepcopy(scope)]}]
    write_record(role, adopt(record))
    report.write_text("changed bytes")
    with pytest.raises(ValueError, match="evidence file.*stale"):
        project_cursor_role(role)


def test_readonly_qualification_records_ask_mode(source):
    role = source / "roles/design-reviewer"
    record = limited_record(role)
    record["host_versions"]["ide"] = ["3.24.12"]
    record["scope"]["dispatch"].append({
        "environment": "ide", "deployment": "project", "version": "3.24.12",
        "mode": "agent", "purpose": "qualification-probe"})
    write_record(role, adopt(record))
    with pytest.raises(ValueError, match="invalid or unversioned dispatch scope"):
        project_cursor_role(role)
    record["scope"]["dispatch"][-1]["mode"] = "ask"
    write_record(role, adopt(record))
    assert '"mode": "ask"' in project_cursor_role(role)[1]


def test_existing_correctly_hashed_evidence_outside_source_is_rejected(source):
    role = source / "roles/developer"
    record = limited_record(role)
    record.update(status="proved", missing=[])
    record["scope"]["dispatch"][0]["purpose"] = "accepted-role-duty"
    outside = source.parent / "outside.json"
    outside.write_text('{"synthetic": true}')
    record["evidence"] = [{"reference": "../outside.json", "sha256": digest(outside.read_bytes()),
                           "claims": sorted(CLAIMS), "dispatch": copy.deepcopy(record["scope"]["dispatch"])}]
    write_record(role, adopt(record))
    with pytest.raises(ValueError, match="evidence file.*outside source"):
        project_cursor_role(role)
