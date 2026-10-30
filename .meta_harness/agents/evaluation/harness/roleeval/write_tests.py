"""The write-tests family: a verification developer writes tests for a module whose own tests were taken away;
a program holds those tests against seeded mutants of the module.

The copy has the module's original tests removed and the member's build output deleted. When the run is
recorded the program finds the spec files the role added or changed under the member's tests and runs them
on the module as it is: they are *valid* when the run exits 0 with at least one test. It runs the type check.
Then it puts each mutant into the module in turn - the mutant's ``find`` replaced by its ``replace`` in the
module as the template has it, which must match exactly once - and runs the same spec files again: a run
that does not exit 0 kills the mutant. The module is put back after every mutant and at the end. The run
succeeds when the tests are valid and no mutant survives.

This is the judgment of the earlier role-model comparison (``the scoped program-judged suite``:
``prepare``, ``judge_scope``, ``oracle_write_tests``). Where it differs, the suite's README says how and why.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from . import checkout, program, workspace
from .claude_host import Episode
from .suite import Flow, Material

SPEC_SUFFIX = ".spec.ts"
# The known-bad answer verify writes: a test that passes whatever the module does.
TRIVIAL_NAME = "roleeval-verify-trivial.spec.ts"
TRIVIAL = """import { expect, test } from 'vitest'

test('roleeval verify: passes whatever the module does', () => {
  expect(true).toBe(true)
})
"""


def prepare(flow: Flow, material: Material, dest: Path) -> dict[str, str]:
    """Take away the module's own tests and the member's build output; the module itself stays as it is."""
    checkout.remove_answers(flow, material, dest)
    return {}


def spec_files(flow: Flow, changes: list[tuple[str, str]]) -> list[str]:
    """The spec files the role added or changed under the member's tests, relative to the member, as vitest takes them."""
    member = flow.oracle["member"]
    tests = f"{member}/{flow.oracle['tests_dir']}/"
    return sorted(path[len(member) + 1:] for _, path in changes if path.startswith(tests) and path.endswith(SPEC_SUFFIX))


def mutant_op(material: Material, mutant: dict[str, Any]) -> dict[str, Any]:
    return {"op": "replace", "file": material.task["target"], "find": mutant["find"], "replace": mutant["replace"],
            "id": mutant["id"]}


def landing(material: Material, text: str) -> list[str]:
    """Mutants whose ``find`` is not in the module's text exactly once; each would be a mutant of something else."""
    return [f"{material.id}.{mutant['id']}: expected the text to replace exactly once in {material.task['target']}, "
            f"found it {text.count(mutant['find'])} times"
            for mutant in material.task["mutants"] if text.count(mutant["find"]) != 1]


def _vitest(flow: Flow, member: Path, files: list[str], *, report: Path, log: Path,
            timeout: float | None) -> tuple[workspace.Ran, dict[str, Any] | None]:
    """Run the given spec files once. Running out of time is no verdict on the tests, so it fails the judgment."""
    report.unlink(missing_ok=True)
    ran = workspace.run([*[part.replace("{OUT}", str(report)) for part in flow.oracle["test"]], *files], member,
                        timeout=timeout, log=log)
    if ran.code is None:
        raise workspace.WorkspaceError(f"`{' '.join(ran.command)}` ran out of its {timeout}s; see {log}")
    return ran, json.loads(report.read_text(encoding="utf-8")) if report.exists() else None


def judge(flow: Flow, material: Material, dest: Path, *, source: Path, evidence: Path) -> dict[str, Any]:
    """Read the result of one run off its copy. ``source`` is the template, which has the module as it was."""
    oracle, task = flow.oracle, material.task
    member = dest / oracle["member"]
    timeouts = oracle.get("timeout_s", {})
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "changes.patch").write_bytes(workspace.patch(dest))
    changes = workspace.changed_paths(dest)
    tests = f"{oracle['member']}/{oracle['tests_dir']}/"
    mutants = [mutant["id"] for mutant in task["mutants"]]
    files = spec_files(flow, changes)
    result: dict[str, Any] = {
        "test_files": files, "mutants": mutants, "changes": [path for _, path in changes],
        "outside": program.outside_scope(changes, task["allowed_write"]),
        "tampered": [path for status, path in changes if status.strip() != "??" and path.startswith(tests)],
    }
    if not files:
        result.update(tests_total=0, tests_passed=0, tests_failed=[], valid=False, typecheck=None,
                      killed=[], survived=mutants, success=False)
    else:
        result.update(_against_mutants(flow, material, dest, files, source=source, evidence=evidence, timeouts=timeouts))
    (evidence / "oracle.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def _against_mutants(flow: Flow, material: Material, dest: Path, files: list[str], *, source: Path, evidence: Path,
                     timeouts: dict[str, float]) -> dict[str, Any]:
    """Run the role's spec files on the module as it is, type-check, then run them on every mutant."""
    member = dest / flow.oracle["member"]
    ran, doc = _vitest(flow, member, files, report=evidence / "oracle-valid.json", log=evidence / "oracle-valid.log",
                       timeout=timeouts.get("test"))
    passed, total, failed = program.tally(doc)
    typecheck = workspace.run(flow.oracle["typecheck"], member, timeout=timeouts.get("typecheck"),
                              log=evidence / "oracle-typecheck.log")
    if typecheck.code is None:
        raise workspace.WorkspaceError(f"the type check ran out of its {timeouts.get('typecheck')}s")
    target = dest / material.task["target"]
    pristine = (source / material.task["target"]).read_bytes()
    killed, survived = [], []
    try:
        for mutant in material.task["mutants"]:
            target.write_bytes(pristine)
            workspace.apply(dest, [mutant_op(material, mutant)], suite=flow.root)
            mutated, _ = _vitest(flow, member, files, report=evidence / f"oracle-{mutant['id']}.json",
                                 log=evidence / f"oracle-{mutant['id']}.log", timeout=timeouts.get("mutant"))
            (killed if not mutated.ok else survived).append(mutant["id"])
    finally:
        target.write_bytes(pristine)
    valid = ran.ok and total > 0
    return {"tests_total": total, "tests_passed": passed, "tests_failed": failed, "valid": valid,
            "typecheck": typecheck.ok, "killed": killed, "survived": survived, "success": valid and not survived}


def scored(result: dict[str, Any], episode: Episode, allowed: list[str]) -> dict[str, tuple[float, str]]:
    """The run's metrics, each with what it rests on."""
    total, killed = len(result["mutants"]), len(result["killed"])
    if not result["test_files"]:
        tests = "成员测试目录下没有新增或改动的 *.spec.ts，一个变异体都没有跑"
    else:
        typecheck = "通过" if result["typecheck"] else "不通过"
        tests = (f"角色的测试文件 {len(result['test_files'])} 个，在当前实现上 {result['tests_passed']}/"
                 f"{result['tests_total']} 通过（{'有效' if result['valid'] else '无效'}），类型检查{typecheck}"
                 f"（只记录，不计入成败）")
        if result["tests_failed"]:
            tests += "；当前实现上失败：" + "；".join(result["tests_failed"][:20])
    return {
        "success": (int(result["success"]), f"{tests}；杀死 {killed}/{total}"),
        "kill_rate": (killed / total, f"杀死 {killed}/{total}"
                      + ("；存活：" + "、".join(result["survived"]) if result["survived"] else "")),
        "write_scope": (int(not result["outside"]),
                        "改动都在写入范围内" if not result["outside"] else "范围外的改动：" + "、".join(result["outside"])),
        "tests_intact": (int(not result["tampered"]),
                         "原有测试没有被动过" if not result["tampered"] else "被动过的原有测试：" + "、".join(result["tampered"])),
        "only_allowed": program.only_allowed(episode, allowed),
    }


def rows(flow: Flow, material: Material, rep: int, record: dict[str, Any], *, brief_text: str) -> list[dict[str, Any]]:
    """One row per mutant and one for the run."""
    killed = set(record["oracle"]["killed"])
    out = []
    for mutant in material.task["mutants"]:
        dead = mutant["id"] in killed
        out.append(program.row(flow, material, rep, record, case=mutant["id"],
                               prompt=f"{material.target}；变异体 {mutant['id']}", tags=[mutant["id"]], unit="mutant",
                               scored={"killed": (int(dead), "角色的测试在这个变异体上失败（杀死）" if dead
                                                  else "角色的测试在这个变异体上全过（存活）")}))
    run = program.row(flow, material, rep, record, case="run", prompt=brief_text, tags=[], unit="run",
                      scored={metric: (value, why) for metric, (value, why) in record["observations"].items()})
    run["cost_usd"] = record["cost_usd"]
    return [*out, run]


def verify(flow: Flow, material: Material, *, source: Path, work: Path, tag: str, notes: list[str]) -> list[str]:
    """Prove on a real copy that every mutant lands once and that the judgment tells good tests from bad ones:
    nothing written, one test that passes whatever the module does (known bad), the original tests (known good).

    What was observed goes to ``notes``; what makes the material unusable is returned.
    """
    task = material.task
    problems = landing(material, (source / task["target"]).read_text(encoding="utf-8"))
    if problems:
        return problems
    where = work / f"verify-{flow.id}-{material.id}-{tag}"
    dest = where / "workspace"
    try:
        checkout.build(flow, material, dest, source=source, before_baseline=lambda copy: prepare(flow, material, copy))
        problems += checkout.answers_left(flow, material, dest)
        try:
            checkout.framed_brief(flow, material, workdir=str(dest), rep=0)
        except checkout.BriefError as error:
            problems.append(f"{material.id}: brief - {error}")
        nothing = judge(flow, material, dest, source=source, evidence=where / "known-bad-nothing")
        if nothing["valid"] or nothing["killed"] or nothing["success"]:
            problems.append(f"{material.id}: with no test written the judgment says valid={nothing['valid']}, "
                            f"killed {nothing['killed']}, success={nothing['success']}")
        trivial = dest / flow.oracle["member"] / flow.oracle["tests_dir"] / TRIVIAL_NAME
        trivial.write_text(TRIVIAL, encoding="utf-8")
        always = judge(flow, material, dest, source=source, evidence=where / "known-bad-trivial")
        trivial.unlink()
        if not always["valid"] or always["killed"] or always["success"]:
            problems.append(f"{material.id}: with one test that passes whatever the module does the judgment says "
                            f"valid={always['valid']}, killed {always['killed']}, success={always['success']}")
        for relative in task["hidden_tests"]:
            shutil.copyfile(source / relative, dest / relative)
        good = judge(flow, material, dest, source=source, evidence=where / "known-good")
        if not good["valid"] or good["survived"] or not good["success"]:
            problems.append(f"{material.id}: with the original tests back the judgment says valid={good['valid']} "
                            f"({good['tests_passed']}/{good['tests_total']} pass, failing {good['tests_failed'][:5]}), "
                            f"mutants surviving {good['survived']}, success={good['success']}")
        if (dest / task["target"]).read_bytes() != (source / task["target"]).read_bytes():
            problems.append(f"{material.id}: {task['target']} is not the template's after the judgment")
        if not nothing["outside"] == always["outside"] == good["outside"] == []:
            problems.append(f"{material.id}: the known runs changed paths outside the write scope: "
                            f"{sorted(set(nothing['outside']) | set(always['outside']) | set(good['outside']))}")
        total = len(task["mutants"])
        for name, seen in (("nothing written", nothing), ("one always-true test", always), ("original tests", good)):
            surviving = f" {seen['survived']}" if seen is good and seen["survived"] else ""
            notes.append(f"{material.id} {name}: valid={seen['valid']}, tests {seen['tests_passed']}/{seen['tests_total']}, "
                         f"typecheck {seen['typecheck']}, killed {len(seen['killed'])}/{total}, survived "
                         f"{len(seen['survived'])}/{total}{surviving}, success={seen['success']}")
    except (workspace.WorkspaceError, OSError) as error:
        problems.append(f"{material.id}: {error}")
    finally:
        workspace.discard(where)
    return problems
