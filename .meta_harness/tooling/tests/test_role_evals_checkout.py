"""运行器的整仓检出一类：模板与副本、两类由程序判定的流（implement、acceptance）、实现评审、隔离、判官身份。

一律用小仓库与假命令，不依赖 pnpm；真实的检出由 `make role-eval ARGS="verify …"` 证。
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest

from test_role_evals import EVALUATION, META, MODEL, git, repo, serial, transcript, wired  # noqa: F401  (fixtures)
from test_role_evals import prepare as prepare_material

from roleeval import acceptance, checkout, claude_host, cli, implement, judge, review, suite, workspace  # noqa: E402
from roleeval.store import VariantStore, check_row  # noqa: E402

PY = sys.executable
SIGNED = {"cases": {"by": "t", "date": "2026-10-01", "version": 1},
          "grading": {"by": "t", "date": "2026-10-01", "version": 1}}

# 假的测试运行器：tests/ 下每个 *.spec.ts 每行一条「名字=src/mod.ts 里要有的字」，照 vitest 的 JSON 报告形状写出。
FAKE_VITEST = """
import json, pathlib, sys
out = next(a.split("=", 1)[1] for a in sys.argv if a.startswith("--outputFile="))
mod = pathlib.Path("src/mod.ts").read_text()
results, ok = [], True
for spec in sorted(pathlib.Path("tests").glob("*.spec.ts")):
    cases = []
    for line in spec.read_text().splitlines():
        name, _, want = line.partition("=")
        passed = want in mod
        ok = ok and passed
        cases.append({"title": name, "fullName": name, "status": "passed" if passed else "failed"})
    results.append({"name": str(spec.resolve()), "status": "passed", "assertionResults": cases})
pathlib.Path(out).write_text(json.dumps({"testResults": results}))
sys.exit(0 if ok else 1)
"""
FAKE_TYPECHECK = "import pathlib, sys; sys.exit(1 if 'TYPE_ERROR' in pathlib.Path('src/mod.ts').read_text() else 0)"
FAKE_BUILD = "import pathlib; pathlib.Path('dist').mkdir(exist_ok=True); pathlib.Path('dist/mod.js').write_text(pathlib.Path('src/mod.ts').read_text())"
# 安装：每次在模板里跑都往计数文件里记一行；装出两处依赖目录，并构建成员。
FAKE_SETUP = """
import pathlib, sys
with open(sys.argv[1], "a") as counter:
    counter.write("ran\\n")
for where in ("node_modules/pkg", "member/node_modules/dep"):
    pathlib.Path(where).mkdir(parents=True, exist_ok=True)
    pathlib.Path(where, "index.js").write_text("module.exports = 1\\n")
pathlib.Path("member/dist").mkdir(exist_ok=True)
pathlib.Path("member/dist/mod.js").write_text(pathlib.Path("member/src/mod.ts").read_text())
"""
# 真值脚本：C2 看制品里有没有种入的 bad；C1、C3 恒过。
GROUND_TRUTH = """#!/usr/bin/env bash
cd "$1"
echo "C1 pass"
if grep -q bad member/dist/mod.js; then echo "C2 fail broken"; else echo "C2 pass"; fi
echo "C3 pass"
"""
RULES = "import pathlib, sys\nif 'infra' in pathlib.Path('member/src/mod.ts').read_text():\n    print('member/src/mod.ts: group-direction')\n    sys.exit(1)\n"


def write(root: Path, files: dict[str, str]) -> None:
    for relative, text in files.items():
        (root / relative).parent.mkdir(parents=True, exist_ok=True)
        (root / relative).write_text(text, encoding="utf-8")


def checkout_workspace(base: str, counter: Path, **over: Any) -> dict[str, Any]:
    return {"kind": "checkout", "base": base, "excludes": [".meta_harness/agents/evaluation"],
            "setup": [[PY, "tools/setup.py", str(counter)]], "linked": ["node_modules"], "drop": [".claude"],
            "commit": "single", **over}


HOST = {"claude-code": {"model": MODEL, "effort": "high", "allowed": ["Read", "Glob", "Grep", "Edit", "Write", "Bash"]}}


def implement_flow(base: str, counter: Path) -> dict[str, Any]:
    return {
        "format": 1, "id": "tiny-implement", "version": 1, "family": "implement", "role": "tiny-developer", "reps": 2,
        "host": HOST, "workspace": checkout_workspace(base, counter), "brief_frame": "briefs/_frame.md",
        "oracle": {"member": "member", "tests_dir": "tests", "test": [PY, "../tools/fake_vitest.py", "--outputFile={OUT}"],
                   "typecheck": [PY, "../tools/fake_typecheck.py"], "format": [PY, "-c", "pass"],
                   "target_tests": "target-tests.json"},
        "metrics": [{"id": "success", "kind": "binary"}, {"id": "target_pass", "kind": "float"},
                    {"id": "write_scope", "kind": "binary"}, {"id": "tests_intact", "kind": "binary"},
                    {"id": "only_allowed", "kind": "binary"}],
        "signoffs": SIGNED,
        "materials": [{"id": "T1", "target": "member/src/mod.ts", "brief": "briefs/T1.md",
                       "task": {"stub": "stubs/T1", "hidden_tests": ["member/tests/mod.spec.ts"],
                                "allowed_write": ["member/src/mod.ts", "member/tests/"]}}],
    }


def acceptance_flow(base: str, counter: Path) -> dict[str, Any]:
    return {
        "format": 1, "id": "tiny-acceptance", "version": 1, "family": "acceptance", "role": "tiny-qa", "reps": 2,
        "host": HOST, "workspace": checkout_workspace(base, counter, rebuild=[PY, "../tools/build.py"]),
        "criteria": ["C1", "C2", "C3"],
        "oracle": {"member": "member", "tests_dir": "tests", "report_glob": "tmp/qa/**/report.json",
                   "artefact": "member/dist", "ground_truth": "ground-truth.sh"},
        "metrics": [{"id": "success", "kind": "binary"}, {"id": "criterion_ok", "kind": "binary"}],
        "signoffs": SIGNED,
        "materials": [
            {"id": "Q1", "target": "对照", "brief": "briefs/QA.md", "defects": [],
             "expected": {"verdict_not": ["Fail"], "failing_criteria": []}, "allowed_write": ["tmp/qa/"]},
            {"id": "Q2", "target": "种入", "brief": "briefs/QA.md",
             "defects": [{"id": "d1", "file": "member/src/mod.ts", "find": "'good'", "replace": "'bad'"}],
             "expected": {"verdict": ["Fail"], "failing_criteria": ["C2"], "either": ["C3"]},
             "allowed_write": ["tmp/qa/"]}],
    }


def delivery_flow(base: str, counter: Path) -> dict[str, Any]:
    return {
        "format": 1, "id": "tiny-delivery", "version": 1, "family": "review", "role": "tiny-reviewer",
        "judgment": "实现", "criteria_page": "", "reps": 2,
        "host": {"claude-code": {"model": MODEL, "effort": "high", "allowed": ["Read", "Glob", "Grep", "Bash"]}},
        "workspace": checkout_workspace(base, counter, commit="delivery", member="member",
                                        rebuild=[PY, "../tools/build.py"],
                                        delivery={"subject": "member: a delivery", "author": "implementer <implementer@invalid>",
                                                  "trailers": ["Harness: claude-code", "Agent-Role: developer"]}),
        "checks": {"member_test": [PY, "-c", "pass"], "rules": {"run": [PY, "tools/rules.py"], "fails_with": "group-direction"}},
        "metrics": [{"id": "caught", "kind": "binary"}, {"id": "tracked_intact", "kind": "binary"},
                    {"id": "blocking", "kind": "judge"}, {"id": "novel_blocking", "kind": "judge"},
                    {"id": "out_of_kind", "kind": "judge"}],
        "signoffs": SIGNED,
        "materials": [{
            "id": "D1", "target": "一个交付", "brief": "briefs/review.md", "delivery_note": "briefs/note.md", "tags": ["种入的"],
            "seeds": [
                {"id": "S1", "kind": "seeded", "where": "member/src/mod.ts 与 README.md", "truth": "导入 infra，且改了范围外的说明",
                 "ops": [{"op": "replace", "file": "member/src/mod.ts", "find": "'good'", "replace": "'good' // infra"},
                         {"op": "append", "file": "README.md", "text": "\n备注一句。\n"}]},
                {"id": "S2", "kind": "seeded", "where": "交付说明", "truth": "声称没改别处", "in": "briefs/note.md"}]}],
    }


@pytest.fixture
def tiny(tmp_path: Path) -> dict[str, Any]:
    """小仓库：成员 member/ 带源码与测试，tools/ 是假的安装、测试、构建与规则检查，评估目录放真值。"""
    root = tmp_path / "repo"
    write(root, {
        ".gitignore": "dist/\nnode_modules/\ntmp/\n",
        "README.md": "小仓库\n",
        "member/src/mod.ts": "export const v = 'good'\n",
        "member/tests/mod.spec.ts": "returns good=good\n",
        "member/tests/other.spec.ts": "exports=export\n",
        ".meta_harness/agents/evaluation/truth.json": "{\"answer\": 42}\n",
        "tools/setup.py": FAKE_SETUP, "tools/fake_vitest.py": FAKE_VITEST, "tools/fake_typecheck.py": FAKE_TYPECHECK,
        "tools/build.py": FAKE_BUILD, "tools/rules.py": RULES,
    })
    os.symlink(".meta_harness", root / ".claude")
    git(root, "init", "-q")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "base")
    base = git(root, "rev-parse", "HEAD")
    counter = tmp_path / "setup-runs.txt"
    suites = root / "suites"
    write(suites / "tiny-implement", {
        "briefs/_frame.md": "任务 {TASK_ID}（run {RUN_ID}），角色 {ROLE}，检出 `{WORKDIR}`。\n\n{GOAL}\n",
        "briefs/T1.md": "@@GOAL\n把 member/src/mod.ts 补完。\n",
        "stubs/T1/member/src/mod.ts": "export const v = 'stub'\n",
        "target-tests.json": json.dumps({"T1": ["mod.spec.ts :: returns good"]}),
        "flow.json": json.dumps(implement_flow(base, counter), ensure_ascii=False)})
    write(suites / "tiny-acceptance", {
        "briefs/QA.md": "验收 {TASK_ID}（run {RUN_ID}），检出 `{WORKDIR}`，报告写到 tmp/qa/{RUN_ID}/。\n",
        "ground-truth.sh": GROUND_TRUTH, "flow.json": json.dumps(acceptance_flow(base, counter), ensure_ascii=False)})
    write(suites / "tiny-delivery", {
        "briefs/review.md": "审 `{WORKDIR}`：基线 `{BASE}`，交付 `{HEAD}`。\n\n{DELIVERY_NOTE}\n",
        "briefs/note.md": "- 只改了 member。\n", "flow.json": json.dumps(delivery_flow(base, counter), ensure_ascii=False)})
    git(root, "add", "-A")
    git(root, "commit", "-qm", "suites")
    work = tmp_path / "work"
    work.mkdir()
    return {"repo": root, "base": base, "counter": counter, "work": work, "tmp": tmp_path,
            "flows": {name: suite.load(suites / name) for name in ("tiny-implement", "tiny-acceptance", "tiny-delivery")}}


def source_of(tiny: dict[str, Any], name: str) -> Path:
    flow = tiny["flows"][name]
    return checkout.template(flow, flow.materials[0], repo=tiny["repo"], work=tiny["work"])


def runs(counter: Path) -> int:
    return len(counter.read_text().splitlines()) if counter.exists() else 0


# --- A2：模板与副本 -----------------------------------------------------------------------------------------

def test_a_template_is_built_once_and_reused(tiny: dict[str, Any]) -> None:
    first = source_of(tiny, "tiny-implement")
    assert runs(tiny["counter"]) == 1 and (first / workspace.READY).is_file()
    assert source_of(tiny, "tiny-implement") == first and runs(tiny["counter"]) == 1, "已就绪的模板直接复用"
    assert first.parent.name == workspace.TEMPLATES and first.name.startswith(f"tiny-implement-{tiny['base'][:12]}-")
    changed = workspace.template(tiny["repo"], tiny["work"], flow_id="tiny-implement", base=tiny["base"],
                                 excludes=[".meta_harness/agents/evaluation", "README.md"],
                                 setup=[[PY, "tools/setup.py", str(tiny["counter"])]])
    assert changed != first and runs(tiny["counter"]) == 2, "excludes 一变就是另一个模板"


def test_a_failed_setup_leaves_no_template_behind(tiny: dict[str, Any]) -> None:
    setup = [[PY, "tools/setup.py", str(tiny["counter"])], [PY, "-c", "import sys; print('装不上'); sys.exit(3)"]]
    with pytest.raises(workspace.WorkspaceError, match="exited 3") as raised:
        workspace.template(tiny["repo"], tiny["work"], flow_id="f", base=tiny["base"], excludes=[], setup=setup)
    assert "装不上" in str(raised.value)
    assert list((tiny["work"] / workspace.TEMPLATES).iterdir()) == [], "失败的模板连同临时目录都不留"
    good = workspace.template(tiny["repo"], tiny["work"], flow_id="f", base=tiny["base"], excludes=[], setup=setup[:1])
    assert (good / workspace.READY).is_file()


def test_a_copy_has_no_truth_hard_links_its_dependencies_and_drops_host_links(tiny: dict[str, Any]) -> None:
    source = source_of(tiny, "tiny-implement")
    assert not (source / ".meta_harness" / "agents" / "evaluation").exists(), "excludes 不进模板"
    dest = tiny["tmp"] / "copy"
    workspace.checkout(source, dest, linked=["node_modules"], drop=[".claude"])
    assert not (dest / ".meta_harness" / "agents" / "evaluation").exists() and not (dest / workspace.READY).exists()
    for relative in ("node_modules/pkg/index.js", "member/node_modules/dep/index.js"):
        assert os.stat(dest / relative).st_ino == os.stat(source / relative).st_ino, f"{relative} 是硬链接"
    assert os.stat(dest / "member/src/mod.ts").st_ino != os.stat(source / "member/src/mod.ts").st_ino, "其余是真拷贝"
    assert (dest / "member/dist/mod.js").is_file(), "构建产物随模板来"
    assert not (dest / ".claude").exists() and not (dest / ".claude").is_symlink()
    with pytest.raises(workspace.WorkspaceError, match="already exists"):
        workspace.checkout(source, dest, linked=["node_modules"], drop=[])


def test_a_single_commit_is_one_baseline_and_a_delivery_is_a_second_commit(tiny: dict[str, Any]) -> None:
    flow = tiny["flows"]["tiny-implement"]
    single = tiny["tmp"] / "single"
    facts = checkout.build(flow, flow.materials[0], single, source=source_of(tiny, "tiny-implement"))
    assert workspace.git(single, "rev-list", "--count", "HEAD") == "1" and facts["baseline"] == facts["head"]
    assert workspace.git(single, "branch", "--show-current") == "main"
    flow = tiny["flows"]["tiny-delivery"]
    dest = tiny["tmp"] / "delivery"
    facts = checkout.build(flow, flow.materials[0], dest, source=source_of(tiny, "tiny-delivery"))
    assert workspace.git(dest, "rev-list", "--count", "HEAD") == "2"
    assert workspace.git(dest, "rev-parse", "HEAD~1") == facts["baseline"] and workspace.head(dest) == facts["head"]
    shown = workspace.git(dest, "show", "-s", "--format=%an <%ae>|%cn|%B", "HEAD")
    assert shown.startswith("implementer <implementer@invalid>|implementer|member: a delivery")
    assert "Harness: claude-code\nAgent-Role: developer" in shown
    assert "infra" in (dest / "member/dist/mod.js").read_text(), "交付之后成员重新构建过"
    assert workspace.git(dest, "status", "--porcelain") == ""


# --- A3：implement 的判定 ------------------------------------------------------------------------------------

@pytest.fixture
def implement_copy(tiny: dict[str, Any]) -> dict[str, Any]:
    flow = tiny["flows"]["tiny-implement"]
    material = flow.materials[0]
    source = source_of(tiny, "tiny-implement")
    dest = tiny["tmp"] / "impl-copy"
    checkout.build(flow, material, dest, source=source, before_baseline=lambda copy: implement.prepare(flow, material, copy))
    return {"flow": flow, "material": material, "source": source, "dest": dest, "tmp": tiny["tmp"]}


def judged(case: dict[str, Any], name: str) -> dict[str, Any]:
    return implement.judge(case["flow"], case["material"], case["dest"], source=case["source"],
                           evidence=case["tmp"] / f"evidence-{name}")


def test_the_copy_hides_the_answer(implement_copy: dict[str, Any]) -> None:
    dest = implement_copy["dest"]
    assert not (dest / "member/tests/mod.spec.ts").exists() and not (dest / "member/dist").exists()
    assert (dest / "member/src/mod.ts").read_text() == "export const v = 'stub'\n"
    assert workspace.git(dest, "status", "--porcelain") == "", "桩与删除都在基线提交里"


def test_a_correct_implementation_succeeds(implement_copy: dict[str, Any]) -> None:
    dest = implement_copy["dest"]
    (dest / "member/src/mod.ts").write_text("export const v = 'good'\n")
    (dest / "member/tests/mine.spec.ts").write_text("my own=nothing-like-this\n")   # 角色自己的测试红了也不算
    result = judged(implement_copy, "good")
    assert result["success"] and result["hidden_passed"] == result["hidden_total"] == 1
    assert (result["all_passed"], result["all_total"]) == (2, 2), "跑的是原有测试，角色的测试被挪开"
    assert result["target_passed"] == result["target_total"] == 1 and not result["outside"] and not result["tampered"]
    evidence = implement_copy["tmp"] / "evidence-good"
    assert {"changes.patch", "oracle.json", "oracle-vitest.json", "oracle-vitest.log", "oracle-typecheck.log"} <= {
        path.name for path in evidence.iterdir()}
    assert b"mine.spec.ts" in (evidence / "changes.patch").read_bytes(), "新文件也进 patch"


def test_hidden_tests_still_red_is_a_failure(implement_copy: dict[str, Any]) -> None:
    result = judged(implement_copy, "stub")
    assert not result["success"] and result["hidden_failed"] == ["mod.spec.ts :: returns good"]
    assert result["target_failed"] == ["mod.spec.ts :: returns good"] and result["target_passed"] == 0


def test_a_red_typecheck_fails_even_with_green_tests(implement_copy: dict[str, Any]) -> None:
    (implement_copy["dest"] / "member/src/mod.ts").write_text("export const v = 'good' // TYPE_ERROR\n")
    result = judged(implement_copy, "typecheck")
    assert result["all_passed"] == result["all_total"] and not result["typecheck"] and not result["success"]


def test_editing_an_existing_test_and_writing_outside_the_scope_are_seen(implement_copy: dict[str, Any]) -> None:
    dest = implement_copy["dest"]
    (dest / "member/src/mod.ts").write_text("export const v = 'good'\n")
    (dest / "member/tests/other.spec.ts").write_text("exports=\n")    # 原有测试被改弱
    (dest / "README.md").write_text("顺手改了\n")
    (dest / "member/notes.md").write_text("范围外的新文件\n")
    result = judged(implement_copy, "scope")
    assert result["tampered"] == ["member/tests/other.spec.ts"]
    assert sorted(result["outside"]) == ["README.md", "member/notes.md"]
    episode = claude_host.Episode(tool_names={"Read": 1, "WebFetch": 1})
    scored = implement.scored(result, episode, ["Read", "Edit"])
    assert (scored["tests_intact"][0], scored["write_scope"][0], scored["only_allowed"][0]) == (0, 0, 0)
    assert "README.md" in scored["write_scope"][1] and "WebFetch" in scored["only_allowed"][1]
    assert scored["success"][0] == 1, "原有测试照样跑原件，所以改弱的那条不影响成败；改动另记"


def test_the_brief_is_the_frame_with_the_task_filled_in(tiny: dict[str, Any]) -> None:
    flow = tiny["flows"]["tiny-implement"]
    text = checkout.framed_brief(flow, flow.materials[0], workdir="/w/x", rep=1)
    assert text == "任务 T1（run t1-r1），角色 tiny-developer，检出 `/w/x`。\n\n把 member/src/mod.ts 补完。\n"
    assert "{WORKDIR}" in checkout.framed_brief(flow, flow.materials[0], workdir="{WORKDIR}", rep=0,
                                                keep=("WORKDIR", "RUN_ID"))
    with pytest.raises(checkout.BriefError, match="GOAL"):
        checkout.fill("{GOAL} 与 {WORKDIR}", {"WORKDIR": "/w"})


# --- A4：acceptance 的判定 -----------------------------------------------------------------------------------

@pytest.fixture
def qa_copy(tiny: dict[str, Any]) -> dict[str, Any]:
    flow = tiny["flows"]["tiny-acceptance"]
    material = flow.material("Q2")
    dest = tiny["tmp"] / "qa-copy"
    facts = checkout.build(flow, material, dest, source=source_of(tiny, "tiny-acceptance"),
                           before_baseline=lambda copy: acceptance.prepare(flow, material, copy))
    return {"flow": flow, "material": material, "dest": dest, "facts": facts, "tmp": tiny["tmp"]}


def report(case: dict[str, Any], body: Any, *, raw: str | None = None) -> dict[str, Any]:
    folder = case["dest"] / "tmp" / "qa" / "q2-r0"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "report.json").write_text(raw if raw is not None else json.dumps(body), encoding="utf-8")
    (folder / "report.md").write_text("报告", encoding="utf-8")
    return acceptance.judge(case["flow"], case["material"], case["dest"], evidence=case["tmp"] / f"ev-{next(serial)}",
                            artefact=case["facts"]["artefact"])


def qa_report(verdict: str = "Fail", **results: str) -> dict[str, Any]:
    merged = {"C1": "pass", "C2": "fail", "C3": "pass", **results}
    return {"verdict": verdict, "commit": "c", "run_id": "r", "exit_code": 0, "verifier": "qa",
            "criteria": [{"id": key, "result": value} for key, value in merged.items()]}


def test_the_acceptance_copy_carries_the_defect_in_its_artefact(qa_copy: dict[str, Any]) -> None:
    dest = qa_copy["dest"]
    assert not (dest / "member/tests").exists() and "'bad'" in (dest / "member/dist/mod.js").read_text()


def test_a_right_report_succeeds_and_each_criterion_is_judged(qa_copy: dict[str, Any]) -> None:
    result = report(qa_copy, qa_report())
    assert result["success"] and result["artefact_unchanged"] and result["required_fields"] and not result["outside"]
    assert result["criteria_correct"] == 3


@pytest.mark.parametrize(("body", "what"), [
    (qa_report(C2="pass"), "missed"),
    (qa_report(C1="fail"), "false alarm"),
    (qa_report(verdict="Pass"), "verdict"),
])
def test_a_wrong_report_fails(qa_copy: dict[str, Any], body: dict[str, Any], what: str) -> None:
    result = report(qa_copy, body)
    assert not result["success"]
    assert {"missed": result["missed_defects"] == ["C2"], "false alarm": result["false_alarms"] == ["C1"],
            "verdict": result["verdict_ok"] is False}[what]


def test_a_criterion_under_either_counts_whichever_way_it_is_judged(qa_copy: dict[str, Any]) -> None:
    for given in ("fail", "pass"):
        result = report(qa_copy, qa_report(C3=given))
        assert result["success"] and result["false_alarms"] == []
        assert acceptance.criterion_ok(qa_copy["material"], "C3", given)
    assert not acceptance.criterion_ok(qa_copy["material"], "C3", "not-run"), "either 里的也得判了"


def test_no_report_or_a_broken_one_fails(qa_copy: dict[str, Any]) -> None:
    missing = acceptance.judge(qa_copy["flow"], qa_copy["material"], qa_copy["dest"], evidence=qa_copy["tmp"] / "none",
                               artefact=qa_copy["facts"]["artefact"])
    assert not missing["report_found"] and not missing["success"]
    broken = report(qa_copy, None, raw="{这不是 JSON")
    assert broken["report_found"] and broken.get("report_parse_error") and not broken["success"]
    listed = report(qa_copy, None, raw="[]")
    assert listed.get("report_parse_error") and not listed["success"]


def test_a_changed_artefact_and_a_write_outside_the_scope_are_seen(qa_copy: dict[str, Any]) -> None:
    (qa_copy["dest"] / "member/dist/mod.js").write_text("改过的制品\n")
    (qa_copy["dest"] / "member/acceptance.sh").write_text("范围外\n")
    result = report(qa_copy, qa_report())
    assert not result["artefact_unchanged"] and result["outside"] == ["member/acceptance.sh"]
    scored = acceptance.scored(result, claude_host.Episode(), ["Read"])
    assert (scored["dist_intact"][0], scored["write_scope"][0], scored["success"][0]) == (0, 0, 1)


# --- 三类流的 verify：在真的副本上判得出已知好与已知坏 ------------------------------------------------------

@pytest.mark.parametrize("name", ["tiny-implement", "tiny-acceptance", "tiny-delivery"])
def test_verify_proves_each_flow_on_a_real_copy(tiny: dict[str, Any], monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    monkeypatch.setattr(cli, "REPO", tiny["repo"])
    notes: list[str] = []
    assert cli.verify(tiny["flows"][name], tiny["work"], notes=notes) == []
    assert notes and [path.name for path in tiny["work"].iterdir()] == [workspace.TEMPLATES], "verify 不留副本"


def test_verify_catches_a_stale_target_list_a_wrong_truth_and_seeds_that_get_caught(
        tiny: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "REPO", tiny["repo"])
    root = tiny["repo"] / "suites"
    (root / "tiny-implement" / "target-tests.json").write_text(json.dumps({"T1": ["mod.spec.ts :: something else"]}))
    problems = cli.verify(suite.load(root / "tiny-implement"), tiny["work"])
    assert len(problems) == 1 and "not the stored target tests" in problems[0]
    flow = json.loads((root / "tiny-acceptance" / "flow.json").read_text())
    flow["materials"][1]["expected"]["failing_criteria"] = ["C1"]
    (root / "tiny-acceptance" / "flow.json").write_text(json.dumps(flow, ensure_ascii=False))
    problems = cli.verify(suite.load(root / "tiny-acceptance"), tiny["work"], only=["Q2"])
    assert any("ground truth reports ['C2']" in problem for problem in problems)
    flow = json.loads((root / "tiny-delivery" / "flow.json").read_text())
    flow["checks"]["member_test"] = [PY, "-c", "import sys; sys.exit(1)"]
    flow["materials"][0]["seeds"][0]["ops"][0]["find"] = "'nowhere'"
    (root / "tiny-delivery" / "flow.json").write_text(json.dumps(flow, ensure_ascii=False))
    problems = cli.verify(suite.load(root / "tiny-delivery"), tiny["work"])
    assert len(problems) == 1 and "found it 0 times" in problems[0], "种入落不下就停在那里"
    flow["materials"][0]["seeds"][0]["ops"][0]["find"] = "'good'"
    (root / "tiny-delivery" / "flow.json").write_text(json.dumps(flow, ensure_ascii=False))
    problems = cli.verify(suite.load(root / "tiny-delivery"), tiny["work"])
    assert len(problems) == 1 and "own tests exit 1" in problems[0]


# --- A5：实现评审的种入与 tracked_intact -----------------------------------------------------------------------

def test_a_seed_may_make_several_edits_in_order(tmp_path: Path) -> None:
    write(tmp_path, {"a.ts": "one two\n", "b.md": "说明\n"})
    seed = suite.Seed(id="I9", kind="seeded", where="两处", truth="t", edits=(
        {"op": "replace", "file": "a.ts", "find": "one", "replace": "1"},
        {"op": "replace", "file": "a.ts", "find": "1 two", "replace": "1 2"},
        {"op": "append", "file": "b.md", "text": "追加\n"}))
    assert [change["id"] for change in seed.changes()] == ["I9", "I9", "I9"]
    workspace.apply(tmp_path, seed.changes(), suite=tmp_path)
    assert (tmp_path / "a.ts").read_text() == "1 2\n" and (tmp_path / "b.md").read_text() == "说明\n追加\n"
    with pytest.raises(workspace.WorkspaceError, match="I9"):
        workspace.apply(tmp_path, seed.changes()[:1], suite=tmp_path)


def test_tracked_intact_allows_untracked_output_only(tiny: dict[str, Any]) -> None:
    flow = tiny["flows"]["tiny-delivery"]
    dest = tiny["tmp"] / "review-copy"
    facts = checkout.build(flow, flow.materials[0], dest, source=source_of(tiny, "tiny-delivery"))
    (dest / "metrics-report.txt").write_text("跑检查留下的\n")
    assert review.tracked_intact(dest, facts["head"]) == (1, "受版本管理的文件没有被改动，HEAD 仍是交付提交")
    (dest / "README.md").write_text("改了\n")
    value, why = review.tracked_intact(dest, facts["head"])
    assert value == 0 and "README.md" in why
    workspace.git(dest, "checkout", "--", "README.md")
    git(dest, "commit", "--allow-empty", "-qm", "评审者提交了")
    assert review.tracked_intact(dest, facts["head"]) == (0, "HEAD 不再是交付提交")


def test_the_delivery_brief_names_both_commits_and_the_note(tiny: dict[str, Any]) -> None:
    flow = tiny["flows"]["tiny-delivery"]
    text = review.delivery_brief(flow.materials[0], Path("/w"), {"baseline": "b" * 40, "head": "h" * 40})
    assert text == f"审 `/w`：基线 `{'b' * 40}`，交付 `{'h' * 40}`。\n\n- 只改了 member。\n"


# --- 用 cli 走一遍：准备、派发、收录 ----------------------------------------------------------------------------

@pytest.fixture
def wired_checkout(tiny: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    repo = tiny["repo"]
    monkeypatch.setattr(cli, "REPO", repo)
    monkeypatch.setattr(cli, "META", repo / "meta")
    monkeypatch.setattr(cli, "HARNESS", repo / "harness")
    (repo / "harness").mkdir()

    def compile_definition(flow: suite.Flow, out: Path, variant: str) -> Path:
        frozen = out / variant / "agents" / f"{flow.role}.json"
        frozen.parent.mkdir(parents=True, exist_ok=True)
        frozen.write_text(json.dumps({flow.role: {"prompt": "你来做"}}), encoding="utf-8")
        return frozen

    monkeypatch.setattr(cli, "compile_definition", compile_definition)
    return {**tiny, "out": tiny["tmp"] / "out"}


def dispatched(path: Path, *, prompt: str, cwd: str | None, **shape: Any) -> Path:
    """一份 subagent 记录，带宿主写在每条事件上的会话工作目录。"""
    transcript(path, prompt=prompt, **shape)
    events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    for event in events:
        if cwd:
            event["cwd"] = cwd
    path.write_text("".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events), encoding="utf-8")
    return path


def run_checkout(wired: dict[str, Any], name: str, material: str, *, cwd: str | None = "/elsewhere",
                 edit: Any = None, rep: int = 0, **shape: Any) -> tuple[str, Path]:
    flow = wired["flows"][name]
    said = cli.prepare(flow, flow.material(material), rep, variant="baseline", out=wired["out"], work=wired["work"],
                       allow_dirty=False, again=False)
    evidence = cli.episode_dir(wired["out"], "baseline", material, rep)
    pending = json.loads((evidence / "pending.json").read_text(encoding="utf-8"))
    if edit:
        edit(Path(pending["workspace"]))
    path = dispatched(wired["tmp"] / f"agent-{next(serial)}.jsonl", prompt=(evidence / "brief.md").read_text("utf-8"),
                      cwd=cwd, **shape)
    return said + "\n" + cli.record(flow, flow.material(material), rep, variant="baseline", out=wired["out"],
                                    transcript=path, dispatch="registered", tokens=10), evidence


def test_prepare_says_where_to_dispatch_from_and_brief_is_filled(wired_checkout: dict[str, Any]) -> None:
    flow = wired_checkout["flows"]["tiny-implement"]
    said = cli.prepare(flow, flow.materials[0], 1, variant="baseline", out=wired_checkout["out"],
                       work=wired_checkout["work"], allow_dirty=False, again=False)
    assert said.startswith("PRECONDITION: dispatch from a session whose working directory is outside")
    evidence = cli.episode_dir(wired_checkout["out"], "baseline", "T1", 1)
    pending = json.loads((evidence / "pending.json").read_text(encoding="utf-8"))
    assert "tree_hash" not in pending and Path(pending["template"]).parent.name == workspace.TEMPLATES
    assert f"检出 `{pending['workspace']}`" in (evidence / "brief.md").read_text(encoding="utf-8")
    assert "run t1-r1" in (evidence / "brief.md").read_text(encoding="utf-8")


def test_an_implement_run_is_judged_on_its_copy_before_the_copy_goes(
        wired_checkout: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[bool] = []
    real = implement.judge

    def watched(flow: suite.Flow, material: suite.Material, dest: Path, **kwargs: Any) -> dict[str, Any]:
        seen.append((dest / "member/src/mod.ts").is_file())
        return real(flow, material, dest, **kwargs)

    monkeypatch.setattr(implement, "judge", watched)
    said, evidence = run_checkout(wired_checkout, "tiny-implement", "T1",
                                  edit=lambda copy: (copy / "member/src/mod.ts").write_text("export const v = 'good'\n"),
                                  calls=[("Edit", {"file_path": "member/src/mod.ts"}, "ok")])
    # prepare 里的 verify 判两次（桩在位、放回原件），record 判一次；三次判定时副本都还在
    assert seen == [True, True, True], "判定时副本还在"
    assert "scored by the program: success 1" in said
    record = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
    assert record["oracle"]["success"] and record["provenance"]["session_cwd"] == "/elsewhere"
    assert (evidence / "oracle" / "oracle.json").is_file() and (evidence / "oracle" / "changes.patch").is_file()
    assert list(wired_checkout["work"].glob("tiny-implement-*")) == [], "判完副本删掉"
    rows = VariantStore(wired_checkout["out"], "baseline").rows()
    assert len(rows) == 1 and rows[0]["prompt_id"] == "T1.run" and rows[0]["meta"]["unit"] == "run"
    check_row(rows[0])
    assert rows[0]["grade"] == {"success": 1, "target_pass": 1.0, "write_scope": 1, "tests_intact": 1, "only_allowed": 1}
    assert rows[0]["meta"]["grader"].startswith("program:implement tiny-implement")
    flow, out = wired_checkout["flows"]["tiny-implement"], wired_checkout["out"]
    refused = "a program judges each run when 'record'"
    with pytest.raises(cli.Refused, match=refused):
        cli.judge_brief(flow, flow.materials[0], 0, variant="baseline", out=out)
    with pytest.raises(cli.Refused, match=refused):
        cli.judge_record(flow, flow.materials[0], 0, variant="baseline", out=out, transcript=evidence / "trajectory.jsonl")
    with pytest.raises(cli.Refused, match=refused):
        cli.calibrate_brief(flow, None, out)


def test_an_acceptance_run_lands_one_row_per_criterion_and_one_for_the_run(wired_checkout: dict[str, Any]) -> None:
    def leaves_report(copy: Path) -> None:
        folder = copy / "tmp" / "qa" / "q2-r0"
        folder.mkdir(parents=True)
        (folder / "report.json").write_text(json.dumps(qa_report(C3="fail")), encoding="utf-8")

    said, evidence = run_checkout(wired_checkout, "tiny-acceptance", "Q2", edit=leaves_report,
                                  calls=[("Bash", {"command": "node dist/main.js"}, "ok")])
    assert "success 1" in said and (evidence / "oracle" / "report.json").is_file()
    rows = VariantStore(wired_checkout["out"], "baseline").rows()
    assert [row["prompt_id"] for row in rows] == ["Q2.C1", "Q2.C2", "Q2.C3", "Q2.run"]
    assert [row["grade"]["criterion_ok"] for row in rows[:3]] == [1, 1, 1], "C3 在 either 里，判 fail 也对"
    assert rows[3]["grade"] == {"success": 1, "write_scope": 1, "dist_intact": 1, "report_found": 1, "only_allowed": 1}
    assert {row["meta"]["unit"] for row in rows} == {"criterion", "run"}
    for row in rows:
        check_row(row)


def test_a_delivery_review_records_tracked_intact_for_the_judge_to_add_to(wired_checkout: dict[str, Any]) -> None:
    said, evidence = run_checkout(wired_checkout, "tiny-delivery", "D1", calls=[("Bash", {"command": "pnpm test"}, "ok")],
                                  edit=lambda copy: (copy / "coverage.txt").write_text("未跟踪的检查输出\n"))
    record = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
    assert record["observations"] == {"tracked_intact": [1, "受版本管理的文件没有被改动，HEAD 仍是交付提交"]}
    assert "oracle" not in record and VariantStore(wired_checkout["out"], "baseline").rows() == []
    brief = (evidence / "brief.md").read_text(encoding="utf-8")
    assert "{BASE}" not in brief and "- 只改了 member。" in brief


# --- A6：隔离 --------------------------------------------------------------------------------------------------

@pytest.mark.parametrize(("cwd", "calls", "expected"), [
    ("inside", [("Read", {"file_path": "x"}, "ok")], "inside a checkout of the repository"),
    (None, [("Read", {"file_path": "x"}, "ok")], "does not say where the session ran"),
    ("/elsewhere", [("Read", {"file_path": "MAIN/member/tests/mod.spec.ts"}, "ok")], "Read asked for MAIN"),
    ("/elsewhere", [("Bash", {"command": "ls ~/.cache/role-evals/work/_templates"}, "ok")], "asked for _templates"),
])
def test_a_checkout_run_that_could_reach_the_answers_is_contaminated(
        wired_checkout: dict[str, Any], cwd: str | None, calls: Any, expected: str) -> None:
    main = str(wired_checkout["repo"].resolve())
    cwd = str(wired_checkout["repo"].resolve() / "member") if cwd == "inside" else cwd
    calls = [(name, {key: value.replace("MAIN", main) for key, value in args.items()}, out) for name, args, out in calls]
    said, _ = run_checkout(wired_checkout, "tiny-implement", "T1", cwd=cwd, calls=calls)
    errors = VariantStore(wired_checkout["out"], "baseline").error_rows()
    assert "contaminated" in said and errors[0]["failure_class"] == "contaminated"
    assert expected.replace("MAIN", main) in errors[0]["detail"]
    assert VariantStore(wired_checkout["out"], "baseline").rows() == [], "不计分"


def test_only_what_a_tool_asked_for_counts_not_what_it_got_back(wired_checkout: dict[str, Any]) -> None:
    main = str(wired_checkout["repo"].resolve())
    said, _ = run_checkout(wired_checkout, "tiny-implement", "T1",
                           calls=[("Bash", {"command": "node -p process.env.NODE_PATH"}, f"{main}/node_modules")])
    assert "T1 rep 0: recorded" in said.splitlines()[-1]
    assert VariantStore(wired_checkout["out"], "baseline").error_rows() == []


def test_the_session_directory_is_read_off_the_first_event(tmp_path: Path) -> None:
    path = dispatched(tmp_path / "t.jsonl", prompt="请评审", cwd="/repo/inside")
    events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    events[-1]["cwd"] = "/somewhere/after/cd"
    path.write_text("".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events), encoding="utf-8")
    assert claude_host.parse(path, brief="请评审").cwd == "/repo/inside"
    assert checkout.dispatched_inside("/repo/inside", Path("/repo")) and not checkout.dispatched_inside("/repo-two", Path("/repo"))


def test_a_material_flow_is_recorded_wherever_it_was_dispatched_from(wired: dict[str, Any]) -> None:
    evidence = prepare_material(wired)
    path = dispatched(wired["tmp"] / "inside.jsonl", prompt=(evidence / "brief.md").read_text(encoding="utf-8"),
                      cwd=str(wired["repo"].resolve()),
                      calls=[("Read", {"file_path": f"{wired['repo'].resolve()}/design/doc.md"}, "调用方")])
    said = cli.record(wired["flow"], wired["flow"].material("doc"), 0, variant="baseline", out=wired["out"],
                      transcript=path, dispatch="registered", tokens=None)
    assert "recorded" in said and "contaminated" not in said
    record = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
    assert record["observations"]["read_only"][0] == 1 and record["provenance"]["session_cwd"] == str(wired["repo"].resolve())


# --- A7：判官身份 -----------------------------------------------------------------------------------------------

SIGNED_JUDGE = "judge:subagent:claude-sonnet-5-5 rules 70fdea287e52"


def test_the_signed_judge_keeps_its_name_and_implementation_review_has_its_own() -> None:
    assert judge.identity("claude-sonnet-5-5") == SIGNED_JUDGE
    for judgment in ("表达", "选择", "计划"):
        assert judge.identity("claude-sonnet-5-5", judgment) == SIGNED_JUDGE
    other = judge.identity("claude-sonnet-5-5", "实现")
    assert other != SIGNED_JUDGE and other.startswith("judge:subagent:claude-sonnet-5-5 rules ")
    assert sorted(judge.OUT_OF_KIND) == sorted(["表达", "选择", "计划"]), "已签字的三条规则原样不动"
    for root in sorted((EVALUATION / "suites").glob("design-review-*")):
        flow = suite.load(root)
        assert flow.signoffs["grading"]["judge"] == SIGNED_JUDGE == judge.identity("claude-sonnet-5-5", flow.judgment)


def test_the_implementation_rule_reaches_the_judge_brief(tiny: dict[str, Any]) -> None:
    flow = tiny["flows"]["tiny-delivery"]
    text = judge.brief(flow, flow.materials[0], "## 阻断\n\nB-1 ……\n")
    assert judge.OUT_OF_KIND_MORE["实现"] in text and "本次评审的判断种类：实现" in text
    assert "材料里的这段文字（member/src/mod.ts）：'good' // infra" in text and "材料里的这段文字（README.md）：备注一句。" in text
    assert "id `S2`｜位置：交付说明｜问题：声称没改别处" in text


# --- 用例集与命令行 ------------------------------------------------------------------------------------------------

@pytest.mark.parametrize(("change", "message"), [
    (lambda flow: flow["workspace"].pop("setup"), "workspace lacks 'setup'"),
    (lambda flow: flow["workspace"].update(kind="vm"), "unknown workspace kind"),
    (lambda flow: flow["workspace"].update(excludes=[]), "excludes the evaluation directory"),
    (lambda flow: flow["workspace"].update(commit="squash"), "commit must be one of"),
    (lambda flow: flow["oracle"].pop("typecheck"), "oracle lacks 'typecheck'"),
    (lambda flow: flow["materials"][0]["task"].update(stub="stubs/none"), "does not exist"),
    (lambda flow: flow["materials"][0].update(id="T2"), "has no entry for it"),
    (lambda flow: flow.update(workspace={"base": "x", "material_paths": [], "material_excludes": [], "subject_paths": []}),
     "works on a checkout"),
])
def test_a_checkout_suite_that_leaves_a_run_guessing_does_not_load(tiny: dict[str, Any], change: Any, message: str) -> None:
    root = tiny["repo"] / "suites" / "tiny-implement"
    flow = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    change(flow)
    (root / "flow.json").write_text(json.dumps(flow, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match=message):
        suite.load(root)


def test_an_acceptance_suite_states_its_expectation_in_listed_criteria(tiny: dict[str, Any]) -> None:
    root = tiny["repo"] / "suites" / "tiny-acceptance"
    flow = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    flow["materials"][1]["expected"]["either"] = ["C9"]
    (root / "flow.json").write_text(json.dumps(flow, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match=r"criteria \['C9'\] are not listed"):
        suite.load(root)
    flow["materials"][1]["expected"] = {"verdict": ["Fail"], "verdict_not": ["Pass"], "failing_criteria": []}
    (root / "flow.json").write_text(json.dumps(flow, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match="verdict or verdict_not"):
        suite.load(root)


def test_the_inputs_page_of_each_new_family(tiny: dict[str, Any]) -> None:
    text = cli.inputs(tiny["flows"]["tiny-implement"])
    assert "任务 T1（run {RUN_ID}），角色 tiny-developer，检出 `{WORKDIR}`。" in text
    assert "删掉隐藏测试 `member/tests/mod.spec.ts`" in text and "`member/src/mod.ts`" in text and "（桩在位时失败的 1 条）" in text
    text = cli.inputs(tiny["flows"]["tiny-acceptance"])
    assert "| `Q2` |" in text and "| Fail | C2 | C3 |" in text and "#### 缺陷 `d1`" in text and "'bad'" in text
    text = cli.inputs(tiny["flows"]["tiny-delivery"])
    assert "### 交付说明（note.md，逐字）" in text and "- 只改了 member。" in text
    assert "文件 `README.md` 末尾追加：" in text and "种在派发材料 `briefs/note.md` 里" in text


def test_nothing_new_in_the_runner_starts_a_model() -> None:
    for name in ("checkout.py", "implement.py", "acceptance.py", "program.py", "workspace.py", "review.py"):
        source = (EVALUATION / "harness" / "roleeval" / name).read_text(encoding="utf-8")
        assert '"claude"' not in source and "'claude'" not in source and "claude -p" not in source, name


# --- 入库的三个新用例集 ---------------------------------------------------------------------------------------------

CHECKOUT_SUITES = sorted(path.parent for path in (EVALUATION / "suites").glob("*/flow.json")
                         if json.loads(path.read_text(encoding="utf-8"))["workspace"].get("kind") == "checkout")


def test_the_checkout_suites_are_standing_and_unsigned() -> None:
    assert [root.name for root in CHECKOUT_SUITES] == ["developer-implement", "implementation-review", "qa-acceptance",
                                                       "tui-developer-implement"]
    for root in CHECKOUT_SUITES:
        flow = suite.load(root)
        assert flow.unsigned() == ["cases", "grading"] and flow.version == 1
        with pytest.raises(cli.Refused, match="no sign-off on: cases, grading"):
            cli.prepare(flow, flow.materials[0], 0, variant="baseline", out=Path("/nonexistent"), work=Path("/nonexistent"),
                        allow_dirty=False, again=False)


@pytest.mark.parametrize("root", CHECKOUT_SUITES, ids=lambda path: path.name)
def test_a_checkout_suite_still_fits_its_pinned_commit(root: Path) -> None:
    """零花费的腐坏探测：钉的提交够得着；种入、缺陷、桩、隐藏测试在那个提交上都对得上。"""
    flow = suite.load(root)
    repo = META.parent
    for material in flow.materials:
        base = flow.base(material)
        assert workspace.is_ancestor(repo, base), f"{flow.id}/{material.id}: base {base} is no longer an ancestor of HEAD"
        edits = [*material.ops(), *[{"op": "replace", **defect} for defect in material.defects]]
        for op in edits:
            if op["op"] == "replace":
                text = workspace.git(repo, "show", f"{base}:{op['file']}")
                assert text.count(op["find"]) == 1, f"{flow.id}/{material.id}.{op.get('id')}: no longer lands once"
            else:
                workspace.git(repo, "show", f"{base}:{op['file']}")
        if material.task:
            for path in [*material.task["hidden_tests"], *implement.stub_files(flow, material)]:
                workspace.git(repo, "show", f"{base}:{path}")
            checkout.framed_brief(flow, material, workdir="/w", rep=0)
        if flow.family == "acceptance":
            acceptance.brief(flow, material, workdir="/w", rep=0)
        if material.delivery_note:
            review.delivery_brief(material, Path("/w"), {"baseline": "b", "head": "h"})
