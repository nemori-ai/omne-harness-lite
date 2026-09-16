from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parents[1]
TOOL = TOOL_ROOT / "src/merge_design_candidates.py"
NORMALIZE_TOOL = TOOL_ROOT / "src/normalize_formal_commands.py"
SPEC = importlib.util.spec_from_file_location("merge_design_candidates", TOOL)
assert SPEC and SPEC.loader
MERGER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MERGER
SPEC.loader.exec_module(MERGER)


def dump(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def coordinate(value: str) -> dict[str, object]:
    contract_id, version = value.rsplit("@", 1)
    return {
        "baseline_id": MERGER.BASELINE_ID,
        "contract_id": contract_id,
        "version": int(version),
    }


def make_candidate(design: Path, root: Path, *, label: str = "base") -> None:
    contracts = []
    for key in sorted(MERGER.ALLOWED_COORDINATES):
        contract_id, _ = key.rsplit("@", 1)
        prefix, topic = contract_id.split(".", 1)
        family = {"data": "data", "capability": "capabilities", "composition": "compositions"}[prefix]
        resource = f"spec/{family}/{topic}/v1/contract.md"
        full = design / resource
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(f"# {key}\n")
        contracts.append({
            "coordinate": coordinate(key),
            "family": family,
            "topic": topic,
            "status": "candidate",
            "contract_path": resource,
            "resources": [resource],
            "acceptance": None,
            "dependencies": [],
        })
    baseline = {
        "format": 1,
        "baseline_id": MERGER.BASELINE_ID,
        "snapshot_id": f"fixture:{label}",
        "schema_namespace": MERGER.SCHEMA_NAMESPACE,
        "legacy_baseline_ids": [MERGER.LEGACY_BASELINE_ID],
        "version_policy": {"kind": "initial-uniform", "version": 1},
    }
    relation = {
        "id": "legacy-live-agent",
        "source": {"baseline_id": MERGER.LEGACY_BASELINE_ID, "contract_id": "capability.live-agent", "version": 1},
        "source_clauses": ["AR-1"],
        "disposition": "rebase",
        "target": coordinate("capability.live-agent@1"),
        "target_clauses": ["AR-1"],
        "clause_mappings": [{"source": "AR-1", "target": "AR-1"}],
        "consumers": [],
        "release_evidence": [],
        "freeze_gate": {"blocked": True, "reason": "fixture"},
    }
    task = {
        "id": "live-agent-safety",
        "kind": "tlc",
        "artifacts": [contracts[0]["contract_path"]],
        "command": ["java", "tlc2.TLC", "Runtime.cfg"],
        "timeout_seconds": 30,
        "coverage": ["fixture"],
        "exclusions": ["implementation"],
    }
    dump(root / "baseline.json", baseline)
    dump(root / "catalog.json", {"format": 1, "baseline_id": MERGER.BASELINE_ID, "contracts": contracts})
    dump(root / "rebase-map.json", {
        "format": 1,
        "target_baseline_id": MERGER.BASELINE_ID,
        "retired_identities": ["capability.session-run"],
        "relations": [relation],
        "consumer_observations": [{"consumer": "fixture-consumer", "consumes": coordinate("capability.live-agent@1"), "status": "unknown", "evidence": []}],
    })
    dump(root / "frozen.json", {"format": 1, "baseline_id": MERGER.BASELINE_ID, "files": {}})
    dump(root / "formal-tasks.json", {"format": 1, "baseline_id": MERGER.BASELINE_ID, "tasks": [task]})


def run_merge(design: Path, output: Path, *inputs: tuple[str, Path], replacements: Path | None = None, authorization: Path | None = None) -> subprocess.CompletedProcess[str]:
    args = [sys.executable, str(TOOL), "--design-root", str(design), "--snapshot-id", "final-review-sha", "--output", str(output)]
    for label, path in inputs:
        args += ["--input", f"{label}={path}"]
    if replacements:
        args += ["--replacements", str(replacements)]
    if authorization:
        args += ["--adoption-authorization", str(authorization)]
    return subprocess.run(args, text=True, capture_output=True)


def test_merge_deduplicates_exact_items_and_requires_explicit_replacement(tmp_path: Path) -> None:
    design, first, second = tmp_path / "design", tmp_path / "first", tmp_path / "second"
    make_candidate(design, first, label="first")
    make_candidate(design, second, label="second")
    rebase = json.loads((second / "rebase-map.json").read_text())
    rebase["relations"][0]["freeze_gate"]["reason"] = "reviewed replacement"
    dump(second / "rebase-map.json", rebase)

    failed = run_merge(design, tmp_path / "failed", ("first", first), ("second", second))
    assert failed.returncode == 1
    assert "declare an explicit replacement" in failed.stderr

    replacement = tmp_path / "replacements.json"
    dump(replacement, {"format": 1, "relations": {"legacy-live-agent": "second"}})
    output = tmp_path / "output"
    passed = run_merge(design, output, ("first", first), ("second", second), replacements=replacement)
    assert passed.returncode == 0, passed.stderr
    assert len(json.loads((output / "catalog.json").read_text())["contracts"]) == 21
    assert json.loads((output / "rebase-map.json").read_text())["relations"][0]["freeze_gate"]["reason"] == "reviewed replacement"
    assert json.loads((output / "baseline.json").read_text())["snapshot_id"] == "final-review-sha"


def test_merge_fails_closed_on_missing_resource_cross_baseline_and_retired_identity(tmp_path: Path) -> None:
    design, candidate = tmp_path / "design", tmp_path / "candidate"
    make_candidate(design, candidate)
    catalog = json.loads((candidate / "catalog.json").read_text())
    missing = Path(catalog["contracts"][0]["contract_path"])
    (design / missing).unlink()
    result = run_merge(design, tmp_path / "out-missing", ("only", candidate))
    assert result.returncode == 1 and "missing resource" in result.stderr

    (design / missing).write_text("restored\n")
    catalog["contracts"][0]["coordinate"]["baseline_id"] = "another-baseline"
    dump(candidate / "catalog.json", catalog)
    result = run_merge(design, tmp_path / "out-cross", ("only", candidate))
    assert result.returncode == 1 and "crosses baseline" in result.stderr

    catalog["contracts"][0]["coordinate"]["baseline_id"] = MERGER.BASELINE_ID
    dump(candidate / "catalog.json", catalog)
    rebase = json.loads((candidate / "rebase-map.json").read_text())
    rebase["retired_identities"].append("capability.live-agent")
    dump(candidate / "rebase-map.json", rebase)
    result = run_merge(design, tmp_path / "out-retired", ("only", candidate))
    assert result.returncode == 1 and "retired identities outside allowlist" in result.stderr


def test_merge_rejects_unauthorized_accepted_and_frozen_state(tmp_path: Path) -> None:
    design, candidate = tmp_path / "design", tmp_path / "candidate"
    make_candidate(design, candidate)
    catalog = json.loads((candidate / "catalog.json").read_text())
    item = catalog["contracts"][0]
    key = f"{item['coordinate']['contract_id']}@1"
    acceptance = f"decisions/{key.replace('.', '-')}/acceptance.json"
    item["status"] = "accepted"
    item["acceptance"] = acceptance
    dump(design / acceptance, {"format": 1})
    dump(candidate / "catalog.json", catalog)
    result = run_merge(design, tmp_path / "out-unapproved", ("only", candidate))
    assert result.returncode == 1 and "lacks explicit adoption authorization" in result.stderr

    authorization = tmp_path / "authorization.json"
    acceptance_sha = hashlib.sha256((design / acceptance).read_bytes()).hexdigest()
    resource_sha = hashlib.sha256((design / item["contract_path"]).read_bytes()).hexdigest()
    dump(authorization, {
        "format": 1,
        "accepted_coordinates": {key: {"path": acceptance, "sha256": acceptance_sha}},
        "frozen_files": {item["contract_path"]: resource_sha},
    })
    result = run_merge(design, tmp_path / "out-approved", ("only", candidate), authorization=authorization)
    assert result.returncode == 0, result.stderr

    resource = item["contract_path"]
    frozen = json.loads((candidate / "frozen.json").read_text())
    frozen["files"][resource] = "0" * 64
    dump(candidate / "frozen.json", frozen)
    result = run_merge(design, tmp_path / "out-bad-frozen", ("only", candidate), authorization=authorization)
    assert result.returncode == 1 and "lacks exact adoption authorization" in result.stderr


def test_merge_rejects_duplicate_keys_inside_one_candidate(tmp_path: Path) -> None:
    design, candidate = tmp_path / "design", tmp_path / "candidate"
    make_candidate(design, candidate)
    formal = json.loads((candidate / "formal-tasks.json").read_text())
    formal["tasks"].append(copy.deepcopy(formal["tasks"][0]))
    dump(candidate / "formal-tasks.json", formal)
    result = run_merge(design, tmp_path / "out", ("only", candidate))
    assert result.returncode == 1 and "duplicate tasks key inside only" in result.stderr


def test_formal_normalizer_removes_only_the_unsupported_flag(tmp_path: Path) -> None:
    source = {
        "format": 1,
        "baseline_id": MERGER.BASELINE_ID,
        "tasks": [{
            "id": "run-progress",
            "kind": "tlc",
            "artifacts": ["spec/a.tla", "spec/a.cfg"],
            "command": ["java", "tlc2.TLC", "-workers", "2", "-noGenerateSpecTE", "-config", "spec/a.cfg", "spec/a.tla"],
            "timeout_seconds": 900,
            "coverage": ["RN-05"],
            "exclusions": ["provider"],
        }],
    }
    input_path, output, diff = tmp_path / "input.json", tmp_path / "output.json", tmp_path / "diff.json"
    dump(input_path, source)
    result = subprocess.run(
        [sys.executable, str(NORMALIZE_TOOL), "--input", str(input_path), "--output", str(output), "--diff", str(diff)],
        text=True, capture_output=True,
    )
    assert result.returncode == 0, result.stderr
    normalized = json.loads(output.read_text())
    assert normalized["tasks"][0]["command"] == ["java", "tlc2.TLC", "-workers", "2", "-config", "spec/a.cfg", "spec/a.tla"]
    normalized["tasks"][0]["command"] = source["tasks"][0]["command"]
    assert normalized == source
    assert json.loads(diff.read_text())["changes"][0]["removed"] == ["-noGenerateSpecTE"]
