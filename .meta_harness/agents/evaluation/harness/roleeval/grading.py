"""What a grader says about one review report, whoever the grader is.

A verdict covers every seed of the material and every judged run-level metric; a
grader that leaves one out has failed, and the episode is not scored.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .suite import Material

# Counts read off the report by a grader: findings outside the kind of judgment asked for, blocking findings,
# and blocking findings that match neither a target nor a known issue of the material.
JUDGED_RUN_METRICS = ("out_of_kind", "blocking", "novel_blocking")


class GraderError(RuntimeError):
    """The grader did not produce a complete verdict."""


@dataclass(frozen=True)
class Verdict:
    grader: str
    seeds: dict[str, tuple[int, str]]
    run: dict[str, tuple[float, str]]


def check(verdict: Verdict, material: Material) -> None:
    expected = {seed.id for seed in material.seeds}
    if set(verdict.seeds) != expected:
        raise GraderError(f"{material.id}: verdict covers seeds {sorted(verdict.seeds)}, material has {sorted(expected)}")
    for seed_id, (caught, why) in verdict.seeds.items():
        if caught not in (0, 1) or not why.strip():
            raise GraderError(f"{material.id}.{seed_id}: a seed verdict is 0 or 1 with the sentence it rests on")
    if set(verdict.run) != set(JUDGED_RUN_METRICS):
        raise GraderError(f"{material.id}: verdict must carry exactly {JUDGED_RUN_METRICS}")
    for metric, (value, why) in verdict.run.items():
        if value < 0 or not why.strip():
            raise GraderError(f"{material.id}: {metric} is a count with its reason")


def from_labels(path: Path, material: Material, rep: int) -> Verdict:
    """Verdicts a person wrote down, one entry per (material, rep)."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    try:
        entry: dict[str, Any] = raw["episodes"][material.id][str(rep)]
    except KeyError as error:
        raise GraderError(f"{path.name} has no labels for {material.id} rep {rep}") from error
    sha = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    verdict = Verdict(grader=f"{raw['grader']} [{path.name}@{sha}]",
                      seeds={seed: (int(value), why) for seed, (value, why) in entry["seeds"].items()},
                      run={metric: (float(value), why) for metric, (value, why) in entry["run"].items()})
    check(verdict, material)
    return verdict
