import shutil
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
from projection import compile_sources
from qualification_test_support import adopt, limited_record, pending_record, qualify_roles, write_record

SOURCE = Path(__file__).parents[2] / "agents"


ROLES = {"design-reviewer", "developer", "diagnostician", "implementation-reviewer",
         "product-design-drafter", "product-design-reviewer", "qa"}


def test_pending_production_writes_no_agent_files(tmp_path):
    source = Path(shutil.copytree(SOURCE, tmp_path / "source"))
    output = tmp_path / "output"
    assert main(["--source", str(source), "--output", str(output), "--host", "cursor"]) == 0
    agents = output / ".cursor/agents"
    assert not agents.exists() or not any(agents.glob("*.md"))
    assert (output / ".cursor/skills/terminal-practice/SKILL.md").is_file()
    gate = json.loads((output / ".cursor/runtime/role-gate.json").read_text())
    assert set(gate["managed"]) == ROLES and gate["summaries"] == {}
    role = source / "roles/developer"
    record = yaml.safe_load((role / "cursor-qualification.yaml").read_text())
    assert record["status"] == "pending" and record["adoption"] is None
    native, prompt = (role / "cursor.yaml").read_bytes(), cursor_role_prompt(role)
    with pytest.raises(ValueError, match="dispatch scope is not adopted"):
        require_dispatch(role, native, prompt, {
            "environment": "ide", "deployment": "project", "version": "3.24.12",
            "mode": "agent", "purpose": "qualification-probe"})


def test_pending_omits_only_that_role_agent_file(source, tmp_path):
    role = source / "roles/developer"
    write_record(role, pending_record(role))
    output = tmp_path / "output"
    assert main(["--source", str(source), "--output", str(output), "--host", "cursor"]) == 0
    names = {path.name for path in (output / ".cursor/agents").glob("*.md")}
    assert "developer.md" not in names
    assert names == {f"{name}.md" for name in ROLES - {"developer"}}
    gate = json.loads((output / ".cursor/runtime/role-gate.json").read_text())
    assert "developer" not in gate["summaries"] and "qa" in gate["summaries"]


@pytest.fixture
def source(tmp_path):
    root = Path(shutil.copytree(SOURCE, tmp_path / "source"))
    qualify_roles(root)
    return root


def test_private_limited_fixture_generates_and_restricts_dispatch(source):
    role = source / "roles/developer"
    native, prompt = (role / "cursor.yaml").read_bytes(), cursor_role_prompt(role)
    record = limited_record(role)
    write_record(role, record)
    path, text = project_cursor_role(role)
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
        assert project_cursor_role(role) is None
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
def test_role_native_shared_or_overlay_source_change_invalidates_binding(source, file):
    path = source / "roles" / file
    path.write_text(path.read_text() + ("\n# changed native bytes\n" if file.endswith("yaml") else "\nChanged source.\n"))
    with pytest.raises(ValueError, match="source binding is stale"):
        project_cursor_role(source / "roles/developer")


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


def test_proved_fixture_requires_verified_evidence_for_each_scope(source):
    role = source / "roles/developer"
    record = limited_record(role)
    record.update(status="proved", missing=[])
    record["scope"]["dispatch"][0]["purpose"] = "accepted-role-duty"
    scope = record["scope"]["dispatch"][0]
    report = source / "qualification-evidence/fixture.json"
    report.parent.mkdir()
    report.write_text(json.dumps({"synthetic": True, "claims": sorted(CLAIMS)}))
    record["evidence"] = [{"reference": "qualification-evidence/fixture.json", "sha256": digest(report.read_bytes()),
                           "claims": sorted(CLAIMS), "dispatch": [copy.deepcopy(scope)]}]
    write_record(role, adopt(record))
    assert "Status: proved" in project_cursor_role(role)[1]
    for missing in CLAIMS:
        incomplete = copy.deepcopy(record)
        incomplete["evidence"][0]["claims"].remove(missing)
        write_record(role, adopt(incomplete))
        with pytest.raises(ValueError, match="every dispatch scope"):
            project_cursor_role(role)
    another = copy.deepcopy(record)
    another["scope"]["dispatch"].append({**scope, "deployment": "plugin"})
    write_record(role, adopt(another))
    with pytest.raises(ValueError, match="every dispatch scope"):
        project_cursor_role(role)
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
