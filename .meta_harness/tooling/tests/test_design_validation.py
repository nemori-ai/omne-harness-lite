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
        "acceptance": "decisions/accept-current/acceptance.json",
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
        "version_policy": {"kind": "initial-uniform", "version": 1},
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
        ("capabilities", "command-input", {
            "contract.md": (
                "# Command input contract\n\n"
                "**IN-02:** A keyboard control carries no authority. The active run capability "
                "must resolve the target, recheck authorization, and expose accepted or rejected; "
                "an exited session-run identity cannot be revived as queue owner.\n"
            ),
        }),
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
    requirement.write_text(
        "# Pending input control\n\n"
        "**PF-SAMPLE-01:** After a user submits a valid control, the system must expose whether "
        "the target run accepted or rejected it without reviving an exited queue owner.\n\n"
        "The adopted responsibility mapping is recorded by "
        "[the decision](../../../decisions/accept-current/decision.md).\n",
        encoding="utf-8",
    )
    decision = root / "decisions" / "accept-current" / "decision.md"
    decision.parent.mkdir(parents=True)
    decision.write_text(
        "# Accept current design\n\n"
        "The decision assigns pending input control to `capability.run@1` and accepts the sample "
        "data and driver contracts for the exact design baseline. It does not claim that the "
        "legacy product consumer has upgraded.\n\n"
        "Source: [requirement](../../requirements/product/sample/requirements.md).\n",
        encoding="utf-8",
    )

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
    write_json(decision.parent / "acceptance.json", {
        "format": 1,
        "decision_path": "decisions/accept-current/decision.md",
        "accepts": [{
            "coordinate": entry["coordinate"],
            "scope_clauses": ["sample-full-contract"],
        } for entry in entries],
    })
    write_json(root / "catalog.json", {"format": 1, "baseline_id": BASELINE, "contracts": entries})
    legacy_snapshot = root / "evidence/legacy-consumers/core-work.schema.json"
    write_json(legacy_snapshot, {
        "$id": "https://omne-harness-lite.invalid/spec/data/core-work/v1/schema.json",
        "description": "Observed legacy product schema fixture",
    })
    relation_evidence = root / "evidence/rebase/command-input-IN-02.md"
    relation_evidence.parent.mkdir(parents=True)
    relation_evidence.write_text(
        "# IN-02 mapping evidence\n\nThe sample maps legacy SR-10 to current RUN-03.\n",
        encoding="utf-8",
    )
    write_json(root / "lineage.json", {
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
            "source_clauses": ["SR-10"],
            "disposition": "rebase",
            "target": coordinate("capability.run"),
            "target_clauses": ["RUN-03"],
            "clause_mappings": [{"source": "SR-10", "target": "RUN-03"}],
            "consumers": ["capability.command-input:IN-02"],
            "release_evidence": [{
                "path": "evidence/rebase/command-input-IN-02.md",
                "sha256": sha(relation_evidence),
            }],
            "freeze_gate": {"blocked": False, "reason": "IN-02 maps to current RUN-03"},
        }],
        "consumer_observations": [
            {
                "consumer": "capability.command-input:IN-02",
                "consumes": coordinate("capability.run"),
                "status": "verified-current",
                "evidence": {
                    "source_commit": "e3573ca72d18bfe7ddd002df5025551b51eede46",
                    "source_path": "spec/capabilities/command-input/v1/contract.md",
                    "sha256": sha(relation_evidence),
                    "snapshot_path": "evidence/rebase/command-input-IN-02.md",
                },
            },
            {
                "consumer": "packages/core/work-data/src/schemas/core-work.schema.json",
                "consumes": coordinate("data.core-work", baseline=LEGACY),
                "status": "observed-legacy",
                "evidence": {
                    "source_commit": "e3573ca72d18bfe7ddd002df5025551b51eede46",
                    "source_path": "packages/core/work-data/src/schemas/core-work.schema.json",
                    "sha256": sha(legacy_snapshot),
                    "snapshot_path": "evidence/legacy-consumers/core-work.schema.json",
                },
            },
        ],
    })
    write_json(root / "formal-tasks.json", {
        "format": 1,
        "baseline_id": BASELINE,
        "tasks": [{
            "id": "run-driver-small-model",
            "kind": "tla",
            "artifacts": selected("run-driver")[1:],
            "command": ["${PYTHON_BIN}", "-c", "print('model runner injected')"],
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
    errors, notes = validate(tmp_path, gate="release")
    assert errors == []
    assert notes == ["FORMAL run-driver-small-model: registered; execution was not requested"]


def test_formal_registration_skip_and_actual_execution_are_distinct(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    build_tree(tmp_path)
    assert validate(tmp_path, formal="skip")[1] == [
        "FORMAL run-driver-small-model: skipped by explicit --formal skip"
    ]
    monkeypatch.setenv("PYTHON_BIN", sys.executable)
    errors, notes = validate(tmp_path, formal="run")
    assert errors == []
    assert "executed; exit=0" in notes[0]


def test_formal_runner_failure_is_propagated(tmp_path: Path) -> None:
    build_tree(tmp_path)
    tasks = json.loads((tmp_path / "formal-tasks.json").read_text())
    tasks["tasks"][0]["command"] = ["sh", "-c", "exit 7"]
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
    rebase = json.loads((tmp_path / "lineage.json").read_text())
    rebase["relations"][0]["freeze_gate"] = {"blocked": True, "reason": "owner review is open"}
    write_json(tmp_path / "lineage.json", rebase)
    errors, _ = validate(tmp_path)
    assert any("blocked by freeze_gate" in error and "owner review is open" in error for error in errors)


def test_unblocked_rebase_relation_requires_its_exact_catalog_target(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "lineage.json").read_text())
    rebase["relations"][0]["target"] = coordinate("capability.missing")
    write_json(tmp_path / "lineage.json", rebase)
    errors, _ = validate(tmp_path)
    assert any("has no exact target in catalog" in error and "capability.missing" in error for error in errors)


def test_accepted_legacy_dependency_requires_clause_coverage_and_accepted_target(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "lineage.json").read_text())
    evidence = rebase["relations"][0]["release_evidence"]
    rebase["relations"].append({
        "id": "legacy-core-work-owner",
        "source": coordinate("data.core-work", baseline=LEGACY),
        "source_clauses": ["CD-01"],
        "disposition": "rebase",
        "target": coordinate("data.core-work"),
        "target_clauses": ["CD-NEW-01"],
        "clause_mappings": [{"source": "CD-01", "target": "CD-NEW-01"}],
        "consumers": ["packages/core/work-data/src/schemas/core-work.schema.json"],
        "release_evidence": evidence,
        "freeze_gate": {"blocked": False, "reason": "exact clause checked"},
    })
    write_json(tmp_path / "lineage.json", rebase)
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    command = next(item for item in catalog["contracts"]
                   if item["coordinate"]["contract_id"] == "capability.command-input")
    command["dependencies"] = [{
        "coordinate": coordinate("data.core-work", baseline=LEGACY),
        "clauses": ["CD-01"],
        "rebase_relation": "legacy-core-work-owner",
    }]
    write_json(tmp_path / "catalog.json", catalog)
    assert validate(tmp_path, gate="release")[0] == []

    command["dependencies"][0]["clauses"] = ["CD-02"]
    write_json(tmp_path / "catalog.json", catalog)
    errors, _ = validate(tmp_path)
    assert any("clauses are outside relation" in error and "CD-02" in error for error in errors)

    command["dependencies"][0]["clauses"] = ["CD-01"]
    target = next(item for item in catalog["contracts"]
                  if item["coordinate"]["contract_id"] == "data.core-work")
    target["status"] = "candidate"
    target["acceptance"] = None
    write_json(tmp_path / "catalog.json", catalog)
    errors, _ = validate(tmp_path)
    assert any("maps to non-accepted target" in error for error in errors)


def test_release_gate_cannot_bypass_blocked_relation_or_unknown_consumer(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "lineage.json").read_text())
    rebase["relations"][0]["freeze_gate"] = {"blocked": True, "reason": "semantic owner open"}
    rebase["consumer_observations"][0]["status"] = "unknown"
    write_json(tmp_path / "lineage.json", rebase)
    assert validate(tmp_path, gate="internal")[0] == []
    errors, _ = validate(tmp_path, gate="release")
    assert any("blocked at release" in error for error in errors)
    assert any("unknown and blocks the release gate" in error for error in errors)


def test_verified_current_consumer_requires_exact_catalog_coordinate(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "lineage.json").read_text())
    rebase["consumer_observations"][0]["consumes"] = coordinate("capability.missing")
    write_json(tmp_path / "lineage.json", rebase)
    errors, _ = validate(tmp_path)
    assert any("verified-current consumer" in error and "capability.missing" in error for error in errors)


def test_retired_identity_cannot_be_revived_in_current_catalog(tmp_path: Path) -> None:
    build_tree(tmp_path)
    rebase = json.loads((tmp_path / "lineage.json").read_text())
    rebase["retired_identities"][0]["baseline_id"] = BASELINE
    write_json(tmp_path / "lineage.json", rebase)
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

    build_tree(tmp_path)
    previous = tmp_path.parent / "previous-frozen-2.json"
    shutil.copy2(tmp_path / "frozen.json", previous)
    scenario = tmp_path / "spec/capabilities/run/v1/formal/scenarios.md"
    scenario.parent.mkdir(parents=True)
    scenario.write_text("# New resource added after version freeze\n")
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    run = next(item for item in catalog["contracts"]
               if item["coordinate"]["contract_id"] == "capability.run")
    run["resources"].append("spec/capabilities/run/v1/formal/scenarios.md")
    write_json(tmp_path / "catalog.json", catalog)
    frozen = json.loads((tmp_path / "frozen.json").read_text())
    frozen["files"]["spec/capabilities/run/v1/formal/scenarios.md"] = sha(scenario)
    write_json(tmp_path / "frozen.json", frozen)
    errors, _ = validate(tmp_path, previous_frozen=previous)
    assert any("resources were added to an already frozen version" in error for error in errors)


def test_evolving_baseline_allows_new_version_without_overwriting_v1(tmp_path: Path) -> None:
    build_tree(tmp_path)
    baseline = json.loads((tmp_path / "baseline.json").read_text())
    baseline["version_policy"] = {"kind": "evolving"}
    write_json(tmp_path / "baseline.json", baseline)
    catalog = json.loads((tmp_path / "catalog.json").read_text())
    old = next(item for item in catalog["contracts"]
               if item["coordinate"]["contract_id"] == "capability.run")
    new = deepcopy(old)
    new["coordinate"]["version"] = 2
    new["contract_path"] = "spec/capabilities/run/v2/contract.md"
    new["resources"] = [new["contract_path"]]
    target = tmp_path / new["contract_path"]
    target.parent.mkdir(parents=True)
    target.write_text("# Run v2 contract\n")
    catalog["contracts"].append(new)
    write_json(tmp_path / "catalog.json", catalog)
    acceptance_path = tmp_path / "decisions/accept-current/acceptance.json"
    acceptance = json.loads(acceptance_path.read_text())
    acceptance["accepts"].append({"coordinate": new["coordinate"], "scope_clauses": ["RUN2-01"]})
    write_json(acceptance_path, acceptance)
    frozen = json.loads((tmp_path / "frozen.json").read_text())
    frozen["files"][new["contract_path"]] = sha(target)
    write_json(tmp_path / "frozen.json", frozen)
    assert validate(tmp_path, gate="release")[0] == []


def test_broken_requirement_decision_link_and_acceptance_are_locatable(tmp_path: Path) -> None:
    build_tree(tmp_path)
    (tmp_path / "decisions/accept-current/decision.md").unlink()
    errors, _ = validate(tmp_path)
    assert any("decision_path must identify a decision file" in error for error in errors)
    assert any("requirements/product/sample/requirements.md: broken local link" in error for error in errors)


def test_copied_meta_harness_resolves_agent_and_workspace_navigation(tmp_path: Path) -> None:
    source = tmp_path / "source" / ".meta_harness"
    build_tree(source / "design")
    agent_page = source / "agents/skills/handbook/SKILL.md"
    agent_page.parent.mkdir(parents=True)
    agent_page.write_text("# Handbook\n\n## Design intent\n", encoding="utf-8")
    (source / "README.md").write_text("# Workspace\n", encoding="utf-8")
    shutil.copytree(TOOLING / "src", source / "tooling/src")
    requirement = source / "design/requirements/product/sample/requirements.md"
    with requirement.open("a", encoding="utf-8") as handle:
        handle.write("[method](../../../../agents/skills/handbook/SKILL.md#design-intent) "
                     "[workspace](../../../../README.md#workspace)\n")

    copied = tmp_path / "copied" / ".meta_harness"
    shutil.copytree(source, copied)
    result = subprocess.run(
        [sys.executable, str(copied / "tooling/src/check_design.py"),
         "--root", str(copied / "design"), "--gate", "internal"],
        cwd=tmp_path, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


def test_workspace_navigation_rejects_missing_targets_anchors_and_escapes(tmp_path: Path) -> None:
    workspace = tmp_path / ".meta_harness"
    build_tree(workspace / "design")
    agent_page = workspace / "agents/handbook.md"
    agent_page.parent.mkdir(parents=True)
    agent_page.write_text("# Handbook\n", encoding="utf-8")
    (workspace / "README.md").write_text("# Workspace\n", encoding="utf-8")
    (workspace / "tooling").mkdir()
    (workspace / "tooling/inside.md").write_text("# Tooling\n", encoding="utf-8")
    outside = tmp_path / "outside.md"
    outside.write_text("# Outside\n", encoding="utf-8")
    (workspace / "agents/escape.md").symlink_to(outside)
    requirement = workspace / "design/requirements/product/sample/requirements.md"
    with requirement.open("a", encoding="utf-8") as handle:
        handle.write("[missing](../../../../agents/missing.md) "
                     "[anchor](../../../../agents/handbook.md#absent) "
                     "[tooling](../../../../tooling/inside.md) "
                     "[product](../../../../../outside.md) "
                     "[symlink](../../../../agents/escape.md)\n")

    errors, _ = validate(workspace / "design")
    assert len(errors) == 5
    assert sum("broken local link" in error for error in errors) == 1
    assert sum("missing Markdown anchor" in error for error in errors) == 1
    assert sum("link escapes design root" in error for error in errors) == 3


def test_decision_acceptance_must_name_exact_coordinate_and_scope(tmp_path: Path) -> None:
    build_tree(tmp_path)
    path = tmp_path / "decisions/accept-current/acceptance.json"
    acceptance = json.loads(path.read_text())
    acceptance["accepts"] = acceptance["accepts"][1:]
    write_json(path, acceptance)
    errors, _ = validate(tmp_path)
    assert any("must declare this exact coordinate exactly once" in error for error in errors)


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
