"""The implement family: a developer fills in one module of an installed checkout; a program judges it.

The copy has the module's body replaced by a stub, its own tests removed and the member's build
output deleted (it holds the answer). When the run is recorded the program puts the original tests
back - the role's own tests are set aside - and runs the member's test and type checks. This is the
judgment of the earlier role-model comparison (``the scoped program-judged suite``:
``render_brief``, ``prepare``, ``judge_scope``, ``oracle_implement``), unchanged.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from . import checkout, program, workspace
from .claude_host import Episode
from .suite import Flow, Material

AGENT_TESTS = "tests.agent"


def stub_files(flow: Flow, material: Material) -> list[str]:
    """Paths, relative to the checkout, that the task's stub replaces."""
    stub = flow.root / material.task["stub"]
    return sorted(str(path.relative_to(stub)) for path in stub.rglob("*") if path.is_file())


def prepare(flow: Flow, material: Material, dest: Path) -> dict[str, str]:
    """Take away what would give the answer: the member's build output and the hidden tests; put the stub in."""
    checkout.remove_answers(flow, material, dest)
    stub = flow.root / material.task["stub"]
    for relative in stub_files(flow, material):
        shutil.copyfile(stub / relative, dest / relative)
    return {}


def judge(flow: Flow, material: Material, dest: Path, *, source: Path, evidence: Path) -> dict[str, Any]:
    """Read the result of one run off its copy. ``source`` is the template, which still has the original tests."""
    oracle, task = flow.oracle, material.task
    member = dest / oracle["member"]
    timeouts = oracle.get("timeout_s", {})
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "changes.patch").write_bytes(workspace.patch(dest))
    changes = workspace.changed_paths(dest)
    outside = program.outside_scope(changes, task["allowed_write"])
    tests = f"{oracle['member']}/{oracle['tests_dir']}/"
    tampered = [path for status, path in changes if status.strip() != "??" and path.startswith(tests)]
    # The role's own tests are set aside and the original ones put back.
    shutil.move(str(member / oracle["tests_dir"]), str(member / AGENT_TESTS))
    shutil.copytree(source / oracle["member"] / oracle["tests_dir"], member / oracle["tests_dir"])
    report = evidence / "oracle-vitest.json"
    report.unlink(missing_ok=True)
    workspace.run([part.replace("{OUT}", str(report)) for part in oracle["test"]], member,
                  timeout=timeouts.get("test"), log=evidence / "oracle-vitest.log")
    doc = json.loads(report.read_text(encoding="utf-8")) if report.exists() else None
    hidden = [Path(path).name for path in task["hidden_tests"]]
    hidden_passed, hidden_total, hidden_failed = program.tally(doc, hidden)
    all_passed, all_total, all_failed = program.tally(doc)
    wanted = task["target_tests"]
    target_failed = [name for name in wanted if name in all_failed]
    typecheck = workspace.run(oracle["typecheck"], member, timeout=timeouts.get("typecheck"),
                              log=evidence / "oracle-typecheck.log")
    files = [entry for entry in task["allowed_write"] if not entry.endswith("/")]
    formatted = workspace.run([*oracle["format"], *files], dest, timeout=timeouts.get("format"),
                              log=evidence / "oracle-format.log")
    result = {
        "hidden_passed": hidden_passed, "hidden_total": hidden_total, "hidden_failed": hidden_failed,
        "all_passed": all_passed, "all_total": all_total, "all_failed": all_failed,
        "target_total": len(wanted), "target_passed": len(wanted) - len(target_failed), "target_failed": target_failed,
        "typecheck": typecheck.ok, "format": formatted.ok,
        "success": hidden_total > 0 and hidden_passed == hidden_total and all_passed == all_total and typecheck.ok,
        "changes": [path for _, path in changes], "outside": outside, "tampered": tampered,
    }
    (evidence / "oracle.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def scored(result: dict[str, Any], episode: Episode, allowed: list[str]) -> dict[str, tuple[float, str]]:
    """The run's metrics, each with what it rests on."""
    tests = (f"隐藏测试 {result['hidden_passed']}/{result['hidden_total']} 通过，全部测试 {result['all_passed']}/"
             f"{result['all_total']} 通过，类型检查{'通过' if result['typecheck'] else '不通过'}")
    if result["all_failed"]:
        tests += "；失败：" + "；".join(result["all_failed"][:20])
    return {
        "success": (int(result["success"]), tests + f"（格式检查{'通过' if result['format'] else '不通过'}，不计入成败）"),
        "target_pass": (result["target_passed"] / result["target_total"],
                        f"目标测试 {result['target_passed']}/{result['target_total']} 通过"
                        + ("；未过：" + "；".join(result["target_failed"][:20]) if result["target_failed"] else "")),
        "write_scope": (int(not result["outside"]),
                        "改动都在写入范围内" if not result["outside"] else "范围外的改动：" + "、".join(result["outside"])),
        "tests_intact": (int(not result["tampered"]),
                         "原有测试没有被动过" if not result["tampered"] else "被动过的原有测试：" + "、".join(result["tampered"])),
        "only_allowed": program.only_allowed(episode, allowed),
    }


def rows(flow: Flow, material: Material, rep: int, record: dict[str, Any], *, brief_text: str) -> list[dict[str, Any]]:
    """One row for the run."""
    run = program.row(flow, material, rep, record, case="run", prompt=brief_text, tags=[], unit="run",
                      scored={metric: (value, why) for metric, (value, why) in record["observations"].items()})
    run["cost_usd"] = record["cost_usd"]
    return [run]


def verify(flow: Flow, material: Material, *, source: Path, work: Path, tag: str, notes: list[str]) -> list[str]:
    """Prove on a real copy that the judgment tells the stub (known bad) from the original (known good).

    What was observed goes to ``notes``; what makes the material unusable is returned.
    """
    problems: list[str] = []
    where = work / f"verify-{flow.id}-{material.id}-{tag}"
    dest = where / "workspace"
    try:
        checkout.build(flow, material, dest, source=source, before_baseline=lambda copy: prepare(flow, material, copy))
        member = dest / flow.oracle["member"]
        problems += checkout.answers_left(flow, material, dest)
        try:
            checkout.framed_brief(flow, material, workdir=str(dest), rep=0)
        except checkout.BriefError as error:
            problems.append(f"{material.id}: brief - {error}")
        bad = judge(flow, material, dest, source=source, evidence=where / "known-bad")
        if bad["success"]:
            problems.append(f"{material.id}: with the stub in place the judgment says success")
        if sorted(bad["all_failed"]) != sorted(material.task["target_tests"]):
            missing = sorted(set(material.task["target_tests"]) - set(bad["all_failed"]))
            extra = sorted(set(bad["all_failed"]) - set(material.task["target_tests"]))
            problems.append(f"{material.id}: with the stub in place the failing tests are not the stored target tests; "
                            f"not failing: {missing}; failing besides: {extra}")
        shutil.rmtree(member / AGENT_TESTS)
        for relative in stub_files(flow, material):
            shutil.copyfile(source / relative, dest / relative)
        good = judge(flow, material, dest, source=source, evidence=where / "known-good")
        if not good["success"] or good["target_failed"]:
            problems.append(f"{material.id}: with the original module back the judgment says success={good['success']}, "
                            f"target tests failing {good['target_failed'][:5]}, all failing {good['all_failed'][:5]}, "
                            f"typecheck {good['typecheck']}")
        if not good["outside"] == bad["outside"] == []:
            problems.append(f"{material.id}: the known runs changed paths outside the write scope: "
                            f"{sorted(set(good['outside']) | set(bad['outside']))}")
        for name, seen in (("stub in place", bad), ("original back", good)):
            notes.append(f"{material.id} {name}: success={seen['success']}, hidden {seen['hidden_passed']}/"
                         f"{seen['hidden_total']}, all {seen['all_passed']}/{seen['all_total']}, target "
                         f"{seen['target_passed']}/{seen['target_total']}, typecheck {seen['typecheck']}, "
                         f"format {seen['format']}, failing {len(seen['all_failed'])}")
    except (workspace.WorkspaceError, OSError) as error:
        problems.append(f"{material.id}: {error}")
    finally:
        workspace.discard(where)
    return problems
