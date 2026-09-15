from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

import pytest


TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

from design_validation import DesignValidator  # noqa: E402


BASELINE = "omne-harness-lite-design-2026-09-15"
LEGACY = "omne-harness-lite-legacy-spec"
NAMESPACE = "https://omne-harness-lite.invalid/meta-harness"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def coordinate(contract_id: str, *, baseline: str = BASELINE) -> dict[str, object]:
    return {"baseline_id": baseline, "contract_id": contract_id, "version": 1}


def contract_entry(contract_id: str, family: str, topic: str, resources: list[str],
                   dependencies: list[dict[str, object]] | None = None) -> dict[str, object]:
    return {
        "coordinate": coordinate(contract_id),
        "family": family,
        "topic": topic,
        "status": "accepted",
        "contract_path": f"spec/{family}/{topic}/v1/contract.md",
        "resources": resources,
        "acceptance": "decisions/accept-current/decision.md",
        "dependencies": dependencies or [],
    }


def build_tree(root: Path) -> None:
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True)
    write_json(root / "baseline.json", {
        "format": 1,
        "baseline_id": BASELINE,
        "snapshot_id": "e3573ca72d18bfe7ddd002df5025551b51eede46:test-fixture",
        "schema_namespace": NAMESPACE,
        "legacy_baseline_ids": [LEGACY],
    })
    identity_id = f"{NAMESPACE}/{BASELINE}/spec/data/agent-runtime-identity/v1/schema.json"
    core_id = f"{NAMESPACE}/{BASELINE}/spec/data/core-work/v1/schema.json"
    identity = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": identity_id,
        "$defs": {"OpaqueId": {"type": "string", "minLength": 1}},
    }
    core = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": core_id,
        "$defs": {
            "WorkOwner": {
                "type": "object",
                "required": ["tenantId"],
                "properties": {
                    "tenantId": {"$ref": f"{identity_id}#/$defs/OpaqueId"},
                    "local": {"$ref": "#/$defs/LocalOwner"},
                },
            },
            "LocalOwner": {"type": "string", "minLength": 1},
        },
    }
    resources: list[str] = []
    for family, topic, files in (
        ("data", "agent-runtime-identity", {"contract.md": "# Identity contract\n", "schema.json": identity}),
        ("data", "core-work", {"contract.md": "# Core work contract\n", "schema.json": core}),
        ("capabilities", "run", {"contract.md": "# Run contract\n"}),
        ("capabilities", "command-input", {"contract.md": "# Command input contract\n"}),
        ("capabilities", "run-driver", {
            "contract.md": "# RunDriver contract\n",
            "RunDriver.tla": "---- MODULE RunDriver ----\n====\n",
            "RunDriver.cfg": "SPECIFICATION Spec\n",
            "RunDriverProgress.cfg": "SPECIFICATION Spec\nPROPERTY Progress\n",
        }),
    ):
        for name, value in files.items():
            path = root / "spec" / family / topic / "v1" / name
            if isinstance(value, dict):
                write_json(path, value)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(value, encoding="utf-8")
            resources.append(path.relative_to(root).as_posix())

    requirement = root / "requirements" / "product" / "sample" / "requirements.md"
    requirement.parent.mkdir(parents=True)
    requirement.write_text("# Requirement sample\n\nAccepted by [the decision](../../../decisions/accept-current/decision.md).\n",
                           encoding="utf-8")
    decision = root / "decisions" / "accept-current" / "decision.md"
    decision.parent.mkdir(parents=True)
    decision.write_text("# Accept current design\n\nSource: [requirement](../../requirements/product/sample/requirements.md).\n",
                        encoding="utf-8")

    def selected(topic: str) -> list[str]:
        marker = f"/{topic}/"
        return [path for path in resources if marker in f"/{path}"]

    entries = [
        contract_entry("data.agent-runtime-identity", "data", "agent-runtime-identity",
                       selected("agent-runtime-identity")),
        contract_entry("data.core-work", "data", "core-work", selected("core-work"), [{
            "coordinate": coordinate("data.agent-runtime-identity"),
            "clauses": ["OpaqueId"],
            "rebase_relation": None,
        }]),
        contract_entry("capability.run", "capabilities", "run", selected("run")),
        contract_entry("capability.command-input", "capabilities", "command-input",
                       selected("command-input"), [{
                           "coordinate": coordinate("capability.run"),
                           "clauses": ["RUN-03"],
                           "rebase_relation": None,
                       }]),
        contract_entry("capability.run-driver", "capabilities", "run-driver",
                       selected("run-driver"), [{
                           "coordinate": coordinate("capability.run"),
                           "clauses": ["RUN-01", "RUN-04"],
                           "rebase_relation": None,
                       }]),
    ]
    write_json(root / "catalog.json", {"format": 1, "baseline_id": BASELINE, "contracts": entries})
    write_json(root / "rebase-map.json", {
        "format": 1,
        "target_baseline_id": BASELINE,
        "retired_identities": [{
            "baseline_id": LEGACY,
            "contract_id": "capability.session-run",
            "reason": "D-014 split this responsibility across live capabilities",
        }],
        "relations": [{
            "id": "command-input-IN-02-session-run-SR-10",
            "source": coordinate("capability.session-run", baseline=LEGACY),
            "disposition": "rebase",
            "target": coordinate("capability.run"),
            "freeze_gate": {"blocked": False, "reason": "IN-02 maps to current RUN-03"},
        }],
        "consumer_observations": [{
            "consumer": "packages/core/work-data/src/schemas/core-work.schema.json",
            "consumes": coordinate("data.core-work", baseline=LEGACY),
            "status": "observed-legacy",
            "evidence": "byte hash and legacy $id observed at the P0 source revision",
        }],
    })
    write_json(root / "formal-tasks.json", {
        "format": 1,
        "baseline_id": BASELINE,
        "tasks": [{
            "id": "run-driver-small-model",
            "kind": "tla",
            "artifacts": selected("run-driver")[1:],
            "command": [sys.executable, "-c", "print('model runner injected')"],
            "timeout_seconds": 10,
        }],
    })
    write_json(root / "frozen.json", {
        "format": 1,
        "baseline_id": BASELINE,
        "files": {path: sha(root / path) for path in resources},
    })


def validate(root: Path, **kwargs: object) -> tuple[list[str], list[str]]:
    return DesignValidator(root, **kwargs).validate()


def test_realistic_small_tree_resolves_schema_links_and_tracks_legacy_consumer(tmp_path: Path) -> None:
    build_tree(tmp_path)
    errors, notes = validate(tmp_path)
    assert errors == []
    assert notes == ["FORMAL run-driver-small-model: registered; execution was not requested"]


def test_formal_registration_skip_and_actual_execution_are_distinct(tmp_path: Path) -> None:
    build_tree(tmp_path)
    assert validate(tmp_path, formal="skip")[1] == [
        "FORMAL run-driver-small-model: skipped by explicit --formal skip"
    ]
    errors, notes = validate(tmp_path, formal="run")
    assert errors == []
    assert "executed; exit=0" in notes[0]


def test_formal_runner_failure_is_propagated(tmp_path: Path) -> None:
    build_tree(tmp_path)
    tasks = json.loads((tmp_path / "formal-tasks.json").read_text())
    tasks["tasks"][0]["command"] = [sys.executable, "-c", "raise SystemExit(7)"]
    write_json(tmp_path / "formal-tasks.json", tasks)
    errors, notes = validate(tmp_path, formal="run")
    assert "executed; exit=7" in notes[0]
    assert any("formal task failed" in error and "exit 7" in error for error in errors)


def test_unresolved_json_pointer_is_rejected_with_source_location(tmp_path: Path) -> None:
    build_tree(tmp_path)
    path = tmp_path / "spec/data/core-work/v1/schema.json"
    schema = json.loads(path.read_text())
    schema["$defs"]["WorkOwner"]["properties"]["tenantId"]["$ref"] = "#/$defs/Missing"
    write_json(path, schema)
    write_json(tmp_path / "frozen.json", {
        "format": 1, "baseline_id": BASELINE,
        "files": {key: sha(tmp_path / key) for key in json.loads((tmp_path / "frozen.json").read_text())["files"]},
    })
    errors, _ = validate(tmp_path)
    assert any("unresolved JSON Pointer token 'Missing'" in error and "core-work" in error for error in errors)


def test_namespace_and_legacy_catalog_mix_are_rejected(tmp_path: Path) -> None:
    build_tree(tmp_path)
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    catalog["contracts"][0]["coordinate"]["baseline_id"] = LEGACY
    write_json(tmp_path / "catalog.json", catalog)
    errors, _ = validate(tmp_path)
    assert any("mixes baseline" in error for error in errors)

    build_tree(tmp_path)
    schema_path = tmp_path / "spec/data/core-work/v1/schema.json"
    schema = json.loads(schema_path.read_text())
    schema["$id"] = "https://omne-harness-lite.invalid/spec/data/core-work/v1/schema.json"
    write_json(schema_path, schema)
    errors, _ = validate(tmp_path)
    assert any("wrong $id" in error for error in errors)


def test_duplicate_exact_coordinate_is_rejected_even_if_content_paths_differ(tmp_path: Path) -> None:
    build_tree(tmp_path)
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    duplicate = deepcopy(catalog["contracts"][2])
    duplicate["family"] = "capabilities"
    duplicate["topic"] = "run-copy"
    copy_dir = tmp_path / "spec/capabilities/run-copy/v1"
    copy_dir.mkdir(parents=True)
    (copy_dir / "contract.md").write_text("# different contract\n")
    duplicate["contract_path"] = "spec/capabilities/run-copy/v1/contract.md"
    duplicate["resources"] = [duplicate["contract_path"]]
    catalog["contracts"].append(duplicate)
    write_json(tmp_path / "catalog.json", catalog)
    errors, _ = validate(tmp_path)
    assert any("duplicate coordinate" in error for error in errors)


def test_direct_retired_dependency_needs_mapping_and_blocked_gate_stops_acceptance(tmp_path: Path) -> None:
    build_tree(tmp_path)
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    command = next(item for item in catalog["contracts"]
                   if item["coordinate"]["contract_id"] == "capability.command-input")
    command["dependencies"] = [{
        "coordinate": coordinate("capability.session-run", baseline=LEGACY),
        "clauses": ["SR-10"],
        "rebase_relation": None,
    }]
    write_json(tmp_path / "catalog.json", catalog)
    errors, _ = validate(tmp_path)
    assert any("rebase_relation must be a non-empty string" in error for error in errors)

    command["dependencies"][0]["rebase_relation"] = "command-input-IN-02-session-run-SR-10"
    write_json(tmp_path / "catalog.json", catalog)
    rebase = json.loads((tmp_path / "rebase-map.json").read_text())
    rebase["relations"][0]["freeze_gate"] = {"blocked": True, "reason": "owner review is open"}
    write_json(tmp_path / "rebase-map.json", rebase)
    errors, _ = validate(tmp_path)
    assert any("blocked by freeze_gate" in error and "owner review is open" in error for error in errors)


def test_unblocked_rebase_relation_requires_its_exact_catalog_target(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "rebase-map.json").read_text())
    rebase["relations"][0]["target"] = coordinate("capability.missing")
    write_json(tmp_path / "rebase-map.json", rebase)
    errors, _ = validate(tmp_path)
    assert any("has no exact target in catalog" in error and "capability.missing" in error for error in errors)


def test_retired_identity_cannot_be_revived_in_current_catalog(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "rebase-map.json").read_text())
    rebase["retired_identities"][0]["baseline_id"] = BASELINE
    write_json(tmp_path / "rebase-map.json", rebase)
    errors, _ = validate(tmp_path)
    assert any("cannot retire an identity in the new baseline" in error for error in errors)

    build_tree(tmp_path)
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    revived = deepcopy(catalog["contracts"][2])
    revived["coordinate"]["contract_id"] = "capability.session-run"
    revived["topic"] = "session-run"
    target = tmp_path / "spec/capabilities/session-run/v1/contract.md"
    target.parent.mkdir(parents=True)
    target.write_text("# revived\n")
    revived["contract_path"] = "spec/capabilities/session-run/v1/contract.md"
    revived["resources"] = [revived["contract_path"]]
    catalog["contracts"].append(revived)
    write_json(tmp_path / "catalog.json", catalog)
    errors, _ = validate(tmp_path)
    assert any("retired contract identity was revived" in error for error in errors)


def test_current_frozen_content_and_previous_registration_are_immutable(tmp_path: Path) -> None:
    build_tree(tmp_path)
    previous = tmp_path.parent / "previous-frozen.json"
    shutil.copy2(tmp_path / "frozen.json", previous)
    contract = tmp_path / "spec/capabilities/run/v1/contract.md"
    contract.write_text("# changed after freeze\n")
    errors, _ = validate(tmp_path)
    assert any("frozen file changed: spec/capabilities/run/v1/contract.md" in error for error in errors)

    build_tree(tmp_path)
    frozen = json.loads((tmp_path / "frozen.json").read_text())
    frozen["files"].pop("spec/capabilities/run/v1/contract.md")
    write_json(tmp_path / "frozen.json", frozen)
    errors, _ = validate(tmp_path, previous_frozen=previous)
    assert any("previous frozen registration changed or was removed" in error for error in errors)


def test_broken_requirement_decision_link_and_acceptance_are_locatable(tmp_path: Path) -> None:
    build_tree(tmp_path)
    (tmp_path / "decisions/accept-current/decision.md").unlink()
    errors, _ = validate(tmp_path)
    assert any("acceptance must be an existing decisions/ file" in error for error in errors)
    assert any("requirements/product/sample/requirements.md: broken local link" in error for error in errors)


def test_cli_runs_after_tooling_and_design_are_copied_outside_repository(tmp_path: Path) -> None:
    copied = tmp_path / "portable"
    tooling = copied / "tooling"
    shutil.copytree(TOOLING / "src", tooling / "src")
    build_tree(copied / "design")
    result = subprocess.run(
        [sys.executable, str(tooling / "src/check_design.py"), "--root", str(copied / "design")],
        cwd=tmp_path,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS: design tree" in result.stdout


def test_cli_propagates_failure_as_nonzero_with_path(tmp_path: Path) -> None:
    build_tree(tmp_path)
    (tmp_path / "spec/data/core-work/v1/schema.json").unlink()
    result = subprocess.run(
        [sys.executable, str(TOOLING / "src/check_design.py"), "--root", str(tmp_path)],
        text=True,
        capture_output=True,
    )
    assert result.returncode == 1
    assert "spec/data/core-work/v1/schema.json" in result.stderr
    assert "FAIL:" in result.stderr
