"""Calibrating the model judge against verdicts a person wrote down.

A suite keeps a calibration set under ``calibration/``: reports with a known verdict for every
problem of the material they were written about. Some are real reports a person graded, some are
made to be negatives (a report that says nothing, a report about something else, a real report
with a finding cut out or moved out of the scored groups). A main session hands each one to a
judge subagent; the answer is checked here and compared with the person's, problem by problem.

What this measures is agreement on these reports. It says nothing about reports of materials
the set does not cover.
"""
from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import judge
from .claude_host import Episode
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


def directory(out: Path, model: str) -> Path:
    """Results of one judge under one set of rules; a changed rule is another judge."""
    return out / "_calibration" / re.sub(r"[^A-Za-z0-9.@-]+", "-", judge.identity(model))


def recorded(where: Path) -> dict[str, dict[str, Any]]:
    return {path.parent.name: json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(where.glob("*/result.json"))}


def write_brief(flow: Flow, case: Case, out: Path) -> Path:
    """Write what the judge is told for this case; a main session points a subagent at the file."""
    path = out / "_calibration" / "_briefs" / f"{case.id}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(judge.brief(flow, flow.material(case.material), case.text), encoding="utf-8")
    return path


def record(flow: Flow, case: Case, episode: Episode, *, out: Path, transcript: Path) -> dict[str, Any]:
    """Take the answer a judge subagent gave for one case.

    An answer that fails its checks is kept as a thrown-away attempt and ``GraderError`` is raised,
    so the caller dispatches the judge again; after the last allowed attempt the case is stored as failed.
    """
    path = out / "_calibration" / "_briefs" / f"{case.id}.md"
    if not path.is_file() or path.read_text(encoding="utf-8") != judge.brief(flow, flow.material(case.material), case.text):
        raise judge.NotThisJudge(f"{path} is not the brief of case {case.id} as the suite now has it; write it again")
    name = judge.read(episode, path, signed=None)
    target = directory(out, episode.models_observed[0]) / case.id
    if (target / "result.json").exists():
        raise SuiteError(f"calibration case {case.id} already has a result under {target.parent.name}")
    target.mkdir(parents=True, exist_ok=True)
    (target / "report.md").write_text(case.text, encoding="utf-8")   # what the judge was actually given
    log = target / "attempts.json"
    attempts = json.loads(log.read_text(encoding="utf-8")) if log.exists() else []
    shutil.copyfile(transcript, target / f"judge.attempt{len(attempts)}.jsonl")
    try:
        verdict = judge.verdict(judge.parse_answer(episode.final), flow.material(case.material), case.text, grader=name)
    except GraderError as error:
        attempts.append(judge.attempt(episode, rejected=str(error)))
        log.write_text(json.dumps(attempts, ensure_ascii=False, indent=1), encoding="utf-8")
        if len(attempts) < judge.ATTEMPTS:
            raise
        result: dict[str, Any] = {"case": case.id, "status": "failed", "error": str(error), "grader": name,
                                  "spend": judge.spend(attempts)}
    else:
        attempts.append(judge.attempt(episode))
        log.write_text(json.dumps(attempts, ensure_ascii=False, indent=1), encoding="utf-8")
        result = {"case": case.id, "status": "judged", "grader": verdict.grader,
                  "seeds": {seed: list(value) for seed, value in verdict.seeds.items()},
                  "run": {metric: list(value) for metric, value in verdict.run.items()},
                  "spend": judge.spend(attempts)}
    (target / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


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
            retried.append({"case": case.id, "reasons": result["spend"]["judge_rejected"]})
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
            "efforts": sorted({effort for result in results.values() for effort in result["spend"]["judge_efforts"]}),
            "output_tokens": sum(result["spend"]["judge_usage"]["output_tokens"] for result in results.values())}


def render(flow: Flow, grader: str, cases: list[Case], results: dict[str, dict[str, Any]], *, model: str) -> str:
    """The comparison as markdown, for the grading sign-off."""
    outcome = compare(cases, results)
    cells, judged = outcome["cells"], outcome["judged"]
    agree = cells["both_caught"] + cells["both_missed"]
    lines = [
        f"# 判官校准：{flow.id}", "",
        f"判官：`{judge.identity(model)}`（以 subagent 派发；宿主记录的档位：{'、'.join(outcome['efforts']) or '未记录'}）",
        f"人工判定：{grader}", "",
        f"{len(cases)} 份报告，已判 {len(cases) - len(outcome['pending']) - len(outcome['failed'])} 份，"
        f"判官答复没通过核对的 {len(outcome['failed'])} 份，还没判的 {len(outcome['pending'])} 份；"
        f"共 {outcome['attempts']} 次派发。", "",
        "## 逐处问题的一致情况", "",
        "| | 判官：报出了 | 判官：没报出 |", "|---|---|---|",
        f"| 人工：报出了 | {cells['both_caught']} | {cells['person_only']} |",
        f"| 人工：没报出 | {cells['judge_only']} | {cells['both_missed']} |", "",
        (f"一致 {agree} / {judged}（{agree / judged:.1%}）。" if judged else "还没有可比的判定。"),
    ]
    lines += ["", "## 每份报告", "", "| 报告 | 种类 | 材料 | 人工：报出 | 判官：报出 | 不一致的问题 | 派发次数 |",
              "|---|---|---|---|---|---|---|"]
    for case in cases:
        result = results.get(case.id)
        person = sum(value for value, _ in case.seeds.values())
        if result is None:
            lines.append(f"| `{case.id}` | {case.kind} | `{case.material}` | {person} / {len(case.seeds)} | 还没判 | | |")
            continue
        cost = str(result["spend"]["judge_attempts"])
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
