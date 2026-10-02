"""运行器的 write-tests 一类：角色为拿走了原有测试的模块写测试，程序用预置的变异体判它写的测试。

一律用小仓库与假命令，不依赖 pnpm；真实的检出由 `make role-eval ARGS="verify …"` 证。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from test_role_evals import git, serial  # noqa: F401  (also puts the harness on sys.path)
from test_role_evals_checkout import FAKE_SETUP, HOST, PY, SIGNED, checkout_workspace, run_checkout, write

from roleeval import checkout, claude_host, cli, suite, workspace, write_tests  # noqa: E402
from roleeval.store import VariantStore, check_row  # noqa: E402

# 假的 vitest：位置参数是文件过滤（子串匹配，同 vitest），一个都匹配不上就以 1 退出；
# spec 里「名字=src/mod.ts 里要有的字」一行一条；以 test('名字' 开头的一行是一条不看模块、恒过的真 vitest 测试
# （verify 写的那条恒真测试就是这样）；别的行不算测试。模块里有 HANG 就一直睡。
FAKE_VITEST = """
import json, pathlib, re, sys, time
out = next(a.split("=", 1)[1] for a in sys.argv if a.startswith("--outputFile="))
filters = [a for a in sys.argv[1:] if not a.startswith("--")]
mod = pathlib.Path("src/mod.ts").read_text()
if "HANG" in mod:
    time.sleep(60)
specs = [s for s in sorted(pathlib.Path("tests").glob("*.spec.ts")) if not filters or any(f in s.as_posix() for f in filters)]
if not specs:
    print("No test files found")
    sys.exit(1)
results, ok = [], True
for spec in specs:
    cases = []
    for line in spec.read_text().splitlines():
        named = re.match(r"test\\('([^']*)'", line)
        if named:
            name, passed = named.group(1), True
        elif "=" in line:
            name, _, want = line.partition("=")
            passed = want in mod
        else:
            continue
        ok = ok and passed
        cases.append({"title": name, "fullName": name, "status": "passed" if passed else "failed"})
    results.append({"name": str(spec.resolve()), "status": "passed", "assertionResults": cases})
pathlib.Path(out).write_text(json.dumps({"testResults": results}))
sys.exit(0 if ok else 1)
"""
FAKE_TYPECHECK = ("import pathlib, sys; "
                  "sys.exit(1 if any('TYPE_ERROR' in p.read_text() for p in pathlib.Path('tests').glob('*.ts')) else 0)")
MODULE = "export const a = 'alpha'\nexport const b = 'beta'\n"
ORIGINAL_TESTS = "has alpha='alpha'\nhas beta='beta'\n"
MUTANTS = [{"id": "m1-alpha", "find": "'alpha'", "replace": "'ALPHA'"},
           {"id": "m2-beta", "find": "'beta'\n", "replace": "'BETA'\n"}]


def write_tests_flow(base: str, counter: Path, mutants: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "format": 1, "id": "tiny-write-tests", "version": 1, "family": "write-tests", "role": "tiny-verifier", "reps": 2,
        "host": HOST, "workspace": checkout_workspace(base, counter), "brief_frame": "briefs/_frame.md",
        "oracle": {"member": "member", "tests_dir": "tests", "test": [PY, "../tools/fake_vitest.py", "--outputFile={OUT}"],
                   "typecheck": [PY, "../tools/fake_typecheck.py"], "timeout_s": {"mutant": 5}},
        "metrics": [{"id": "success", "kind": "binary"}, {"id": "kill_rate", "kind": "float"},
                    {"id": "killed", "kind": "binary"}, {"id": "write_scope", "kind": "binary"},
                    {"id": "tests_intact", "kind": "binary"}, {"id": "only_allowed", "kind": "binary"}],
        "signoffs": SIGNED,
        "materials": [{"id": "W1", "target": "member/src/mod.ts 的测试", "brief": "briefs/W1.md",
                       "task": {"target": "member/src/mod.ts", "hidden_tests": ["member/tests/mod.spec.ts"],
                                "allowed_write": ["member/tests/"], "mutants": mutants}}],
    }


@pytest.fixture
def small(tmp_path: Path) -> dict[str, Any]:
    """小仓库：成员 member/ 带被测模块、它的原有测试与另一份已有测试；用例集 tiny-write-tests 带两个变异体。"""
    root = tmp_path / "repo"
    write(root, {
        ".gitignore": "dist/\nnode_modules/\ntmp/\n",
        "member/src/mod.ts": MODULE, "member/tests/mod.spec.ts": ORIGINAL_TESTS, "member/tests/other.spec.ts": "exports=export\n",
        ".meta_harness/agents/evaluation/truth.json": "{}\n",
        "tools/setup.py": FAKE_SETUP, "tools/fake_vitest.py": FAKE_VITEST, "tools/fake_typecheck.py": FAKE_TYPECHECK,
    })
    git(root, "init", "-q")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "base")
    base = git(root, "rev-parse", "HEAD")
    counter = tmp_path / "setup-runs.txt"
    flow_root = root / "suites" / "tiny-write-tests"
    write(flow_root, {
        "briefs/_frame.md": "任务 {TASK_ID}（run {RUN_ID}），角色 {ROLE}，检出 `{WORKDIR}`。\n\n{GOAL}\n",
        "briefs/W1.md": "@@GOAL\n为 member/src/mod.ts 写测试。\n",
        "flow.json": json.dumps(write_tests_flow(base, counter, MUTANTS), ensure_ascii=False)})
    git(root, "add", "-A")
    git(root, "commit", "-qm", "suite")
    work = tmp_path / "work"
    work.mkdir()
    flow = suite.load(flow_root)
    return {"repo": root, "base": base, "counter": counter, "work": work, "tmp": tmp_path, "root": flow_root,
            "flow": flow, "flows": {flow.id: flow}}


def reload(small: dict[str, Any], mutants: list[dict[str, str]]) -> suite.Flow:
    (small["root"] / "flow.json").write_text(
        json.dumps(write_tests_flow(small["base"], small["counter"], mutants), ensure_ascii=False), encoding="utf-8")
    return suite.load(small["root"])


@pytest.fixture
def copy(small: dict[str, Any]) -> dict[str, Any]:
    flow = small["flow"]
    material = flow.materials[0]
    source = checkout.template(flow, material, repo=small["repo"], work=small["work"])
    dest = small["tmp"] / "copy"
    checkout.build(flow, material, dest, source=source, before_baseline=lambda c: write_tests.prepare(flow, material, c))
    return {**small, "material": material, "source": source, "dest": dest}


def judged(case: dict[str, Any], tests: str | None = None, *, flow: suite.Flow | None = None) -> dict[str, Any]:
    """Judge the copy after the role wrote ``tests`` as member/tests/mine.spec.ts (nothing when None)."""
    if tests is not None:
        (case["dest"] / "member/tests/mine.spec.ts").write_text(tests, encoding="utf-8")
    flow = flow or case["flow"]
    return write_tests.judge(flow, flow.materials[0], case["dest"], source=case["source"],
                             evidence=case["tmp"] / f"evidence-{next(serial)}")


def module(case: dict[str, Any]) -> bytes:
    return (case["dest"] / "member/src/mod.ts").read_bytes()


# --- 副本 --------------------------------------------------------------------------------------------------------

def test_the_copy_takes_the_tests_away_and_keeps_the_module(copy: dict[str, Any]) -> None:
    dest = copy["dest"]
    assert not (dest / "member/tests/mod.spec.ts").exists() and not (dest / "member/dist").exists()
    assert (dest / "member/src/mod.ts").read_text() == MODULE, "被测模块原样留着"
    assert (dest / "member/tests/other.spec.ts").is_file(), "别的已有测试留着"
    assert workspace.git(dest, "status", "--porcelain") == "", "删除都在基线提交里"
    assert checkout.answers_left(copy["flow"], copy["material"], dest) == []


# --- 判定 --------------------------------------------------------------------------------------------------------

def test_the_original_tests_kill_every_mutant_and_succeed(copy: dict[str, Any]) -> None:
    result = judged(copy, ORIGINAL_TESTS)
    assert result["test_files"] == ["tests/mine.spec.ts"]
    assert (result["tests_passed"], result["tests_total"]) == (2, 2), "只跑角色写的文件，不跑 other.spec.ts"
    assert result["valid"] and result["typecheck"] and result["success"]
    assert result["killed"] == ["m1-alpha", "m2-beta"] and result["survived"] == []
    assert module(copy) == (copy["source"] / "member/src/mod.ts").read_bytes(), "判完模块还原成模板里的那份"
    evidence = Path(copy["tmp"]).glob("evidence-*")
    names = {path.name for folder in evidence for path in folder.iterdir()}
    assert {"changes.patch", "oracle.json", "oracle-valid.json", "oracle-typecheck.log", "oracle-m1-alpha.json",
            "oracle-m2-beta.log"} <= names


def test_no_test_written_is_invalid_and_every_mutant_survives(copy: dict[str, Any]) -> None:
    result = judged(copy)
    assert result["test_files"] == [] and not result["valid"] and not result["success"]
    assert result["killed"] == [] and result["survived"] == ["m1-alpha", "m2-beta"]
    assert result["typecheck"] is None, "没有测试就什么都不跑"
    scored = write_tests.scored(result, claude_host.Episode(), ["Read"])
    assert scored["success"][0] == 0 and scored["kill_rate"][0] == 0 and "没有新增或改动" in scored["success"][1]


def test_a_test_that_passes_whatever_the_module_does_kills_nothing(copy: dict[str, Any]) -> None:
    result = judged(copy, "always=\n")
    assert result["valid"] and result["killed"] == [] and result["survived"] == ["m1-alpha", "m2-beta"]
    assert not result["success"]


def test_a_partial_kill_is_counted_mutant_by_mutant(copy: dict[str, Any]) -> None:
    result = judged(copy, "has alpha='alpha'\n")
    assert result["valid"] and result["killed"] == ["m1-alpha"] and result["survived"] == ["m2-beta"]
    scored = write_tests.scored(result, claude_host.Episode(), ["Read"])
    assert scored["success"][0] == 0 and scored["kill_rate"][0] == 0.5 and "存活：m2-beta" in scored["kill_rate"][1]


def test_tests_red_on_the_module_are_invalid_even_though_every_mutant_fails_them(copy: dict[str, Any]) -> None:
    result = judged(copy, "wants=nowhere\n")
    assert not result["valid"] and not result["success"] and result["tests_failed"] == ["mine.spec.ts :: wants"]
    assert result["killed"] == ["m1-alpha", "m2-beta"], "原判定的杀死只看退出码，不看有效性"
    assert write_tests.scored(result, claude_host.Episode(), ["Read"])["kill_rate"][0] == 1.0


def test_a_red_typecheck_is_recorded_but_does_not_decide(copy: dict[str, Any]) -> None:
    result = judged(copy, ORIGINAL_TESTS + "// TYPE_ERROR=\n")
    assert result["typecheck"] is False and result["success"], "原判定把类型检查只记下来，不计入成败"
    assert "类型检查不通过" in write_tests.scored(result, claude_host.Episode(), ["Read"])["success"][1]


def test_only_spec_files_under_the_tests_dir_are_the_role_s_tests(copy: dict[str, Any]) -> None:
    dest = copy["dest"]
    (dest / "member/tests/helper.ts").write_text("export const x = 1\n")
    (dest / "member/src/extra.spec.ts").write_text("has alpha='alpha'\n")
    (dest / "member/tests/other.spec.ts").write_text("exports=export\nhas beta='beta'\n")   # 改了一份已有测试
    result = judged(copy, "has alpha='alpha'\n")
    assert result["test_files"] == ["tests/mine.spec.ts", "tests/other.spec.ts"], "改动的已有 spec 也算进来，同原判定"
    assert result["killed"] == ["m1-alpha", "m2-beta"]
    assert result["tampered"] == ["member/tests/other.spec.ts"] and result["outside"] == ["member/src/extra.spec.ts"]
    episode = claude_host.Episode(tool_names={"Read": 1, "WebFetch": 1})
    scored = write_tests.scored(result, episode, ["Read"])
    assert (scored["write_scope"][0], scored["tests_intact"][0], scored["only_allowed"][0]) == (0, 0, 0)
    assert "member/src/extra.spec.ts" in scored["write_scope"][1] and "WebFetch" in scored["only_allowed"][1]


def test_mutants_go_into_the_module_as_the_template_has_it(copy: dict[str, Any]) -> None:
    (copy["dest"] / "member/src/mod.ts").write_text("export const a = 'alpha'\n")   # 角色越界改了被测模块
    result = judged(copy, "has alpha='alpha'\n")
    assert result["valid"], "有效性在角色留下的模块上跑，同原判定"
    assert result["killed"] == ["m1-alpha"] and result["survived"] == ["m2-beta"], "m2 仍落在模板那份原文上"
    assert result["outside"] == ["member/src/mod.ts"]
    assert module(copy) == MODULE.encode(), "判完是模板里的模块，不是角色改过的"


def test_a_mutant_that_does_not_land_once_stops_the_judgment(copy: dict[str, Any]) -> None:
    flow = reload(copy, [MUTANTS[0], {"id": "m3-nowhere", "find": "'gamma'", "replace": "'GAMMA'"}])
    with pytest.raises(workspace.WorkspaceError, match="m3-nowhere: expected the text to replace exactly once, found it 0"):
        judged(copy, ORIGINAL_TESTS, flow=flow)
    assert module(copy) == MODULE.encode(), "停下之前模块已还原"
    assert write_tests.landing(flow.materials[0], MODULE + "x = 'alpha'\n") == [
        "W1.m1-alpha: expected the text to replace exactly once in member/src/mod.ts, found it 2 times",
        "W1.m3-nowhere: expected the text to replace exactly once in member/src/mod.ts, found it 0 times"]


def test_a_mutant_run_that_runs_out_of_time_is_no_verdict(copy: dict[str, Any]) -> None:
    flow = reload(copy, [MUTANTS[0], {"id": "m4-hang", "find": "'beta'", "replace": "'HANG'"}])
    raw = json.loads((copy["root"] / "flow.json").read_text(encoding="utf-8"))
    raw["oracle"]["timeout_s"]["mutant"] = 1
    (copy["root"] / "flow.json").write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(workspace.WorkspaceError, match="ran out of its 1s"):
        judged(copy, ORIGINAL_TESTS, flow=suite.load(copy["root"]))
    assert module(copy) == MODULE.encode()
    assert flow.materials[0].task["mutants"][1]["id"] == "m4-hang"


# --- verify ------------------------------------------------------------------------------------------------------

def test_verify_tells_the_original_tests_from_none_and_from_an_always_true_one(
        small: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "REPO", small["repo"])
    notes: list[str] = []
    assert cli.verify(small["flow"], small["work"], notes=notes) == []
    assert [path.name for path in small["work"].iterdir()] == [workspace.TEMPLATES], "verify 不留副本"
    assert any(note.startswith("W1 nothing written: valid=False") and "survived 2/2" in note for note in notes)
    assert any(note.startswith("W1 one always-true test: valid=True") and "killed 0/2" in note for note in notes)
    assert any(note.startswith("W1 original tests: valid=True") and "killed 2/2" in note and "success=True" in note
               for note in notes)


def test_verify_reports_a_mutant_the_original_tests_let_through(small: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "REPO", small["repo"])
    flow = reload(small, [*MUTANTS, {"id": "m5-let", "find": "export const b", "replace": "export let b"}])
    problems = cli.verify(flow, small["work"])
    assert len(problems) == 1 and "mutants surviving ['m5-let']" in problems[0]


def test_verify_reports_a_mutant_that_does_not_land_once_and_builds_nothing(
        small: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "REPO", small["repo"])
    flow = reload(small, [*MUTANTS, {"id": "m6-twice", "find": "export const", "replace": "export let"}])
    problems = cli.verify(flow, small["work"])
    assert problems == ["W1.m6-twice: expected the text to replace exactly once in member/src/mod.ts, found it 2 times"]
    assert [path.name for path in small["work"].iterdir()] == [workspace.TEMPLATES]


# --- 用 cli 走一遍：准备、派发、收录 ----------------------------------------------------------------------------------

@pytest.fixture
def wired(small: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    repo = small["repo"]
    monkeypatch.setattr(cli, "REPO", repo)
    monkeypatch.setattr(cli, "META", repo / "meta")
    monkeypatch.setattr(cli, "HARNESS", repo / "harness")
    (repo / "harness").mkdir()

    def compile_definition(flow: suite.Flow, out: Path, variant: str) -> Path:
        frozen = out / variant / "agents" / f"{flow.role}.json"
        frozen.parent.mkdir(parents=True, exist_ok=True)
        frozen.write_text(json.dumps({flow.role: {"prompt": "你来写测试"}}), encoding="utf-8")
        return frozen

    monkeypatch.setattr(cli, "compile_definition", compile_definition)
    return {**small, "out": small["tmp"] / "out"}


def test_a_run_lands_one_row_per_mutant_and_one_for_the_run(wired: dict[str, Any]) -> None:
    said, evidence = run_checkout(wired, "tiny-write-tests", "W1",
                                  edit=lambda c: (c / "member/tests/mine.spec.ts").write_text("has alpha='alpha'\n"),
                                  calls=[("Write", {"file_path": "member/tests/mine.spec.ts"}, "ok")])
    assert said.startswith("PRECONDITION: dispatch from a session whose working directory is outside")
    assert "scored by the program: success 0" in said
    brief = (evidence / "brief.md").read_text(encoding="utf-8")
    assert "角色 tiny-verifier" in brief and "为 member/src/mod.ts 写测试。" in brief and "run w1-r0" in brief
    record = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
    assert record["oracle"]["killed"] == ["m1-alpha"] and (evidence / "oracle" / "oracle-m2-beta.json").is_file()
    assert list(wired["work"].glob("tiny-write-tests-*")) == [], "判完副本删掉"
    rows = VariantStore(wired["out"], "baseline").rows()
    assert [row["prompt_id"] for row in rows] == ["W1.m1-alpha", "W1.m2-beta", "W1.run"]
    assert [row["grade"] for row in rows[:2]] == [{"killed": 1}, {"killed": 0}]
    assert rows[2]["grade"] == {"success": 0, "kill_rate": 0.5, "write_scope": 1, "tests_intact": 1, "only_allowed": 1}
    assert {row["meta"]["unit"] for row in rows} == {"mutant", "run"}
    assert rows[2]["meta"]["grader"] == "program:write-tests tiny-write-tests v1"
    for row in rows:
        check_row(row)
    flow = wired["flow"]
    with pytest.raises(cli.Refused, match="a program judges each run when 'record'"):
        cli.judge_brief(flow, flow.materials[0], 0, variant="baseline", out=wired["out"])
    text = cli.summary(flow, wired["out"])
    assert "kill_rate" in text and "the mutants of one material are judged with the same tests" in text


# --- 用例集与命令行 ------------------------------------------------------------------------------------------------

def task_of(flow: dict[str, Any]) -> dict[str, Any]:
    return flow["materials"][0]["task"]


@pytest.mark.parametrize(("change", "message"), [
    (lambda flow: task_of(flow).pop("mutants"), "task lacks 'mutants'"),
    (lambda flow: task_of(flow).pop("target"), "task lacks 'target'"),
    (lambda flow: task_of(flow).update(mutants=[]), "at least one mutant"),
    (lambda flow: task_of(flow).update(mutants=[MUTANTS[0], MUTANTS[0]]), "duplicate mutant ids"),
    (lambda flow: task_of(flow).update(mutants=[{"id": "m", "find": "'a'"}]), r"a mutant lacks \['replace'\]"),
    (lambda flow: task_of(flow).update(mutants=[{"id": "m", "find": "'a'", "replace": "'a'"}]), "with other text"),
    (lambda flow: task_of(flow).update(mutants=[{"id": "m", "find": "", "replace": "x"}]), "with other text"),
    (lambda flow: flow["oracle"].pop("test"), "oracle lacks 'test'"),
    (lambda flow: flow.update(brief_frame="briefs/none.md"), "the write-tests family fills its task briefs into a brief_frame"),
    (lambda flow: flow.update(workspace={"base": "x", "material_paths": [], "material_excludes": [], "subject_paths": []}),
     "works on a checkout"),
])
def test_a_write_tests_suite_that_leaves_a_run_guessing_does_not_load(small: dict[str, Any], change: Any,
                                                                     message: str) -> None:
    flow = json.loads((small["root"] / "flow.json").read_text(encoding="utf-8"))
    change(flow)
    (small["root"] / "flow.json").write_text(json.dumps(flow, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match=message):
        suite.load(small["root"])


def test_the_inputs_page_shows_the_brief_and_every_mutant_verbatim(small: dict[str, Any]) -> None:
    text = cli.inputs(small["flow"])
    assert "任务 W1（run {RUN_ID}），角色 tiny-verifier，检出 `{WORKDIR}`。" in text
    assert "| `W1` |" in text and "| 2 个 |" in text and "删掉原有测试 `member/tests/mod.spec.ts`" in text
    assert "#### `m2-beta`" in text and json.dumps({"find": "'beta'\n", "replace": "'BETA'\n"}) in text
