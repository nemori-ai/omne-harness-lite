#!/usr/bin/env python3
"""Validate offline evidence completeness; this never calls or selects a model."""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import FormatChecker
from jsonschema.validators import validator_for

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCHEMA = ROOT / "docs/evaluation/formats/developer-model-experiment.schema.json"
DEFAULT_SUITE = ROOT / "docs/evaluation/suites/developer-model-v1.json"


@dataclass(frozen=True)
class EvaluationResult:
    status: str
    issues: tuple[str, ...]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def verify_artifact(report_path: Path, artifact: dict[str, str], label: str, issues: list[str]) -> None:
    path = report_path.parent / artifact["path"]
    if not path.is_file():
        issues.append(f"{label} is missing")
    elif sha256(path) != artifact["sha256"]:
        issues.append(f"{label} hash does not match")


def evaluate(report_path: Path, schema_path: Path = DEFAULT_SCHEMA, suite_path: Path = DEFAULT_SUITE) -> EvaluationResult:
    issues: list[str] = []
    try:
        report = load_json(report_path)
    except (OSError, json.JSONDecodeError) as error:
        return EvaluationResult("needs-completion", (f"report cannot be read: {error}",))
    try:
        schema = load_json(schema_path)
        fixed_suite = load_json(suite_path)
    except (OSError, json.JSONDecodeError) as error:
        return EvaluationResult("needs-completion", (f"evaluation inputs cannot be read: {error}",))

    validator_class = validator_for(schema)
    validator_class.check_schema(schema)
    validator = validator_class(schema, format_checker=FormatChecker())
    for error in sorted(validator.iter_errors(report), key=lambda item: list(item.absolute_path)):
        location = "/".join(str(part) for part in error.absolute_path) or "report"
        issues.append(f"schema {location}: {error.message}")
    if issues:
        return EvaluationResult("needs-completion", tuple(issues))

    if report["report_state"] != "completed":
        issues.append("report_state must be completed")
    public_suite = report["public_suite"]
    if public_suite["id"] != fixed_suite.get("suite_version"):
        issues.append("report suite id does not match the fixed suite")
    if public_suite["artifact"]["sha256"] != sha256(suite_path):
        issues.append("report suite hash does not match the fixed suite")
    verify_artifact(report_path, public_suite["artifact"], "public suite artifact", issues)
    verify_artifact(report_path, report["frozen_heldout_suite"]["artifact"], "frozen heldout suite artifact", issues)
    for label, item in (("baseline configuration", report["baseline"]["configuration"]), ("candidate configuration", report["candidate"]["configuration"])):
        verify_artifact(report_path, item, label, issues)
    for name, item in report["environment"].items():
        verify_artifact(report_path, item["artifact"], f"{name} artifact", issues)
    for arm in report["arms"]:
        verify_artifact(report_path, arm["aid"], f"{arm['id']} aid artifact", issues)
    if report["baseline"] == report["candidate"]:
        issues.append("baseline and candidate must be distinguishable")
    arm_ids = [arm["id"] for arm in report["arms"]]
    if set(arm_ids) != {"retain", "simplify", "remove"} or len(set(arm_ids)) != 3:
        issues.append("arms must contain retain, simplify, and remove exactly once")
    if len({arm["pattern_id"] for arm in report["arms"]}) != 1:
        issues.append("all arms must name the same defensive pattern")

    try:
        heldout_path = report_path.parent / report["frozen_heldout_suite"]["artifact"]["path"]
        heldout_suite = load_json(heldout_path)
    except (OSError, json.JSONDecodeError) as error:
        return EvaluationResult("needs-completion", tuple(issues + [f"heldout suite cannot be read: {error}"]))
    public_tasks = fixed_suite.get("tasks", [])
    heldout_tasks = heldout_suite.get("tasks", [])
    if not isinstance(public_tasks, list) or not isinstance(heldout_tasks, list):
        return EvaluationResult("needs-completion", tuple(issues + ["task suites must contain task arrays"]))
    required_task_fields = {"id", "split", "critical_constraints", "prompt", "fixture", "rubric"}
    if any(not isinstance(task, dict) or not required_task_fields <= task.keys() for task in public_tasks + heldout_tasks):
        return EvaluationResult("needs-completion", tuple(issues + ["task suite contains an incomplete task packet"]))
    task_specs = {task["id"]: task for task in public_tasks + heldout_tasks}
    if len(task_specs) != len(public_tasks) + len(heldout_tasks):
        issues.append("task ids must be unique across public and heldout suites")
    if not heldout_tasks or any(task.get("split") != "heldout" for task in heldout_tasks):
        issues.append("frozen heldout suite must contain heldout tasks")
    expected = {(task_id, model, arm, repeat) for task_id in task_specs for model, arm in (("baseline", "retain"), ("candidate", "retain"), ("candidate", "simplify"), ("candidate", "remove")) for repeat in range(1, report["repetitions"] + 1)}
    seen: set[tuple[str, str, str, int]] = set()
    has_violation = False
    for index, run in enumerate(report["task_runs"]):
        task = task_specs.get(run["task_id"])
        key = (run["task_id"], run["model"], run["arm"], run["repeat"])
        if task is None:
            issues.append(f"task_runs[{index}] has an unknown task")
            continue
        if run["split"] != task["split"]:
            issues.append(f"task_runs[{index}] split disagrees with the suite")
        if run["repeat"] > report["repetitions"]:
            issues.append(f"task_runs[{index}] repeat exceeds repetitions")
        if key in seen:
            issues.append(f"task_runs[{index}] duplicates a task/model/arm/repeat")
        seen.add(key)
        if key not in expected:
            issues.append(f"task_runs[{index}] is not a required baseline/candidate comparison")
        verify_artifact(report_path, run["artifact"], f"task_runs[{index}] evidence artifact", issues)
        observation_ids = [item["id"] for item in run["constraint_observations"]]
        if len(observation_ids) != len(set(observation_ids)):
            issues.append(f"task_runs[{index}] duplicates a constraint observation")
        observed = {item["id"]: item["status"] for item in run["constraint_observations"]}
        for constraint in task["critical_constraints"]:
            status = observed.get(constraint)
            if status == "unobserved" or status is None:
                issues.append(f"task_runs[{index}] critical constraint {constraint} is unobserved")
            elif status == "violated":
                has_violation = True
    missing = expected - seen
    if missing:
        issues.append(f"missing {len(missing)} required task/arm/repeat observations")
    if has_violation and report["adoption_record"]["decision"] == "adopt":
        issues.append("a report with violated critical constraints cannot record adopt")
    return EvaluationResult("evidence-ready" if not issues else "needs-completion", tuple(issues))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--suite", type=Path, default=DEFAULT_SUITE)
    arguments = parser.parse_args()
    result = evaluate(arguments.report, arguments.schema, arguments.suite)
    print(result.status)
    for issue in result.issues:
        print(f"- {issue}")
    return 0 if result.status == "evidence-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
