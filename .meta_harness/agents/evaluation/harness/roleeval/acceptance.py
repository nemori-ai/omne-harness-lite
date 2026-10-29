"""The acceptance family: qa runs a fixed list of criteria against a built checkout; a program judges the report.

The copy has the implementer's tests removed and the seeded defects built into the artefact. The role
writes a ``report.json`` with a verdict and a result for each criterion; when the run is recorded the
program compares it with what the defects are known to break. This is the judgment of the earlier
role-model comparison (``the scoped program-judged suite``: ``prepare``, ``oracle_acceptance``)
with its third revision (``evalrun_r3.py``): a criterion listed under ``either`` may be judged pass or fail.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from . import checkout, program, workspace
from .claude_host import Episode
from .suite import Flow, Material

REQUIRED_FIELDS = ("commit", "run_id", "exit_code", "verifier")
VERDICTS = ("Pass", "Pass with issues", "Fail", "Unable to verify")


def brief(flow: Flow, material: Material, *, workdir: str, rep: int, keep: tuple[str, ...] = ()) -> str:
    values = {"TASK_ID": material.id, "RUN_ID": checkout.run_id(material, rep), "ROLE": flow.role, "WORKDIR": workdir}
    return checkout.fill(material.brief.read_text(encoding="utf-8"), values, keep=keep)


def prepare(flow: Flow, material: Material, dest: Path) -> dict[str, str]:
    """Remove the implementer's tests, build the defects into the artefact; return the artefact's hash."""
    shutil.rmtree(dest / flow.oracle["member"] / flow.oracle["tests_dir"])
    workspace.apply(dest, [{"op": "replace", **defect} for defect in material.defects], suite=flow.root)
    checkout.rebuild(flow, dest)
    return {"artefact": workspace.tree_hash(dest / flow.oracle["artefact"])}


def criterion_ok(material: Material, criterion: str, result: str | None) -> bool:
    """Whether a criterion was judged as the defects say; one under ``either`` only has to be judged at all."""
    expected = material.expected or {}
    if criterion in expected.get("either", ()):
        return result in ("pass", "fail")
    return result == ("fail" if criterion in expected["failing_criteria"] else "pass")


def judge(flow: Flow, material: Material, dest: Path, *, evidence: Path, artefact: str) -> dict[str, Any]:
    """Read the report the run left in its copy and hold it against the expected verdict and criteria."""
    oracle, expected = flow.oracle, material.expected or {}
    evidence.mkdir(parents=True, exist_ok=True)
    changes = workspace.changed_paths(dest)
    reports = sorted(dest.glob(oracle["report_glob"]))
    result: dict[str, Any] = {
        "report_found": bool(reports), "artefact_unchanged": workspace.tree_hash(dest / oracle["artefact"]) == artefact,
        "changes": [path for _, path in changes], "outside": program.outside_scope(changes, material.allowed_write),
        "criteria": {}, "success": False,
    }
    if reports:
        shutil.copyfile(reports[-1], evidence / "report.json")
        written = reports[-1].with_name("report.md")
        if written.exists():
            shutil.copyfile(written, evidence / "report.md")
        try:
            doc = json.loads(reports[-1].read_text(encoding="utf-8"))
            if not isinstance(doc, dict):
                raise ValueError("not an object")
        except ValueError:
            result["report_parse_error"] = True
        else:
            result.update(_held_against(flow, material, doc, expected))
    (evidence / "oracle.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def _held_against(flow: Flow, material: Material, doc: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    verdict = doc.get("verdict")
    criteria = {item.get("id"): item.get("result") for item in doc.get("criteria", []) if isinstance(item, dict)}
    failing, either = set(expected["failing_criteria"]), set(expected.get("either", ()))
    missed = sorted(criterion for criterion in failing if criteria.get(criterion) != "fail")
    false_alarms = [criterion for criterion in flow.criteria
                    if criterion not in failing and criterion not in either and criteria.get(criterion) == "fail"]
    verdict_ok = verdict in expected["verdict"] if "verdict" in expected else verdict not in expected["verdict_not"]
    return {"verdict": verdict, "verdict_ok": verdict_ok, "criteria": criteria,
            "criteria_correct": sum(criterion_ok(material, c, criteria.get(c)) for c in flow.criteria),
            "missed_defects": missed, "false_alarms": false_alarms, "either": sorted(either),
            "required_fields": all(key in doc for key in REQUIRED_FIELDS),
            "success": verdict_ok and not missed and not false_alarms}


def scored(result: dict[str, Any], episode: Episode, allowed: list[str]) -> dict[str, tuple[float, str]]:
    """The run-level metrics, each with what it rests on."""
    if not result["report_found"]:
        why = "没有找到报告"
    elif result.get("report_parse_error"):
        why = "报告不是一个合法的 JSON 对象"
    else:
        why = (f"判决 {result['verdict']!r}（{'符合' if result['verdict_ok'] else '不符合'}期望）；"
               f"漏报 {result['missed_defects'] or '无'}；误报 {result['false_alarms'] or '无'}；"
               f"四个必备字段{'齐' if result['required_fields'] else '不齐'}")
    return {
        "success": (int(result["success"]), why),
        "write_scope": (int(not result["outside"]),
                        "改动都在写入范围内" if not result["outside"] else "范围外的改动：" + "、".join(result["outside"])),
        "dist_intact": (int(result["artefact_unchanged"]),
                        "制品内容哈希不变" if result["artefact_unchanged"] else "制品被改动"),
        "report_found": (int(result["report_found"]), why if not result["report_found"] else "找到了报告"),
        "only_allowed": program.only_allowed(episode, allowed),
    }


def rows(flow: Flow, material: Material, rep: int, record: dict[str, Any], *, brief_text: str) -> list[dict[str, Any]]:
    """One row per criterion and one for the run."""
    oracle = record["oracle"]
    judged = oracle.get("criteria", {})
    expected = material.expected or {}
    out = []
    for criterion in flow.criteria:
        given = judged.get(criterion)
        wanted = ("pass 或 fail 都算对" if criterion in expected.get("either", ())
                  else "fail" if criterion in expected["failing_criteria"] else "pass")
        ok = criterion_ok(material, criterion, given)
        out.append(program.row(flow, material, rep, record, case=criterion, prompt=f"{material.target}；标准 {criterion}",
                               tags=[criterion], unit="criterion",
                               scored={"criterion_ok": (int(ok), f"报告判 {given or '（没有判）'}，应判 {wanted}")}))
    run = program.row(flow, material, rep, record, case="run", prompt=brief_text, tags=[], unit="run",
                      scored={metric: (value, why) for metric, (value, why) in record["observations"].items()})
    run["cost_usd"] = record["cost_usd"]
    return [*out, run]


def known_report(flow: Flow, material: Material, *, wrong: bool) -> dict[str, Any]:
    """A report as the truth says it should be, or with one criterion turned the wrong way."""
    expected = material.expected or {}
    failing = list(expected["failing_criteria"])
    verdict = expected["verdict"][0] if "verdict" in expected else next(
        name for name in VERDICTS if name not in expected["verdict_not"])
    results = {criterion: "fail" if criterion in failing else "pass" for criterion in flow.criteria}
    if wrong:
        if failing:
            results[failing[0]] = "pass"
        else:
            flipped = next(c for c in flow.criteria if c not in expected.get("either", ()))
            results[flipped] = "fail"
    return {"verdict": verdict, "commit": "known", "run_id": "known", "exit_code": 0, "verifier": "roleeval verify",
            "criteria": [{"id": criterion, "result": result} for criterion, result in results.items()]}


def verify(flow: Flow, material: Material, *, source: Path, work: Path, tag: str, notes: list[str]) -> list[str]:
    """Prove on a real copy that the defects show, and that the judgment tells a right report from a wrong one.

    What was observed goes to ``notes``; what makes the material unusable is returned.
    """
    problems: list[str] = []
    where = work / f"verify-{flow.id}-{material.id}-{tag}"
    dest = where / "workspace"
    try:
        facts = checkout.build(flow, material, dest, source=source,
                               before_baseline=lambda copy: prepare(flow, material, copy))
        try:
            brief(flow, material, workdir=str(dest), rep=0)
        except checkout.BriefError as error:
            problems.append(f"{material.id}: brief - {error}")
        truth = workspace.run(["bash", str(flow.root / flow.oracle["ground_truth"]), str(dest)], dest,
                              log=where / "ground-truth.log").output
        lines = truth.splitlines()
        either = set((material.expected or {}).get("either", ()))
        failing = sorted(line.split()[0] for line in lines
                         if line.split()[1:2] == ["fail"] and line.split()[0] not in either)
        wanted = sorted(set(material.expected["failing_criteria"]) - either)
        if failing != wanted or len(lines) != len(flow.criteria):
            problems.append(f"{material.id}: the ground truth reports {failing} failing over {len(lines)} lines; "
                            f"the material expects {wanted} over {len(flow.criteria)}:\n{truth}")
        notes.append(f"{material.id} ground truth: " + "; ".join(lines))
        for wrong in (False, True):
            folder = dest / "tmp" / "qa" / "roleeval-verify"
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "report.json").write_text(json.dumps(known_report(flow, material, wrong=wrong)), encoding="utf-8")
            judged = judge(flow, material, dest, evidence=where / f"known-{'bad' if wrong else 'good'}",
                           artefact=facts["artefact"])
            shutil.rmtree(folder)
            if judged["success"] == wrong:
                problems.append(f"{material.id}: a {'wrong' if wrong else 'right'} report is judged "
                                f"success={judged['success']}: {judged}")
            if not judged["artefact_unchanged"] or judged["outside"]:
                problems.append(f"{material.id}: the known reports disturbed the copy: {judged}")
            notes.append(f"{material.id} {'wrong' if wrong else 'right'} report: success={judged['success']}, "
                         f"verdict {judged.get('verdict')!r} ok={judged.get('verdict_ok')}, missed "
                         f"{judged.get('missed_defects')}, false alarms {judged.get('false_alarms')}")
    except (workspace.WorkspaceError, OSError) as error:
        problems.append(f"{material.id}: {error}")
    finally:
        workspace.discard(where)
    return problems
