from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import pytest

TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

import design_review  # noqa: E402
from design_review import Config, ReportError, build_report, load_config, main  # noqa: E402
from fractions import Fraction  # noqa: E402

BASELINE = "test-baseline"
TOPIC = "PF-001-identity"
CONFIG = Config(Fraction("0.3"), 3)


def clauses(count: int, extra: str = "") -> str:
    """一份只有 S-1～S-count 的契约正文，extra 追加在最后。"""
    return "# 契约\n\n" + "".join(f"### S-{n} 条款{n}\n\n正文。\n\n" for n in range(1, count + 1)) + extra


def entry(contract_id: str, version: int = 1, *, status: str = "accepted", deps: list[tuple[str, int, list[str]]] = (),
          extra_resources: list[str] = ()) -> dict[str, Any]:
    family = {"data": "data", "capability": "capabilities", "composition": "compositions"}[contract_id.split(".")[0]]
    topic = contract_id.split(".", 1)[1]
    path = f"spec/{family}/{topic}/v{version}/contract.md"
    return {
        "coordinate": {"baseline_id": BASELINE, "contract_id": contract_id, "version": version},
        "family": family, "topic": topic, "status": status, "contract_path": path,
        "resources": [path, *extra_resources],
        "acceptance": None,
        "dependencies": [{"coordinate": {"baseline_id": BASELINE, "contract_id": cid, "version": v},
                          "clauses": list(cl), "rebase_relation": None} for cid, v, cl in deps],
    }


def build(tmp_path: Path, contracts: dict[str, tuple[dict[str, Any], str]], *, covers: list[dict[str, Any]] | None = None,
          frozen: list[str] = (), product_rev: int = 5, extra: dict[str, str] | None = None) -> Path:
    """在 tmp_path 下现造一棵设计树。contracts: 坐标标签 → (catalog 条目, 契约正文)。"""
    root = tmp_path / "design"
    files: dict[str, str] = {
        "registry/catalog.json": json.dumps({"format": 1, "baseline_id": BASELINE,
                                             "contracts": [item for item, _ in contracts.values()]},
                                            ensure_ascii=False, indent=2),
        "registry/frozen.json": json.dumps({"format": 1, "baseline_id": BASELINE,
                                            "files": {path: "0" * 64 for path in frozen}}, indent=2),
        f"product/{TOPIC}/README.md": f"---\nid: PF-001\nrevision: {product_rev}\n---\n# PF-001\n",
        f"product/{TOPIC}/design.md": "# PF-001\n\n## 账号\n\n## 6.4 隔离\n",
    }
    if covers is not None:
        files["registry/covers.json"] = json.dumps({"format": 1, "baseline_id": BASELINE, "covers": covers},
                                                   ensure_ascii=False, indent=2)
    for item, text in contracts.values():
        files[item["contract_path"]] = text
    files.update(extra or {})
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return root


def line_after(text: str) -> int:
    """text 之后追加的第一行的行号。"""
    return text.count("\n") + 1


def single(tmp_path: Path, text: str, contract_id: str = "data.example", **kwargs: Any) -> Path:
    return build(tmp_path, {f"{contract_id}/v1": (entry(contract_id, **kwargs), text)})


def report(root: Path, *, scope: list[str] = (), frozen: bool = False) -> dict[str, Any]:
    return build_report(root, list(scope), frozen, CONFIG)


def found(result: dict[str, Any], check: str, status: str = "finding") -> list[dict[str, Any]]:
    return [f for f in result["findings"] if f["check"] == check and f["status"] == status]


# ── bare-clause-ref ─────────────────────────────────────────────────────────
def test_bare_reference_to_a_clause_this_contract_lacks_is_reported(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(4, "见 S-7。\n"))
    [hit] = found(report(root), "bare-clause-ref")
    assert hit["line"] == line_after(clauses(4)) and "S-7" in hit["message"] and "S-1～S-4" in hit["message"]


@pytest.mark.parametrize("prose", [
    "按 `data.other/v1#S-7` 判。\n",                                   # 坐标
    "见 [S-7](../../other/v1/contract.md#s-7-x)。\n",                    # 指向别的文件的链接文字
    "见 [S-3](#s-3-条款3)。\n",                                          # 本契约有的条款
    "沿 `data.other/v1#S-7` 判；S-7 的结果不因此成立。\n",              # 同一句里已写出坐标
    "沿 `data.other/v1#S-7` 判，\n  S-7 的结果折到下一行仍是同一句。\n",  # 段落折行
    "| `data.other` v1 | `#S-7` |\n",                                   # 表格一行里写了契约
    "| `data.other` v1 | `#S-7` |\n| 同上 | `#S-8` |\n",                # 「同上」沿用上一行
    "跑[清除链（[`#S-7`](../../other/v1/contract.md#s-7)）](#s-2-条款2)。\n",  # 外层链接包着指向别处的内层链接
    "本批 other/v1 的 S-7 属于这种采用。\n",                            # topic 简写坐标
])
def test_qualified_or_local_references_are_not_reported(tmp_path: Path, prose: str) -> None:
    other = entry("data.other")
    root = build(tmp_path, {"data.example/v1": (entry("data.example"), clauses(4, prose)),
                            "data.other/v1": (other, clauses(9))})
    result = report(root, scope=["data.example/v1"])
    assert found(result, "bare-clause-ref") == [] and found(result, "bare-clause-ref", "undetermined") == []


def test_link_to_own_anchor_for_a_missing_clause_is_reported(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(4, "见 [S-9](#s-9-没有)。\n"))
    assert [f["line"] for f in found(report(root), "bare-clause-ref")] == [line_after(clauses(4))]


def test_explicit_this_contract_wins_over_another_contract_in_the_sentence(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(4, "依 `data.other/v1#S-2`，本契约 S-9 收口。\n"))
    assert "S-9" in found(report(root), "bare-clause-ref")[0]["message"]


def test_hash_shorthand_belongs_to_a_contract_named_earlier_in_the_paragraph_only(tmp_path: Path) -> None:
    earlier = "先按 `data.other/v1#S-2` 求。\n再读 `#S-8` 的时刻。\n"
    later = "再读 `#S-8` 的时刻。\n这与 `data.other/v1` 无关。\n"
    assert found(report(single(tmp_path / "a", clauses(4, earlier))), "bare-clause-ref") == []
    assert len(found(report(single(tmp_path / "b", clauses(4, later))), "bare-clause-ref")) == 1


def test_abbreviated_contract_names_are_undetermined_not_reported(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(4, "实际工作仍沿 EC S-34/S-59 收场。\n"))
    result = report(root)
    assert found(result, "bare-clause-ref") == []
    [hit] = found(result, "bare-clause-ref", "undetermined")
    assert "EC S-34" in hit["message"] and "EC S-59" in hit["message"]


def test_section_headed_by_another_contract_is_undetermined(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(4, "#### `data.other` v1 侧\n\n读 `#S-59` 的时刻。\n"))
    result = report(root)
    assert found(result, "bare-clause-ref") == []
    assert "data.other" in found(result, "bare-clause-ref", "undetermined")[0]["message"]


def test_references_in_code_blocks_are_undetermined(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(4, "```\n\\* 见 S-31\n```\n"))
    result = report(root)
    assert found(result, "bare-clause-ref") == [] and len(found(result, "bare-clause-ref", "undetermined")) == 1


def test_contract_without_clause_headings_is_undetermined(tmp_path: Path) -> None:
    root = single(tmp_path, "# 契约\n\n| 条款 | 内容 |\n|---|---|\n| S-1 | 一 |\n\n见 S-7。\n")
    result = report(root)
    assert found(result, "bare-clause-ref") == []
    assert "认不出" in found(result, "bare-clause-ref", "undetermined")[0]["message"]


# ── analysis-id-in-contract ─────────────────────────────────────────────────
def test_analysis_ids_in_prose_are_reported_and_in_code_blocks_undetermined(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(2, "满足 INV-3 与 LIV-1。\n\n```\n反例 SAF-2\n```\n"))
    result = report(root)
    [hit] = found(result, "analysis-id-in-contract")
    assert "INV-3" in hit["message"] and "LIV-1" in hit["message"]
    assert len(found(result, "analysis-id-in-contract", "undetermined")) == 1


def test_contract_without_analysis_ids_is_clean(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(2, "满足 S-1；状态 INVALID-3 不是编号。\n"))
    result = report(root)
    assert found(result, "analysis-id-in-contract") + found(result, "analysis-id-in-contract", "undetermined") == []


# ── stale-product-rev ───────────────────────────────────────────────────────
BASIS = ("- **产品依据**：[PF-001](../../../../product/PF-001-identity/README.md) rev {rev}"
         "（由 PF-001 rev 1 对到 rev {rev}）。\n\n")


def test_candidate_with_an_old_product_rev_is_reported(tmp_path: Path) -> None:
    root = single(tmp_path, BASIS.format(rev=3) + clauses(1), status="candidate")
    [hit] = found(report(root), "stale-product-rev")
    assert "PF-001 rev 3" in hit["message"] and "rev 5" in hit["message"] and hit["line"] == 1


def test_candidate_on_current_rev_and_parenthetical_history_are_not_reported(tmp_path: Path) -> None:
    root = single(tmp_path, BASIS.format(rev=5) + clauses(1), status="candidate")
    assert found(report(root), "stale-product-rev") == []


def test_accepted_contract_is_only_checked_with_include_frozen(tmp_path: Path) -> None:
    path = "spec/data/example/v1/contract.md"
    root = build(tmp_path, {"data.example/v1": (entry("data.example"), BASIS.format(rev=3) + clauses(1))},
                 frozen=[path])
    assert found(report(root), "stale-product-rev") == []
    [hit] = found(report(root, frozen=True), "stale-product-rev")
    assert "已冻结，不能原地改" in hit["message"]


def test_contract_without_product_basis_is_undetermined(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(1), status="candidate")
    result = report(root)
    assert found(result, "stale-product-rev") == []
    assert len(found(result, "stale-product-rev", "undetermined")) == 1


# ── dependency-clause-missing ───────────────────────────────────────────────
def dependency_tree(tmp_path: Path, consumed: list[str]) -> Path:
    return build(tmp_path, {
        "data.target/v1": (entry("data.target"), clauses(4)),
        "data.user/v1": (entry("data.user", deps=[("data.target", 1, consumed)]), clauses(1)),
        "data.bystander/v1": (entry("data.bystander"), clauses(1)),
    })


def test_dependency_consuming_a_missing_clause_is_reported_at_its_line(tmp_path: Path) -> None:
    root = dependency_tree(tmp_path, ["S-2", "S-5"])
    [hit] = found(report(root), "dependency-clause-missing")
    assert hit["coordinate"] == "data.user/v1" and "S-5" in hit["message"]
    catalog_lines = (root / "registry/catalog.json").read_text(encoding="utf-8").splitlines()
    assert catalog_lines[hit["line"] - 1].strip() == '"S-5"'


def test_dependency_on_existing_clauses_and_out_of_scope_entries_are_not_reported(tmp_path: Path) -> None:
    assert found(report(dependency_tree(tmp_path / "a", ["S-2", "S-4"])), "dependency-clause-missing") == []
    root = dependency_tree(tmp_path / "b", ["S-5"])
    assert found(report(root, scope=["data.bystander/v1"]), "dependency-clause-missing") == []
    assert len(found(report(root, scope=["data.target/v1"]), "dependency-clause-missing")) == 1


# ── covers-target-missing ───────────────────────────────────────────────────
def cover(clause: str, targets: list[str], contract_id: str = "data.example") -> dict[str, Any]:
    return {"requirement": {"topic": TOPIC, "clause": clause},
            "target": {"contract_id": contract_id, "version": 1, "clauses": targets}, "reviewed": False}


def test_cover_pointing_at_missing_clause_or_section_is_reported(tmp_path: Path) -> None:
    root = build(tmp_path, {"data.example/v1": (entry("data.example"), clauses(4))},
                 covers=[cover("design.md#账号", ["S-40"]), cover("design.md#不存在的小节", ["S-1"]),
                         cover("flows.md#账号", ["S-2"])])
    messages = [f["message"] for f in found(report(root), "covers-target-missing")]
    assert len(messages) == 3
    assert "S-40" in messages[0] and "不存在的小节" in messages[1] and "文件不存在" in messages[2]


def test_cover_on_a_coordinate_missing_from_catalog_is_reported_in_a_full_run(tmp_path: Path) -> None:
    root = build(tmp_path, {"data.example/v1": (entry("data.example"), clauses(4))},
                 covers=[cover("design.md#账号", ["S-1"], "data.gone")])
    [hit] = found(report(root), "covers-target-missing")
    assert hit["coordinate"] == "data.gone/v1" and "不在 catalog" in hit["message"]
    assert found(report(root, scope=["data.example/v1"]), "covers-target-missing") == []


def test_cover_on_existing_clause_and_section_is_not_reported(tmp_path: Path) -> None:
    root = build(tmp_path, {"data.example/v1": (entry("data.example"), clauses(4))},
                 covers=[cover("design.md#64-隔离", ["S-1", "S-4"]), cover("design.md#账号", [])])
    assert found(report(root), "covers-target-missing") == []


# ── unregistered-file ───────────────────────────────────────────────────────
def test_file_in_version_directory_outside_resources_is_reported(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(1), extra_resources=["spec/data/example/v1/formal/M.tla"])
    (root / "spec/data/example/v1/formal").mkdir(parents=True)
    (root / "spec/data/example/v1/formal/M.tla").write_text("---- MODULE M ----\n====\n", encoding="utf-8")
    assert found(report(root), "unregistered-file") == []
    (root / "spec/data/example/v1/formal/tlc.out").write_text("Model checking completed.\n", encoding="utf-8")
    [hit] = found(report(root), "unregistered-file")
    assert "formal/tlc.out" in hit["message"]


# ── nine-items / open-failure-set ───────────────────────────────────────────
DEFINITION = ("### S-1 这一节每个操作写全九件事\n\n| # | 写什么 |\n|---|---|\n"
              + "".join(f"| {m} | {w} |\n" for m, w in zip("①②③④⑤⑥⑦⑧⑨", (
                  "输入", "前置", "结构性禁止", "提交点", "成功返回", "失败集合（闭合）", "幂等", "缺席", "事件"))) + "\n")


def operation(name: str, failure: str = "`invalidInput` · `unavailable`", drop: str = "", blank: str = "",
              event: str = "不发") -> str:
    cells = dict(zip("①②③④⑤⑥⑦⑧⑨", ("`session`", "无", "无", "只读", "一组", failure, "可重复", "`unavailable`", event)))
    rows = "".join(f"| {m} | {'' if m == blank else c} |\n" for m, c in cells.items() if m != drop)
    return f"### {name}\n\n| # | 内容 |\n|---|---|\n{rows}\n"


def capability(tmp_path: Path, body: str) -> dict[str, Any]:
    return report(single(tmp_path, "# 契约\n\n" + DEFINITION + body, contract_id="capability.example"))


def test_operation_table_missing_or_blank_row_is_reported(tmp_path: Path) -> None:
    result = capability(tmp_path, operation("S-2 read", drop="⑧") + operation("S-3 write", blank="④"))
    messages = [f["message"] for f in found(result, "nine-items")]
    assert len(messages) == 2 and "缺 ⑧ 行" in messages[0] and "④ 为空" in messages[1]


def test_complete_operation_tables_with_none_and_no_events_pass(tmp_path: Path) -> None:
    result = capability(tmp_path, operation("S-2 read", event="**不发。**") + operation("S-3 write"))
    assert found(result, "nine-items") == [] and found(result, "nine-items", "undetermined") == []


def test_capability_without_definition_table_is_undetermined(tmp_path: Path) -> None:
    result = report(single(tmp_path, clauses(1) + operation("S-2 read"), contract_id="capability.example"))
    assert found(result, "nine-items") == []
    assert "没有「# | 写什么」" in found(result, "nine-items", "undetermined")[0]["message"]


def test_irregular_nine_item_table_is_undetermined(tmp_path: Path) -> None:
    wide = "| # | openCall | dispatch |\n|---|---|---|\n" + "".join(f"| {m} | 甲 | 乙 |\n" for m in "①②③④⑤⑥⑦⑧⑨")
    result = capability(tmp_path, "### S-2 增量\n\n" + wide)
    assert "不是「# | 内容」两列格式" in found(result, "nine-items", "undetermined")[0]["message"]


def test_data_contracts_are_not_judged_for_nine_items(tmp_path: Path) -> None:
    result = report(single(tmp_path, clauses(1)))
    assert [f for f in result["findings"] if f["check"] in ("nine-items", "open-failure-set")] == []


@pytest.mark.parametrize("failure, expected", [
    ("`invalidInput` · 其他错误", "其他错误"),
    ("`invalidInput`、`unavailable` 等", "等"),
    ("`invalidInput` · `unavailable` · etc.", "etc."),
])
def test_open_ended_failure_set_is_reported(tmp_path: Path, failure: str, expected: str) -> None:
    [hit] = found(capability(tmp_path, operation("S-2 read", failure=failure)), "open-failure-set")
    assert f"「{expected}」" in hit["message"]


@pytest.mark.parametrize("failure", [
    "`invalidInput` · `unavailable`。**没有「其他」**：那不是一种失败",
    "`invalidInput` · `unavailable`。列举到此为止，不留 etc",
    "`invalidInput` · `notEqual`（逐字相等才算）",
])
def test_closed_failure_set_with_negation_or_ordinary_words_is_not_reported(tmp_path: Path, failure: str) -> None:
    result = capability(tmp_path, operation("S-2 read", failure=failure))
    assert found(result, "open-failure-set") == [] and found(result, "open-failure-set", "undetermined") == []


def test_failure_set_ending_in_a_qualified_other_is_undetermined(tmp_path: Path) -> None:
    result = capability(tmp_path, operation("S-2 read", failure="`wrongPhase`；其他沿原失败集合"))
    assert found(result, "open-failure-set") == []
    assert len(found(result, "open-failure-set", "undetermined")) == 1


# ── 依赖图 ──────────────────────────────────────────────────────────────────
def graph_of(tmp_path: Path, edges: dict[str, list[str]], config: Config = CONFIG) -> dict[str, Any]:
    contracts = {f"data.{name}/v1": (entry(f"data.{name}", deps=[(f"data.{t}", 1, ["S-1"]) for t in targets]), clauses(1))
                 for name, targets in edges.items()}
    return build_report(build(tmp_path, contracts), [], False, config)["graph"]


def test_cycles_and_self_loops_are_reported(tmp_path: Path) -> None:
    graph = graph_of(tmp_path, {"a": ["b"], "b": ["c"], "c": ["a"], "d": ["d"], "e": ["a"]})
    assert graph["cycles"] == [["data.a/v1", "data.b/v1", "data.c/v1"], ["data.d/v1"]]


def test_acyclic_graph_has_no_cycles(tmp_path: Path) -> None:
    assert graph_of(tmp_path, {"a": ["b", "c"], "b": ["c"], "c": []})["cycles"] == []


def test_stable_depending_on_unstable_above_margin_is_listed(tmp_path: Path) -> None:
    # a: 入 3、出 1 → I=0.25；b: 入 1、出 3 → I=0.75；差 0.5 > 0.3
    edges = {"a": ["b"], "x": ["a"], "y": ["a"], "z": ["a"], "b": ["p", "q", "r"], "p": [], "q": [], "r": []}
    unstable = graph_of(tmp_path, edges)["unstable_dependencies"]
    assert unstable == [{"from": "data.a/v1", "to": "data.b/v1", "from_instability": 0.25, "to_instability": 0.75}]


def test_difference_equal_to_margin_is_not_listed(tmp_path: Path) -> None:
    # 同上，差恰为 0.5：阈值 0.5 时不列
    edges = {"a": ["b"], "x": ["a"], "y": ["a"], "z": ["a"], "b": ["p", "q", "r"], "p": [], "q": [], "r": []}
    assert graph_of(tmp_path, edges, Config(Fraction("0.5"), 3))["unstable_dependencies"] == []


def test_fan_lists_top_n_by_in_plus_out(tmp_path: Path) -> None:
    edges = {"hub": ["a", "b"], "a": ["c"], "b": ["c"], "c": [], "d": ["hub"], "lonely": []}
    fan = graph_of(tmp_path, edges)["fan"]
    assert [(f["coordinate"], f["in"], f["out"]) for f in fan] == [
        ("data.hub/v1", 1, 2), ("data.a/v1", 1, 1), ("data.b/v1", 1, 1)]
    assert fan[0]["instability"] == round(2 / 3, 4)


# ── 配置 ────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text, fragment", [
    (None, "不存在"),
    ("{", "不是合法 JSON"),
    ('{"unstableDependencyMargin": 0.3}', "键必须恰为"),
    ('{"unstableDependencyMargin": 1.5, "fanTop": 3}', "unstableDependencyMargin"),
    ('{"unstableDependencyMargin": true, "fanTop": 3}', "unstableDependencyMargin"),
    ('{"unstableDependencyMargin": 0.3, "fanTop": 0}', "fanTop"),
])
def test_unreadable_or_invalid_config_is_an_explicit_error(tmp_path: Path, text: str | None, fragment: str) -> None:
    path = tmp_path / "config.json"
    if text is not None:
        path.write_text(text, encoding="utf-8")
    with pytest.raises(ReportError, match=fragment):
        load_config(path)


def test_shipped_config_is_valid() -> None:
    config = load_config(design_review.CONFIG_PATH)
    assert config.fan_top >= 1 and 0 <= config.unstable_dependency_margin < 1


# ── 命令行与只读 ────────────────────────────────────────────────────────────
def config_file(tmp_path: Path) -> Path:
    path = tmp_path / "config.json"
    path.write_text('{"unstableDependencyMargin": 0.3, "fanTop": 2}', encoding="utf-8")
    return path


def test_text_report_has_four_sections_in_order_and_exits_zero_with_findings(tmp_path: Path, capsys) -> None:
    root = single(tmp_path, clauses(4, "见 S-7。\n"))
    assert main(["--root", str(root)], config_path=config_file(tmp_path)) == 0
    out = capsys.readouterr().out
    titles = [line for line in out.splitlines() if line.startswith("## ")]
    assert titles[0] == "## 成立的问题（1）" and [t.split("（")[0] for t in titles] == [
        "## 成立的问题", "## 未能判定", "## 依赖图", "## 未覆盖"]
    assert f"[bare-clause-ref] spec/data/example/v1/contract.md:{line_after(clauses(4))}  data.example/v1  引了 S-7" in out


def test_json_report_has_the_agreed_shape(tmp_path: Path, capsys) -> None:
    root = single(tmp_path, clauses(4, "见 S-7。\n"))
    assert main(["--root", str(root), "--format", "json"], config_path=config_file(tmp_path)) == 0
    data = json.loads(capsys.readouterr().out)
    assert list(data) == ["scope", "findings", "graph", "not_covered"]
    assert set(data["findings"][0]) == {"check", "status", "coordinate", "path", "line", "message"}
    assert set(data["graph"]) == {"cycles", "unstable_dependencies", "fan"}
    assert "同名不同义" in data["not_covered"]


def test_unknown_contract_is_a_usage_error_and_bad_config_exits_nonzero(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(1))
    with pytest.raises(SystemExit) as raised:
        main(["--root", str(root), "--contract", "data.nope/v1"], config_path=config_file(tmp_path))
    assert raised.value.code == 2
    assert main(["--root", str(root)], config_path=tmp_path / "missing.json") == 1


def test_unreadable_catalog_exits_nonzero(tmp_path: Path) -> None:
    root = single(tmp_path, clauses(1))
    (root / "registry/catalog.json").write_text("{", encoding="utf-8")
    assert main(["--root", str(root)], config_path=config_file(tmp_path)) == 1


def snapshot(root: Path) -> dict[str, str]:
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob("*")) if p.is_file()}


def test_report_leaves_the_design_tree_untouched(tmp_path: Path, capsys) -> None:
    text = DEFINITION + operation("S-2 read", failure="`a` · 其他错误") + "见 S-77。满足 INV-1。\n"
    root = build(tmp_path, {
        "capability.example/v1": (entry("capability.example", status="candidate",
                                        deps=[("data.target", 1, ["S-9"])]), BASIS.format(rev=3) + "# 契约\n\n" + text),
        "data.target/v1": (entry("data.target", deps=[("capability.example", 1, ["S-1"])]), clauses(2)),
    }, covers=[cover("design.md#不存在", ["S-40"], "capability.example")],
        extra={"spec/data/target/v1/stray.out": "x"})
    config = config_file(tmp_path)
    before = snapshot(root)
    for arguments in ([], ["--format", "json"], ["--include-frozen"]):
        assert main(["--root", str(root), *arguments], config_path=config) == 0
    output = capsys.readouterr().out
    assert "[open-failure-set]" in output and "[covers-target-missing]" in output  # 确实走到了各项核对
    assert snapshot(root) == before
