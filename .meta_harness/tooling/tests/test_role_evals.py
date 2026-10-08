from __future__ import annotations

import itertools
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

META = Path(__file__).resolve().parents[2]
EVALUATION = META / "agents" / "evaluation"
sys.path.insert(0, str(EVALUATION / "harness"))

from roleeval import calibration, claude_host, cli, grading, judge, review, stats, suite, workspace  # noqa: E402
from roleeval.store import RowRejected, VariantStore, check_row  # noqa: E402

MODEL = "claude-test-1"
JUDGE = "claude-judge-1"
USAGE = {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
FINAL = "本次判断是**选择**，读的判据页是 `references/review/x.md`。\n\n## 阻断\n\nB-1 ……"
READ_DOC = ("Read", {"file_path": "design/doc.md"}, "x" * 30000)
serial = itertools.count()


# --- 夹具 ---------------------------------------------------------------------------------------------------

def row(case: str = "m.S1", rep: int = 0, *, episode: str = "m", grade: dict[str, Any] | None = None,
        status: str = "ok", **over: Any) -> dict[str, Any]:
    base = {"prompt_id": case, "prompt": "p", "tags": ["m"], "rep": rep, "status": status,
            "grade": {"caught": 1} if grade is None else grade, "model": MODEL, "usage": dict(USAGE),
            "meta": {"episode": episode, "unit": "seed"}}
    return {**base, **over}


TURNS = [{"role": "user", "content": "brief"}, {"role": "assistant", "content": "report"}]


def transcript(path: Path, *, prompt: str, final: str = FINAL, model: str = MODEL,
               calls: list[tuple[str, dict[str, Any], str]] | None = None, handback: bool = True,
               stop: str = "end_turn", effort: str | None = "high", helper: str | None = None) -> Path:
    """一份 subagent 记录，照宿主的落盘方式：一条消息按块拆成几行，共用一个 id，各行重复同一份用量。"""
    events: list[dict[str, Any]] = [{"type": "user", "message": {"role": "user", "content": prompt}}]

    def said(identity: str, block: dict[str, Any], output: int, *, by: str = model, stop_reason: str | None = None) -> None:
        event: dict[str, Any] = {"type": "assistant", "message": {
            "id": identity, "model": by, "content": [block], "stop_reason": stop_reason,
            "usage": {"input_tokens": 100, "output_tokens": output, "cache_read_input_tokens": 7}}}
        if effort:
            event["effort"] = effort
        events.append(event)

    for index, (name, args, result) in enumerate([READ_DOC] if calls is None else calls):
        said(f"m{index}", {"type": "thinking", "thinking": "先读材料"}, 10)
        said(f"m{index}", {"type": "tool_use", "name": name, "input": args}, 10, stop_reason="tool_use")
        events.append({"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": result}]}})
    if helper:
        said("side", {"type": "text", "text": "标题"}, 3, by=helper)
    if handback:
        said("final", {"type": "tool_use", "name": claude_host.HANDBACK, "input": {"message": final}}, 50, stop_reason=stop)
        events.append({"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "ok"}]}})
    else:
        said("final", {"type": "text", "text": final}, 50, stop_reason=stop)
    for second, event in enumerate(events):
        event["timestamp"] = f"2026-10-01T00:00:{second:02d}.000Z"
    path.write_text("".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events), encoding="utf-8")
    return path


def read_back(tmp_path: Path, **shape: Any) -> claude_host.Episode:
    return claude_host.parse(transcript(tmp_path / f"agent-{next(serial)}.jsonl", prompt="请评审", **shape), brief="请评审")


def headless(directory: Path) -> Path:
    """早先无界面运行留下的一份记录：以一条 result 事件收尾。只用于接手旧记录。"""
    directory.mkdir(parents=True, exist_ok=True)
    events = [
        {"type": "system", "subtype": "init"},
        {"type": "assistant", "message": {"content": [
            {"type": "thinking", "thinking": "先读材料"},
            {"type": "tool_use", "name": "Read", "input": {"file_path": "design/doc.md"}}]}},
        {"type": "user", "message": {"content": [{"type": "tool_result", "content": "x" * 30000}]}},
        {"type": "assistant", "message": {"content": [{"type": "text", "text": FINAL}]}},
        {"type": "result", "subtype": "success", "is_error": False, "stop_reason": "end_turn", "result": FINAL,
         "usage": {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 7},
         "modelUsage": {MODEL: {"outputTokens": 50}, "claude-small-1": {"outputTokens": 3}},
         "total_cost_usd": 0.5, "duration_api_ms": 1200}]
    (directory / "trajectory.jsonl").write_text("".join(json.dumps(event, ensure_ascii=False) + "\n" for event in events),
                                                encoding="utf-8")
    (directory / "brief.md").write_text("请评审", encoding="utf-8")
    return directory


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@invalid", *args],
                          check=True, capture_output=True, text=True).stdout.strip()


def flow_json(base: str, **over: Any) -> dict[str, Any]:
    value = {
        "format": 1, "id": "tiny-review", "version": 1, "family": "review", "role": "tiny-reviewer",
        "judgment": "选择", "criteria_page": "references/review/x.md", "reps": 2,
        "host": {"claude-code": {"model": MODEL, "effort": "high", "allowed": ["Read", "Glob", "Grep"]}},
        "workspace": {"subject_paths": ["skills", "NOTES.md"]},
        "metrics": [{"id": "caught", "kind": "binary", "label": "抓到种入"},
                    {"id": "read_only", "kind": "binary", "label": "只读"},
                    {"id": "names_page", "kind": "binary", "label": "写明判据页"},
                    {"id": "out_of_kind", "kind": "float", "label": "越出判断条数", "better": "lower"},
                    {"id": "blocking", "kind": "float", "label": "阻断条数"},
                    {"id": "novel_blocking", "kind": "float", "label": "表外阻断条数", "better": "lower"}],
        "signoffs": {"cases": {"by": "t", "date": "2026-10-01", "version": 1},
                     "grading": {"by": "t", "date": "2026-10-01", "version": 1}},
        "materials": [{
            "id": "doc", "target": "design/doc.md", "brief": "briefs/doc.md", "fixture": "fixtures/doc.json", "tags": ["种入的"],
            "prepare": [{"op": "copy", "from": "materials/extra.md", "to": "tmp/extra.md"}],
            "seeds": [
                {"id": "S1", "kind": "judgment", "where": "第一句", "truth": "把必须写成了可以",
                 "op": {"op": "replace", "file": "design/doc.md", "find": "必须先读", "replace": "可以不读"}},
                {"id": "S2", "kind": "judgment", "where": "附件", "truth": "附件自相矛盾"},
            ]}],
    }
    return {**value, **over}


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """一个小仓库：design/ 是待审材料，skills/ 与 NOTES.md 是被测的一部分，suites/tiny-review 是用例集。"""
    root = tmp_path / "repo"
    files = {
        "design/doc.md": "调用方必须先读，再写。\n",
        "design/evidence/big.log": "不该进副本\n",
        "skills/page.md": "判据页 第一版\n",
        "NOTES.md": "根约定\n",
        "harness/keep.txt": "运行器\n",
    }
    for relative, text in files.items():
        (root / relative).parent.mkdir(parents=True, exist_ok=True)
        (root / relative).write_text(text, encoding="utf-8")
    git(root, "init", "-q")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "material")
    base = git(root, "rev-parse", "HEAD")
    tiny = root / "suites" / "tiny-review"
    (tiny / "briefs").mkdir(parents=True)
    (tiny / "materials").mkdir()
    (tiny / "briefs" / "doc.md").write_text("评审 `{WORKDIR}/design/doc.md`。\n- **本次判断：选择。**\n", encoding="utf-8")
    (tiny / "materials" / "extra.md").write_text("附件：既说要又说不要。\n", encoding="utf-8")
    (tiny / "fixtures").mkdir()
    (tiny / "fixtures/doc.json").write_text(json.dumps({"format": 1, "files": {"design/doc.md": files["design/doc.md"]}}), encoding="utf-8")
    (tiny / "flow.json").write_text(json.dumps(flow_json(base), ensure_ascii=False, indent=1), encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "suite")
    return root


@pytest.fixture
def wired(repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """把命令行接到小仓库上；角色定义不真的编译。"""
    monkeypatch.setattr(cli, "REPO", repo)
    monkeypatch.setattr(cli, "META", repo / "meta")
    monkeypatch.setattr(cli, "HARNESS", repo / "harness")

    def compile_definition(flow: suite.Flow, out: Path, variant: str) -> Path:
        frozen = out / variant / "agents" / f"{flow.role}.json"
        frozen.parent.mkdir(parents=True, exist_ok=True)
        frozen.write_text(json.dumps({flow.role: {"prompt": "你只读"}}), encoding="utf-8")
        return frozen

    monkeypatch.setattr(cli, "compile_definition", compile_definition)
    return {"flow": suite.load(repo / "suites" / "tiny-review"), "out": tmp_path / "out", "work": tmp_path / "work",
            "repo": repo, "tmp": tmp_path}


def prepare(wired: dict[str, Any], rep: int = 0, **over: Any) -> Path:
    """准备一次运行；返回它的证据目录。"""
    wired["work"].mkdir(exist_ok=True)
    args = {"variant": "baseline", "out": wired["out"], "work": wired["work"], "allow_dirty": False, "again": False}
    args.update(over)
    cli.prepare(wired["flow"], wired["flow"].material("doc"), rep, **args)
    return cli.episode_dir(wired["out"], args["variant"], "doc", rep)


def run_one(wired: dict[str, Any], rep: int = 0, *, variant: str = "baseline", dispatch: str = "registered",
            edits_copy: bool = False, prepare_args: dict[str, Any] | None = None, **shape: Any) -> str:
    """准备、「派发」（写一份记录）、收录，一次走完。"""
    evidence = prepare(wired, rep, variant=variant, **(prepare_args or {}))
    pending = json.loads((evidence / "pending.json").read_text(encoding="utf-8"))
    prompt = (evidence / ("brief.md" if dispatch == "registered" else "dispatch.inline.md")).read_text(encoding="utf-8")
    if dispatch == "inline" and "calls" not in shape:
        shape["calls"] = [("Read", {"file_path": pending["role"]}, "你只读"), READ_DOC]
    if edits_copy:
        (Path(pending["workspace"]) / "design" / "doc.md").write_text("改过了", encoding="utf-8")
    path = transcript(wired["tmp"] / f"agent-{next(serial)}.jsonl", prompt=prompt, **shape)
    return cli.record(wired["flow"], wired["flow"].material("doc"), rep, variant=variant, out=wired["out"],
                      transcript=path, dispatch=dispatch, tokens=1000)


def numbered(text: str) -> str:
    """宿主的 Read 工具交回文件的样子：每行前面带行号。"""
    return "\n".join(f"{number:>6}\t{line}" for number, line in enumerate(text.splitlines(), 1))


def judge_transcript(path: Path, brief: Path, answer: Any, *, model: str = JUDGE, **shape: Any) -> Path:
    """判官的一份记录：提示只指向简报文件，它读那个文件，再交回答复。"""
    text = answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)
    shape.setdefault("calls", [("Read", {"file_path": str(brief)}, numbered(brief.read_text(encoding="utf-8")))])
    shape.setdefault("prompt", judge.pointer(brief))
    return transcript(path, final=text, model=model, **shape)


def judge_one(wired: dict[str, Any], answer: Any, rep: int = 0, **shape: Any) -> int:
    material = wired["flow"].material("doc")
    cli.judge_brief(wired["flow"], material, rep, variant="baseline", out=wired["out"])
    brief = cli.episode_dir(wired["out"], "baseline", "doc", rep) / "judge.brief.md"
    path = judge_transcript(wired["tmp"] / f"judge-{next(serial)}.jsonl", brief, answer, **shape)
    return cli.judge_record(wired["flow"], material, rep, variant="baseline", out=wired["out"], transcript=path)


def labels(tmp_path: Path, episodes: dict[str, Any]) -> Path:
    path = tmp_path / "labels.json"
    path.write_text(json.dumps({"grader": "人工", "episodes": {"doc": episodes}}, ensure_ascii=False), encoding="utf-8")
    return path


RUN_COUNTS = {"out_of_kind": [0, "没有"], "blocking": [1, "B-1"], "novel_blocking": [0, "没有"]}
GOOD_LABEL = {"seeds": {"S1": [1, "报告的 B-1"], "S2": [0, "没有提到附件"]}, "run": RUN_COUNTS}


# --- 结果落盘 -----------------------------------------------------------------------------------------------

def test_an_episode_lands_as_rows_plus_one_trace_per_row(tmp_path: Path) -> None:
    store = VariantStore(tmp_path, "baseline")
    store.record_episode([row("m.S1"), row("m.run", grade={"read_only": 1})], TURNS)
    assert [r["prompt_id"] for r in store.rows()] == ["m.S1", "m.run"]
    assert json.loads((store.traces / "m.S1_rep0.json").read_text(encoding="utf-8")) == TURNS
    assert (store.traces / "m.run_rep0.json").is_file()
    assert store.done() == {("m", 0)}


def test_variant_directories_are_named_as_the_report_builder_reads_them(tmp_path: Path) -> None:
    VariantStore(tmp_path, "v12")
    for name in ("v1-better", "variant_a", "Baseline", "v"):
        with pytest.raises(ValueError):
            VariantStore(tmp_path, name)


@pytest.mark.parametrize("broken", [
    {"usage": {"input_tokens": 10, "output_tokens": 0}},
    {"usage": {}},
    {"model": ""},
    {"grade": {"caught": True}},
    {"grade": {"caught": "yes"}},
    {"grade": 1},
    {"prompt_id": "../escape"},
    {"rep": -1},
    {"rep": "0"},
    {"meta": {}},
])
def test_a_row_that_would_be_a_fake_measurement_is_refused(broken: dict[str, Any]) -> None:
    with pytest.raises(RowRejected):
        check_row(row(**broken))


def test_a_row_missing_a_required_field_is_refused() -> None:
    incomplete = row()
    del incomplete["usage"]
    with pytest.raises(RowRejected, match="usage"):
        check_row(incomplete)


def test_nothing_is_written_when_one_row_of_the_episode_is_bad(tmp_path: Path) -> None:
    store = VariantStore(tmp_path, "baseline")
    with pytest.raises(RowRejected):
        store.record_episode([row("m.S1"), row("m.S2", model="")], TURNS)
    assert store.rows() == []
    assert not store.traces.exists()


def test_a_second_copy_of_an_episode_is_refused(tmp_path: Path) -> None:
    store = VariantStore(tmp_path, "baseline")
    store.record_episode([row()], TURNS)
    with pytest.raises(RowRejected, match="already recorded"):
        store.record_episode([row()], TURNS)
    store.record_episode([row(rep=1)], TURNS)
    assert len(store.rows()) == 2


def test_rows_of_two_episodes_or_no_transcript_are_refused(tmp_path: Path) -> None:
    store = VariantStore(tmp_path, "baseline")
    with pytest.raises(RowRejected, match="share one"):
        store.record_episode([row("a.S1", episode="a"), row("b.S1", episode="b")], TURNS)
    with pytest.raises(RowRejected, match="transcript"):
        store.record_episode([row()], [])
    with pytest.raises(RowRejected, match="no rows"):
        store.record_episode([], TURNS)


def test_a_failed_attempt_goes_to_the_sidecar_and_leaves_its_slot_free(tmp_path: Path) -> None:
    store = VariantStore(tmp_path, "baseline")
    store.record_error("m", 0, "timeout", "ceiling hit", model=MODEL, usage=USAGE, cost_usd=0.4)
    store.record_error("m", 0, "contaminated", "read the truth list")
    assert store.rows() == []
    assert store.done() == set()
    assert [e["failure_class"] for e in store.error_rows()] == ["timeout", "contaminated"]
    store.record_episode([row()], TURNS)
    assert store.done() == {("m", 0)}
    with pytest.raises(ValueError):
        store.record_error("m", 1, "model was wrong", "not a class")


# --- 汇总 ---------------------------------------------------------------------------------------------------

def test_case_means_leave_out_reps_that_are_not_ok() -> None:
    rows = [row("a", 0, grade={"caught": 1}), row("a", 1, grade={"caught": 0}),
            row("a", 2, grade={}, status="truncated"), row("b", 0, grade={"read_only": 1})]
    assert stats.case_means(rows, "caught") == {"a": (0.5, 2)}


def test_the_interval_is_over_cases_not_over_cases_times_reps() -> None:
    rows = [row(f"c{case}", rep, grade={"caught": 1 if case < 3 else 0}) for case in range(4) for rep in range(5)]
    score = stats.score(rows, "caught", binary=True)
    assert (score.cases, score.observations, score.mean) == (4, 20, 0.75)
    assert (score.lo, score.hi) == stats.wilson(0.75, 4)
    assert score.hi - score.lo > stats.wilson(0.75, 20)[1] - stats.wilson(0.75, 20)[0]


def test_wilson_does_not_collapse_at_a_perfect_score() -> None:
    lo, hi = stats.wilson(1.0, 9)
    assert hi == 1.0 and 0.65 < lo < 0.75
    assert stats.wilson(0.0, 9)[0] == 0.0
    assert stats.wilson(0.5, 0) == (0.0, 1.0)


def test_a_metric_nobody_carries_is_not_measured_rather_than_zero() -> None:
    assert stats.score([row()], "out_of_kind", binary=False) is None


def test_paired_delta_tells_a_consistent_shift_from_noise() -> None:
    reference = [row(f"c{n}", grade={"caught": 0.2 + 0.01 * n}) for n in range(8)]
    shifted = [row(f"c{n}", grade={"caught": 0.5 + 0.012 * n}) for n in range(8)]
    mixed = [row(f"c{n}", grade={"caught": 0.2 + 0.01 * n + (0.3 if n % 2 else -0.3)}) for n in range(8)]
    assert stats.paired_delta(reference, shifted, "caught").significant
    noisy = stats.paired_delta(reference, mixed, "caught")
    assert not noisy.significant and noisy.cases == 8
    assert stats.paired_delta(reference, [row("other")], "caught") is None


def test_noise_floor_shrinks_with_the_square_root_of_cases() -> None:
    assert math.isclose(stats.noise_floor(25), 0.196, abs_tol=0.001)
    assert math.isclose(stats.noise_floor(100), stats.noise_floor(25) / 2)
    assert stats.noise_floor(0) == 1.0


# --- 宿主留下的记录 -----------------------------------------------------------------------------------------

def test_a_subagent_run_is_read_back_from_its_transcript(tmp_path: Path) -> None:
    episode = read_back(tmp_path, helper="claude-small-1")
    assert episode.failure(MODEL) is None
    assert [turn["role"] for turn in episode.turns] == ["user", "tool_call", "tool_result", "assistant", "assistant",
                                                        "tool_result"]
    assert episode.turns[0]["content"] == "请评审" and episode.prompt == "请评审"
    assert episode.turns[1]["name"] == "Read" and episode.turns[1]["thinking"] == "先读材料", (
        "思考块与它引出的工具调用落在两行里，仍要接上")
    assert "more characters in trajectory.jsonl" in episode.turns[2]["content"]
    assert len(episode.turns[2]["content"]) < 21000 and len(episode.tool_outputs[0]) == 30000
    assert episode.turns[4]["content"] == FINAL and episode.final == FINAL, "报告是交回来的那一份"
    assert episode.model == MODEL and episode.models_observed == ["claude-small-1", MODEL]
    # 同一条消息的两行不重复计：m0 一次、旁支一次、交回一次
    assert episode.usage == {"input_tokens": 300, "output_tokens": 63, "cache_read_input_tokens": 21,
                             "cache_creation_input_tokens": 0}
    assert (episode.cost_usd, episode.tool_calls, episode.tool_names) == (None, 1, {"Read": 1}), "交回不算角色用的工具"
    assert episode.efforts_observed == ["high"] and episode.wall_seconds == 6.0 and not episode.truncated()


def test_a_report_left_as_the_last_message_counts_when_nothing_is_handed_back(tmp_path: Path) -> None:
    episode = read_back(tmp_path, handback=False, effort=None)
    assert episode.failure(MODEL) is None and episode.final == FINAL and episode.efforts_observed == []


@pytest.mark.parametrize(("shape", "failure_class"), [
    ({"model": "claude-fallback-9"}, "model-mismatch"),
    ({"final": ""}, "harness"),
    ({"final": "  \n", "handback": False}, "harness"),
])
def test_a_run_that_cannot_be_scored_says_why(tmp_path: Path, shape: dict[str, Any], failure_class: str) -> None:
    failure = read_back(tmp_path, **shape).failure(MODEL)
    assert failure is not None and failure[0] == failure_class


def test_a_clipped_answer_is_truncated_not_wrong(tmp_path: Path) -> None:
    episode = read_back(tmp_path, stop="max_tokens", handback=False)
    assert episode.failure(MODEL) is None and episode.truncated()


def test_where_a_run_reached_is_read_off_what_it_asked_for_and_what_came_back(tmp_path: Path) -> None:
    episode = read_back(tmp_path, calls=[
        ("Read", {"file_path": "/repo/agents/evaluation/suites/x/flow.json"}, "真值"),
        ("Grep", {"pattern": "caught"}, "/main/tmp/role-evals/x/results.jsonl:1:…")])
    assert episode.touched(["evaluation/suites/", "tmp/role-evals", "calibration/cases.json"]) == [
        "Read asked for evaluation/suites/", "a tool result mentions tmp/role-evals"]
    assert read_back(tmp_path).touched(["evaluation/suites/"]) == []


def test_the_stream_of_an_earlier_headless_run_is_still_read(tmp_path: Path) -> None:
    episode = claude_host.parse(headless(tmp_path / "old") / "trajectory.jsonl", brief="请评审")
    assert episode.failure(MODEL) is None and episode.final == FINAL
    assert episode.turns[1]["thinking"] == "先读材料"
    assert episode.model == MODEL and episode.models_observed == ["claude-small-1", MODEL]
    assert (episode.cost_usd, episode.api_seconds, episode.tool_calls) == (0.5, 1.2, 1)
    assert episode.usage["cache_read_input_tokens"] == 7


def test_a_compiled_role_becomes_a_definition_entry(tmp_path: Path) -> None:
    generated = tmp_path / "tiny-reviewer.md"
    generated.write_text(
        "---\nname: tiny-reviewer\ndescription: Read-only review of one thing, never\n  edits files; it's 'careful'.\n"
        "tools: Read, Glob, Grep, WebFetch\nmodel: claude-big-1\neffort: xhigh\n---\n\n你只读。\n\n---\n\n第二段。\n",
        encoding="utf-8")
    entry = claude_host.definition(generated)["tiny-reviewer"]
    assert entry["description"] == "Read-only review of one thing, never edits files; it's 'careful'."
    assert entry["prompt"] == "你只读。\n\n---\n\n第二段。"
    assert (entry["model"], entry["effort"], entry["tools"]) == ("claude-big-1", "xhigh", ["Read", "Glob", "Grep", "WebFetch"])
    narrowed = claude_host.definition(generated, model=MODEL, tools=["Read"])["tiny-reviewer"]
    assert (narrowed["model"], narrowed["tools"]) == (MODEL, ["Read"])


def test_nothing_in_the_runner_starts_a_model() -> None:
    """运行器只准备与记账；起角色、起判官都是主会话派 subagent。这里守住它不再自己起宿主进程。"""
    for name in ("claude_host.py", "judge.py", "calibration.py"):
        assert "subprocess" not in (EVALUATION / "harness" / "roleeval" / name).read_text(encoding="utf-8"), name
    source = (EVALUATION / "harness" / "roleeval" / "cli.py").read_text(encoding="utf-8")
    assert '"claude"' not in source and "'claude'" not in source


# --- 工作副本 -----------------------------------------------------------------------------------------------

def build(repo: Path, dest: Path, fixture: Path | None = None) -> None:
    workspace.build(repo, dest, fixture=fixture or repo / "suites/tiny-review/fixtures/doc.json",
                    subject_paths=["skills", "NOTES.md"])


def test_material_comes_from_explicit_fixture_and_subject_from_working_tree(repo: Path, tmp_path: Path) -> None:
    (repo / "design" / "doc.md").write_text("后来改过的材料\n", encoding="utf-8")
    (repo / "skills" / "page.md").write_text("判据页 第二版\n", encoding="utf-8")
    dest = tmp_path / "copy"
    build(repo, dest)
    assert (dest / "design" / "doc.md").read_text(encoding="utf-8") == "调用方必须先读，再写。\n"
    assert (dest / "skills" / "page.md").read_text(encoding="utf-8") == "判据页 第二版\n"
    assert (dest / "NOTES.md").is_file()
    assert not (dest / "design" / "evidence").exists()
    assert not (dest / "suites").exists(), "the suite holds the ground truth and never enters a copy"


def test_a_copy_is_never_reused_and_a_missing_path_is_an_error(repo: Path, tmp_path: Path) -> None:
    dest = tmp_path / "copy"
    build(repo, dest)
    with pytest.raises(workspace.WorkspaceError, match="already exists"):
        build(repo, dest)
    with pytest.raises(workspace.WorkspaceError):
        build(repo, tmp_path / "other", fixture=repo / "missing.json")
    with pytest.raises(workspace.WorkspaceError, match="does not exist"):
        workspace.build(repo, tmp_path / "third", fixture=repo / "suites/tiny-review/fixtures/doc.json", subject_paths=["no-such-dir"])


def test_a_seed_has_to_land_exactly_once(repo: Path, tmp_path: Path) -> None:
    dest = tmp_path / "copy"
    build(repo, dest)
    op = {"op": "replace", "file": "design/doc.md", "find": "必须先读", "replace": "可以不读"}
    workspace.apply(dest, [op], suite=repo / "suites" / "tiny-review")
    assert (dest / "design" / "doc.md").read_text(encoding="utf-8") == "调用方可以不读，再写。\n"
    with pytest.raises(workspace.WorkspaceError, match="found it 0 times"):
        workspace.apply(dest, [op], suite=repo)
    (dest / "design" / "doc.md").write_text("再写，再写。", encoding="utf-8")
    with pytest.raises(workspace.WorkspaceError, match="found it 2 times"):
        workspace.apply(dest, [{**op, "find": "再写"}], suite=repo)
    with pytest.raises(workspace.WorkspaceError, match="unknown workspace op"):
        workspace.apply(dest, [{"op": "delete"}], suite=repo)


@pytest.mark.parametrize("op", ["catalog-candidate", "catalog-add-clause"])
def test_retired_workspace_ops_are_rejected(tmp_path: Path, op: str) -> None:
    with pytest.raises(workspace.WorkspaceError, match="unknown workspace op"):
        workspace.apply(tmp_path, [{"op": op}], suite=tmp_path)


def test_the_tree_hash_sees_content_and_ignores_git(repo: Path, tmp_path: Path) -> None:
    dest = tmp_path / "copy"
    build(repo, dest)
    before = workspace.tree_hash(dest)
    workspace.commit(dest)
    assert workspace.tree_hash(dest) == before
    (dest / "design" / "doc.md").write_text("动过", encoding="utf-8")
    assert workspace.tree_hash(dest) != before


def test_dirty_and_ancestor_read_the_repository(repo: Path) -> None:
    assert workspace.dirty(repo, ["skills", "suites"]) == []
    (repo / "skills" / "page.md").write_text("未提交", encoding="utf-8")
    (repo / "skills" / "new.md").write_text("未跟踪", encoding="utf-8")
    assert len(workspace.dirty(repo, ["skills"])) == 2
    assert workspace.dirty(repo, ["suites"]) == []
    assert workspace.is_ancestor(repo, git(repo, "rev-parse", "HEAD~1"))
    assert not workspace.is_ancestor(repo, "0" * 40)


# --- 用例集 -------------------------------------------------------------------------------------------------

def rewrite(repo: Path, **over: Any) -> Path:
    root = repo / "suites" / "tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    (root / "flow.json").write_text(json.dumps({**current, **over}, ensure_ascii=False), encoding="utf-8")
    return root


def test_a_suite_loads_into_materials_and_seeds(repo: Path) -> None:
    flow = suite.load(repo / "suites" / "tiny-review")
    material = flow.material("doc")
    assert [seed.id for seed in material.seeds] == ["S1", "S2"]
    assert [op["op"] for op in material.ops()] == ["copy", "replace"]
    assert material.ops()[1]["id"] == "S1"
    assert flow.unsigned() == []
    assert [metric["id"] for metric in flow.state()["metrics"]][0] == "caught"
    with pytest.raises(suite.SuiteError):
        flow.material("nope")


@pytest.mark.parametrize(("over", "message"), [
    ({"id": "other-name"}, "directory name"),
    ({"family": "drafting"}, "unknown family"),
    ({"reps": 0}, "reps"),
    ({"format": 2}, "format"),
    ({"metrics": [{"id": "caught", "kind": "binary", "label": "一个长得放不进图例的指标标签名"}]}, "longer than"),
    ({"metrics": [{"id": "caught", "kind": "ordinal"}]}, "unknown kind"),
    ({"metrics": [{"id": "caught", "kind": "binary"}, {"id": "caught", "kind": "float"}]}, "duplicate metric"),
    ({"attach_design_review": True}, "retired attach_design_review"),
    ({"workspace": {}}, "workspace lacks"),
    ({"host": {"codex": {}}}, "claude-code"),
])
def test_a_suite_that_leaves_a_run_guessing_does_not_load(repo: Path, over: dict[str, Any], message: str) -> None:
    with pytest.raises(suite.SuiteError, match=message):
        suite.load(rewrite(repo, **over))


def test_a_suite_with_a_missing_brief_or_field_does_not_load(repo: Path, tmp_path: Path) -> None:
    root = repo / "suites" / "tiny-review"
    (root / "briefs" / "doc.md").unlink()
    with pytest.raises(suite.SuiteError, match="brief"):
        suite.load(root)
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    del current["criteria_page"]
    (root / "flow.json").write_text(json.dumps(current), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match="criteria_page"):
        suite.load(root)
    with pytest.raises(suite.SuiteError, match="no flow.json"):
        suite.load(tmp_path)


def test_each_material_uses_its_own_explicit_fixture(repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (repo / "design" / "doc.md").write_text("后来的版本：调用方必须先读。\n", encoding="utf-8")
    git(repo, "commit", "-qam", "material moves on")
    later = git(repo, "rev-parse", "HEAD")
    root = repo / "suites" / "tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    real = {"id": "doc-later", "target": "design/doc.md 的后来版本", "brief": "briefs/doc.md", "fixture": "fixtures/later.json", "seeds": [{"id": "R1", "kind": "real", "where": "第一句", "truth": "只说先读",
                                             "quote": "后来的版本", "files": ["design/doc.md"],
                                             "severity": "阻断"}]}
    (root / "fixtures/later.json").write_text(json.dumps({"format": 1, "files": {"design/doc.md": "后来的版本：调用方必须先读。\n", "harness/keep.txt": "运行器"}}), encoding="utf-8")
    flow = suite.load(rewrite(repo, materials=[*current["materials"], real]))
    assert flow.base(flow.material("doc")) == "fixture:doc"
    assert flow.base(flow.material("doc-later")) == "fixture:doc-later"
    monkeypatch.setattr(cli, "REPO", repo)
    for name, expected in (("doc", "调用方可以不读，再写。\n"), ("doc-later", "后来的版本：调用方必须先读。\n")):
        dest = tmp_path / name
        cli.build_copy(flow, flow.material(name), dest)
        assert (dest / "design" / "doc.md").read_text(encoding="utf-8") == expected
        # 只有那份材料当时对着读的路径，才随它进副本
        assert (dest / "harness" / "keep.txt").exists() == (name == "doc-later")
    text = cli.inputs(flow)
    assert "当时定的严重度：阻断" in text and "fixture:d" in text


def test_sign_offs_are_owed_again_when_the_suite_version_moves(repo: Path) -> None:
    assert suite.load(rewrite(repo, version=2)).unsigned() == ["cases", "grading"]
    assert suite.load(rewrite(repo, version=1, signoffs={"cases": {"version": 1}})).unsigned() == ["grading"]


def test_the_suite_digest_follows_its_files(repo: Path) -> None:
    root = repo / "suites" / "tiny-review"
    before = suite.load(root).digest()
    assert suite.load(root).digest() == before
    (root / "briefs" / "doc.md").write_text("评审 `{WORKDIR}`，另加一句。\n", encoding="utf-8")
    assert suite.load(root).digest() != before


# --- 判定 ---------------------------------------------------------------------------------------------------

def test_labels_become_a_verdict_that_names_its_source(repo: Path, tmp_path: Path) -> None:
    material = suite.load(repo / "suites" / "tiny-review").material("doc")
    verdict = grading.from_labels(labels(tmp_path, {"0": GOOD_LABEL}), material, 0)
    assert verdict.seeds == {"S1": (1, "报告的 B-1"), "S2": (0, "没有提到附件")}
    assert verdict.run == {"out_of_kind": (0.0, "没有"), "blocking": (1.0, "B-1"), "novel_blocking": (0.0, "没有")}
    assert verdict.grader.startswith("人工 [labels.json@")


@pytest.mark.parametrize("entry", [
    {"seeds": {"S1": [1, "有"]}, "run": RUN_COUNTS},
    {"seeds": {"S1": [1, "有"], "S2": [1, "有"], "S3": [1, "多出来的"]}, "run": RUN_COUNTS},
    {"seeds": {"S1": [2, "有"], "S2": [0, "没有"]}, "run": RUN_COUNTS},
    {"seeds": {"S1": [1, " "], "S2": [0, "没有"]}, "run": RUN_COUNTS},
    {"seeds": {"S1": [1, "有"], "S2": [0, "没有"]}, "run": {}},
    {"seeds": {"S1": [1, "有"], "S2": [0, "没有"]}, "run": {"out_of_kind": [0, "没有"]}},
    {"seeds": {"S1": [1, "有"], "S2": [0, "没有"]}, "run": {**RUN_COUNTS, "out_of_kind": [-1, "负数"]}},
])
def test_an_incomplete_verdict_is_a_grader_failure(repo: Path, tmp_path: Path, entry: dict[str, Any]) -> None:
    material = suite.load(repo / "suites" / "tiny-review").material("doc")
    with pytest.raises(grading.GraderError):
        grading.from_labels(labels(tmp_path, {"0": entry}), material, 0)
    with pytest.raises(grading.GraderError, match="no labels"):
        grading.from_labels(labels(tmp_path, {"0": GOOD_LABEL}), material, 1)


# --- 评审类 -------------------------------------------------------------------------------------------------

def test_run_level_facts_are_read_off_the_transcript_and_the_copy(repo: Path, tmp_path: Path) -> None:
    flow = suite.load(repo / "suites" / "tiny-review")
    allowed = ["Read", "Glob", "Grep"]
    ok = review.observe(flow, read_back(tmp_path), unchanged=True, allowed=allowed)
    assert (ok["read_only"][0], ok["names_page"][0]) == (1, 1)
    edited = read_back(tmp_path, calls=[("Edit", {"file_path": "design/doc.md"}, "ok")])
    assert review.observe(flow, edited, unchanged=True, allowed=allowed)["read_only"][0] == 0
    changed = review.observe(flow, read_back(tmp_path), unchanged=False, allowed=allowed)
    assert changed["read_only"][0] == 0 and "被改动" in changed["read_only"][1]
    late = read_back(tmp_path, final="结论：有两条阻断。\n\n判据页 references/review/x.md 在这里才提到。")
    assert review.observe(flow, late, unchanged=True, allowed=allowed)["names_page"][0] == 0, (
        "naming the page after the first paragraph does not count")


# --- 判官：答复怎样变成判定 ---------------------------------------------------------------------------------

REPORT = (
    "本次判断是**选择**，读的判据页是 `references/review/x.md`。\n\n## 阻断\n\n### B-1 第一句把必须写成了可以\n\n"
    "design/doc.md 第一句写「调用方可以不读」，\n与契约 S-3「必须先读」冲突，后果是越权路径不被拒绝。\n\n"
    "## 非阻断\n\n### N-1 措辞\n\n「再写」一词有两种读法。\n\n## 未覆盖\n\n附件 tmp/extra.md 自相矛盾，转交。\n")


def finding(label: str, group: str, match: str, *, outside: bool = False) -> dict[str, Any]:
    return {"label": label, "group": group, "summary": f"{label} 的概括", "match": match, "out_of_kind": outside,
            "out_of_kind_reason": "评措辞" if outside else ""}


def raw_answer() -> dict[str, Any]:
    return {
        "findings": [finding("B-1", "blocking", "S1"), finding("N-1", "non_blocking", "none", outside=True),
                     finding("未覆盖 1", "other", "S2")],
        "targets": [
            {"id": "S1", "caught": True, "finding": "B-1", "reason": "",
             "quote": "design/doc.md 第一句写「调用方可以不读」， 与契约 S-3「必须先读」冲突"},
            {"id": "S2", "caught": False, "finding": "", "quote": "", "reason": "只在未覆盖里提了一句"}],
    }


SILENT = {"findings": [], "targets": [
    {"id": seed, "caught": False, "finding": "", "quote": "", "reason": "报告没有提到"} for seed in ("S1", "S2")]}


@pytest.fixture
def doc(repo: Path) -> tuple[suite.Flow, suite.Material]:
    import dataclasses
    flow = suite.load(repo / "suites" / "tiny-review")
    material = dataclasses.replace(flow.material("doc"), known_issues=({"id": "K1", "verdict": "real", "what": "基线没有提交号"},))
    return flow, material


def test_a_judge_answer_becomes_a_verdict_only_through_the_report_text(doc: tuple[suite.Flow, suite.Material]) -> None:
    _, material = doc
    verdict = judge.verdict(raw_answer(), material, REPORT, grader="judge:x")
    assert verdict.seeds["S1"][0] == 1 and "B-1：「design/doc.md" in verdict.seeds["S1"][1]
    assert verdict.seeds["S2"] == (0, "只在未覆盖里提了一句")
    assert {metric: value for metric, (value, _) in verdict.run.items()} == {
        "out_of_kind": 1.0, "blocking": 1.0, "novel_blocking": 0.0}
    assert "N-1" in verdict.run["out_of_kind"][1]


def test_blocking_findings_off_the_known_list_are_counted_apart(doc: tuple[suite.Flow, suite.Material]) -> None:
    _, material = doc
    raw = raw_answer()
    raw["findings"] += [finding("B-2", "blocking", "none"), finding("B-3", "blocking", "K1"),
                        finding("B-4", "blocking", "none", outside=True)]
    verdict = judge.verdict(raw, material, REPORT, grader="judge:x")
    assert {metric: value for metric, (value, _) in verdict.run.items()} == {
        "out_of_kind": 2.0, "blocking": 4.0, "novel_blocking": 1.0}


def broken(change: Any) -> dict[str, Any]:
    raw = raw_answer()
    change(raw)
    return raw


@pytest.mark.parametrize(("change", "message"), [
    (lambda raw: raw["targets"][0].update(quote="报告指出第一句把必须写成了可以，违反契约"), "not in the report"),
    (lambda raw: raw["targets"][0].update(quote="冲突"), "not in the report"),
    (lambda raw: raw["targets"][0].update(finding="未覆盖 1"), "not a listed blocking"),
    (lambda raw: raw["targets"][0].update(finding="B-9"), "not a listed blocking"),
    (lambda raw: raw["targets"].pop(), "no answer for S2"),
    (lambda raw: raw["targets"].append({"id": "S9", "caught": False, "finding": "", "quote": "", "reason": "x"}),
     "not given"),
    (lambda raw: raw["findings"][0].update(match="E7"), "not on the list"),
    (lambda raw: raw["findings"][0].update(group="severe"), "unknown group"),
    (lambda raw: raw["findings"][0].pop("match"), "lacks"),
    (lambda raw: raw["findings"][0].update({"summary: ": raw["findings"][0].pop("summary")}), "lacks"),
    (lambda raw: raw.pop("targets"), "lacks"),
])
def test_a_judge_claim_the_report_does_not_bear_out_is_a_grader_failure(
        doc: tuple[suite.Flow, suite.Material], change: Any, message: str) -> None:
    with pytest.raises(grading.GraderError, match=message):
        judge.verdict(broken(change), doc[1], REPORT, grader="judge:x")


@pytest.mark.parametrize("report", ["", "没有发现问题。", "今天天气不错，建议把仓库改名。"])
def test_a_report_that_says_nothing_cannot_be_judged_as_catching_anything(
        doc: tuple[suite.Flow, suite.Material], report: str) -> None:
    with pytest.raises(grading.GraderError, match="not in the report"):
        judge.verdict(raw_answer(), doc[1], report, grader="judge:x")
    verdict = judge.verdict(SILENT, doc[1], report, grader="judge:x")
    assert [value for value, _ in verdict.seeds.values()] == [0, 0]
    assert all(value == 0 for value, _ in verdict.run.values())


def test_the_judge_brief_carries_the_targets_and_not_the_material(doc: tuple[suite.Flow, suite.Material]) -> None:
    flow, material = doc
    text = judge.brief(flow, material, REPORT)
    assert text.startswith("你是一次评估里的判官") and "你的最终答复只有一个 JSON 对象" in text
    assert "id `S1`｜位置：第一句｜问题：把必须写成了可以" in text and "材料里的这段文字：可以不读" in text
    assert "id `K1`｜基线没有提交号" in text and "评措辞与歧义" in text
    assert text.index("<report>") < text.index("### B-1") < text.index("</report>")
    assert "调用方必须先读，再写" not in text, "the judge reads the report, not the material"
    import dataclasses
    control = dataclasses.replace(material, seeds=())
    assert "targets 填空数组" in judge.prompt(flow, control, REPORT)
    assert judge.verdict({"findings": [finding("B-1", "blocking", "none")], "targets": []}, control, REPORT,
                         grader="judge:x").run["novel_blocking"][0] == 1.0


def test_an_answer_is_one_json_object_with_or_without_a_fence() -> None:
    assert judge.parse_answer(' {"findings": [], "targets": []}\n') == {"findings": [], "targets": []}
    assert judge.parse_answer('```json\n{"findings": []}\n```') == {"findings": []}
    for text in ('好的，答复如下：{"findings": []}', "[]", ""):
        with pytest.raises(grading.GraderError, match="not a JSON object"):
            judge.parse_answer(text)


# --- 判官：一份记录是不是这个判官在答这份简报 ---------------------------------------------------------------

@pytest.fixture
def briefed(doc: tuple[suite.Flow, suite.Material], tmp_path: Path) -> Path:
    path = tmp_path / "judge.brief.md"
    path.write_text(judge.brief(doc[0], doc[1], REPORT), encoding="utf-8")
    return path


def judged(tmp_path: Path, brief: Path, **shape: Any) -> claude_host.Episode:
    return claude_host.parse(judge_transcript(tmp_path / f"judge-{next(serial)}.jsonl", brief, raw_answer(), **shape),
                             brief="判官")


def test_a_judge_is_named_by_its_model_and_its_rules(briefed: Path, tmp_path: Path) -> None:
    name = judge.read(judged(tmp_path, briefed), briefed, signed=None)
    assert name == judge.identity(JUDGE) and name.startswith(f"judge:subagent:{JUDGE} rules ")
    assert judge.identity("a") != judge.identity("b")
    assert judge.read(judged(tmp_path, briefed), briefed, signed=name) == name


def test_only_the_signed_off_judge_reading_the_whole_brief_and_nothing_else_is_taken(
        briefed: Path, tmp_path: Path) -> None:
    whole = numbered(briefed.read_text(encoding="utf-8"))
    read = ("Read", {"file_path": str(briefed)}, whole)
    refused = {
        "pointed at": {"prompt": "判一下这份报告"},
        "uses nothing else": {"calls": [read, ("Grep", {"pattern": "S1"}, "…")]},
        "reads its brief": {"calls": [("Read", {"file_path": str(briefed.with_name("other.md"))}, whole)]},
        "uses nothing": {"calls": []},
        "not the whole brief": {"calls": [("Read", {"file_path": str(briefed), "limit": 20}, whole[:400])]},
        "not on one model": {"helper": "claude-small-1"},
    }
    for message, shape in refused.items():
        with pytest.raises(judge.NotThisJudge, match=message):
            judge.read(judged(tmp_path, briefed, **shape), briefed, signed=None)
    with pytest.raises(judge.NotThisJudge, match="sign-off is for"):
        judge.read(judged(tmp_path, briefed, model="claude-judge-2"), briefed, signed=judge.identity(JUDGE))
    # 分两段读完也算读全了；只读了前一段不算
    lines = whole.splitlines()
    paged = [("Read", {"file_path": str(briefed), "limit": 9}, "\n".join(lines[:9])),
             ("Read", {"file_path": str(briefed), "offset": 10}, "\n".join(lines[9:]))]
    assert judge.read(judged(tmp_path, briefed, calls=paged), briefed, signed=None) == judge.identity(JUDGE)
    with pytest.raises(judge.NotThisJudge, match="not the whole brief"):
        judge.read(judged(tmp_path, briefed, calls=paged[:1]), briefed, signed=None)


def test_what_the_judge_used_is_added_up_over_its_attempts(briefed: Path, tmp_path: Path) -> None:
    first, second = judged(tmp_path, briefed), judged(tmp_path, briefed, effort="medium")
    spent = judge.spend([judge.attempt(first, rejected="引的句子不在报告里"), judge.attempt(second)])
    assert spent == {
        "judge_model": JUDGE, "judge_attempts": 2, "judge_efforts": ["high", "medium"],
        "judge_rejected": ["引的句子不在报告里"],
        "judge_usage": {"input_tokens": 400, "output_tokens": 120, "cache_read_input_tokens": 28,
                        "cache_creation_input_tokens": 0}}


# --- 命令行：准备、收录、判定、汇总 -------------------------------------------------------------------------

def test_a_run_waits_for_both_sign_offs(wired: dict[str, Any]) -> None:
    wired["flow"] = suite.load(rewrite(wired["repo"], signoffs={"cases": {"version": 1}}))
    with pytest.raises(cli.Refused, match="no sign-off on: grading"):
        prepare(wired)
    assert not wired["out"].exists()


def test_a_run_refuses_uncommitted_changes_in_what_is_under_test(wired: dict[str, Any]) -> None:
    (wired["repo"] / "skills" / "page.md").write_text("改了没提交\n", encoding="utf-8")
    with pytest.raises(cli.Refused, match="uncommitted"):
        prepare(wired)
    run_one(wired, prepare_args={"allow_dirty": True})
    record = json.loads((cli.episode_dir(wired["out"], "baseline", "doc", 0) / "episode.json").read_text("utf-8"))
    assert record["provenance"]["dirty"] is True


def test_a_run_refuses_a_suite_whose_seeds_no_longer_land(wired: dict[str, Any]) -> None:
    root = wired["repo"] / "suites" / "tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    current["materials"][0]["seeds"][0]["op"]["find"] = "这句话不在材料里"
    (root / "flow.json").write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
    git(wired["repo"], "commit", "-qam", "break a seed")
    wired["flow"] = suite.load(root)
    with pytest.raises(cli.Refused, match="found it 0 times"):
        prepare(wired)


def test_verify_uses_no_history_and_detects_drifted_fixture(wired: dict[str, Any]) -> None:
    wired["work"].mkdir()
    assert cli.verify(wired["flow"], wired["work"]) == []
    assert cli.verify(wired["flow"], wired["work"], only=["nope"]) == [], "只核点到的材料"
    fixture = wired["flow"].fixture(wired["flow"].material("doc"))
    fixture.write_text(json.dumps({"format": 1, "files": {"design/doc.md": "changed"}}), encoding="utf-8")
    assert "found it 0 times" in cli.verify(wired["flow"], wired["work"])[0]
    assert list(wired["work"].iterdir()) == [], "verify leaves no copies behind"


def test_verify_rejects_missing_prerequisite_and_unquoted_seed_input(wired: dict[str, Any]) -> None:
    root = wired["repo"] / "suites/tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    current["materials"][0]["required_inputs"] = ["case/missing-premise.md"]
    current["materials"][0]["seeds"][0].update(files=["case/missing-seed.md"], quote=None)
    (root / "flow.json").write_text(json.dumps(current), encoding="utf-8")
    wired["work"].mkdir()
    problems = cli.verify(suite.load(root), wired["work"])
    assert any("required input is missing" in item for item in problems)
    assert any("seed input is missing" in item for item in problems)
    assert list(wired["work"].iterdir()) == []


@pytest.mark.parametrize("path", ["../outside.json", "/outside.json", "fixtures/missing.json"])
def test_material_suite_rejects_missing_or_outside_fixture(repo: Path, path: str) -> None:
    root = repo / "suites/tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    current["materials"][0]["fixture"] = path
    (root / "flow.json").write_text(json.dumps(current), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match="fixture"):
        suite.load(root)


def test_material_suite_rejects_retired_history_protocol(repo: Path) -> None:
    root = repo / "suites/tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    current["workspace"]["base"] = "obsolete"
    (root / "flow.json").write_text(json.dumps(current), encoding="utf-8")
    with pytest.raises(suite.SuiteError, match="historical material source protocol is retired"):
        suite.load(root)


def test_preparing_leaves_a_copy_a_brief_and_what_to_dispatch(wired: dict[str, Any]) -> None:
    wired["work"].mkdir()
    text = cli.prepare(wired["flow"], wired["flow"].material("doc"), 0, variant="baseline", out=wired["out"],
                       work=wired["work"], allow_dirty=False, again=False)
    evidence = cli.episode_dir(wired["out"], "baseline", "doc", 0)
    pending = json.loads((evidence / "pending.json").read_text(encoding="utf-8"))
    copy = Path(pending["workspace"])
    assert (copy / "design" / "doc.md").read_text(encoding="utf-8") == "调用方可以不读，再写。\n"
    assert pending["tree_hash"] == workspace.tree_hash(copy)
    assert pending["harness_commit"] == git(wired["repo"], "rev-parse", "HEAD")
    brief = (evidence / "brief.md").read_text(encoding="utf-8")
    assert "{WORKDIR}" not in brief and str(copy) in brief
    role = Path(pending["role"])
    assert role.read_text(encoding="utf-8") == "你只读\n" and copy not in role.parents, "角色定义在副本旁边，不在副本里"
    inline = (evidence / "dispatch.inline.md").read_text(encoding="utf-8")
    assert str(role) in inline and brief in inline and "Read、Glob、Grep" in inline
    assert "subagent type `tiny-reviewer`" in text and f"model {MODEL}" in text and str(evidence / "brief.md") in text
    with pytest.raises(cli.Refused, match="already prepared"):
        prepare(wired)
    prepare(wired, again=True)
    assert Path(json.loads((evidence / "pending.json").read_text(encoding="utf-8"))["workspace"]).is_dir()


def test_prepare_record_grade_summary(wired: dict[str, Any], tmp_path: Path) -> None:
    out = wired["out"]
    for rep in (0, 1):
        assert "recorded, " in run_one(wired, rep)
        evidence = cli.episode_dir(out, "baseline", "doc", rep)
        record = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
        assert record["model"] == MODEL and record["observations"]["read_only"][0] == 1
        assert (record["cost_usd"], record["efforts_observed"], record["requested_model"]) == (None, ["high"], MODEL)
        provenance = record["provenance"]
        assert provenance["harness_commit"] == git(wired["repo"], "rev-parse", "HEAD")
        assert provenance["suite_sha"] == wired["flow"].digest()
        assert (provenance["dispatch"], provenance["tokens_reported"], provenance["outside_copy"]) == ("registered", 1000, [])
        assert (evidence / "final.md").read_text(encoding="utf-8") == FINAL
        assert (evidence / "trajectory.jsonl").is_file() and not (evidence / "pending.json").exists()
    assert list(wired["work"].iterdir()) == [], "copies are removed once their hash is taken"
    assert json.loads((out / "_state.json").read_text(encoding="utf-8"))["metrics"][0]["id"] == "caught"
    with pytest.raises(cli.Refused, match="already recorded"):
        prepare(wired)

    second = {"seeds": {"S1": [1, "报告的 B-1"], "S2": [1, "报告的 N-2"]},
              "run": {"out_of_kind": [1, "N-3 在评措辞"], "blocking": [3, "B-1、B-2、B-3"], "novel_blocking": [2, "B-2、B-3"]}}
    assert cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL, "1": second})) == 0
    store = VariantStore(out, "baseline")
    rows = store.rows()
    assert sorted(r["prompt_id"] for r in rows) == ["doc.S1", "doc.S1", "doc.S2", "doc.S2", "doc.run", "doc.run"]
    for r in rows:
        check_row(r)
        assert (store.traces / f"{r['prompt_id']}_rep{r['rep']}.json").is_file()
    run_rows = [r for r in rows if r["meta"]["unit"] == "run"]
    assert run_rows[0]["grade"] == {"read_only": 1, "names_page": 1, "out_of_kind": 0.0, "blocking": 1.0,
                                    "novel_blocking": 0.0}
    assert run_rows[0]["meta"]["dispatch"] == "registered"
    seed = next(r for r in rows if r["prompt_id"] == "doc.S1")
    assert "原文：" in seed["prompt"] and seed["tags"][:3] == ["doc", "seed", "judgment"]
    assert cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL, "1": second})) == 0
    assert len(store.rows()) == 6, "grading again adds nothing"

    text = cli.summary(wired["flow"], out)
    assert "baseline: 2 episodes recorded (registered), 2 scored, 0 truncated, 0 failed attempts" in text
    assert "role 2000 tokens reported, 0 min; judge answers 0" in text
    assert "caught           75.0%" in text and "over 2 cases, 4 observations" in text
    assert "out_of_kind       0.50  [no interval from one case]" in text
    assert "novel_blocking    1.00  [no interval from one case]" in text
    assert "noise floor on caught: about ±69% with 2 cases" in text


def test_a_transcript_of_something_else_is_not_taken(wired: dict[str, Any], tmp_path: Path) -> None:
    material = wired["flow"].material("doc")
    settings = {"variant": "baseline", "out": wired["out"], "dispatch": "registered", "tokens": None}
    other = transcript(tmp_path / "other.jsonl", prompt="评审另一份文档")
    with pytest.raises(cli.Refused, match="not prepared"):
        cli.record(wired["flow"], material, 0, transcript=other, **settings)
    evidence = prepare(wired)
    with pytest.raises(cli.Refused, match="does not carry the brief"):
        cli.record(wired["flow"], material, 0, transcript=other, **settings)
    assert (evidence / "pending.json").exists(), "拒收不动已准备好的这一次"
    # 派发者转抄时换行、空格有出入不算走样；字有出入才算
    brief = (evidence / "brief.md").read_text(encoding="utf-8")
    reflowed = transcript(tmp_path / "reflowed.jsonl", prompt="前言。\n\n" + brief.replace("\n", "\n\n").replace("。", "。 "))
    assert "recorded" in cli.record(wired["flow"], material, 0, transcript=reflowed, **settings)


def test_a_failed_attempt_is_recorded_aside_and_its_slot_can_be_run_again(wired: dict[str, Any], tmp_path: Path) -> None:
    assert "harness - the transcript does not end in a report" in run_one(wired, final="")
    out, store = wired["out"], VariantStore(wired["out"], "baseline")
    errors = store.error_rows()
    assert [(e["episode"], e["rep"], e["failure_class"]) for e in errors] == [("doc", 0, "harness")]
    assert errors[0]["model"] == MODEL and errors[0]["cost_usd"] is None
    assert Path(errors[0]["evidence"]).is_dir() and ".failed-" in errors[0]["evidence"]
    assert (Path(errors[0]["evidence"]) / "trajectory.jsonl").is_file()
    assert not cli.episode_dir(out, "baseline", "doc", 0).exists()
    assert list(wired["work"].iterdir()) == []
    assert "recorded" in run_one(wired)
    assert (cli.episode_dir(out, "baseline", "doc", 0) / "episode.json").is_file()
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL}))
    text = cli.summary(wired["flow"], out)
    assert "1 episodes recorded (registered), 1 scored, 0 truncated, 1 failed attempts {'harness': 1}" in text


def test_a_run_served_by_another_model_is_not_scored(wired: dict[str, Any]) -> None:
    assert "model-mismatch" in run_one(wired, model="claude-fallback-9")
    assert VariantStore(wired["out"], "baseline").error_rows()[0]["failure_class"] == "model-mismatch"


@pytest.mark.parametrize("call", [
    ("Read", {"file_path": "/repo/.meta_harness/agents/evaluation/suites/tiny-review/flow.json"}, "真值清单"),
    ("Grep", {"pattern": "caught", "path": "/main"}, "/main/tmp/role-evals/tiny-review/baseline/results.jsonl:3:…"),
])
def test_a_run_that_reached_the_truth_or_earlier_results_is_not_scored(wired: dict[str, Any], call: Any) -> None:
    assert "contaminated" in run_one(wired, calls=[READ_DOC, call])
    errors = VariantStore(wired["out"], "baseline").error_rows()
    assert errors[0]["failure_class"] == "contaminated"
    assert not cli.episode_dir(wired["out"], "baseline", "doc", 0).exists()


def test_a_run_that_changed_its_copy_or_left_its_tools_is_scored_as_not_read_only(wired: dict[str, Any]) -> None:
    run_one(wired, 0, edits_copy=True)
    run_one(wired, 1, calls=[("Bash", {"command": "ls /etc/hosts"}, "…"), ("Read", {"file_path": "/etc/hosts"}, "…")])
    records = [json.loads((cli.episode_dir(wired["out"], "baseline", "doc", rep) / "episode.json").read_text("utf-8"))
               for rep in (0, 1)]
    assert [record["observations"]["read_only"][0] for record in records] == [0, 0]
    assert "被改动" in records[0]["observations"]["read_only"][1] and "Bash" in records[1]["observations"]["read_only"][1]
    assert records[1]["provenance"]["outside_copy"] == ["/etc/hosts"], "副本之外读了什么，记下来"


def test_an_inline_dispatch_hands_the_role_over_as_a_file_and_is_kept_apart(wired: dict[str, Any]) -> None:
    with pytest.raises(cli.Refused, match="never read the role definition"):
        run_one(wired, dispatch="inline", calls=[READ_DOC])
    assert "recorded" in run_one(wired, dispatch="inline", prepare_args={"again": True})
    record = json.loads((cli.episode_dir(wired["out"], "baseline", "doc", 0) / "episode.json").read_text("utf-8"))
    assert record["provenance"]["dispatch"] == "inline" and record["provenance"]["outside_copy"] == []
    assert record["observations"]["read_only"][0] == 1
    with pytest.raises(cli.Refused, match="one way of dispatching"):
        run_one(wired, 1)
    evidence = prepare(wired, 0, variant="v1")
    inline = transcript(wired["tmp"] / "inline.jsonl", prompt=(evidence / "dispatch.inline.md").read_text(encoding="utf-8"))
    with pytest.raises(cli.Refused, match="that is an inline dispatch"):
        cli.record(wired["flow"], wired["flow"].material("doc"), 0, variant="v1", out=wired["out"], transcript=inline,
                   dispatch="registered", tokens=None)


def test_a_grader_that_fails_scores_nothing(wired: dict[str, Any], tmp_path: Path) -> None:
    run_one(wired)
    out = wired["out"]
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": {"seeds": {}, "run": {}}}))
    store = VariantStore(out, "baseline")
    assert store.rows() == [] and [e["failure_class"] for e in store.error_rows()] == ["grader"]
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL}))
    assert len(store.rows()) == 3


def good_answer() -> dict[str, Any]:
    return {"findings": [finding("B-1", "blocking", "S1")], "targets": [
        {"id": "S1", "caught": True, "finding": "B-1", "quote": FINAL.splitlines()[0], "reason": ""},
        {"id": "S2", "caught": False, "finding": "", "quote": "", "reason": "没有提到附件"}]}


def test_a_judge_answer_scores_a_recorded_run_and_says_what_the_judge_used(wired: dict[str, Any]) -> None:
    out, material = wired["out"], wired["flow"].material("doc")
    with pytest.raises(cli.Refused, match="no recorded run"):
        cli.judge_brief(wired["flow"], material, 0, variant="baseline", out=out)
    run_one(wired)
    said = cli.judge_brief(wired["flow"], material, 0, variant="baseline", out=out)
    brief = cli.episode_dir(out, "baseline", "doc", 0) / "judge.brief.md"
    assert judge.pointer(brief) in said and FINAL in brief.read_text(encoding="utf-8")
    assert judge_one(wired, good_answer()) == 0
    store = VariantStore(out, "baseline")
    run_row = next(r for r in store.rows() if r["meta"]["unit"] == "run")
    assert (run_row["judge_model"], run_row["judge_attempts"], run_row["judge_efforts"]) == (JUDGE, 1, ["high"])
    assert run_row["judge_usage"]["output_tokens"] == 60 and run_row["judge_rejected"] == []
    assert run_row["meta"]["grader"] == judge.identity(JUDGE)
    assert run_row["grade"]["blocking"] == 1.0 and store.rows()[0]["grade"] == {"caught": 1}
    assert (brief.parent / "judge.attempt0.jsonl").is_file()
    assert "1 scored" in cli.summary(wired["flow"], out) and "judge answers 1" in cli.summary(wired["flow"], out)
    with pytest.raises(cli.Refused, match="already scored"):
        judge_one(wired, good_answer())


def test_a_judge_answer_that_fails_its_checks_is_asked_for_once_more(wired: dict[str, Any]) -> None:
    run_one(wired, 0)
    run_one(wired, 1)
    bad = broken(lambda raw: raw["targets"][0].update(quote="报告里没有的一句话，足够长"))
    assert judge_one(wired, bad) == cli.RETRY
    store = VariantStore(wired["out"], "baseline")
    assert store.rows() == [] and store.error_rows() == [], "第一次被驳回还不算失败"
    assert judge_one(wired, good_answer()) == 0
    run_row = next(r for r in store.rows() if r["meta"]["unit"] == "run")
    assert run_row["judge_attempts"] == 2 and "not in the report" in run_row["judge_rejected"][0]
    assert run_row["judge_usage"]["output_tokens"] == 120, "被驳回的那一次的用量也记"
    # 两次都不过：这一次运行记为判定失败，不进结果表
    assert judge_one(wired, "这份报告写得不错。", rep=1) == cli.RETRY
    assert judge_one(wired, bad, rep=1) == 1
    assert [(e["rep"], e["failure_class"]) for e in store.error_rows()] == [(1, "grader")]
    assert {r["rep"] for r in store.rows()} == {0}
    evidence = cli.episode_dir(wired["out"], "baseline", "doc", 1)
    assert (evidence / "judge.attempt0.jsonl").is_file() and (evidence / "judge.attempt1.jsonl").is_file()


def test_the_grading_sign_off_is_for_one_judge(wired: dict[str, Any]) -> None:
    run_one(wired)
    signed = {"cases": {"version": 1}, "grading": {"version": 1, "judge": judge.identity(JUDGE)}}
    wired["flow"] = suite.load(rewrite(wired["repo"], signoffs=signed))
    with pytest.raises(cli.Refused, match="sign-off is for"):
        judge_one(wired, good_answer(), model="claude-judge-2")
    with pytest.raises(cli.Refused, match="uses nothing else"):
        judge_one(wired, good_answer(), calls=[("Bash", {"command": "cat flow.json"}, "…")])
    assert VariantStore(wired["out"], "baseline").error_rows() == [], "不是这个判官的答复，连一次尝试都不算"
    assert judge_one(wired, good_answer()) == 0, "签过的那个判官放行"
    wired["flow"] = suite.load(rewrite(wired["repo"], signoffs={"cases": {"version": 1}}))
    with pytest.raises(cli.Refused, match="no sign-off on the grading method"):
        cli.judge_brief(wired["flow"], wired["flow"].material("doc"), 0, variant="baseline", out=wired["out"])


def test_a_truncated_run_is_counted_and_left_out_of_the_means(wired: dict[str, Any], tmp_path: Path) -> None:
    run_one(wired, 0, stop="max_tokens", handback=False)
    run_one(wired, 1)
    cli.grade(wired["flow"], variant="baseline", out=wired["out"], labels=labels(tmp_path, {"0": GOOD_LABEL, "1": GOOD_LABEL}))
    rows = VariantStore(wired["out"], "baseline").rows()
    assert [r["grade"] for r in rows if r["rep"] == 0] == [{}, {}, {}]
    text = cli.summary(wired["flow"], wired["out"])
    assert "2 scored, 1 truncated" in text and "over 2 cases, 2 observations" in text


def test_an_earlier_recorded_run_is_taken_over_without_running_anything(wired: dict[str, Any], tmp_path: Path) -> None:
    old = headless(tmp_path / "evidence-ok")
    (old / "run.json").write_text(json.dumps({
        "model_id": MODEL, "effort": "xhigh", "wall_ms": 4200, "timed_out": False, "workspace_unchanged": True,
        "agents_definition_sha256": "abc"}), encoding="utf-8")
    material = wired["flow"].material("doc")
    cli.import_run(wired["flow"], variant="baseline", out=wired["out"], material=material, rep=0, source=old)
    record = json.loads((cli.episode_dir(wired["out"], "baseline", "doc", 0) / "episode.json").read_text("utf-8"))
    assert record["provenance"]["harness_commit"] == "imported" and record["provenance"]["agent_sha"] == "abc"
    assert (record["wall_seconds"], record["effort"], record["cost_usd"]) == (4.2, "xhigh", 0.5)
    assert record["provenance"]["dispatch"] == "headless"
    with pytest.raises(cli.Refused, match="already recorded"):
        cli.import_run(wired["flow"], variant="baseline", out=wired["out"], material=material, rep=0, source=old)
    with pytest.raises(cli.Refused, match="one way of dispatching"):
        run_one(wired, 1)


def test_the_inputs_page_shows_every_case_in_full(wired: dict[str, Any]) -> None:
    text = cli.inputs(wired["flow"])
    assert "共 1 份材料、2 处应当被报出的问题" in text
    assert "评审 `{WORKDIR}/design/doc.md`。" in text and "附件：既说要又说不要。" in text
    assert "#### `doc.S1`" in text and "必须先读" in text and "可以不读" in text
    assert cli.fenced("a ``` b ````` c").startswith("``````\n")


def test_the_work_root_must_be_outside_any_checkout(repo: Path) -> None:
    with pytest.raises(cli.Refused, match="inside a git work tree"):
        cli.work_root(repo / "scratch")


def test_the_command_line_runs_the_pair_around_a_dispatch(wired: dict[str, Any], tmp_path: Path,
                                                          monkeypatch: pytest.MonkeyPatch,
                                                          capsys: pytest.CaptureFixture[str]) -> None:
    wired["work"].mkdir()
    monkeypatch.setattr(cli, "work_root", lambda _: wired["work"])   # make test 的临时目录在检出里，真的工作根不许在那
    root, out = str(wired["repo"] / "suites" / "tiny-review"), str(wired["out"])
    episode = ["--out", out, "--variant", "baseline", "--material", "doc"]
    assert cli.main(["prepare", root, *episode]) == 0
    assert "Dispatch ONE subagent" in capsys.readouterr().out
    evidence = cli.episode_dir(wired["out"], "baseline", "doc", 0)
    ran = transcript(tmp_path / "agent.jsonl", prompt=(evidence / "brief.md").read_text(encoding="utf-8"))
    assert cli.main(["record", root, *episode, "--transcript", str(tmp_path / "no-such.jsonl"), "--dispatch", "registered"]) == 2
    assert cli.main(["record", root, *episode, "--transcript", str(ran), "--dispatch", "registered", "--tokens", "4321"]) == 0
    assert cli.main(["judge-brief", root, *episode]) == 0
    answered = judge_transcript(tmp_path / "judge.jsonl", evidence / "judge.brief.md", good_answer())
    assert cli.main(["judge-record", root, *episode, "--transcript", str(answered)]) == 0
    assert cli.main(["judge-record", root, *episode, "--transcript", str(answered)]) == 2, "已经判过"
    assert cli.main(["summary", root, "--out", out]) == 0
    assert "role 4321 tokens reported" in capsys.readouterr().out


def test_report_without_a_builder_points_at_the_summary(repo: Path, capsys: pytest.CaptureFixture[str],
                                                        monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "BUILDER", repo / "no-such-builder.mjs")
    assert cli.main(["report", str(repo / "suites" / "tiny-review"), "--out", str(repo / "out")]) == 2
    assert "'summary' prints the same scores" in capsys.readouterr().err


@pytest.mark.skipif(shutil.which("node") is None, reason="报告页生成器要 node")
def test_the_builder_kept_in_the_repository_renders_a_graded_flow(wired: dict[str, Any], tmp_path: Path) -> None:
    out = wired["out"]
    run_one(wired, 0)
    run_one(wired, 1)
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL, "1": GOOD_LABEL}))
    assert cli.main(["report", str(wired["repo"] / "suites" / "tiny-review"), "--out", str(out)]) == 0
    assert "baseline" in (out / "report.html").read_text(encoding="utf-8")
    scores = (out / "trajectory" / "scores.tsv").read_text(encoding="utf-8")
    assert scores.splitlines()[:3] == ["id\tsplit\tbaseline", "doc.S1\tall\t1.000", "doc.S2\tall\t0.000"]


# --- 判官校准 -----------------------------------------------------------------------------------------------

def calibration_set(repo: Path, cases: list[dict[str, Any]], reports: dict[str, str]) -> suite.Flow:
    root = repo / "suites" / "tiny-review" / "calibration"
    (root / "reports").mkdir(parents=True, exist_ok=True)
    for name, text in reports.items():
        (root / "reports" / name).write_text(text, encoding="utf-8")
    (root / "cases.json").write_text(json.dumps({"format": 1, "grader": "人工：测试", "cases": cases},
                                                ensure_ascii=False), encoding="utf-8")
    return suite.load(repo / "suites" / "tiny-review")


def calibration_case(case_id: str, report: str, s1: int, s2: int, **over: Any) -> dict[str, Any]:
    return {"id": case_id, "material": "doc", "report": f"reports/{report}", "kind": "真实报告", "origin": "测试",
            "seeds": {"S1": [s1, "人工的理由一"], "S2": [s2, "人工的理由二"]}, **over}


def calibrate_one(flow: suite.Flow, case: calibration.Case, out: Path, answer: Any, **shape: Any) -> dict[str, Any]:
    """写这份报告的判官简报、「派发」判官、收录它的答复。"""
    brief = calibration.write_brief(flow, case, out)
    path = judge_transcript(out.parent / f"calibrate-{next(serial)}.jsonl", brief, answer, **shape)
    return calibration.record(flow, case, claude_host.parse(path, brief="校准"), out=out, transcript=path)


def test_a_made_negative_is_a_real_report_with_stated_changes() -> None:
    text = "## 阻断\n\n### B-1 甲\n\n正文甲\n\n### B-2 乙\n\n正文乙\n\n## 非阻断\n\n无\n"
    cut = calibration.derive(text, [{"op": "cut", "from": "### B-1", "until": "### B-2"}])
    assert "正文甲" not in cut and "### B-2 乙" in cut
    moved = calibration.derive(text, [{"op": "replace", "find": "## 阻断", "replace": "## 未覆盖"}])
    assert moved.startswith("## 未覆盖")
    for ops, message in (([{"op": "cut", "from": "###", "until": "## 非阻断"}], "occurs 2 times"),
                         ([{"op": "cut", "from": "### B-2", "until": "### B-3"}], "nothing after"),
                         ([{"op": "replace", "find": "丙", "replace": "丁"}], "occurs 0 times"),
                         ([{"op": "shuffle"}], "unknown derivation")):
        with pytest.raises(suite.SuiteError, match=message):
            calibration.derive(text, ops)


def test_calibration_compares_the_judge_with_a_person_problem_by_problem(repo: Path, tmp_path: Path) -> None:
    flow = calibration_set(repo, [
        calibration_case("real", "real.md", 1, 0, run={"blocking": [1, "B-1"], "out_of_kind": [0, "没有"]}),
        calibration_case("cut", "real.md", 0, 0),          # 人工说没报出，判官会说报出了
        calibration_case("silent", "silent.md", 0, 0),
        calibration_case("later", "silent.md", 0, 0),
    ], {"real.md": REPORT, "silent.md": "没有发现问题。"})
    out = tmp_path / "out"
    grader, cases = calibration.load(flow)
    for case, answer in zip(cases, (raw_answer(), raw_answer(), SILENT)):
        assert calibrate_one(flow, case, out, answer)["status"] == "judged"
    where = calibration.directory(out, JUDGE)
    assert where.name.startswith(f"judge-subagent-{JUDGE}-rules-") and (where / "real" / "judge.attempt0.jsonl").is_file()
    assert (where / "real" / "report.md").read_text(encoding="utf-8") == REPORT, "判官实际拿到的那一份报告留底"
    results = calibration.recorded(where)
    assert grader == "人工：测试" and sorted(results) == ["cut", "real", "silent"]
    outcome = calibration.compare(cases, results)
    assert outcome["cells"] == {"both_caught": 1, "both_missed": 4, "judge_only": 1, "person_only": 0}
    assert [(item["case"], item["seed"]) for item in outcome["disagreements"]] == [("cut", "S1")]
    assert [(item["metric"], item["agree"]) for item in outcome["run_checks"]] == [("blocking", True),
                                                                                   ("out_of_kind", False)]
    assert (outcome["attempts"], outcome["output_tokens"], outcome["efforts"]) == (3, 180, ["high"])
    assert outcome["pending"] == ["later"]
    text = calibration.render(flow, grader, cases, results, model=JUDGE)
    assert "一致 5 / 6（83.3%）" in text and "`cut` 的 `S1`：人工判 0（人工的理由一）；判官判 1" in text
    assert f"`{judge.identity(JUDGE)}`" in text and "宿主记录的档位：high" in text and "还没判的" in text
    with pytest.raises(suite.SuiteError, match="already has a result"):
        calibrate_one(flow, cases[0], out, raw_answer())
    # 另一个判官的结果另放一处，互不相干
    assert calibrate_one(flow, cases[0], out, raw_answer(), model="claude-judge-2")["status"] == "judged"
    assert sorted(calibration.recorded(where)) == ["cut", "real", "silent"]


def test_a_rejected_calibration_answer_is_asked_for_once_more_and_then_counts_as_failed(
        repo: Path, tmp_path: Path) -> None:
    flow = calibration_set(repo, [calibration_case("real", "real.md", 1, 0),
                                  calibration_case("silent", "silent.md", 0, 0)],
                           {"real.md": REPORT, "silent.md": "没有发现问题。"})
    out = tmp_path / "out"
    _, cases = calibration.load(flow)
    miscopied = broken(lambda raw: raw["targets"][0].update(quote="design/doc.md 第一句写「调用方方可以不读」"))
    with pytest.raises(grading.GraderError, match="not in the report"):
        calibrate_one(flow, cases[0], out, miscopied)
    assert calibrate_one(flow, cases[0], out, raw_answer())["spend"]["judge_attempts"] == 2
    with pytest.raises(grading.GraderError):
        calibrate_one(flow, cases[1], out, raw_answer())      # 引的句子不在这份报告里
    assert calibrate_one(flow, cases[1], out, raw_answer())["status"] == "failed"
    outcome = calibration.compare(cases, calibration.recorded(calibration.directory(out, JUDGE)))
    assert outcome["judged"] == 2 and outcome["failed"][0]["case"] == "silent" and outcome["attempts"] == 4
    assert outcome["retried"][0]["case"] == "real" and "not in the report" in outcome["retried"][0]["reasons"][0]
    text = calibration.render(flow, "人工", cases, calibration.recorded(calibration.directory(out, JUDGE)), model=JUDGE)
    assert "判官的答复被程序驳回、重答之后通过的" in text and "判官答复没通过核对的" in text


def test_a_calibration_answer_to_a_brief_that_has_since_changed_is_not_taken(repo: Path, tmp_path: Path) -> None:
    flow = calibration_set(repo, [calibration_case("real", "real.md", 1, 0)], {"real.md": REPORT})
    out = tmp_path / "out"
    _, cases = calibration.load(flow)
    brief = calibration.write_brief(flow, cases[0], out)
    path = judge_transcript(tmp_path / "judge.jsonl", brief, raw_answer())
    brief.write_text(brief.read_text(encoding="utf-8") + "\n另加一句。\n", encoding="utf-8")
    with pytest.raises(judge.NotThisJudge, match="write it again"):
        calibration.record(flow, cases[0], claude_host.parse(path, brief="校准"), out=out, transcript=path)
    assert not calibration.directory(out, JUDGE).exists()


@pytest.mark.parametrize(("change", "message"), [
    (lambda case: case["seeds"].pop("S2"), "covers"),
    (lambda case: case.update(report="reports/missing.md"), "does not exist"),
    (lambda case: case.update(material="nope"), "no material"),
    (lambda case: case.update(run={"speed": [1, "x"]}), "unknown run metrics"),
    (lambda case: case["seeds"].update(S1=[2, "x"]), "0 or 1"),
    (lambda case: case.update(id="a/b"), "names a directory"),
    (lambda case: case.update(derive=[{"op": "cut", "from": "不在报告里", "until": "## 非阻断"}]), "occurs 0 times"),
])
def test_a_calibration_set_that_does_not_cover_its_material_does_not_load(repo: Path, change: Any, message: str) -> None:
    case = calibration_case("real", "real.md", 1, 0)
    change(case)
    with pytest.raises(suite.SuiteError, match=message):
        calibration_set(repo, [case], {"real.md": REPORT})
        calibration.load(suite.load(repo / "suites" / "tiny-review"))


def test_the_calibrate_commands_write_briefs_take_answers_and_print_the_comparison(
        wired: dict[str, Any], tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    calibration_set(wired["repo"], [calibration_case("real", "real.md", 1, 0), calibration_case("again", "real.md", 1, 0)],
                    {"real.md": REPORT})
    root, out = str(wired["repo"] / "suites" / "tiny-review"), wired["out"]
    assert cli.main(["calibrate-brief", root, "--out", str(out)]) == 0
    briefs = out / "_calibration" / "_briefs"
    printed = capsys.readouterr().out
    assert judge.pointer(briefs / "real.md") in printed and judge.pointer(briefs / "again.md") in printed
    assert cli.main(["calibrate-brief", root, "--out", str(out), "--case", "nope"]) == 2
    good = judge_transcript(tmp_path / "good.jsonl", briefs / "real.md", raw_answer())
    assert cli.main(["calibrate-record", root, "--out", str(out), "--case", "real", "--transcript", str(good)]) == 0
    assert cli.main(["calibrate-record", root, "--out", str(out), "--case", "again", "--transcript", str(good)]) == 2, (
        "指向另一份简报的记录不收")
    bad = judge_transcript(tmp_path / "bad.jsonl", briefs / "again.md", "我认为都报出了。")
    assert cli.main(["calibrate-record", root, "--out", str(out), "--case", "again", "--transcript", str(bad)]) == cli.RETRY
    capsys.readouterr()
    assert cli.main(["calibrate", root, "--out", str(out), "--judge-model", JUDGE]) == 0
    assert "一致 2 / 2（100.0%）" in capsys.readouterr().out
    written = list((out / "_calibration").glob("*/calibration.md"))
    assert len(written) == 1 and written[0].parent == calibration.directory(out, JUDGE)
    assert "还没判的" in written[0].read_text(encoding="utf-8")


# --- 入库的常设用例集 ---------------------------------------------------------------------------------------

# 整仓检出一类的用例集另有一条测试（test_role_evals_checkout.py），这里只收待审材料一类。
STANDING = sorted(path.parent for path in (EVALUATION / "suites").glob("*/flow.json")
                  if json.loads(path.read_text(encoding="utf-8"))["workspace"].get("kind", "material") == "material")


@pytest.mark.parametrize("root", STANDING, ids=lambda path: path.name)
def test_a_standing_suite_still_fits_the_repository(root: Path) -> None:
    """零花费的腐坏探测：案例输入存在，每处种入在输入中恰好出现一次。"""
    flow = suite.load(root)
    repo = META.parent
    for path in flow.workspace["subject_paths"]:
        assert (repo / path).exists(), f"{flow.id}: subject path {path} is gone"
    for material in flow.materials:
        files = json.loads(flow.fixture(material).read_text(encoding="utf-8"))["files"]
        assert "{WORKDIR}" in material.brief.read_text(encoding="utf-8")
        assert f"本次判断：{flow.judgment}" in material.brief.read_text(encoding="utf-8")
        for op in material.ops():
            if op["op"] == "replace":
                text = files[op["file"]]
                assert text.count(op["find"]) == 1, f"{flow.id}/{material.id}.{op.get('id')}: seed no longer lands once"
            elif op["op"] == "copy":
                assert (root / op["from"]).is_file()
        for seed in material.seeds:
            texts = [files[path] for path in seed.files]
            for fragment in seed.fragments():
                assert any(fragment in text for text in texts), (
                    f"{flow.id}/{material.id}.{seed.id}: the pinned material does not contain {fragment[:50]!r}")
    if (root / "calibration" / "cases.json").exists():
        # 校准集跟着用例走：种入清单变了而人工判定没跟上，这里会失败
        assert calibration.load(flow)[1], f"{flow.id}: the calibration set is empty"

@pytest.mark.parametrize("target", ["../escape", "/escape", ".git/config", ".meta_harness/design/record/decision.md"])
def test_case_fixture_rejects_escape_and_record(tmp_path: Path, target: str) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps({"format": 1, "files": {target: "bad"}}))
    with pytest.raises(workspace.WorkspaceError, match="invalid fixture target"):
        workspace.build(tmp_path, tmp_path / "copy", fixture=fixture, subject_paths=[])
    assert not (tmp_path / "copy").exists()


def test_case_fixture_prepares_without_a_git_repository(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps({"format": 1, "files": {"case/input.md": "stable input"}}))
    dest = tmp_path / "copy"
    workspace.build(tmp_path, dest, fixture=fixture, subject_paths=[])
    assert (dest / "case/input.md").read_text() == "stable input"


@pytest.mark.parametrize("subject", ["../outside", "/outside", ".git/config"])
def test_material_subject_rejects_escape_before_writing(tmp_path: Path, subject: str) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps({"format": 1, "files": {"case/input.md": "input"}}))
    dest = tmp_path / "copy"
    with pytest.raises(workspace.WorkspaceError, match="subject path escapes"):
        workspace.build(tmp_path, dest, fixture=fixture, subject_paths=[subject])
    assert not dest.exists()


def test_case_fixture_rejects_boolean_format(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps({"format": True, "files": {"case/input.md": "input"}}))
    with pytest.raises(workspace.WorkspaceError, match="format=1"):
        workspace.build(tmp_path, tmp_path / "copy", fixture=fixture, subject_paths=[])
