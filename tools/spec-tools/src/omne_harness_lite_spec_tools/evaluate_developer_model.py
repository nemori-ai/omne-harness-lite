#!/usr/bin/env python3
"""Validate offline evidence completeness; this never calls or selects a model."""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from jsonschema.validators import validator_for

from .doc_support import repository_root


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
    path = (report_path.parent / artifact["path"]).resolve()
    if not path.is_relative_to(report_path.parent.resolve()):
        issues.append(f"{label} is outside the evidence directory")
        return
    if not path.is_file():
        issues.append(f"{label} is missing")
    elif sha256(path) != artifact["sha256"]:
        issues.append(f"{label} hash does not match")


def evaluate(report_path: Path, schema_path: Path | None = None,
             suite_path: Path | None = None, *, root: Path | None = None) -> EvaluationResult:
    issues: list[str] = []
    try:
        root = root.resolve() if root is not None else repository_root()
    except ValueError as error:
        return EvaluationResult("needs-completion", (str(error),))
    schema_path = schema_path if schema_path is not None else root / ".meta_harness/agents/evaluation/developer-model/formats/developer-model-experiment.schema.json"
    suite_path = suite_path if suite_path is not None else root / ".meta_harness/agents/evaluation/developer-model/suites/developer-model-v1.json"
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
    try:
        validator_class.check_schema(schema)
    except SchemaError as error:
        return EvaluationResult("needs-completion", (f"invalid report format: {error.message}",))
    validator = validator_class(schema, format_checker=FormatChecker())
    for error in sorted(validator.iter_errors(report), key=lambda item: item.json_path):
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
    verify_artifact(report_path, report["analysis_plan"]["artifact"], "analysis plan artifact", issues)
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
    try:
        suite_validator = Draft202012Validator(load_json(root / ".meta_harness/agents/evaluation/developer-model/formats/task-suite.schema.json"))
        for label, suite in (("public", fixed_suite), ("heldout", heldout_suite)):
            for error in suite_validator.iter_errors(suite):
                issues.append(f"{label} task packet {error.json_path}: {error.message}")
    except (OSError, ValueError) as error:
        issues.append(f"task packet schema cannot be read: {error}")
    if issues:
        return EvaluationResult("needs-completion", tuple(issues))
    public_tasks = fixed_suite["tasks"]
    heldout_tasks = heldout_suite["tasks"]
    if heldout_suite["suite_version"] != report["frozen_heldout_suite"]["id"]:
        issues.append("heldout suite identity disagrees with the frozen artifact")
    if any(task["split"] != "training" for task in public_tasks):
        issues.append("public tasks cannot be declared heldout")
    for task in public_tasks + heldout_tasks:
        rubric_ids = [entry["id"] for entry in task["rubric"]]
        if len(rubric_ids) != len(set(rubric_ids)) or not set(task["critical_constraints"]) <= set(rubric_ids):
            issues.append(f"task {task['id']} lacks unique observable rubrics for its critical constraints")
    task_specs = {task["id"]: task for task in public_tasks + heldout_tasks}
    if len(task_specs) != len(public_tasks) + len(heldout_tasks):
        issues.append("task ids must be unique across public and heldout suites")
    if not heldout_tasks or any(task.get("split") != "heldout" for task in heldout_tasks):
        issues.append("frozen heldout suite must contain heldout tasks")
    expected = {(task_id, model, arm, repeat) for task_id in task_specs for model, arm in (("baseline", "retain"), ("candidate", "retain"), ("candidate", "simplify"), ("candidate", "remove")) for repeat in range(1, report["repetitions"] + 1)}
    seen: set[tuple[str, str, str, int]] = set()
    selected_arm = report["adoption_record"]["selected_arm"]
    selected_violation = False
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
                if run["model"] == "candidate" and run["arm"] == selected_arm:
                    selected_violation = True
    missing = expected - seen
    if missing:
        issues.append(f"missing {len(missing)} required task/arm/repeat observations")
    if selected_violation and report["adoption_record"]["decision"] == "adopt":
        issues.append("selected candidate arm violates a critical constraint; adoption record is inconsistent")
    return EvaluationResult("evidence-ready" if not issues else "needs-completion", tuple(issues))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--root", type=Path, help="Checkout supplying evaluation policy; otherwise discover from cwd")
    parser.add_argument("--schema", type=Path)
    parser.add_argument("--suite", type=Path)
    arguments = parser.parse_args()
    result = evaluate(arguments.report, arguments.schema, arguments.suite, root=arguments.root)
    print(result.status)
    for issue in result.issues:
        print(f"- {issue}")
    return 0 if result.status == "evidence-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
