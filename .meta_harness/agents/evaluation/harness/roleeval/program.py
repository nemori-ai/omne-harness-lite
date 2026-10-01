"""What the flows a program judges have in common: the write scope, the tools used, the shape of a row.

In these flows (implement, acceptance) the role changes or runs a checkout, and a program reads the
result off the copy when the run is recorded, before the copy is removed. There is no judge.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .claude_host import Episode
from .suite import Flow, Material


def tally(doc: dict[str, Any] | None, only: list[str] | None = None) -> tuple[int, int, list[str]]:
    """(passed, total, failed names) from a vitest JSON report; a file that failed to load counts as one failure."""
    passed = total = 0
    failed = []
    for result in (doc or {}).get("testResults", []):
        name = Path(result["name"]).name
        if only is not None and name not in only:
            continue
        for assertion in result["assertionResults"]:
            total += 1
            if assertion["status"] == "passed":
                passed += 1
            else:
                failed.append(f"{name} :: {assertion['fullName'] if 'fullName' in assertion else assertion['title']}")
        if not result["assertionResults"] and result.get("status") == "failed":
            failed.append(f"{name} :: (file failed to load)")
    return passed, total, failed


def outside_scope(changes: list[tuple[str, str]], allowed: list[str] | tuple[str, ...]) -> list[str]:
    """Changed paths that are neither an allowed file nor under an allowed directory (one ending in '/')."""
    return [path for _, path in changes
            if not any(path == entry or (entry.endswith("/") and path.startswith(entry)) for entry in allowed)]


def only_allowed(episode: Episode, allowed: list[str]) -> tuple[int, str]:
    """Whether every tool the run called is on the flow's list."""
    outside = sorted({name for name in episode.tool_names if name not in allowed})
    return (0, f"放行之外的工具：{'、'.join(outside)}") if outside else (1, "轨迹里只有放行的工具")


def grader(flow: Flow) -> str:
    return f"program:{flow.family} {flow.id} v{flow.version}"


def row(flow: Flow, material: Material, rep: int, record: dict[str, Any], *, case: str, prompt: str,
        tags: list[str], unit: str, scored: dict[str, tuple[float, str]]) -> dict[str, Any]:
    """One scored row; a truncated run keeps its row but carries no grade."""
    status = "truncated" if record["truncated"] else "ok"
    return {
        "rep": rep, "status": status, "model": record["model"], "usage": record["usage"],
        "stop_reason": record["stop_reason"], "latency_s": record["wall_seconds"], "tool_calls": record["tool_calls"],
        "prompt_id": f"{material.id}.{case}", "prompt": prompt, "tags": [material.id, unit, *material.tags, *tags],
        "grade": {} if status != "ok" else {metric: value for metric, (value, _) in scored.items()},
        "explanation": {metric: why for metric, (_, why) in scored.items()},
        "meta": {"episode": material.id, "flow": flow.id, "grader": grader(flow), "unit": unit,
                 **record["provenance"]},
    }
