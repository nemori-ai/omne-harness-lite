import json
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

from omne_harness_lite_spec_tools.documentation_inputs import Inputs
from omne_harness_lite_spec_tools.documentation_inventory import compare, inventory

MODULE = "omne_harness_lite_spec_tools.documentation_inventory"


def write(root, path, text):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def fixture(root, *, text="# Target\n\nReal instruction.\n", sections=None, **changes):
    write(root, "docs/policy.md", "# Basis\n\nCurrent target obligation.\n")
    document = {"id": "target", "path": "docs/target.md", "kind": "standard",
                "required": True, "visibility": "internal", "basis": "adopted",
                "applicability": "applicable", "expectationSource": {"path": "docs/policy.md"},
                "inspectionProfile": "prose-v1", "requiredSections": sections or [], **changes}
    registry = {"schemaVersion": 2, "kind": "documentation-bindings",
                "owner": {"id": "project", "kind": "project", "source": {"path": "docs/policy.md"}},
                "documents": [document]}
    write(root, "docs/documentation.json", json.dumps(registry))
    if text is not None:
        write(root, "docs/target.md", text)
    return registry


def run(root, *args):
    return subprocess.run([sys.executable, "-m", MODULE, "inventory", "--root", str(root), *args],
                          capture_output=True, text=True)


@pytest.mark.parametrize("text,status", [
    (None, "missing-file"), ("", "empty-body"), (" \n", "empty-body"),
    ("# Target\n## Only title\n", "empty-body"),
    ("---\nstatus: adopted\n---\n# Target\n<!-- comment -->\n", "empty-body"),
    ("# Target\n\n- [Only title](#only-title)\n## Only title\n", "empty-body"),
    ("# Target\n<!-- documentation:placeholder -->\n\nCurrent source is elsewhere.\n", "placeholder-only"),
    ("# Target\n\nActual condition.\n", "inspectable"),
    ("# Target\n\n- Required behavior.\n", "inspectable"),
    ("# Target\n\n```ts\nexport type A = string\n```\n", "unknown"),
    ("<section>Unsupported HTML-only contract</section>\n", "unknown"),
    ('<a id="x"></a>\n', "empty-body"),
    ('<span></span>\n', "unknown"),
    ('<span>HTML only</span>\n', "unknown"),
])
def test_file_states_and_no_false_green(tmp_path, text, status):
    fixture(tmp_path, text=text)
    result = run(tmp_path)
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["rows"][0]["status"] == status
    if text is None:
        assert any(item["path"] == "docs/target.md" and not item["exists"] for item in report["inputs"])


def test_reference_profile_accepts_code_without_claiming_adoption(tmp_path):
    fixture(tmp_path, text="```ts\nexport type A = string\n```\n", inspectionProfile="reference-v1", basis="candidate")
    row = inventory(tmp_path)["rows"][0]
    assert row["status"] == "inspectable" and row["basis"] == "candidate"


@pytest.mark.parametrize("changes,status", [
    ({"basis": "unknown"}, "unknown"), ({"applicability": "unknown"}, "unknown"),
    ({"applicability": "not-applicable"}, "not-applicable"),
    ({"inspectionProfile": "future-profile"}, "unknown"),
])
def test_unknown_and_applicability_never_become_pass(tmp_path, changes, status):
    fixture(tmp_path, **changes)
    assert inventory(tmp_path)["rows"][0]["status"] == status


def test_allowance_preserves_gap_and_optional_denominator(tmp_path):
    fixture(tmp_path, text=None, required=False, gapAllowanceSource={"path": "docs/policy.md"})
    report = inventory(tmp_path)
    assert report["rows"][0]["status"] == "missing-file"
    assert report["summary"]["documents"]["allowedGapUnits"] == 1
    assert "adopted/applicable/optional" in report["summary"]["groups"]


@pytest.mark.parametrize("text,expected", [
    ("# Root\n\nBody.\n", "missing-section"),
    ("# Root\n\nBody.\n## Needed\n", "missing-section"),
    ("# Root\n## Needed\n<!-- documentation:placeholder -->\nTODO supplied later.\n## Other\nActual body.\n", "missing-section"),
    ("# Root\n## Needed\n### Child\nRequired behavior.\n", "inspectable"),
    ("# Root\n\nBody.\n## Needed\n## Other\nUnrelated body.\n", "missing-section"),
    ('# Root\n\nBody.\n## Needed\n<a id="anchor-only"></a>\n', "missing-section"),
    ('# Root\n\nBody.\n## Needed\n<span>HTML only</span>\n', "unknown"),
])
def test_sections_do_not_borrow_a_sibling_body(tmp_path, text, expected):
    fixture(tmp_path, text=text, sections=[{"id": "required", "anchor": "needed"}])
    assert inventory(tmp_path)["rows"][1]["status"] == expected


def test_missing_parent_keeps_dependent_gaps_out_of_root_count(tmp_path):
    fixture(tmp_path, text=None, sections=[{"id": "required", "anchor": "needed"}])
    report = inventory(tmp_path)
    assert report["rows"][1]["dependencyMissing"]
    assert report["summary"]["sections"]["gapUnits"] == 1
    assert report["summary"]["sections"]["independentGapUnits"] == 0


def test_unicode_and_duplicate_anchors_and_explicit_heading_anchor(tmp_path):
    fixture(tmp_path, text='# Root\n## 标题\nOne.\n## 标题\nTwo.\n<a id="stable"></a>\n\n## Last\nThree.\n',
            sections=[{"id": "unicode", "anchor": "标题-1"}, {"id": "explicit", "anchor": "stable"}])
    assert all(row["status"] == "inspectable" for row in inventory(tmp_path)["rows"])


@pytest.mark.parametrize("field,value", [("schemaVersion", 1), ("schemaVersion", 99), ("extra", True)])
def test_rejects_old_candidate_unknown_version_and_extra_fields(tmp_path, field, value):
    registry = fixture(tmp_path)
    registry[field] = value
    write(tmp_path, "docs/documentation.json", json.dumps(registry))
    result = run(tmp_path)
    assert result.returncode == 2
    assert json.loads(result.stdout)["execution"]["status"] == "error"


@pytest.mark.parametrize("path", ["../escape.md", "/etc/passwd", "tmp/policy.md", ".meta_harness/design/record/policy.md"])
def test_rejects_source_escape_and_process_material(tmp_path, path):
    fixture(tmp_path, path=path)
    assert run(tmp_path).returncode == 2


def test_rejects_symlink_escape_without_reading_external_bytes(tmp_path):
    fixture(tmp_path)
    external = tmp_path.parent / "external-inventory.md"
    external.write_text("do not inspect", encoding="utf-8")
    target = tmp_path / "docs/target.md"
    target.unlink()
    target.symlink_to(external)
    result = run(tmp_path)
    assert result.returncode == 2 and "do not inspect" not in result.stdout


def test_rejects_duplicate_target_and_local_owner_conflicts(tmp_path):
    registry = fixture(tmp_path)
    other = {**registry, "owner": {**registry["owner"], "id": "domain"}}
    write(tmp_path, "docs/domains/a/documentation.json", json.dumps(other))
    result = run(tmp_path)
    assert result.returncode == 2 and "duplicate" in result.stderr


def test_rejects_duplicate_section_identity(tmp_path):
    fixture(tmp_path, sections=[{"id": "same", "anchor": "one"}, {"id": "same", "anchor": "two"}])
    assert run(tmp_path).returncode == 2


def test_rejects_missing_basis_and_bad_anchor(tmp_path):
    fixture(tmp_path, expectationSource={"path": "docs/missing.md"})
    assert run(tmp_path).returncode == 2
    fixture(tmp_path, expectationSource={"path": "docs/policy.md", "anchor": "none"})
    assert run(tmp_path).returncode == 2


def test_input_change_is_error(tmp_path):
    fixture(tmp_path)
    inputs = Inputs(tmp_path)
    inputs.read("docs/target.md")
    write(tmp_path, "docs/target.md", "Changed during run.")
    with pytest.raises(ValueError, match="changed during"):
        inputs.verify()


def test_baseline_is_independent_and_gap_deltas_are_mechanical(tmp_path):
    base, current = tmp_path / "base", tmp_path / "current"
    fixture(base, text=None)
    shutil.copytree(base, current)
    write(current, "docs/target.md", "# Target\n")
    assert compare(inventory(base), inventory(current))["rows"][0]["category"] == "persistent"
    write(current, "docs/target.md", "# Target\n\nActual requirement.\n")
    assert compare(inventory(base), inventory(current))["rows"][0]["category"] == "resolved"
    assert compare(inventory(current), inventory(base))["rows"][0]["category"] == "introduced"
    assert compare(inventory(current), inventory(current))["rows"][0]["category"] == "unchanged"
    cli = run(current, "--base", str(base))
    assert cli.returncode == 0 and json.loads(cli.stdout)["delta"]["available"]
    assert run(current, "--base", str(current)).returncode == 2


def test_profile_change_scope_removal_and_unknown_are_not_repairs(tmp_path):
    base, current = tmp_path / "base", tmp_path / "current"
    fixture(base, text=None)
    fixture(current, text=None, inspectionProfile="reference-v1")
    assert compare(inventory(base), inventory(current))["rows"][0]["category"] == "measurement-change"
    registry = fixture(current, text=None)
    registry["documents"] = []
    write(current, "docs/documentation.json", json.dumps(registry))
    assert compare(inventory(base), inventory(current))["rows"][0]["category"] == "measurement-change"
    fixture(current, text=None, basis="unknown")
    before = inventory(current)
    write(current, "docs/target.md", "Real statement.\n")
    assert compare(before, inventory(current))["rows"][0]["category"] == "uncompared"


def test_missing_base_registry_cannot_fall_back_to_current(tmp_path):
    fixture(tmp_path / "current")
    (tmp_path / "base").mkdir()
    assert run(tmp_path / "current", "--base", str(tmp_path / "base")).returncode == 2


def test_json_markdown_publish_is_read_only_and_no_base_is_explicit(tmp_path):
    root, output = tmp_path / "source", tmp_path / "report"
    fixture(root, text=None)
    original = (root / "docs/documentation.json").read_bytes()
    result = run(root, "--out", str(output))
    assert result.returncode == 0
    report = json.loads(result.stdout)
    assert not report["delta"]["available"]
    assert report == json.loads((output / "inventory.json").read_text())
    assert "missing-file" in (output / "inventory.md").read_text()
    assert (root / "docs/documentation.json").read_bytes() == original
    assert not (root / "docs/target.md").exists()
    assert run(root, "--out", str(root / "docs")).returncode == 2


@pytest.mark.parametrize("link_kind", ["soft", "hard"])
@pytest.mark.parametrize("linked_source", ["current", "base"])
def test_existing_output_file_links_do_not_overwrite_sources(tmp_path, link_kind, linked_source):
    root, output = tmp_path / "source", tmp_path / "report"
    fixture(root)
    base = tmp_path / "base"
    fixture(base)
    protected = root if linked_source == "current" else base
    original = (protected / "docs/target.md").read_bytes()
    output.mkdir()
    for name in ("inventory.json", "inventory.md"):
        target = output / name
        if link_kind == "soft":
            target.symlink_to(protected / "docs/target.md")
        else:
            target.hardlink_to(protected / "docs/target.md")
    result = run(root, "--base", str(base), "--out", str(output))
    assert result.returncode == 0, result.stderr
    assert (protected / "docs/target.md").read_bytes() == original
    assert json.loads((output / "inventory.json").read_text())["execution"]["status"] == "complete"
    assert not (output / "inventory.json").is_symlink()
