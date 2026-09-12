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


def evaluate(report_path: Path, schema_path: Path = DEFAULT_SCHEMA, suite_path: Path = DEFAULT_SUITE) -> EvaluationResult:
    issues: list[str] = []
    try:
        report = load_json(report_path)
    except (OSError, json.JSONDecodeError) as error:
        return EvaluationResult("needs-completion", (f"report cannot be read: {error}",))
    try:
        schema = load_json(schema_path)
        suite = load_json(suite_path)
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
    if report["suite"]["id"] != suite.get("suite_version"):
        issues.append("report suite id does not match the fixed suite")
    if report["suite"]["sha256"] != sha256(suite_path):
        issues.append("report suite hash does not match the fixed suite")
    if report["baseline"] == report["candidate"]:
        issues.append("baseline and candidate must be distinguishable")
    arm_ids = [arm["id"] for arm in report["arms"]]
    if set(arm_ids) != {"retain", "simplify", "remove"} or len(set(arm_ids)) != 3:
        issues.append("arms must contain retain, simplify, and remove exactly once")

    task_specs = {task["id"]: task for task in suite.get("tasks", [])}
    expected = {(task_id, arm, repeat) for task_id in task_specs for arm in arm_ids for repeat in range(1, report["repetitions"] + 1)}
    seen: set[tuple[str, str, int]] = set()
    for index, run in enumerate(report["task_runs"]):
        task = task_specs.get(run["task_id"])
        key = (run["task_id"], run["arm"], run["repeat"])
        if task is None:
            issues.append(f"task_runs[{index}] has an unknown task")
            continue
        if run["split"] != task["split"]:
            issues.append(f"task_runs[{index}] split disagrees with the suite")
        if run["repeat"] > report["repetitions"]:
            issues.append(f"task_runs[{index}] repeat exceeds repetitions")
        if key in seen:
            issues.append(f"task_runs[{index}] duplicates a task/arm/repeat")
        seen.add(key)
        artifact = report_path.parent / run["artifact"]["path"]
        if not artifact.is_file():
            issues.append(f"task_runs[{index}] evidence artifact is missing")
        elif sha256(artifact) != run["artifact"]["sha256"]:
            issues.append(f"task_runs[{index}] evidence artifact hash does not match")
        observation_ids = [item["id"] for item in run["constraint_observations"]]
        if len(observation_ids) != len(set(observation_ids)):
            issues.append(f"task_runs[{index}] duplicates a constraint observation")
        observed = {item["id"]: item["status"] for item in run["constraint_observations"]}
        for constraint in task["critical_constraints"]:
            if observed.get(constraint) != "satisfied":
                issues.append(f"task_runs[{index}] critical constraint {constraint} is not satisfied")
    missing = expected - seen
    if missing:
        issues.append(f"missing {len(missing)} required task/arm/repeat observations")
    if not any(task["split"] == "heldout" for task in task_specs.values()):
        issues.append("fixed suite has no heldout task")
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
