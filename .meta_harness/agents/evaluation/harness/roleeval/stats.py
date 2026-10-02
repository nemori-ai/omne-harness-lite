"""Aggregates recomputed from the scored rows.

Per-case means are taken over status-ok reps and then averaged over cases, the same
way the report builder does, so the summary agrees with ``report.html``. Intervals
are computed over cases, not over cases times reps: reps of one case are correlated,
and counting them as independent observations would make the interval too narrow.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable

Z95 = 1.959963984540054


@dataclass(frozen=True)
class Score:
    metric: str
    mean: float
    lo: float
    hi: float
    cases: int
    observations: int


@dataclass(frozen=True)
class Delta:
    metric: str
    mean: float
    lo: float
    hi: float
    cases: int
    significant: bool


def case_means(rows: Iterable[dict[str, Any]], metric: str) -> dict[str, tuple[float, int]]:
    """case id -> (mean over status-ok reps, number of those reps), for cases that carry the metric."""
    values: dict[str, list[float]] = {}
    for row in rows:
        if row.get("status", "ok") != "ok" or metric not in row["grade"]:
            continue
        values.setdefault(row["prompt_id"], []).append(float(row["grade"][metric]))
    return {case: (sum(v) / len(v), len(v)) for case, v in values.items()}


def wilson(p: float, n: int) -> tuple[float, float]:
    """Wilson score interval; stays inside [0, 1] and does not collapse when p is 0 or 1."""
    if n == 0:
        return (0.0, 1.0)
    centre = (p + Z95 ** 2 / (2 * n)) / (1 + Z95 ** 2 / n)
    half = Z95 * math.sqrt(p * (1 - p) / n + Z95 ** 2 / (4 * n * n)) / (1 + Z95 ** 2 / n)
    return (max(0.0, centre - half), min(1.0, centre + half))


def wald(values: list[float]) -> tuple[float, float]:
    n = len(values)
    mean = sum(values) / n
    if n < 2:
        return (-math.inf, math.inf)
    sd = math.sqrt(sum((v - mean) ** 2 for v in values) / (n - 1))
    half = Z95 * sd / math.sqrt(n)
    return (mean - half, mean + half)


def score(rows: Iterable[dict[str, Any]], metric: str, *, binary: bool) -> Score | None:
    means = case_means(rows, metric)
    if not means:
        return None
    values = [mean for mean, _ in means.values()]
    mean = sum(values) / len(values)
    lo, hi = wilson(mean, len(values)) if binary else wald(values)
    return Score(metric, mean, lo, hi, len(values), sum(reps for _, reps in means.values()))


def paired_delta(reference: Iterable[dict[str, Any]], variant: Iterable[dict[str, Any]], metric: str) -> Delta | None:
    """Per-case difference of means over the cases both sides scored; between-case variance cancels."""
    ref, var = case_means(reference, metric), case_means(variant, metric)
    deltas = [var[case][0] - ref[case][0] for case in sorted(ref.keys() & var.keys())]
    if not deltas:
        return None
    mean = sum(deltas) / len(deltas)
    lo, hi = wald(deltas)
    return Delta(metric, mean, lo, hi, len(deltas), lo > 0 or hi < 0)


def noise_floor(cases: int) -> float:
    """Half-width, in rate points, of the widest 95% interval a pass-rate over this many cases can have."""
    return Z95 * 0.5 / math.sqrt(cases) if cases else 1.0
