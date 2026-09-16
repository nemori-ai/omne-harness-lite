#!/usr/bin/env python3
"""Create a review candidate by removing only TLC 2.19's unsupported output flag."""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any


UNSUPPORTED = "-noGenerateSpecTE"


class NormalizeError(ValueError):
    pass


def load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise NormalizeError(str(error)) from error
    if not isinstance(value, dict) or value.get("format") != 1 or not isinstance(value.get("tasks"), list):
        raise NormalizeError("input must be a format=1 formal manifest with a tasks array")
    return value


def normalize(raw: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    result = copy.deepcopy(raw)
    diffs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, task in enumerate(result["tasks"]):
        if not isinstance(task, dict) or not isinstance(task.get("id"), str):
            raise NormalizeError(f"tasks[{index}] needs a string id")
        task_id = task["id"]
        if task_id in seen:
            raise NormalizeError(f"duplicate task id: {task_id}")
        seen.add(task_id)
        command = task.get("command")
        if not isinstance(command, list) or not all(isinstance(arg, str) for arg in command):
            raise NormalizeError(f"task {task_id} command must be a string array")
        count = command.count(UNSUPPORTED)
        if count > 1:
            raise NormalizeError(f"task {task_id} repeats unsupported flag")
        if count == 1:
            before = list(command)
            task["command"] = [arg for arg in command if arg != UNSUPPORTED]
            diffs.append({"task_id": task_id, "removed": [UNSUPPORTED], "before": before, "after": task["command"]})
    return result, diffs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--diff", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        normalized, diffs = normalize(load(args.input))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.diff.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n")
        args.diff.write_text(json.dumps({"format": 1, "changes": diffs}, ensure_ascii=False, indent=2) + "\n")
        print(f"PASS: normalized {len(diffs)} task command(s); all other fields were preserved.")
        return 0
    except (OSError, NormalizeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
