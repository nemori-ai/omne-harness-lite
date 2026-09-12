import hashlib
import json
import sys
from pathlib import Path
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from evaluate_developer_model import DEFAULT_SUITE, evaluate, sha256  # noqa: E402


def artifact(directory: Path, name: str, content: str) -> dict:
    path = directory / name
    path.write_text(content, encoding="utf-8")
    return {"path": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def write_report(directory: Path) -> Path:
    public = artifact(directory, "public-suite.json", DEFAULT_SUITE.read_text())
    heldout_document = {"suite_version": "heldout-v1", "tasks": [{
        "id": "heldout-authority", "split": "heldout", "critical_constraints": ["authority"],
        "prompt": "Apply authority resolution to a fresh fixture.", "fixture": {"authoritative_rule": "tenant identity is required"},
        "rubric": [{"id": "authority", "observable": "Names the authoritative source."}]
    }]}
    heldout = artifact(directory, "heldout-suite.json", json.dumps(heldout_document))
    files = {name: artifact(directory, f"{name}.txt", name) for name in ("base-config", "candidate-config", "reasoning", "harness", "tools", "prompt", "retain", "simplify", "remove", "trajectory", "analysis-plan")}
    suites = json.loads(DEFAULT_SUITE.read_text())
    tasks = suites["tasks"] + heldout_document["tasks"]
    runs = []
    for task in tasks:
        for model, arm in (("baseline", "retain"), ("candidate", "retain"), ("candidate", "simplify"), ("candidate", "remove")):
            runs.append({"task_id": task["id"], "split": task["split"], "model": model, "arm": arm, "repeat": 1, "artifact": files["trajectory"], "constraint_observations": [{"id": item, "status": "satisfied", "evidence": "reviewed trajectory"} for item in task["critical_constraints"]], "cost": {"input_tokens": 1, "output_tokens": 1, "duration_ms": 1, "tool_calls": 0, "human_interventions": 0}})
    report = {
        "format_version": 1, "report_id": "sample", "evaluation_target": "developer_agent", "report_state": "completed",
        "public_suite": {"id": suites["suite_version"], "version": "1", "artifact": public},
        "frozen_heldout_suite": {"id": "heldout-v1", "version": "1", "artifact": heldout, "non_contamination_attestation": "This file was frozen before prompt or aid tuning."},
        "baseline": {"provider": "example", "model_id": "base", "revision": "r1", "configuration": files["base-config"]},
        "candidate": {"provider": "example", "model_id": "candidate", "revision": "r2", "configuration": files["candidate-config"]},
        "environment": {name: {"id": name, "version": "v1", "artifact": files[name]} for name in ("reasoning", "harness", "tools", "prompt")},
        "analysis_plan": {"id": "plan", "version": "1", "artifact": files["analysis-plan"]},
        "arms": [{"id": arm, "pattern_id": "defensive.authority", "aid": files[arm]} for arm in ("retain", "simplify", "remove")],
        "repetitions": 1, "task_runs": runs,
        "adoption_record": {"decision": "undecided", "selected_arm": None, "recorded_by": "human reviewer", "recorded_on": "2026-09-12", "scope": "sample only", "rationale": "Awaiting human judgement.", "review_triggers": ["model revision changes"]}
    }
    report_path = directory / "report.json"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    return report_path


def mutate(path: Path) -> dict:
    return json.loads(path.read_text())


class DeveloperModelEvaluationTests(unittest.TestCase):
    def test_complete_report_is_evidence_ready(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(evaluate(write_report(Path(directory))).status, "evidence-ready")

    def test_complete_negative_result_is_evidence_ready_for_do_not_adopt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = mutate(report_path)
            report["task_runs"][0]["constraint_observations"][0]["status"] = "violated"
            report["adoption_record"]["decision"] = "do_not_adopt"
            report_path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(evaluate(report_path).status, "evidence-ready")

    def test_negative_result_cannot_record_adopt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = mutate(report_path)
            report["task_runs"][0]["constraint_observations"][0]["status"] = "violated"
            report["adoption_record"]["decision"] = "adopt"
            report["adoption_record"]["selected_arm"] = "retain"
            report["task_runs"][1]["constraint_observations"][0]["status"] = "violated"
            report_path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(evaluate(report_path).status, "needs-completion")

    def test_unobserved_critical_constraint_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = mutate(report_path)
            report["task_runs"][0]["constraint_observations"][0]["status"] = "unobserved"
            report_path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(evaluate(report_path).status, "needs-completion")

    def test_missing_baseline_run_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = mutate(report_path)
            report["task_runs"] = [run for run in report["task_runs"] if not (run["task_id"] == "authority-source" and run["model"] == "baseline")]
            report_path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(evaluate(report_path).status, "needs-completion")

    def test_tampered_configuration_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            report_path = write_report(path)
            (path / "candidate-config.txt").write_text("tampered", encoding="utf-8")
            self.assertEqual(evaluate(report_path).status, "needs-completion")

    def test_incomplete_frozen_task_packet_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            report_path = write_report(path)
            report = mutate(report_path)
            heldout_path = path / report["frozen_heldout_suite"]["artifact"]["path"]
            heldout = json.loads(heldout_path.read_text())
            del heldout["tasks"][0]["rubric"]
            heldout_path.write_text(json.dumps(heldout), encoding="utf-8")
            report["frozen_heldout_suite"]["artifact"]["sha256"] = sha256(heldout_path)
            report_path.write_text(json.dumps(report), encoding="utf-8")
            self.assertEqual(evaluate(report_path).status, "needs-completion")

    def test_rejected_arm_does_not_prevent_selecting_a_successful_arm(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_report(Path(directory))
            report = mutate(path)
            report["task_runs"][3]["constraint_observations"][0]["status"] = "violated"
            report["adoption_record"].update(decision="adopt", selected_arm="retain")
            path.write_text(json.dumps(report))
            self.assertEqual(evaluate(path).status, "evidence-ready")

    def test_empty_heldout_constraints_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_report(Path(directory))
            report = mutate(path)
            heldout = path.parent / "heldout-suite.json"
            data = json.loads(heldout.read_text())
            data["tasks"][0]["critical_constraints"] = []
            heldout.write_text(json.dumps(data))
            report["frozen_heldout_suite"]["artifact"]["sha256"] = sha256(heldout)
            path.write_text(json.dumps(report))
            self.assertEqual(evaluate(path).status, "needs-completion")
