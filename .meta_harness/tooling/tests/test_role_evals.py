from __future__ import annotations

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
USAGE = {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}


# --- 夹具 ---------------------------------------------------------------------------------------------------

def row(case: str = "m.S1", rep: int = 0, *, episode: str = "m", grade: dict[str, Any] | None = None,
        status: str = "ok", **over: Any) -> dict[str, Any]:
    base = {"prompt_id": case, "prompt": "p", "tags": ["m"], "rep": rep, "status": status,
            "grade": {"caught": 1} if grade is None else grade, "model": MODEL, "usage": dict(USAGE),
            "meta": {"episode": episode, "unit": "seed"}}
    return {**base, **over}


TURNS = [{"role": "user", "content": "brief"}, {"role": "assistant", "content": "report"}]

FAKE_HOST = r'''
import json, pathlib, sys, time
mode = sys.argv[1]
brief = sys.stdin.read()
def emit(event): print(json.dumps(event, ensure_ascii=False), flush=True)
emit({"type": "system", "subtype": "init"})
if mode == "hang":
    time.sleep(60)
tool = "Edit" if mode == "edit-tool" else "Read"
emit({"type": "assistant", "message": {"content": [
    {"type": "thinking", "thinking": "先读材料"}, {"type": "tool_use", "name": tool, "input": {"file_path": "design/doc.md"}}]}})
emit({"type": "user", "message": {"content": [{"type": "tool_result", "content": "x" * 30000}]}})
if mode == "write":
    pathlib.Path("design/doc.md").write_text("改过了")
if mode == "no-result":
    sys.exit(3)
final = "" if mode == "empty" else "本次判断是**选择**，读的判据页是 `references/review/x.md`。\n\n## 阻断\n\nB-1 ……"
if mode == "no-page":
    final = "结论：有两条阻断。\n\n判据页 references/review/x.md 在这里才提到。"
result = {"type": "result", "subtype": "success", "is_error": False, "stop_reason": "end_turn", "result": final,
          "usage": {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 7},
          "modelUsage": {"claude-test-1": {"outputTokens": 50}, "claude-small-1": {"outputTokens": 3}},
          "total_cost_usd": 0.5, "duration_api_ms": 1200}
if mode == "host-error":
    result.update(subtype="error_during_execution", is_error=True)
if mode == "budget":
    result.update(subtype="error_max_budget_usd", is_error=True)
if mode == "other-model":
    result["modelUsage"] = {"claude-fallback-9": {"outputTokens": 50}}
if mode == "max-tokens":
    result["stop_reason"] = "max_tokens"
emit({"type": "assistant", "message": {"content": [{"type": "text", "text": final}]}})
emit(result)
'''


def fake_host(tmp_path: Path, mode: str) -> list[str]:
    script = tmp_path / "fake_host.py"
    script.write_text(FAKE_HOST, encoding="utf-8")
    return [sys.executable, str(script), mode]


def run_fake(tmp_path: Path, mode: str, *, wall: int = 20) -> claude_host.Episode:
    cwd = tmp_path / f"cwd-{mode}"
    (cwd / "design").mkdir(parents=True)
    (cwd / "design" / "doc.md").write_text("原文", encoding="utf-8")
    return claude_host.run(fake_host(tmp_path, mode), cwd=cwd, brief="请评审", wall_seconds=wall,
                           evidence=tmp_path / f"evidence-{mode}")


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@invalid", *args],
                          check=True, capture_output=True, text=True).stdout.strip()


def flow_json(base: str, **over: Any) -> dict[str, Any]:
    value = {
        "format": 1, "id": "tiny-review", "version": 1, "family": "review", "role": "tiny-reviewer",
        "judgment": "选择", "criteria_page": "references/review/x.md", "reps": 2,
        "host": {"claude-code": {"model": MODEL, "effort": "high", "allowed": ["Read", "Glob", "Grep"],
                                 "disallowed": ["Agent"], "permission_mode": "dontAsk", "wall_seconds": 20,
                                 "budget_usd": 1}},
        "workspace": {"base": base, "material_paths": ["design"], "material_excludes": ["design/evidence"],
                      "subject_paths": ["skills", "NOTES.md"]},
        "metrics": [{"id": "caught", "kind": "binary", "label": "抓到种入"},
                    {"id": "read_only", "kind": "binary", "label": "只读"},
                    {"id": "names_page", "kind": "binary", "label": "写明判据页"},
                    {"id": "out_of_kind", "kind": "float", "label": "越出判断条数", "better": "lower"},
                    {"id": "blocking", "kind": "float", "label": "阻断条数"},
                    {"id": "novel_blocking", "kind": "float", "label": "表外阻断条数", "better": "lower"}],
        "signoffs": {"cases": {"by": "t", "date": "2026-10-01", "version": 1},
                     "grading": {"by": "t", "date": "2026-10-01", "version": 1}},
        "materials": [{
            "id": "doc", "target": "design/doc.md", "brief": "briefs/doc.md", "tags": ["种入的"],
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
    (tiny / "flow.json").write_text(json.dumps(flow_json(base), ensure_ascii=False, indent=1), encoding="utf-8")
    git(root, "add", "-A")
    git(root, "commit", "-qm", "suite")
    return root


@pytest.fixture
def wired(repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """把命令行接到小仓库与假宿主上；mode 列表按启动次序取用，取完后一直用最后一个。"""
    modes: list[str] = ["ok"]
    monkeypatch.setattr(cli, "REPO", repo)
    monkeypatch.setattr(cli, "META", repo / "meta")
    monkeypatch.setattr(cli, "HARNESS", repo / "harness")

    def compile_definition(flow: suite.Flow, out: Path, variant: str) -> Path:
        frozen = out / variant / "agents" / f"{flow.role}.json"
        frozen.parent.mkdir(parents=True, exist_ok=True)
        frozen.write_text(json.dumps({flow.role: {"prompt": "你只读"}}), encoding="utf-8")
        return frozen

    def command(*_: Any, **__: Any) -> list[str]:
        return fake_host(tmp_path, modes.pop(0) if len(modes) > 1 else modes[0])

    monkeypatch.setattr(cli, "compile_definition", compile_definition)
    monkeypatch.setattr(claude_host, "command", command)
    return {"flow": suite.load(repo / "suites" / "tiny-review"), "out": tmp_path / "out", "work": tmp_path / "work",
            "modes": modes, "repo": repo}


def run_cli(wired: dict[str, Any], **over: Any) -> int:
    wired["work"].mkdir(exist_ok=True)
    args = {"variant": "baseline", "out": wired["out"], "work": wired["work"], "reps": None, "only": None,
            "parallel": 1, "allow_dirty": False, "keep": False}
    return cli.run(wired["flow"], **{**args, **over})


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
    store.record_error("m", 0, "harness", "host error")
    assert store.rows() == []
    assert store.done() == set()
    assert [e["failure_class"] for e in store.error_rows()] == ["timeout", "harness"]
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


# --- 宿主 ---------------------------------------------------------------------------------------------------

def test_a_normal_run_is_read_back_from_the_stream(tmp_path: Path) -> None:
    episode = run_fake(tmp_path, "ok")
    assert episode.failure(MODEL) is None
    assert [turn["role"] for turn in episode.turns] == ["user", "tool_call", "tool_result", "assistant"]
    assert episode.turns[0]["content"] == "请评审"
    assert episode.turns[1]["name"] == "Read" and episode.turns[1]["thinking"] == "先读材料"
    assert "more characters in trajectory.jsonl" in episode.turns[2]["content"]
    assert len(episode.turns[2]["content"]) < 21000
    assert episode.model == MODEL and episode.models_observed == ["claude-small-1", MODEL]
    assert episode.usage == {"input_tokens": 100, "output_tokens": 50, "cache_read_input_tokens": 7,
                             "cache_creation_input_tokens": 0}
    assert (episode.cost_usd, episode.api_seconds, episode.tool_calls) == (0.5, 1.2, 1)
    assert episode.tool_names == {"Read": 1} and episode.exit_code == 0 and not episode.truncated()
    assert (tmp_path / "evidence-ok" / "brief.md").read_text(encoding="utf-8") == "请评审"


@pytest.mark.parametrize(("mode", "failure_class"), [
    ("host-error", "harness"), ("budget", "budget"), ("other-model", "model-mismatch"),
    ("empty", "harness"), ("no-result", "harness"),
])
def test_a_run_that_cannot_be_scored_says_why(tmp_path: Path, mode: str, failure_class: str) -> None:
    failure = run_fake(tmp_path, mode).failure(MODEL)
    assert failure is not None and failure[0] == failure_class


def test_the_wall_clock_ceiling_ends_a_run_that_keeps_its_stream_open(tmp_path: Path) -> None:
    episode = run_fake(tmp_path, "hang", wall=1)
    assert episode.timed_out and episode.failure(MODEL)[0] == "timeout"
    assert episode.wall_seconds < 10


def test_a_clipped_answer_is_truncated_not_wrong(tmp_path: Path) -> None:
    episode = run_fake(tmp_path, "max-tokens")
    assert episode.failure(MODEL) is None and episode.truncated()


def test_a_compiled_role_becomes_an_agents_entry(tmp_path: Path) -> None:
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


def test_the_host_command_carries_the_isolation_settings(tmp_path: Path) -> None:
    command = claude_host.command(tmp_path / "a.json", "tiny-reviewer", model=MODEL, effort="high", allowed=["Read"],
                                  disallowed=["Agent", "WebFetch"], permission_mode="dontAsk", budget_usd=3)
    joined = " ".join(command)
    for part in ("--agent tiny-reviewer", f"--model {MODEL}", "--effort high", "--setting-sources project",
                 "--max-budget-usd 3", "--no-session-persistence", "--disallowedTools Agent WebFetch",
                 "--allowedTools Read", "--output-format stream-json"):
        assert part in joined


# --- 工作副本 -----------------------------------------------------------------------------------------------

def build(repo: Path, dest: Path, base: str | None = None) -> None:
    workspace.build(repo, dest, base=base or git(repo, "rev-parse", "HEAD~1"), material_paths=["design"],
                    material_excludes=["design/evidence"], subject_paths=["skills", "NOTES.md"])


def test_material_comes_from_the_pinned_commit_and_the_subject_from_the_working_tree(repo: Path, tmp_path: Path) -> None:
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
        build(repo, tmp_path / "other", base="0" * 40)
    with pytest.raises(workspace.WorkspaceError, match="does not exist"):
        workspace.build(repo, tmp_path / "third", base=git(repo, "rev-parse", "HEAD"), material_paths=["design"],
                        material_excludes=[], subject_paths=["no-such-dir"])


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


def test_catalog_ops_present_a_contract_as_an_unfrozen_candidate(tmp_path: Path) -> None:
    registry = tmp_path / "registry"
    registry.mkdir()
    coordinate = {"baseline_id": "b", "contract_id": "capability.x", "version": 2}
    catalog = {"contracts": [{"coordinate": coordinate, "status": "accepted", "acceptance": {"by": "d"},
                              "resources": ["spec/x/v2/contract.md"],
                              "dependencies": [{"coordinate": {"contract_id": "data.y", "version": 1}, "clauses": ["S-1"]}]}]}
    (registry / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    (registry / "frozen.json").write_text(json.dumps({"format": 1, "files": {
        "spec/x/v2/contract.md": "a" * 64, "spec/y/v1/contract.md": "b" * 64}}), encoding="utf-8")
    workspace.apply(tmp_path, [
        {"op": "catalog-candidate", "registry": "registry", "contract_id": "capability.x", "version": 2},
        {"op": "catalog-add-clause", "registry": "registry", "contract_id": "capability.x", "version": 2,
         "dependency": {"contract_id": "data.y", "version": 1}, "clause": "S-97"}], suite=tmp_path)
    item = json.loads((registry / "catalog.json").read_text(encoding="utf-8"))["contracts"][0]
    assert item["status"] == "candidate" and "acceptance" not in item
    assert item["dependencies"][0]["clauses"] == ["S-1", "S-97"]
    assert list(json.loads((registry / "frozen.json").read_text(encoding="utf-8"))["files"]) == ["spec/y/v1/contract.md"]
    with pytest.raises(workspace.WorkspaceError, match="not in the catalog"):
        workspace.apply(tmp_path, [{"op": "catalog-candidate", "registry": "registry", "contract_id": "capability.z",
                                    "version": 1}], suite=tmp_path)
    with pytest.raises(workspace.WorkspaceError, match="declares no dependency"):
        workspace.apply(tmp_path, [{"op": "catalog-add-clause", "registry": "registry", "contract_id": "capability.x",
                                    "version": 2, "dependency": {"contract_id": "data.q", "version": 1},
                                    "clause": "S-1"}], suite=tmp_path)


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
    ({"attach_design_review": True}, "contract coordinate"),
    ({"workspace": {"base": "x"}}, "workspace lacks"),
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


def test_a_historical_material_is_taken_from_its_own_commit(repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (repo / "design" / "doc.md").write_text("后来的版本：调用方必须先读。\n", encoding="utf-8")
    git(repo, "commit", "-qam", "material moves on")
    later = git(repo, "rev-parse", "HEAD")
    root = repo / "suites" / "tiny-review"
    current = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    real = {"id": "doc-later", "target": "design/doc.md 的后来版本", "brief": "briefs/doc.md", "base": later,
            "material_paths": ["harness"], "source": "一次真实评审", "seeds": [{"id": "R1", "kind": "real", "where": "第一句", "truth": "只说先读",
                                             "quote": "后来的版本", "files": ["design/doc.md"],
                                             "severity": "阻断"}]}
    flow = suite.load(rewrite(repo, materials=[*current["materials"], real]))
    assert flow.base(flow.material("doc")) == flow.workspace["base"]
    assert flow.base(flow.material("doc-later")) == later
    monkeypatch.setattr(cli, "REPO", repo)
    for name, expected in (("doc", "调用方可以不读，再写。\n"), ("doc-later", "后来的版本：调用方必须先读。\n")):
        dest = tmp_path / name
        cli.prepare(flow, flow.material(name), dest)
        assert (dest / "design" / "doc.md").read_text(encoding="utf-8") == expected
        # 只有那份材料当时对着读的路径，才随它进副本
        assert (dest / "harness" / "keep.txt").exists() == (name == "doc-later")
    text = cli.inputs(flow)
    assert "来源：一次真实评审" in text and "当时定的严重度：阻断" in text and f"`{later[:9]}`" in text


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
    ok = review.observe(flow, run_fake(tmp_path, "ok"), unchanged=True, allowed=allowed)
    assert (ok["read_only"][0], ok["names_page"][0]) == (1, 1)
    assert review.observe(flow, run_fake(tmp_path, "edit-tool"), unchanged=True, allowed=allowed)["read_only"][0] == 0
    changed = review.observe(flow, run_fake(tmp_path, "write"), unchanged=False, allowed=allowed)
    assert changed["read_only"][0] == 0 and "被改动" in changed["read_only"][1]
    late = review.observe(flow, run_fake(tmp_path, "no-page"), unchanged=True, allowed=allowed)
    assert late["names_page"][0] == 0, "naming the page after the first paragraph does not count"


# --- 判官 ---------------------------------------------------------------------------------------------------

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
    silent = {"findings": [], "targets": [
        {"id": seed, "caught": False, "finding": "", "quote": "", "reason": "报告没有提到"} for seed in ("S1", "S2")]}
    verdict = judge.verdict(silent, doc[1], report, grader="judge:x")
    assert [value for value, _ in verdict.seeds.values()] == [0, 0]
    assert all(value == 0 for value, _ in verdict.run.values())


def test_the_judge_prompt_carries_the_targets_and_not_the_material(doc: tuple[suite.Flow, suite.Material]) -> None:
    flow, material = doc
    text = judge.prompt(flow, material, REPORT)
    assert "id `S1`｜位置：第一句｜问题：把必须写成了可以" in text and "材料里的这段文字：可以不读" in text
    assert "id `K1`｜基线没有提交号" in text and "评措辞与歧义" in text
    assert text.index("<report>") < text.index("### B-1") < text.index("</report>")
    assert "调用方必须先读，再写" not in text, "the judge reads the report, not the material"
    import dataclasses
    control = dataclasses.replace(material, seeds=())
    assert "targets 填空数组" in judge.prompt(flow, control, REPORT)
    assert judge.verdict({"findings": [finding("B-1", "blocking", "none")], "targets": []}, control, REPORT,
                         grader="judge:x").run["novel_blocking"][0] == 1.0


FAKE_JUDGE = r'''
import json, pathlib, sys
queue = pathlib.Path(sys.argv[1])
sys.stdin.read()
answers = json.loads(queue.read_text())
answer = answers.pop(0) if len(answers) > 1 else answers[0]
queue.write_text(json.dumps(answers))
if answer == "garbage":
    print("not json"); sys.exit(0)
result = {"type": "result", "subtype": "success", "is_error": False, "result": "", "structured_output": answer,
          "total_cost_usd": 0.02, "usage": {"input_tokens": 900, "output_tokens": 120},
          "modelUsage": {"claude-judge-1": {"outputTokens": 120}}}
if answer == "host-error":
    result.update(subtype="error_during_execution", is_error=True, structured_output=None)
print(json.dumps(result, ensure_ascii=False))
'''


def fake_judge(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, answers: list[Any]) -> None:
    script, queue = tmp_path / "fake_judge.py", tmp_path / "judge-queue.json"
    script.write_text(FAKE_JUDGE, encoding="utf-8")
    queue.write_text(json.dumps(answers, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(judge, "command", lambda *_, **__: [sys.executable, str(script), str(queue)])


def test_the_judge_gets_a_second_attempt_and_every_attempt_is_billed(
        doc: tuple[suite.Flow, suite.Material], tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    flow, material = doc
    bad = broken(lambda raw: raw["targets"][0].update(quote="报告里没有的一句话，足够长"))
    fake_judge(tmp_path, monkeypatch, [bad, raw_answer()])
    verdict, results = judge.judge(flow, material, REPORT, model="claude-judge-1", effort="high", cwd=tmp_path,
                                   evidence=tmp_path / "ev" / "judge.json")
    assert verdict.seeds["S1"][0] == 1 and verdict.grader.startswith("judge:claude-judge-1@high rules ")
    spent = judge.spend(results)
    rejected = spent.pop("judge_rejected")
    assert len(rejected) == 1 and "not in the report" in rejected[0], "被驳回的答复留下驳回的原因"
    assert spent == {
        "judge_model": "claude-judge-1", "judge_attempts": 2, "judge_cost_usd": 0.04,
        "judge_usage": {"input_tokens": 1800, "output_tokens": 240, "cache_read_input_tokens": 0,
                        "cache_creation_input_tokens": 0}}
    assert (tmp_path / "ev" / "judge.attempt0.json").is_file() and (tmp_path / "ev" / "judge.attempt1.json").is_file()


@pytest.mark.parametrize("answers", [["garbage"], ["host-error"]])
def test_a_judge_that_never_answers_properly_fails_the_grading(
        doc: tuple[suite.Flow, suite.Material], tmp_path: Path, monkeypatch: pytest.MonkeyPatch, answers: list[Any]) -> None:
    fake_judge(tmp_path, monkeypatch, answers)
    with pytest.raises(judge.JudgeFailed, match="2 judge attempts failed"):
        judge.judge(doc[0], doc[1], REPORT, model="claude-judge-1", effort="high", cwd=tmp_path,
                    evidence=tmp_path / "ev" / "judge.json")


def test_the_judge_command_gives_the_judge_no_tools_and_no_project_settings() -> None:
    command = judge.command("claude-judge-1", "high", budget_usd=2)
    assert command[command.index("--tools") + 1] == "" and command[command.index("--setting-sources") + 1] == ""
    assert json.loads(command[command.index("--json-schema") + 1])["required"] == ["findings", "targets"]
    assert judge.identity("a", "high") != judge.identity("b", "high")


# --- 命令行：从运行到汇总 -----------------------------------------------------------------------------------

def test_a_paid_run_waits_for_both_sign_offs(wired: dict[str, Any]) -> None:
    wired["flow"] = suite.load(rewrite(wired["repo"], signoffs={"cases": {"version": 1}}))
    with pytest.raises(cli.Refused, match="no sign-off on: grading"):
        run_cli(wired)
    assert not wired["out"].exists()


def test_a_run_refuses_uncommitted_changes_in_what_is_under_test(wired: dict[str, Any]) -> None:
    (wired["repo"] / "skills" / "page.md").write_text("改了没提交\n", encoding="utf-8")
    with pytest.raises(cli.Refused, match="uncommitted"):
        run_cli(wired)
    assert run_cli(wired, allow_dirty=True, reps=1) == 0
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
        run_cli(wired)


def test_verify_flags_a_base_that_history_no_longer_reaches(wired: dict[str, Any]) -> None:
    wired["work"].mkdir()
    assert cli.verify(wired["flow"], wired["work"]) == []
    flow = suite.load(rewrite(wired["repo"], workspace={**wired["flow"].workspace, "base": "0" * 40}))
    assert "not an ancestor" in cli.verify(flow, wired["work"])[0]
    assert list(wired["work"].iterdir()) == [], "verify leaves no copies behind"


def test_run_then_grade_then_summary(wired: dict[str, Any], tmp_path: Path) -> None:
    assert run_cli(wired) == 0
    out = wired["out"]
    for rep in (0, 1):
        evidence = cli.episode_dir(out, "baseline", "doc", rep)
        record = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
        assert record["model"] == MODEL and record["observations"]["read_only"][0] == 1
        assert record["provenance"]["harness_commit"] == git(wired["repo"], "rev-parse", "HEAD")
        assert record["provenance"]["suite_sha"] == wired["flow"].digest()
        brief = (evidence / "brief.md").read_text(encoding="utf-8")
        assert "{WORKDIR}" not in brief and str(wired["work"]) in brief
        assert (evidence / "final.md").read_text(encoding="utf-8").startswith("本次判断")
    assert list(wired["work"].iterdir()) == [], "copies are removed once their hash is taken"
    assert json.loads((out / "_state.json").read_text(encoding="utf-8"))["metrics"][0]["id"] == "caught"

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
    assert all(r["cost_usd"] == 0.5 for r in run_rows)
    assert all("cost_usd" not in r for r in rows if r["meta"]["unit"] == "seed"), "spend is counted once per episode"
    assert run_rows[0]["grade"] == {"read_only": 1, "names_page": 1, "out_of_kind": 0.0, "blocking": 1.0,
                                    "novel_blocking": 0.0}
    seed = next(r for r in rows if r["prompt_id"] == "doc.S1")
    assert "原文：" in seed["prompt"] and seed["tags"][:3] == ["doc", "seed", "judgment"]
    assert cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL, "1": second})) == 0
    assert len(store.rows()) == 6, "grading again adds nothing"

    text = cli.summary(wired["flow"], out)
    assert "baseline: 2 episodes recorded, 2 scored, 0 truncated, 0 failed attempts" in text
    assert "role $1.00, judge $0.00" in text
    assert "caught           75.0%" in text and "over 2 cases, 4 observations" in text
    assert "out_of_kind       0.50  [no interval from one case]" in text
    assert "novel_blocking    1.00  [no interval from one case]" in text
    assert "noise floor on caught: about ±69% with 2 cases" in text


def test_a_failed_attempt_is_recorded_aside_and_run_again_on_resume(wired: dict[str, Any], tmp_path: Path) -> None:
    wired["modes"][:] = ["host-error", "ok"]
    assert run_cli(wired) == 0
    out, store = wired["out"], VariantStore(wired["out"], "baseline")
    errors = store.error_rows()
    assert [(e["episode"], e["rep"], e["failure_class"]) for e in errors] == [("doc", 0, "harness")]
    assert errors[0]["cost_usd"] == 0.5 and errors[0]["model"] == MODEL
    assert Path(errors[0]["evidence"]).is_dir() and ".failed-" in errors[0]["evidence"]
    assert not cli.episode_dir(out, "baseline", "doc", 0).exists()
    assert (cli.episode_dir(out, "baseline", "doc", 1) / "episode.json").is_file()
    assert run_cli(wired) == 0
    assert (cli.episode_dir(out, "baseline", "doc", 0) / "episode.json").is_file()
    assert len(store.error_rows()) == 1
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL, "1": GOOD_LABEL}))
    text = cli.summary(wired["flow"], out)
    assert "2 episodes recorded, 2 scored, 0 truncated, 1 failed attempts {'harness': 1} - role $1.50" in text


def test_a_grader_that_fails_scores_nothing(wired: dict[str, Any], tmp_path: Path) -> None:
    run_cli(wired, reps=1)
    out = wired["out"]
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": {"seeds": {}, "run": {}}}))
    store = VariantStore(out, "baseline")
    assert store.rows() == [] and [e["failure_class"] for e in store.error_rows()] == ["grader"]
    cli.grade(wired["flow"], variant="baseline", out=out, labels=labels(tmp_path, {"0": GOOD_LABEL}))
    assert len(store.rows()) == 3


def test_grading_with_the_judge_records_what_the_judge_cost(wired: dict[str, Any], tmp_path: Path,
                                                            monkeypatch: pytest.MonkeyPatch) -> None:
    run_cli(wired, reps=2)
    out = wired["out"]
    final = (cli.episode_dir(out, "baseline", "doc", 0) / "final.md").read_text(encoding="utf-8")
    good = {"findings": [finding("B-1", "blocking", "S1")], "targets": [
        {"id": "S1", "caught": True, "finding": "B-1", "quote": final.strip().splitlines()[0], "reason": ""},
        {"id": "S2", "caught": False, "finding": "", "quote": "", "reason": "没有提到附件"}]}
    fake_judge(tmp_path, monkeypatch, [good, "garbage", "garbage"])
    with pytest.raises(cli.Refused, match="exactly one"):
        cli.grade(wired["flow"], variant="baseline", out=out)
    cli.grade(wired["flow"], variant="baseline", out=out, judge_model="claude-judge-1", work=tmp_path)
    store = VariantStore(out, "baseline")
    run_row = next(r for r in store.rows() if r["meta"]["unit"] == "run")
    assert (run_row["judge_cost_usd"], run_row["judge_model"], run_row["judge_attempts"]) == (0.02, "claude-judge-1", 1)
    assert run_row["meta"]["grader"].startswith("judge:claude-judge-1@high")
    assert [e["failure_class"] for e in store.error_rows()] == ["grader"]
    assert "1 scored" in cli.summary(wired["flow"], out) and "role $1.00, judge $0.02" in cli.summary(wired["flow"], out)
    assert (cli.episode_dir(out, "baseline", "doc", 0) / "judge.attempt0.json").is_file()


def test_the_grading_sign_off_is_for_one_judge(wired: dict[str, Any], tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                               capsys: pytest.CaptureFixture[str]) -> None:
    signed = {"cases": {"version": 1}, "grading": {"version": 1, "judge": judge.identity("claude-judge-1", "high")}}
    root = str(rewrite(wired["repo"], signoffs=signed))
    monkeypatch.setattr(cli, "work_root", lambda _: tmp_path)
    args = ["grade", root, "--out", str(wired["out"]), "--variant", "baseline"]
    assert cli.main([*args, "--judge-model", "claude-judge-2"]) == 2
    assert cli.main([*args, "--judge-model", "claude-judge-1", "--judge-effort", "low"]) == 2
    assert "calibrate that judge" in capsys.readouterr().err
    (wired["out"] / "baseline" / "episodes").mkdir(parents=True)
    assert cli.main([*args, "--judge-model", "claude-judge-1"]) == 0, "签过的那个判官放行"


def test_a_truncated_run_is_counted_and_left_out_of_the_means(wired: dict[str, Any], tmp_path: Path) -> None:
    wired["modes"][:] = ["max-tokens", "ok"]
    run_cli(wired)
    cli.grade(wired["flow"], variant="baseline", out=wired["out"], labels=labels(tmp_path, {"0": GOOD_LABEL, "1": GOOD_LABEL}))
    rows = VariantStore(wired["out"], "baseline").rows()
    assert [r["grade"] for r in rows if r["rep"] == 0] == [{}, {}, {}]
    text = cli.summary(wired["flow"], wired["out"])
    assert "2 scored, 1 truncated" in text and "over 2 cases, 2 observations" in text


def test_a_changed_model_is_a_variant_of_its_own(wired: dict[str, Any]) -> None:
    wired["modes"][:] = ["ok"]
    with_other = run_cli(wired, variant="v1", reps=1, overrides={"model": "claude-fallback-9"})
    assert with_other == 0
    errors = VariantStore(wired["out"], "v1").error_rows()
    assert errors[0]["failure_class"] == "model-mismatch", "the host served another model than the variant asked for"


def test_an_earlier_recorded_run_is_taken_over_without_running_anything(wired: dict[str, Any], tmp_path: Path) -> None:
    old = tmp_path / "evidence-ok"
    run_fake(tmp_path, "ok")
    (old / "run.json").write_text(json.dumps({
        "model_id": MODEL, "effort": "xhigh", "wall_ms": 4200, "timed_out": False, "workspace_unchanged": True,
        "agents_definition_sha256": "abc"}), encoding="utf-8")
    material = wired["flow"].material("doc")
    cli.import_run(wired["flow"], variant="baseline", out=wired["out"], material=material, rep=0, source=old)
    record = json.loads((cli.episode_dir(wired["out"], "baseline", "doc", 0) / "episode.json").read_text("utf-8"))
    assert record["provenance"]["harness_commit"] == "imported" and record["provenance"]["agent_sha"] == "abc"
    assert (record["wall_seconds"], record["effort"]) == (4.2, "xhigh")
    with pytest.raises(cli.Refused, match="already recorded"):
        cli.import_run(wired["flow"], variant="baseline", out=wired["out"], material=material, rep=0, source=old)


def test_the_inputs_page_shows_every_case_in_full(wired: dict[str, Any]) -> None:
    text = cli.inputs(wired["flow"])
    assert "共 1 份材料、2 处应当被报出的问题" in text
    assert "评审 `{WORKDIR}/design/doc.md`。" in text and "附件：既说要又说不要。" in text
    assert "#### `doc.S1`" in text and "必须先读" in text and "可以不读" in text
    assert cli.fenced("a ``` b ````` c").startswith("``````\n")


def test_the_work_root_must_be_outside_any_checkout(repo: Path) -> None:
    with pytest.raises(cli.Refused, match="inside a git work tree"):
        cli.work_root(repo / "scratch")


def test_report_without_a_builder_points_at_the_summary(repo: Path, capsys: pytest.CaptureFixture[str],
                                                        monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cli, "BUILDER", repo / "no-such-builder.mjs")
    assert cli.main(["report", str(repo / "suites" / "tiny-review"), "--out", str(repo / "out")]) == 2
    assert "'summary' prints the same scores" in capsys.readouterr().err


@pytest.mark.skipif(shutil.which("node") is None, reason="报告页生成器要 node")
def test_the_builder_kept_in_the_repository_renders_a_graded_flow(wired: dict[str, Any], tmp_path: Path) -> None:
    out = wired["out"]
    assert run_cli(wired) == 0
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


SILENT = {"findings": [], "targets": [
    {"id": seed, "caught": False, "finding": "", "quote": "", "reason": "报告没有提到"} for seed in ("S1", "S2")]}


def test_calibration_compares_the_judge_with_a_person_problem_by_problem(
        repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    flow = calibration_set(repo, [
        calibration_case("real", "real.md", 1, 0, run={"blocking": [1, "B-1"], "out_of_kind": [0, "没有"]}),
        calibration_case("cut", "real.md", 0, 0),          # 人工说没报出，判官会说报出了
        calibration_case("silent", "silent.md", 0, 0),
    ], {"real.md": REPORT, "silent.md": "没有发现问题。"})
    fake_judge(tmp_path, monkeypatch, [raw_answer(), raw_answer(), SILENT])
    grader, cases = calibration.load(flow)
    results, left_out = calibration.run(flow, cases, model="claude-judge-1", effort="high", out=tmp_path / "out",
                                        work=tmp_path, budget_usd=5, call_budget_usd=1)
    assert left_out == [] and grader == "人工：测试"
    outcome = calibration.compare(cases, results)
    assert outcome["cells"] == {"both_caught": 1, "both_missed": 4, "judge_only": 1, "person_only": 0}
    assert [(item["case"], item["seed"]) for item in outcome["disagreements"]] == [("cut", "S1")]
    assert [(item["metric"], item["agree"]) for item in outcome["run_checks"]] == [("blocking", True),
                                                                                   ("out_of_kind", False)]
    assert outcome["cost_usd"] == pytest.approx(0.06) and outcome["attempts"] == 3
    text = calibration.render(flow, grader, cases, results, model="claude-judge-1", effort="high")
    assert "一致 5 / 6（83.3%）" in text and "`cut` 的 `S1`：人工判 0（人工的理由一）；判官判 1" in text


def test_calibration_stops_at_the_budget_and_resumes_without_paying_twice(
        repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    flow = calibration_set(repo, [calibration_case(name, "real.md", 1, 0) for name in ("a", "b", "c")],
                           {"real.md": REPORT})
    fake_judge(tmp_path, monkeypatch, [raw_answer()])
    _, cases = calibration.load(flow)
    settings = {"model": "claude-judge-1", "effort": "high", "out": tmp_path / "out", "work": tmp_path}
    # 每次调用 0.02：预算 0.05、单次上限 0.02 时，第三份开始前已记 0.04，再加一次就超
    results, left_out = calibration.run(flow, cases, budget_usd=0.05, call_budget_usd=0.02, **settings)
    assert sorted(results) == ["a", "b"] and left_out == ["c"]
    assert "还没判的" in calibration.render(flow, "人工", cases, results, model="claude-judge-1", effort="high")
    results, left_out = calibration.run(flow, cases, budget_usd=1, call_budget_usd=0.02, **settings)
    assert sorted(results) == ["a", "b", "c"] and left_out == []
    assert calibration.spent(results) == pytest.approx(0.06), "已判的不再调用"


def test_a_judge_answer_that_fails_its_checks_is_counted_and_still_billed(
        repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    flow = calibration_set(repo, [calibration_case("silent", "silent.md", 0, 0)], {"silent.md": "没有发现问题。"})
    fake_judge(tmp_path, monkeypatch, [raw_answer()])      # 引的句子不在这份报告里
    _, cases = calibration.load(flow)
    results, _ = calibration.run(flow, cases, model="claude-judge-1", effort="high", out=tmp_path / "out",
                                 work=tmp_path, budget_usd=5, call_budget_usd=1)
    outcome = calibration.compare(cases, results)
    assert outcome["judged"] == 0 and outcome["failed"][0]["case"] == "silent"
    assert outcome["cost_usd"] == pytest.approx(0.04) and outcome["attempts"] == 2


@pytest.mark.parametrize(("change", "message"), [
    (lambda case: case["seeds"].pop("S2"), "covers"),
    (lambda case: case.update(report="reports/missing.md"), "does not exist"),
    (lambda case: case.update(material="nope"), "no material"),
    (lambda case: case.update(run={"speed": [1, "x"]}), "unknown run metrics"),
    (lambda case: case["seeds"].update(S1=[2, "x"]), "0 or 1"),
    (lambda case: case.update(id="a/b"), "names a directory"),
])
def test_a_calibration_set_that_does_not_cover_its_material_does_not_load(repo: Path, change: Any, message: str) -> None:
    case = calibration_case("real", "real.md", 1, 0)
    change(case)
    with pytest.raises(suite.SuiteError, match=message):
        calibration_set(repo, [case], {"real.md": REPORT})
        calibration.load(suite.load(repo / "suites" / "tiny-review"))


def test_the_calibrate_command_writes_the_comparison_beside_the_results(
        wired: dict[str, Any], tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    calibration_set(wired["repo"], [calibration_case("real", "real.md", 1, 0)], {"real.md": REPORT})
    fake_judge(tmp_path, monkeypatch, [raw_answer()])
    monkeypatch.setattr(cli, "work_root", lambda _: tmp_path)   # make test 的临时目录在检出里，真的工作根不许在那
    root = str(wired["repo"] / "suites" / "tiny-review")
    assert cli.main(["calibrate", root, "--out", str(wired["out"]), "--judge-model", "claude-judge-1",
                     "--budget-usd", "1"]) == 0
    assert "一致 2 / 2（100.0%）" in capsys.readouterr().out
    written = list((wired["out"] / "_calibration").glob("*/calibration.md"))
    assert len(written) == 1 and "judge-claude-judge-1@high-rules-" in written[0].parent.name
    assert cli.main(["calibrate", root, "--out", str(wired["out"]), "--judge-model", "claude-judge-1",
                     "--budget-usd", "1", "--case", "nope"]) == 2


# --- 入库的常设用例集 ---------------------------------------------------------------------------------------

STANDING = sorted(path.parent for path in (EVALUATION / "suites").glob("*/flow.json"))


@pytest.mark.parametrize("root", STANDING, ids=lambda path: path.name)
def test_a_standing_suite_still_fits_the_repository(root: Path) -> None:
    """零花费的腐坏探测：钉的提交还够得着，每处种入在那个提交的材料里恰好出现一次。"""
    flow = suite.load(root)
    repo = META.parent
    for path in flow.workspace["subject_paths"]:
        assert (repo / path).exists(), f"{flow.id}: subject path {path} is gone"
    for material in flow.materials:
        base = flow.base(material)
        assert workspace.is_ancestor(repo, base), f"{flow.id}/{material.id}: base {base} is no longer an ancestor of HEAD"
        assert "{WORKDIR}" in material.brief.read_text(encoding="utf-8")
        assert f"本次判断：{flow.judgment}" in material.brief.read_text(encoding="utf-8")
        for op in material.ops():
            if op["op"] == "replace":
                text = workspace.git(repo, "show", f"{base}:{op['file']}")
                assert text.count(op["find"]) == 1, f"{flow.id}/{material.id}.{op.get('id')}: seed no longer lands once"
            elif op["op"] == "copy":
                assert (root / op["from"]).is_file()
        for seed in material.seeds:
            texts = [workspace.git(repo, "show", f"{base}:{path}") for path in seed.files]
            for fragment in seed.fragments():
                assert any(fragment in text for text in texts), (
                    f"{flow.id}/{material.id}.{seed.id}: the pinned material does not contain {fragment[:50]!r}")
    if (root / "calibration" / "cases.json").exists():
        # 校准集跟着用例走：种入清单变了而人工判定没跟上，这里会失败
        assert calibration.load(flow)[1], f"{flow.id}: the calibration set is empty"
