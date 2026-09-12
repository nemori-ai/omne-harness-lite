import hashlib
import json
import sys
from pathlib import Path
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from evaluate_developer_model import DEFAULT_SUITE, evaluate, sha256  # noqa: E402


def write_report(tmp_path: Path) -> Path:
    suite = json.loads(DEFAULT_SUITE.read_text())
    artifact = tmp_path / "trajectory.txt"
    artifact.write_text("reviewable local trajectory\n", encoding="utf-8")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    run_data = []
    for task in suite["tasks"]:
        for arm in ("retain", "simplify", "remove"):
            run_data.append({
                "task_id": task["id"], "split": task["split"], "arm": arm, "repeat": 1,
                "artifact": {"path": artifact.name, "sha256": digest},
                "constraint_observations": [
                    {"id": constraint, "status": "satisfied", "evidence": "trajectory reviewed"}
                    for constraint in task["critical_constraints"]
                ],
                "cost": {"input_tokens": 1, "output_tokens": 1, "duration_ms": 1, "tool_calls": 0, "human_interventions": 0}
            })
    digest64 = "a" * 64
    report = {
        "format_version": 1, "report_id": "sample", "evaluation_target": "developer_agent", "report_state": "completed",
        "suite": {"id": suite["suite_version"], "version": "1", "sha256": sha256(DEFAULT_SUITE)},
        "baseline": {"provider": "example", "model_id": "base", "revision": "r1", "configuration_sha256": digest64},
        "candidate": {"provider": "example", "model_id": "candidate", "revision": "r2", "configuration_sha256": digest64},
        "environment": {key: {"id": key, "version": "v1", "sha256": digest64} for key in ("reasoning", "harness", "tools", "prompt")},
        "arms": [{"id": arm, "aid_sha256": digest64} for arm in ("retain", "simplify", "remove")],
        "repetitions": 1, "task_runs": run_data,
        "adoption_record": {"decision": "undecided", "recorded_by": "human reviewer", "recorded_on": "2026-09-12", "scope": "sample only", "rationale": "Awaiting human judgement.", "review_triggers": ["model revision changes"]}
    }
    destination = tmp_path / "report.json"
    destination.write_text(json.dumps(report), encoding="utf-8")
    return destination


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def write(path: Path, document: dict) -> None:
    path.write_text(json.dumps(document), encoding="utf-8")


class DeveloperModelEvaluationTests(unittest.TestCase):
    def test_complete_report_is_evidence_ready(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(evaluate(write_report(Path(directory))).status, "evidence-ready")

    def test_missing_comparison_arm_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = read(report_path)
            report["arms"] = report["arms"][:2]
            write(report_path, report)
            result = evaluate(report_path)
            self.assertEqual(result.status, "needs-completion")
            self.assertTrue(result.issues)

    def test_tampered_trajectory_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            temp_path = Path(directory)
            report_path = write_report(temp_path)
            (temp_path / "trajectory.txt").write_text("tampered", encoding="utf-8")
            result = evaluate(report_path)
            self.assertEqual(result.status, "needs-completion")
            self.assertTrue(any("hash" in issue for issue in result.issues))

    def test_unobserved_critical_constraint_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = read(report_path)
            report["task_runs"][0]["constraint_observations"][0]["status"] = "unobserved"
            write(report_path, report)
            result = evaluate(report_path)
            self.assertEqual(result.status, "needs-completion")
            self.assertTrue(any("critical constraint" in issue for issue in result.issues))

    def test_missing_repeat_observation_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = read(report_path)
            report["task_runs"].pop()
            write(report_path, report)
            self.assertEqual(evaluate(report_path).status, "needs-completion")

    def test_product_runtime_target_is_rejected_by_the_protocol_schema(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_path = write_report(Path(directory))
            report = read(report_path)
            report["evaluation_target"] = "product_runtime_agent"
            write(report_path, report)
            self.assertEqual(evaluate(report_path).status, "needs-completion")
