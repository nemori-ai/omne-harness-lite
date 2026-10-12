import hashlib
import json
import subprocess
import sys

import pytest

from omne_harness_lite_spec_tools.documentation_context import role_context
from omne_harness_lite_spec_tools.documentation_inputs import Inputs
from test_documentation_inventory import fixture, write


def setup(root, text="# Root\n## User\nRead the instructions.\n## Maintainer\nMaintain the target.\n", **changes):
    registry = fixture(root, text=None, id="docs#README", path="docs/README.md",
                       sections=[{"id": "user", "anchor": "user"}, {"id": "maintainer", "anchor": "maintainer"}], **changes)
    registry["owner"]["id"] = "project-documentation"
    write(root, "docs/documentation.json", json.dumps(registry))
    if text is not None:
        write(root, "docs/README.md", text)
    return registry


def run(root, role="user"):
    return subprocess.run([sys.executable, "-m", "omne_harness_lite_spec_tools.documentation_inventory",
                           "context", "--root", str(root), "--role", role], capture_output=True, text=True)


def test_cli_exact_role_excerpt_and_direct_references_without_recursion(tmp_path):
    setup(tmp_path, "---\nx: y\n---\n# Root\n## User\nRead [guide](guide.md#guide), ![image](image.png), [web](https://example.org).\n### Detail\nKept.\n## Maintainer\nNot selected.\n")
    write(tmp_path, "docs/guide.md", "# Guide\n[Indirect](missing.md)\n")
    (tmp_path / "docs/image.png").write_bytes(b"\xffPNG")
    result = run(tmp_path)
    assert result.returncode == 0, result.stderr
    output = json.loads(result.stdout)
    assert output["excerpt"] == "## User\nRead [guide](guide.md#guide), ![image](image.png), [web](https://example.org).\n### Detail\nKept.\n"
    assert [r["href"] for r in output["directReferences"]] == ["guide.md#guide", "image.png", "https://example.org"]
    assert "docs/missing.md" not in [r["path"] for r in output["inputs"]]
    for record in output["inputs"]:
        assert record["sha256"] == hashlib.sha256((tmp_path / record["path"]).read_bytes()).hexdigest()


def test_eleventh_role_is_driven_by_registry(tmp_path):
    registry = setup(tmp_path)
    registry["documents"][0]["requiredSections"] = [{"id": f"role-{i}", "anchor": f"role-{i}"} for i in range(11)]
    write(tmp_path, "docs/documentation.json", json.dumps(registry))
    write(tmp_path, "docs/README.md", "# Root\n" + "".join(f"## Role {i}\nInstruction {i}.\n" for i in range(11)))
    result = role_context(tmp_path, "role-10")
    assert result["excerpt"] == "## Role 10\nInstruction 10.\n"


@pytest.mark.parametrize("mutation", ["role", "owner", "kind", "path", "duplicate", "registry", "bad-source", "alias"])
def test_identity_and_registry_errors_emit_no_success_json(tmp_path, mutation):
    registry = setup(tmp_path)
    if mutation == "owner": registry["owner"]["id"] = "other"
    if mutation == "kind": registry["owner"]["kind"] = "package"
    if mutation == "path": registry["documents"][0]["path"] = "docs/other.md"
    if mutation == "duplicate": registry["documents"][0]["requiredSections"].append({"id": "user", "anchor": "other"})
    if mutation == "bad-source": registry["owner"]["source"]["anchor"] = "absent"
    write(tmp_path, "docs/documentation.json", json.dumps(registry))
    if mutation == "registry": write(tmp_path, "docs/documentation.json", "{}")
    if mutation == "alias":
        source = tmp_path / "docs/README.md"
        source.rename(tmp_path / "docs/actual.md")
        source.symlink_to(tmp_path / "docs/actual.md")
    result = run(tmp_path, "absent" if mutation == "role" else "user")
    assert result.returncode == 2 and result.stdout == "" and result.stderr


@pytest.mark.parametrize("text,excerpt", [(None, None), ("# Root\nBody.\n", None),
    ("# Root\nBody.\n## User\n", None),
    ("# Root\n## User\n<!-- documentation:placeholder -->\nPending.\n", "## User\n<!-- documentation:placeholder -->\nPending.\n")])
def test_physical_gaps_return_observation_and_available_original(tmp_path, text, excerpt):
    setup(tmp_path, text)
    output = role_context(tmp_path, "user")
    assert output["excerpt"] == excerpt
    assert output["structure"]["status"] == "missing-section"


@pytest.mark.parametrize("changes,status", [({"basis": "candidate"}, "inspectable"), ({"basis": "unknown"}, "unknown"),
                                            ({"applicability": "not-applicable"}, "not-applicable")])
def test_scope_is_preserved_without_support_claim(tmp_path, changes, status):
    setup(tmp_path, **changes)
    output = role_context(tmp_path, "user")
    assert output["structure"]["status"] == status
    assert output["excerpt"] == "## User\nRead the instructions.\n"
    assert "supported" not in output and "accepted" not in output


@pytest.mark.parametrize("href", ["missing.md", "policy.md#absent", "../tmp/a.md", "%ff.md", "bad%2", "file:///etc/passwd", "../../outside.md"])
def test_bad_direct_reference_fails_cli(tmp_path, href):
    setup(tmp_path, f"## User\n[Bad]({href})\n")
    result = run(tmp_path)
    assert result.returncode == 2 and result.stdout == "" and result.stderr


def test_valid_template_is_navigable(tmp_path):
    setup(tmp_path, "## User\n[Template](../.templates/example.md#template)\n")
    write(tmp_path, ".templates/example.md", "# Template\nReal template.\n")
    assert role_context(tmp_path, "user")["directReferences"][0]["path"] == ".templates/example.md"


def test_changed_input_prevents_success(tmp_path, monkeypatch):
    setup(tmp_path)
    verify = Inputs.verify
    def mutate(inputs):
        write(tmp_path, "docs/README.md", "## User\nChanged.\n")
        verify(inputs)
    monkeypatch.setattr(Inputs, "verify", mutate)
    with pytest.raises(ValueError, match="changed"):
        role_context(tmp_path, "user")


def test_observe_decode_error_is_not_success(tmp_path):
    setup(tmp_path)
    (tmp_path / "docs/README.md").write_bytes(b"\xff")
    result = run(tmp_path)
    assert result.returncode == 2 and result.stdout == ""


def test_reference_definitions_outside_role_still_supply_direct_link(tmp_path):
    setup(tmp_path, "## User\nRead [the guide][guide].\n## Maintainer\nOther role.\n\n[guide]: policy.md#basis\n")
    result = role_context(tmp_path, "user")
    assert result["excerpt"] == "## User\nRead [the guide][guide].\n"
    assert result["directReferences"] == [{"href": "policy.md#basis", "path": "docs/policy.md", "fragment": "basis"}]


def test_context_reads_only_selected_basis_but_validates_all_metadata(tmp_path):
    registry = setup(tmp_path)
    unrelated = {**registry["documents"][0], "id": "private", "path": ".meta_harness/private.md",
                 "visibility": "private", "expectationSource": {"path": ".meta_harness/private-basis.md"},
                 "gapAllowanceSource": {"path": ".meta_harness/private-gap.md"}, "requiredSections": []}
    registry["documents"].append(unrelated)
    write(tmp_path, "docs/documentation.json", json.dumps(registry))
    output = role_context(tmp_path, "user")
    assert {entry["path"] for entry in output["inputs"]} == {"docs/documentation.json", "docs/policy.md", "docs/README.md"}
    del unrelated["kind"]
    write(tmp_path, "docs/documentation.json", json.dumps(registry))
    with pytest.raises(ValueError, match="registry"):
        role_context(tmp_path, "user")


def test_filtered_registry_still_rejects_duplicate_unselected_paths(tmp_path):
    registry = setup(tmp_path)
    unrelated = {**registry["documents"][0], "id": "private", "path": ".meta_harness/private.md"}
    registry["documents"] += [unrelated, {**unrelated, "id": "private-duplicate"}]
    write(tmp_path, "docs/documentation.json", json.dumps(registry))
    with pytest.raises(ValueError, match="duplicate document"):
        role_context(tmp_path, "user")
