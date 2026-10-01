"""Calibrating the model judge against verdicts a person wrote down.

A suite keeps a calibration set under ``calibration/``: reports with a known verdict for every
problem of the material they were written about. Some are real reports a person graded, some are
made to be negatives (a report that says nothing, a report about something else, a real report
with a finding cut out or moved out of the scored groups). The judge is run on each and its
verdict compared with the person's, problem by problem.

What this measures is agreement on these reports. It says nothing about reports of materials
the set does not cover.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import judge
from .grading import JUDGED_RUN_METRICS, GraderError
from .suite import Flow, SuiteError

FORMAT = 1


@dataclass(frozen=True)
class Case:
    id: str
    material: str
    report: Path
    text: str
    kind: str
    origin: str
    seeds: dict[str, tuple[int, str]]
    run: dict[str, tuple[float, str]]


def derive(text: str, ops: list[dict[str, str]]) -> str:
    """A made negative is a real report with stated changes, so what was taken out can be read off the case.

    ``cut`` removes from a marker up to, not including, the next occurrence of another marker;
    ``replace`` swaps one passage. Every marker has to be found exactly once, or the case no longer
    says what it claims to.
    """
    for op in ops:
        if op["op"] == "cut":
            if text.count(op["from"]) != 1:
                raise SuiteError(f"cut marker {op['from'][:40]!r} occurs {text.count(op['from'])} times, not once")
            start = text.index(op["from"])
            end = text.find(op["until"], start + len(op["from"]))
            if end < 0:
                raise SuiteError(f"nothing after {op['from'][:40]!r} matches {op['until'][:40]!r}")
            text = text[:start] + text[end:]
        elif op["op"] == "replace":
            if text.count(op["find"]) != 1:
                raise SuiteError(f"passage {op['find'][:40]!r} occurs {text.count(op['find'])} times, not once")
            text = text.replace(op["find"], op["replace"])
        else:
            raise SuiteError(f"unknown derivation {op['op']!r}")
    return text


def load(flow: Flow) -> tuple[str, list[Case]]:
    """The person who graded, and the cases; every case covers every problem of its material."""
    root = flow.root / "calibration"
    try:
        raw = json.loads((root / "cases.json").read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SuiteError(f"{flow.id} has no calibration/cases.json") from error
    if raw.get("format") != FORMAT:
        raise SuiteError(f"{flow.id}: calibration/cases.json format {raw.get('format')} is not {FORMAT}")
    cases = []
    try:
        for item in raw["cases"]:
            material = flow.material(item["material"])
            where = f"{flow.id} calibration case {item['id']}"
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", item["id"]):
                raise SuiteError(f"{where}: the id names a directory")
            report = root / item["report"]
            if not report.is_file():
                raise SuiteError(f"{where}: report {item['report']} does not exist")
            try:
                text = derive(report.read_text(encoding="utf-8"), item.get("derive", []))
            except SuiteError as error:
                raise SuiteError(f"{where}: {error}") from error
            case = Case(id=item["id"], material=material.id, report=report, text=text, kind=item["kind"],
                        origin=item["origin"],
                        seeds={seed: (int(value), why) for seed, (value, why) in item["seeds"].items()},
                        run={metric: (float(value), why) for metric, (value, why) in item.get("run", {}).items()})
            if set(case.seeds) != {seed.id for seed in material.seeds}:
                raise SuiteError(f"{where}: covers {sorted(case.seeds)}, material {material.id} has "
                                 f"{sorted(seed.id for seed in material.seeds)}")
            if any(value not in (0, 1) or not why.strip() for value, why in case.seeds.values()):
                raise SuiteError(f"{where}: a verdict is 0 or 1 with the reason for it")
            if set(case.run) - set(JUDGED_RUN_METRICS):
                raise SuiteError(f"{where}: unknown run metrics {sorted(set(case.run) - set(JUDGED_RUN_METRICS))}")
            cases.append(case)
        grader = raw["grader"]
    except (KeyError, TypeError, ValueError) as error:
        raise SuiteError(f"{flow.id}: calibration/cases.json is malformed: {error!r}") from error
    if len({case.id for case in cases}) != len(cases):
        raise SuiteError(f"{flow.id}: duplicate calibration case ids")
    return grader, cases


def directory(out: Path, model: str, effort: str) -> Path:
    """Results of one judge under one set of rules; a changed rule is another judge."""
    return out / "_calibration" / re.sub(r"[^A-Za-z0-9.@-]+", "-", judge.identity(model, effort))


def recorded(where: Path) -> dict[str, dict[str, Any]]:
    return {path.parent.name: json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(where.glob("*/result.json"))}


def spent(results: dict[str, dict[str, Any]]) -> float:
    return sum(result["spend"]["judge_cost_usd"] or 0 for result in results.values())


def run(flow: Flow, cases: list[Case], *, model: str, effort: str, out: Path, work: Path, budget_usd: float,
        call_budget_usd: float) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Judge every case that has no result yet. Returns all results and the cases the budget left out.

    A case is not started unless one more call fits the budget. A second attempt on the same case can
    exceed it by at most one call.
    """
    where = directory(out, model, effort)
    results = recorded(where)
    left_out = []
    for case in cases:
        if case.id in results:
            continue
        if spent(results) + call_budget_usd > budget_usd:
            left_out.append(case.id)
            continue
        material = flow.material(case.material)
        target = where / case.id
        target.mkdir(parents=True, exist_ok=True)
        (target / "report.md").write_text(case.text, encoding="utf-8")   # what the judge was actually given
        try:
            verdict, calls = judge.judge(flow, material, case.text, model=model, effort=effort, cwd=work,
                                         evidence=target / "judge.json", budget_usd=call_budget_usd)
            result: dict[str, Any] = {"case": case.id, "status": "judged", "grader": verdict.grader,
                                      "seeds": {seed: list(value) for seed, value in verdict.seeds.items()},
                                      "run": {metric: list(value) for metric, value in verdict.run.items()},
                                      "spend": judge.spend(calls)}
        except GraderError as error:
            result = {"case": case.id, "status": "failed", "error": str(error),
                      "spend": judge.spend(getattr(error, "results", []))}
        (target / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        results[case.id] = result
    return results, left_out


def compare(cases: list[Case], results: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Agreement between the person and the judge, problem by problem and count by count."""
    cells = {"both_caught": 0, "both_missed": 0, "judge_only": 0, "person_only": 0}
    disagreements, run_checks, failed, pending, retried = [], [], [], [], []
    for case in cases:
        result = results.get(case.id)
        if result is None:
            pending.append(case.id)
            continue
        if result["status"] != "judged":
            failed.append({"case": case.id, "error": result["error"]})
            continue
        if result["spend"]["judge_attempts"] > 1:
            # Results recorded before the reasons were kept carry none.
            retried.append({"case": case.id, "reasons": result["spend"].get("judge_rejected") or ["原因当时没有记下"]})
        for seed, (expected, why) in case.seeds.items():
            judged, judge_why = result["seeds"][seed]
            cell = {(1, 1): "both_caught", (0, 0): "both_missed", (0, 1): "judge_only", (1, 0): "person_only"}[
                (expected, judged)]
            cells[cell] += 1
            if expected != judged:
                disagreements.append({"case": case.id, "seed": seed, "person": expected, "person_why": why,
                                      "judge": judged, "judge_why": judge_why})
        for metric, (expected_count, why) in case.run.items():
            judged_count, judge_why = result["run"][metric]
            run_checks.append({"case": case.id, "metric": metric, "person": expected_count, "person_why": why,
                               "judge": judged_count, "judge_why": judge_why,
                               "agree": expected_count == judged_count})
    return {"cells": cells, "disagreements": disagreements, "run_checks": run_checks, "failed": failed,
            "pending": pending, "retried": retried, "judged": sum(cells.values()),
            "attempts": sum(result["spend"]["judge_attempts"] for result in results.values()),
            "cost_usd": spent(results)}


def render(flow: Flow, grader: str, cases: list[Case], results: dict[str, dict[str, Any]], *, model: str,
           effort: str) -> str:
    """The comparison as markdown, for the grading sign-off."""
    outcome = compare(cases, results)
    cells, judged = outcome["cells"], outcome["judged"]
    agree = cells["both_caught"] + cells["both_missed"]
    lines = [
        f"# 判官校准：{flow.id}", "",
        f"判官：`{judge.identity(model, effort)}`", f"人工判定：{grader}", "",
        f"{len(cases)} 份报告，已判 {len(cases) - len(outcome['pending']) - len(outcome['failed'])} 份，"
        f"判官答复没通过核对的 {len(outcome['failed'])} 份，还没判的 {len(outcome['pending'])} 份；"
        f"共 {outcome['attempts']} 次调用，{outcome['cost_usd']:.2f} 美元。", "",
        "## 逐处问题的一致情况", "",
        "| | 判官：报出了 | 判官：没报出 |", "|---|---|---|",
        f"| 人工：报出了 | {cells['both_caught']} | {cells['person_only']} |",
        f"| 人工：没报出 | {cells['judge_only']} | {cells['both_missed']} |", "",
        (f"一致 {agree} / {judged}（{agree / judged:.1%}）。" if judged else "还没有可比的判定。"),
    ]
    lines += ["", "## 每份报告", "", "| 报告 | 种类 | 材料 | 人工：报出 | 判官：报出 | 不一致的问题 | 花费 |",
              "|---|---|---|---|---|---|---|"]
    for case in cases:
        result = results.get(case.id)
        person = sum(value for value, _ in case.seeds.values())
        if result is None:
            lines.append(f"| `{case.id}` | {case.kind} | `{case.material}` | {person} / {len(case.seeds)} | 还没判 | | |")
            continue
        cost = f"{result['spend']['judge_cost_usd'] or 0:.2f}"
        if result["status"] != "judged":
            lines.append(f"| `{case.id}` | {case.kind} | `{case.material}` | {person} / {len(case.seeds)} | "
                         f"答复没通过核对 | | {cost} |")
            continue
        got = sum(value for value, _ in result["seeds"].values())
        differ = [seed for seed, (value, _) in case.seeds.items() if result["seeds"][seed][0] != value]
        lines.append(f"| `{case.id}` | {case.kind} | `{case.material}` | {person} / {len(case.seeds)} | "
                     f"{got} / {len(case.seeds)} | {'、'.join(differ) or '无'} | {cost} |")
    lines += ["", "## 不一致的问题", ""]
    for item in outcome["disagreements"]:
        lines += [f"- `{item['case']}` 的 `{item['seed']}`：人工判 {item['person']}（{item['person_why']}）；"
                  f"判官判 {item['judge']}（{item['judge_why']}）"]
    if not outcome["disagreements"]:
        lines.append("无。")
    lines += ["", "## 运行级的三个计数", "", "| 报告 | 指标 | 人工 | 判官 | 一致 | 判官的依据 |", "|---|---|---|---|---|---|"]
    for item in outcome["run_checks"]:
        lines.append(f"| `{item['case']}` | {item['metric']} | {item['person']:g} | {item['judge']:g} | "
                     f"{'是' if item['agree'] else '**否**'} | {item['judge_why']} |")
    if outcome["retried"]:
        lines += ["", "## 判官的答复被程序驳回、重答之后通过的", ""]
        lines += [f"- `{item['case']}`：{'；'.join(item['reasons'])}" for item in outcome["retried"]]
    if outcome["failed"]:
        lines += ["", "## 判官答复没通过核对的", ""]
        lines += [f"- `{item['case']}`：{item['error']}" for item in outcome["failed"]]
    if outcome["pending"]:
        lines += ["", "## 还没判的", "", "、".join(f"`{case}`" for case in outcome["pending"])]
    return "\n".join(lines) + "\n"
