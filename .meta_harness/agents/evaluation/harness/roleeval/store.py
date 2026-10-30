"""What one variant of one flow leaves on disk.

``results.jsonl`` holds scored rows only. An attempt that never produced a scorable
output (host error, wall-clock ceiling, served-model mismatch, grader crash) goes to
``errors.jsonl`` and leaves its (episode, rep) slot free, so a resume runs it again
and plumbing is never averaged in as a model failure.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

VARIANT_RE = re.compile(r"^(baseline|v\d+)$")
CASE_ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
FAILURE_CLASSES = ("timeout", "harness", "model-mismatch", "effort-mismatch", "budget", "grader", "contaminated")
REQUIRED = ("prompt_id", "prompt", "tags", "rep", "status", "grade", "model", "usage", "meta")


class RowRejected(ValueError):
    """A row that would put a hole or a fake zero into the results."""


def check_row(row: dict[str, Any]) -> None:
    missing = [key for key in REQUIRED if key not in row]
    if missing:
        raise RowRejected(f"row {row.get('prompt_id')!r} lacks {missing}")
    if not CASE_ID_RE.match(str(row["prompt_id"])):
        raise RowRejected(f"case id {row['prompt_id']!r} is not path-safe")
    if not isinstance(row["rep"], int) or row["rep"] < 0:
        raise RowRejected(f"row {row['prompt_id']!r}: rep must be a non-negative integer")
    if not isinstance(row["grade"], dict) or not all(
            isinstance(v, (int, float)) and not isinstance(v, bool) for v in row["grade"].values()):
        raise RowRejected(f"row {row['prompt_id']!r}: grade must map metric ids to numbers")
    if not row["model"]:
        raise RowRejected(f"row {row['prompt_id']!r}: model must come from the host's own record of the run")
    usage = row["usage"]
    if not isinstance(usage, dict) or not usage.get("output_tokens"):
        raise RowRejected(f"row {row['prompt_id']!r}: usage without output tokens is a wiring bug, not a measurement")
    if "episode" not in row["meta"]:
        raise RowRejected(f"row {row['prompt_id']!r}: meta.episode names the agent run the row came from")


class VariantStore:
    def __init__(self, flow_dir: Path, variant: str) -> None:
        if not VARIANT_RE.match(variant):
            raise ValueError(f"variant directory must be 'baseline' or 'v<N>', got {variant!r}")
        self.root = Path(flow_dir) / variant
        self.results = self.root / "results.jsonl"
        self.errors = self.root / "errors.jsonl"
        self.traces = self.root / "traces"

    def rows(self) -> list[dict[str, Any]]:
        return _read_jsonl(self.results)

    def error_rows(self) -> list[dict[str, Any]]:
        return _read_jsonl(self.errors)

    def done(self) -> set[tuple[str, int]]:
        """(episode, rep) pairs that already have scored rows."""
        return {(row["meta"]["episode"], row["rep"]) for row in self.rows()}

    def record_episode(self, rows: Iterable[dict[str, Any]], turns: list[dict[str, Any]]) -> None:
        """Write the trace and every row of one agent run, or nothing."""
        rows = list(rows)
        if not rows:
            raise RowRejected("an episode with no rows is an error, not a result")
        keys = {(row["meta"]["episode"], row["rep"]) for row in rows if "meta" in row and "episode" in row["meta"]}
        for row in rows:
            check_row(row)
        if len(keys) != 1:
            raise RowRejected(f"rows of one episode must share one (episode, rep), got {sorted(keys)}")
        if keys & self.done():
            raise RowRejected(f"{next(iter(keys))} is already recorded; a second copy would mix two runs")
        if not turns:
            raise RowRejected("an episode without a transcript cannot be audited")
        self.traces.mkdir(parents=True, exist_ok=True)
        trace = json.dumps(turns, ensure_ascii=False, indent=1)
        for row in rows:
            (self.traces / f"{row['prompt_id']}_rep{row['rep']}.json").write_text(trace, encoding="utf-8")
        _append(self.results, rows)

    def record_error(self, episode: str, rep: int, failure_class: str, detail: str, *,
                     model: str | None = None, usage: dict[str, Any] | None = None,
                     cost_usd: float | None = None, evidence: str | None = None) -> None:
        if failure_class not in FAILURE_CLASSES:
            raise ValueError(f"unknown failure class {failure_class!r}")
        self.root.mkdir(parents=True, exist_ok=True)
        _append(self.errors, [{"episode": episode, "rep": rep, "failure_class": failure_class, "detail": detail,
                               "model": model, "usage": usage, "cost_usd": cost_usd, "evidence": evidence}])


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _append(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
