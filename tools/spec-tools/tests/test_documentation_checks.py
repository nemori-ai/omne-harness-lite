import hashlib
import json
import subprocess
import sys
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
DOCS = "omne_harness_lite_spec_tools.check_docs"
SPECS = "omne_harness_lite_spec_tools.check_specs"


def run(script, root):
    return subprocess.run([sys.executable, "-m", script, "--root", str(root)], text=True, capture_output=True)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def decision(source=True, supersedes="[]"):
    sources = "  - ../proposals/p.md" if source else "  - ../misc.md"
    return "---\nkind: decision\nid: D-001\nstatus: accepted\nscope: x\ndate: 2026-01-01\nsources:\n" + sources + "\nacceptance: ../proposals/p.md\nsupersedes: " + supersedes + "\n---\n# Decision\n"


def base(tmp_path):
    write(tmp_path / "README.md", "# Root\n")
    write(tmp_path / "docs/proposals/p.md", "# Proposal\n")
    write(tmp_path / "spec/catalog.json", '{"catalog_version":1,"contracts":[]}')
    write(tmp_path / "spec/frozen.json", '{"format":1,"files":{}}')
    write(tmp_path / "spec/formal-tasks.json", '{"format":1,"tasks":[]}')


def test_docs_rejects_bad_link_and_anchor(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/a.md", "[missing](no.md) [bad](../README.md#none)\n```\n[ignored](nope.md)\n```")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1
    assert "broken link" in result.stdout and "broken anchor" in result.stdout


@pytest.mark.parametrize("area", ["apps", "tools", "scripts", ".codex"])
def test_source_area_navigation_is_checked(tmp_path, area):
    base(tmp_path)
    write(tmp_path / area / "README.md", "[missing](missing.md)")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1
    assert f"{area}/README.md: broken link" in result.stdout


def test_dependency_and_build_documentation_is_not_project_navigation(tmp_path):
    base(tmp_path)
    for directory in ("tools/check/.venv/lib", "apps/web/node_modules/dependency", "packages/lib/dist"):
        write(tmp_path / directory / "README.md", "[external package link](missing.md)")
    result = run(DOCS, tmp_path)
    assert result.returncode == 0, result.stdout


def test_docs_rejects_accepted_decision_without_eligible_source(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/decisions/D-001.md", decision(source=False))
    write(tmp_path / "docs/misc.md", "# Misc")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "no proposal/research source" in result.stdout


def test_docs_rejects_supersession_without_causal_evidence(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/decisions/D-001.md", decision(supersedes="[{id: D-000, scope: x}]"))
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "change_basis" in result.stdout


def test_docs_rejects_frozen_content_tampering(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/data/x/v1/model.md", "original")
    digest = hashlib.sha256(b"original").hexdigest()
    write(tmp_path / "spec/frozen.json", json.dumps({"format": 1, "files": {"spec/data/x/v1/model.md": digest}}))
    write(tmp_path / "spec/data/x/v1/model.md", "changed")
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "frozen file changed" in result.stdout


def test_docs_baseline_detects_content_and_manifest_tampering(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/data/x/v1/model.md", "original")
    digest = hashlib.sha256(b"original").hexdigest()
    write(tmp_path / "spec/frozen.json", json.dumps({"format": 1, "files": {"spec/data/x/v1/model.md": digest}}))
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "."], cwd=tmp_path, check=True)
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-qm", "baseline"], cwd=tmp_path, check=True)
    write(tmp_path / "spec/data/x/v1/model.md", "changed")
    write(tmp_path / "spec/frozen.json", json.dumps({"format": 1, "files": {"spec/data/x/v1/model.md": hashlib.sha256(b"changed").hexdigest()}}))
    result = subprocess.run([sys.executable, "-m", DOCS, "--root", str(tmp_path), "--baseline", "HEAD"], text=True, capture_output=True)
    assert result.returncode == 1 and "baseline frozen registration changed" in result.stdout


def test_specs_rejects_invalid_catalog_and_invalid_example(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/catalog.json", json.dumps({"catalog_version": 1, "contracts": [{"id": "wrong", "current_version": 2, "versions": [{"version": 1, "status": "accepted", "path": "none.md", "acceptance": "none.md"}]}]}))
    write(tmp_path / "docs/proposals/x/v1/a.schema.json", json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://example.invalid/a", "type": "object", "required": ["x"]}))
    write(tmp_path / "docs/proposals/x/v1/a.example.json", "{}")
    result = run(SPECS, tmp_path)
    assert result.returncode == 1
    assert "catalog.schema.json" in result.stdout and "schema example invalid" in result.stdout


def freeze(root):
    files = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in (root / "spec/data/x/v1").rglob("*") if p.is_file()}
    write(root / "spec/frozen.json", json.dumps({"format": 1, "files": files}))


def published(root):
    base(root)
    write(root / "docs/proposals/p.md", "---\nkind: proposal\nstatus: accepted\n---\n# Proposal\n## 接受记录\nAccepted x v1.\n")
    write(root / "spec/data/x/README.md", "# X\n")
    write(root / "spec/data/x/v1/contract.md", "# X contract\n")
    catalog = {"catalog_version": 1, "contracts": [{"id": "data.x", "current_version": 1, "versions": [{"version": 1, "status": "accepted", "path": "spec/data/x/v1/contract.md", "acceptance": "docs/proposals/p.md#接受记录"}]}]}
    write(root / "spec/catalog.json", json.dumps(catalog))
    freeze(root)
    return catalog


def test_real_heading_tokens_unicode_same_page_duplicates_and_reference_links(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/a.md", "# 中文 **标题**\n[本页](#中文-标题)\n# 中文 **标题**\n[再次](#中文-标题-1)\n[ref][ok]\n\n[ok]: ../README.md#root\n\n~~~\n[ignored](missing.md)\n~~~\n")
    result = run(DOCS, tmp_path)
    assert result.returncode == 0, result.stdout
    write(tmp_path / "docs/b.md", "# Title\n[bad](#missing)\n")
    assert "broken anchor" in run(DOCS, tmp_path).stdout


def test_decision_acceptance_anchor_and_metadata_are_checked(tmp_path):
    base(tmp_path)
    path = tmp_path / "docs/decisions/D-001.md"
    write(path, decision().replace("acceptance: ../proposals/p.md", "acceptance: ../proposals/p.md#missing"))
    assert "broken anchor" in run(DOCS, tmp_path).stdout
    write(path, decision().replace("scope: x", "scope: []"))
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "decision.schema.json" in result.stdout


def test_cycle_with_complete_causal_fields_is_rejected(tmp_path):
    base(tmp_path)
    for current, target in (("D-001", "D-002"), ("D-002", "D-001")):
        text = decision(supersedes="[{id: " + target + ", scope: x}]").replace("id: D-001\n", "id: " + current + "\n")
        text = text.replace("---\n# Decision", "change_basis:\n  observation: new\n  causal_explanation: because\n  reproduction: ../proposals/p.md\n  verification: ../proposals/p.md\n---\n# Decision")
        write(tmp_path / "docs/decisions" / (current + ".md"), text)
    assert "supersedes cycle" in run(DOCS, tmp_path).stdout


def test_real_published_version_and_schema_example_are_checked(tmp_path):
    published(tmp_path)
    schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://example.invalid/x/v1/schema.json", "type": "integer"}
    write(tmp_path / "spec/data/x/v1/schema.json", json.dumps(schema))
    write(tmp_path / "spec/data/x/v1/example.json", "1")
    freeze(tmp_path)
    assert run(SPECS, tmp_path).returncode == 0
    write(tmp_path / "spec/data/x/v1/example.json", '"wrong"')
    freeze(tmp_path)
    result = run(SPECS, tmp_path)
    assert result.returncode == 1 and "schema example invalid" in result.stdout


def test_catalog_rejects_candidate_acceptance_and_duplicate_identity(tmp_path):
    catalog = published(tmp_path)
    write(tmp_path / "docs/proposals/p.md", "---\nstatus: in-review\n---\n# Proposal\n## 接受记录\n")
    catalog["contracts"].append(catalog["contracts"][0])
    write(tmp_path / "spec/catalog.json", json.dumps(catalog))
    result = run(SPECS, tmp_path)
    assert "no accepted scope" in result.stdout and "duplicate contract id" in result.stdout


def test_candidate_is_not_a_formal_dependency(tmp_path):
    published(tmp_path)
    write(tmp_path / "spec/data/x/v1/contract.md", "[candidate](../../../../docs/proposals/p.md)")
    freeze(tmp_path)
    assert "not an exact published version" in run(SPECS, tmp_path).stdout


def test_published_file_cannot_escape_frozen_registration(tmp_path):
    published(tmp_path)
    write(tmp_path / "spec/data/x/v1/new.md", "new normative material")
    assert "not frozen" in run(SPECS, tmp_path).stdout


def test_unregistered_formal_version_is_not_silently_ignored(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/data/x/v1/contract.md", "contract")
    assert "unregistered formal version" in run(SPECS, tmp_path).stdout


def test_offline_ref_resolution_without_examples(tmp_path):
    base(tmp_path)
    first = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://example.invalid/x/a.json", "$ref": "b.json#/$defs/Number"}
    second = {"$schema": first["$schema"], "$id": "https://example.invalid/x/b.json", "$defs": {"Number": {"type": "number"}}}
    write(tmp_path / "docs/proposals/a.schema.json", json.dumps(first))
    write(tmp_path / "docs/proposals/b.schema.json", json.dumps(second))
    assert run(SPECS, tmp_path).returncode == 0
    first["$ref"] = "missing.json#/$defs/Number"
    write(tmp_path / "docs/proposals/a.schema.json", json.dumps(first))
    assert "unresolved $ref" in run(SPECS, tmp_path).stdout


def test_declared_formal_task_executes_and_failure_is_preserved(tmp_path):
    base(tmp_path)
    write(tmp_path / "spec/sample.tla", "---- MODULE sample ----\n====\n")
    task = {"id": "runner-fixture", "kind": "tla", "artifacts": ["spec/sample.tla"], "command": [sys.executable, "-c", "from pathlib import Path; Path('executed').write_text('yes'); raise SystemExit(7)"]}
    write(tmp_path / "spec/formal-tasks.json", json.dumps({"format": 1, "tasks": [task]}))
    result = run(SPECS, tmp_path)
    assert (tmp_path / "executed").read_text() == "yes"
    assert result.returncode == 1 and "formal task failed" in result.stdout
    task["command"] = ["uninstalled-tool-for-check-fixture"]
    write(tmp_path / "spec/formal-tasks.json", json.dumps({"format": 1, "tasks": [task]}))
    assert "formal task tool missing" in run(SPECS, tmp_path).stdout


def test_frozen_manifest_removal_is_not_a_pass(tmp_path):
    base(tmp_path)
    (tmp_path / "spec/frozen.json").unlink()
    result = run(DOCS, tmp_path)
    assert result.returncode == 1 and "frozen.json" in result.stdout
