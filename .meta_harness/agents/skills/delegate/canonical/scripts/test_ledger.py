"""Behavioral checks for the dispatch ledger tool (check, aggregate, apply).

Spec: W7 ID-7 and test decision T-L (L1-L15). Inputs are written to tmp_path;
no test reads or writes the real ledger.
"""
import copy
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name("ledger.py")
spec = importlib.util.spec_from_file_location("ledger", SCRIPT)
ledger = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ledger)

REAL_POLICY = Path(__file__).resolve().parents[4] / "roles" / "dispatch-policy.json"
SCHEMA = Path(__file__).resolve().parents[5] / "agents" / "evaluation" / "dispatch-ledger" / "ledger.schema.json"

POLICY = {
    "version": "947.1",
    "roles": {
        "developer": {
            "work": {"product": "default", "verification": "economical", "kernel": "top"},
            "top_risks": ["security-sensitive", "subtle-algorithm"],
            "hardest_risks": ["subtle-algorithm"],
        },
        "design-reviewer": {"work": {"choice": "source"}},
    },
}

URL = "https://github.com/PanQiWei/omne-harness-lite/issues/960#issuecomment-{}"


@pytest.fixture
def policy_file(tmp_path):
    p = tmp_path / "policy.json"
    p.write_text(json.dumps(POLICY), encoding="utf-8")
    return p


def flow(closure="c1", round=1, defects=(), **over):
    row = {
        "ts": "2026-10-30T10:00:00Z",
        "task": "#960",
        "closure": closure,
        "round": round,
        "role": "developer",
        "work": "verification",
        "risk": "none",
        "clarity": "定",
        "model": "claude-sonnet-5-5",
        "effort": "high",
        "host": "claude-code 2.1",
        "policy_version": "947.1",
        "role_source_tree": "a" * 40,
        "minutes": 10.0,
        "tokens_reported": 1000,
        "tool_calls": 20,
        "usage_source": "notification",
        "appends": 0,
        "acceptance": {
            "report": URL.format(f"{closure}-{round}".replace("c", "").replace("-", "") or "1"),
            "verdict": "Pass",
            "defects": [dict(d) for d in defects],
        },
        "escalation": None,
        "outcome": "merged",
        "experiment": None,
    }
    row.update(over)
    return row


def defect(id, owner="writer", blocking=True, cls="logic"):
    return {"id": id, "owner": owner, "blocking": blocking, "class": cls}


def escalation(to_model="claude-fable-5-1", to_effort="high", mode="takeover"):
    return {"to_model": to_model, "to_effort": to_effort, "mode": mode, "reason": "两轮写者阻断", "trigger_report": URL.format(9)}


def write_flows(tmp_path, rows, name="flow.jsonl"):
    p = tmp_path / name
    p.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    return p


def run(capsys, *argv):
    code = ledger.main([str(a) for a in argv])
    out = capsys.readouterr()
    return code, out.out, out.err


def aggregate(capsys, tmp_path, policy_file, rows, batch="2026-10-30-w7-main", out_name="inc.json"):
    flows = write_flows(tmp_path, rows)
    out = tmp_path / out_name
    code, stdout, stderr = run(capsys, "aggregate", "--flows", flows, "--batch", batch, "--out", out, "--policy", policy_file)
    return code, (json.loads(out.read_text(encoding="utf-8")) if out.exists() else None), stderr


def cell_of(inc, role="developer", work="verification", risk="none", clarity="定", model="claude-sonnet-5-5", effort="high", source="field"):
    for row in inc["rows"]:
        if row["category"] == {"role": role, "work": work, "risk": risk, "clarity": clarity}:
            for cell in row["cells"]:
                if (cell["model"], cell["effort"], cell["source"]) == (model, effort, source):
                    return cell
    raise AssertionError(f"no cell for {role}/{work}/{risk}/{clarity} {model}@{effort} {source}")


def empty_ledger():
    return {"schemaVersion": 1, "rows": [], "batches": []}


def write_json(path, doc):
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


# L1 --------------------------------------------------------------------

def test_two_closures_same_category_make_one_row_and_input_order_does_not_matter(capsys, tmp_path, policy_file):
    rows = [
        flow("c1"),
        flow("c2"),
        flow("c3", model="claude-opus-5-5", work="product"),
        flow("c4", clarity="界"),
        flow("c5", effort="medium", model="claude-opus-5-5"),
    ]
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    assert code == 0
    assert cell_of(inc)["dispatched"] == 2
    assert len(inc["rows"]) == 3

    first = (tmp_path / "inc.json").read_bytes()
    for shuffled in (list(reversed(rows)), [rows[3], rows[0], rows[4], rows[2], rows[1]]):
        code, _, _ = aggregate(capsys, tmp_path, policy_file, shuffled, out_name="inc2.json")
        assert code == 0
        assert (tmp_path / "inc2.json").read_bytes() == first


def test_output_is_sorted_two_space_indented_lf_and_passes_check(capsys, tmp_path, policy_file):
    _, _, _ = aggregate(capsys, tmp_path, policy_file, [flow("c1")])
    raw = (tmp_path / "inc.json").read_bytes()
    assert raw.endswith(b"}\n") and b"\r" not in raw
    assert raw.decode("utf-8").splitlines()[1].startswith('  "')
    doc = json.loads(raw)
    assert list(doc) == sorted(doc)
    code, _, _ = run(capsys, "check", "--ledger", tmp_path / "inc.json", "--policy", policy_file)
    assert code == 0


# L2, L3 ----------------------------------------------------------------

def test_spec_owned_block_in_round_one_is_not_a_writer_failure(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1", owner="spec")]),
        flow("c1", 2),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    assert (cell["first_pass"], cell["first_no_writer_block"]) == (0, 1)
    assert cell["spec_defects"] == 1
    assert cell["writer_defects"] == {"blocking": 0, "nonblocking": 0}


def test_writer_defects_are_deduplicated_by_id_and_split_by_blocking(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1"), defect("D2", blocking=False), defect("E1", owner="env")]),
        flow("c1", 2, [defect("D1")]),
        flow("c1", 3),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    assert cell["writer_defects"] == {"blocking": 1, "nonblocking": 1}
    assert cell["first_no_writer_block"] == 0
    assert cell["spec_defects"] == 0


def test_pass_in_round_two_counts_within_two_but_not_first_pass(capsys, tmp_path, policy_file):
    rows = [flow("c1", 1, [defect("D1")]), flow("c1", 2)]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    assert (cell["within_two"], cell["first_pass"], cell["escalated"]) == (1, 0, 0)


def test_first_round_pass_and_nonblocking_defects_still_pass(capsys, tmp_path, policy_file):
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, [flow("c1", 1, [defect("D1", blocking=False)])])
    cell = cell_of(inc)
    assert (cell["first_pass"], cell["first_no_writer_block"], cell["within_two"]) == (1, 1, 1)


# L4, L5 ----------------------------------------------------------------

def test_takeover_in_round_three_is_counted_apart_from_the_starting_cell(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1")], minutes=10.0, tokens_reported=100, appends=1),
        flow("c1", 2, [defect("D1")], minutes=20.0, tokens_reported=200, appends=2),
        flow("c1", 3, model="claude-fable-5-1", minutes=7.5, tokens_reported=50, escalation=escalation()),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    assert cell["dispatched"] == 1
    assert (cell["escalated"], cell["within_two"], cell["first_pass"]) == (1, 0, 0)
    assert len(cell["escalations"]) == 1
    item = cell["escalations"][0]
    assert {k: item[k] for k in ("to", "mode", "n", "success")} == {"to": "claude-fable-5-1@high", "mode": "takeover", "n": 1, "success": 1}
    assert (item["minutes_sum"], item["tokens_reported_sum"]) == (7.5, 50)
    assert (cell["minutes_sum"], cell["tokens_reported_sum"]) == (30.0, 300)
    assert cell["appends"] == 3
    assert not any(c["model"] == "claude-fable-5-1" for r in inc["rows"] for c in r["cells"])


def test_escalated_closure_is_not_within_two_even_if_it_passes_in_round_two(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1")]),
        flow("c1", 2, model="claude-fable-5-1", escalation=escalation(mode="redo")),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    assert (cell["within_two"], cell["escalated"]) == (0, 1)


def test_escalation_success_needs_a_merged_outcome(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1")]),
        flow("c1", 2, [defect("D1")]),
        flow("c1", 3, [defect("D1")], model="claude-fable-5-1", escalation=escalation(), outcome="stopped"),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    item = cell_of(inc)["escalations"][0]
    assert (item["n"], item["success"]) == (1, 0)


def test_redo_and_takeover_to_the_same_model_are_separate_items(capsys, tmp_path, policy_file):
    def closure(name, mode):
        return [flow(name, 1, [defect("D1")]), flow(name, 2, model="claude-fable-5-1", escalation=escalation(mode=mode))]

    rows = closure("c1", "redo") + closure("c2", "takeover") + closure("c3", "redo")
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    items = {(i["to"], i["mode"]): (i["n"], i["success"]) for i in cell_of(inc)["escalations"]}
    assert items == {("claude-fable-5-1@high", "redo"): (2, 2), ("claude-fable-5-1@high", "takeover"): (1, 1)}


def test_a_closure_started_on_another_model_goes_to_its_own_cell(capsys, tmp_path, policy_file):
    rows = [flow("c1"), flow("c2", model="claude-opus-5-5", effort="medium")]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    assert cell_of(inc)["dispatched"] == 1
    assert cell_of(inc, model="claude-opus-5-5", effort="medium")["dispatched"] == 1


# L6 --------------------------------------------------------------------

@pytest.mark.parametrize("report", ["tmp/issue-960/review.md", "https://example.org/x#issuecomment-1", "https://github.com/a/b/issues/1", ""])
def test_a_report_that_is_not_a_durable_url_excludes_the_closure(capsys, tmp_path, policy_file, report):
    bad = flow("c1")
    bad["acceptance"]["report"] = report
    rows = [bad, flow("c2")]
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    assert code == 0
    assert cell_of(inc)["dispatched"] == 1
    assert len(inc["excluded"]) == 1
    excluded = inc["excluded"][0]
    assert (excluded["task"], excluded["closure"], excluded["round"]) == ("#960", "c1", 1)
    assert "URL" in excluded["reason"]


def test_one_bad_report_excludes_every_round_of_that_closure(capsys, tmp_path, policy_file):
    late = flow("c1", 2)
    late["acceptance"]["report"] = "tmp/report.md"
    rows = [flow("c1", 1, [defect("D1")]), late]
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    assert code == 0
    assert inc["rows"] == []
    assert [e["round"] for e in inc["excluded"]] == [1, 2]
    assert all(e["reason"] for e in inc["excluded"])


@pytest.mark.parametrize("path", ["issues/960#issuecomment-123", "pull/12#pullrequestreview-456", "pull/12#discussion_r789"])
def test_github_comment_and_review_urls_are_durable(capsys, tmp_path, policy_file, path):
    row = flow("c1")
    row["acceptance"]["report"] = f"https://github.com/PanQiWei/omne-harness-lite/{path}"
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, [row])
    assert code == 0 and inc["excluded"] == []
    assert cell_of(inc)["dispatched"] == 1


# L7 --------------------------------------------------------------------

def test_owner_experiment_flows_get_their_own_cell(capsys, tmp_path, policy_file):
    rows = [flow("c1"), flow("c2", experiment="owner-experiment")]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    assert cell_of(inc, source="field")["dispatched"] == 1
    assert cell_of(inc, source="owner-experiment")["dispatched"] == 1


# L8 --------------------------------------------------------------------

def _drop(key):
    def edit(r):
        del r[key]
    return edit


def _set(key, value):
    def edit(r):
        r[key] = value
    return edit


@pytest.mark.parametrize(
    "edit",
    [
        _drop("model"),
        _drop("acceptance"),
        _set("clarity", "难"),
        _set("role", "wizard"),
        _set("work", "kernelish"),
        _set("risk", "vibes"),
        _set("round", 0),
        _set("outcome", "done"),
        _set("usage_source", "guess"),
        _set("role_source_tree", "abc"),
        _set("ts", "yesterday"),
        _set("escalation", {"to_model": "m"}),
    ],
    ids=["no-model", "no-acceptance", "clarity", "role", "work", "risk", "round", "outcome", "usage", "tree", "ts", "escalation"],
)
def test_check_flows_reports_each_problem_with_file_and_line(capsys, tmp_path, policy_file, edit):
    bad = flow("c2")
    edit(bad)
    path = write_flows(tmp_path, [flow("c1"), bad])
    code, out, err = run(capsys, "check", "--flows", path, "--policy", policy_file)
    assert code == 1
    assert f"{path}:2" in err + out
    assert f"{path}:1:" not in err + out


def test_check_flows_accepts_a_clean_file_and_a_second_valid_role(capsys, tmp_path, policy_file):
    rows = [flow("c1"), flow("c2", role="design-reviewer", work="choice", risk="none"), flow("c3", risk="subtle-algorithm")]
    code, _, _ = run(capsys, "check", "--flows", write_flows(tmp_path, rows), "--policy", policy_file)
    assert code == 0


def test_a_role_without_top_risks_only_takes_none(capsys, tmp_path, policy_file):
    row = flow("c1", role="design-reviewer", work="choice", risk="security-sensitive")
    code, _, err = run(capsys, "check", "--flows", write_flows(tmp_path, [row]), "--policy", policy_file)
    assert code == 1 and "risk" in err


def test_flow_lines_must_be_json_objects_and_blank_lines_are_ignored(capsys, tmp_path, policy_file):
    path = tmp_path / "flow.jsonl"
    path.write_text(json.dumps(flow("c1")) + "\n\n{not json}\n", encoding="utf-8")
    code, _, err = run(capsys, "check", "--flows", path, "--policy", policy_file)
    assert code == 1 and f"{path}:3" in err


def test_rounds_must_start_at_one_and_not_repeat(capsys, tmp_path, policy_file):
    for rows, line in (([flow("c1", 2)], 1), ([flow("c1", 1), flow("c1", 1)], 2), ([flow("c1", 1), flow("c1", 3)], 2)):
        path = write_flows(tmp_path, rows)
        code, _, err = run(capsys, "check", "--flows", path, "--policy", policy_file)
        assert code == 1, rows
        assert f"{path}:{line}" in err


def test_same_closure_name_in_two_tasks_is_not_a_repeat(capsys, tmp_path, policy_file):
    rows = [flow("c1"), flow("c1", task="#961")]
    code, _, _ = run(capsys, "check", "--flows", write_flows(tmp_path, rows), "--policy", policy_file)
    assert code == 0


def test_aggregate_refuses_to_write_when_flows_have_errors(capsys, tmp_path, policy_file):
    bad = flow("c1", clarity="难")
    code, inc, err = aggregate(capsys, tmp_path, policy_file, [bad])
    assert code == 1 and inc is None and "flow.jsonl:1" in err


# L9 --------------------------------------------------------------------

@pytest.mark.parametrize("pseudo", ["docs", "read-only"])
def test_pseudo_roles_take_none_and_skip_the_policy_vocabulary(capsys, tmp_path, policy_file, pseudo):
    row = flow("c1", role=pseudo, work="none", risk="none", role_source_tree=None)
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, [row])
    assert code == 0
    assert inc["rows"][0]["policy_scope"] == "none"
    assert inc["rows"][0]["category"]["role"] == pseudo


@pytest.mark.parametrize("edit", [_set("work", "verification"), _set("risk", "subtle-algorithm"), _set("role_source_tree", "a" * 40)])
def test_pseudo_roles_reject_policy_values_and_a_tree_hash(capsys, tmp_path, policy_file, edit):
    row = flow("c1", role="docs", work="none", risk="none", role_source_tree=None)
    edit(row)
    code, _, _ = run(capsys, "check", "--flows", write_flows(tmp_path, [row]), "--policy", policy_file)
    assert code == 1


def test_a_real_role_cannot_take_work_none_or_a_missing_tree(capsys, tmp_path, policy_file):
    for edit in (_set("work", "none"), _set("role_source_tree", None)):
        row = flow("c1")
        edit(row)
        code, _, _ = run(capsys, "check", "--flows", write_flows(tmp_path, [row]), "--policy", policy_file)
        assert code == 1


def test_policy_scope_of_a_real_role_names_the_role(capsys, tmp_path, policy_file):
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, [flow("c1")])
    assert inc["rows"][0]["policy_scope"] == "developer.work"


def test_default_policy_path_is_the_repo_relative_one(capsys, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    code, _, err = run(capsys, "check", "--flows", write_flows(tmp_path, [flow("c1")]))
    assert code == 2 and "dispatch-policy.json" in err


def test_real_policy_accepts_a_developer_verification_flow(capsys, tmp_path):
    code, _, err = run(capsys, "check", "--flows", write_flows(tmp_path, [flow("c1")]), "--policy", REAL_POLICY)
    assert code == 0, err


# L10 -------------------------------------------------------------------

def ledger_from(tmp_path, capsys, policy_file, rows):
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, rows, out_name="seed.json")
    assert code == 0
    return inc


def test_check_ledger_accepts_an_aggregate_output_and_an_empty_ledger(capsys, tmp_path, policy_file):
    inc = ledger_from(tmp_path, capsys, policy_file, [flow("c1")])
    ledg = write_json(tmp_path / "ledger.json", {"schemaVersion": 1, "rows": inc["rows"], "batches": ["2026-10-30-w7-main"]})
    assert run(capsys, "check", "--ledger", ledg, "--policy", policy_file)[0] == 0
    assert run(capsys, "check", "--ledger", write_json(tmp_path / "e.json", empty_ledger()), "--policy", policy_file)[0] == 0


def test_check_ledger_rejects_duplicate_rows_cells_and_batches(capsys, tmp_path, policy_file):
    inc = ledger_from(tmp_path, capsys, policy_file, [flow("c1")])
    base = {"schemaVersion": 1, "rows": inc["rows"], "batches": ["2026-10-30-w7-main", "b1"]}

    dup_row = copy.deepcopy(base)
    dup_row["rows"].append(copy.deepcopy(dup_row["rows"][0]))
    dup_cell = copy.deepcopy(base)
    dup_cell["rows"][0]["cells"].append(copy.deepcopy(dup_cell["rows"][0]["cells"][0]))
    dup_batch = copy.deepcopy(base)
    dup_batch["rows"][0]["cells"][0]["batches"] = ["b1", "b1"]
    for name, doc in (("row", dup_row), ("cell", dup_cell), ("batch", dup_batch)):
        code, _, err = run(capsys, "check", "--ledger", write_json(tmp_path / f"{name}.json", doc), "--policy", policy_file)
        assert code == 1, name
        assert "重复" in err, name


def test_check_ledger_rejects_bad_vocabulary_scope_and_unknown_keys(capsys, tmp_path, policy_file):
    inc = ledger_from(tmp_path, capsys, policy_file, [flow("c1")])
    base = {"schemaVersion": 1, "rows": inc["rows"], "batches": ["2026-10-30-w7-main"]}

    def mutated(edit):
        doc = copy.deepcopy(base)
        edit(doc)
        return doc

    cases = {
        "role": mutated(lambda d: d["rows"][0]["category"].update(role="wizard")),
        "work": mutated(lambda d: d["rows"][0]["category"].update(work="kernelish")),
        "scope": mutated(lambda d: d["rows"][0].update(policy_scope="none")),
        "source": mutated(lambda d: d["rows"][0]["cells"][0].update(source="guess")),
        "evidence": mutated(lambda d: d["rows"][0]["cells"][0].update(evidence="gold")),
        "negative": mutated(lambda d: d["rows"][0]["cells"][0].update(dispatched=-1)),
        "overcount": mutated(lambda d: d["rows"][0]["cells"][0].update(first_pass=5)),
        "extra": mutated(lambda d: d["rows"][0]["cells"][0].update(cost_usd_sum=1)),
        "version": mutated(lambda d: d.update(schemaVersion=2)),
    }
    for name, doc in cases.items():
        code, _, _ = run(capsys, "check", "--ledger", write_json(tmp_path / f"{name}.json", doc), "--policy", policy_file)
        assert code == 1, name


# L11, L12, L13 ---------------------------------------------------------

def make_increment(capsys, tmp_path, policy_file, rows, batch, name):
    code, inc, _ = aggregate(capsys, tmp_path, policy_file, rows, batch=batch, out_name=name)
    assert code == 0
    return tmp_path / name


def test_apply_adds_counts_and_records_both_batches(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    one = make_increment(capsys, tmp_path, policy_file, [flow("c1", 1, [defect("D1")], minutes=4.0), flow("c1", 2, minutes=6.0)], "2026-10-30-a-x", "one.json")
    two = make_increment(capsys, tmp_path, policy_file, [flow("c2", minutes=2.5), flow("c3", model="claude-opus-5-5")], "2026-10-31-b-y", "two.json")
    code, out, _ = run(capsys, "apply", "--ledger", ledg, "--increment", one, two, "--policy", policy_file)
    assert code == 0 and "already-applied" not in out
    merged = json.loads(ledg.read_text(encoding="utf-8"))
    cell = cell_of(merged)
    assert (cell["dispatched"], cell["within_two"], cell["first_pass"]) == (2, 2, 1)
    assert cell["minutes_sum"] == 12.5
    assert cell["writer_defects"] == {"blocking": 1, "nonblocking": 0}
    assert cell["batches"] == ["2026-10-30-a-x", "2026-10-31-b-y"]
    assert cell_of(merged, model="claude-opus-5-5")["batches"] == ["2026-10-31-b-y"]
    assert run(capsys, "check", "--ledger", ledg, "--policy", policy_file)[0] == 0


def test_apply_merges_escalation_items_and_marks_mixed_usage_sources(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    esc = lambda name, src: [flow(name, 1, [defect("D1")], usage_source=src), flow(name, 2, model="claude-fable-5-1", minutes=3.0, escalation=escalation(mode="redo"), usage_source=src)]
    one = make_increment(capsys, tmp_path, policy_file, esc("c1", "notification"), "2026-10-30-a-x", "one.json")
    two = make_increment(capsys, tmp_path, policy_file, esc("c2", "transcript"), "2026-10-31-b-y", "two.json")
    assert run(capsys, "apply", "--ledger", ledg, "--increment", one, two, "--policy", policy_file)[0] == 0
    cell = cell_of(json.loads(ledg.read_text(encoding="utf-8")))
    assert cell["usage_source"] == "mixed"
    assert [(i["to"], i["mode"], i["n"], i["success"], i["minutes_sum"]) for i in cell["escalations"]] == [("claude-fable-5-1@high", "redo", 2, 2, 6.0)]


def test_evidence_follows_the_merged_sample_size(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    for i in range(2):
        rows = [flow(f"c{i}-{j}") for j in range(3)]
        inc = make_increment(capsys, tmp_path, policy_file, rows, f"2026-10-3{i}-t-s", f"i{i}.json")
        assert run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)[0] == 0
        cell = cell_of(json.loads(ledg.read_text(encoding="utf-8")))
        assert cell["evidence"] == ("field-small-n" if i == 0 else "field")


def test_applying_the_same_increment_twice_leaves_the_file_untouched(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    inc = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-30-a-x", "one.json")
    assert run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)[0] == 0
    before = ledg.read_bytes()
    code, out, _ = run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)
    assert code == 0
    assert "already-applied 2026-10-30-a-x" in out
    assert ledg.read_bytes() == before


def test_a_repeated_batch_among_several_increments_counts_once(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    inc = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-30-a-x", "one.json")
    code, out, _ = run(capsys, "apply", "--ledger", ledg, "--increment", inc, inc, "--policy", policy_file)
    assert code == 0 and out.count("already-applied") == 1
    assert cell_of(json.loads(ledg.read_text(encoding="utf-8")))["dispatched"] == 1


def test_a_merge_that_fails_check_exits_1_and_leaves_the_ledger_bytes(capsys, tmp_path, policy_file):
    # The existing ledger already breaks the vocabulary; the increment alone is valid.
    inc = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-30-a-x", "one.json")
    seed = json.loads(inc.read_text(encoding="utf-8"))
    broken = copy.deepcopy(seed["rows"])
    broken[0]["category"]["work"] = "kernelish"
    broken[0]["cells"][0]["batches"] = ["2026-10-01-z-old"]
    ledg = write_json(tmp_path / "ledger.json", {"schemaVersion": 1, "rows": broken, "batches": ["2026-10-01-z-old"]})
    before = ledg.read_bytes()
    code, _, err = run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)
    assert code == 1 and "work" in err
    assert ledg.read_bytes() == before


def test_an_invalid_increment_is_refused_before_merging(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    before = ledg.read_bytes()
    inc = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-30-a-x", "one.json")
    doc = json.loads(inc.read_text(encoding="utf-8"))
    doc["rows"][0]["category"]["role"] = "wizard"
    write_json(inc, doc)
    code, _, _ = run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)
    assert code == 1 and ledg.read_bytes() == before


# L14 -------------------------------------------------------------------

def test_an_increment_may_carry_three_lessons_but_not_four(capsys, tmp_path, policy_file):
    inc = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-30-a-x", "one.json")
    doc = json.loads(inc.read_text(encoding="utf-8"))
    lesson = {"phenomenon": "写者漏了调用方", "evidence": URL.format(1), "route": "constraints.md"}
    doc["lessons"] = [lesson] * 3
    assert run(capsys, "check", "--ledger", write_json(tmp_path / "three.json", doc), "--policy", policy_file)[0] == 0
    doc["lessons"] = [lesson] * 4
    code, _, err = run(capsys, "check", "--ledger", write_json(tmp_path / "four.json", doc), "--policy", policy_file)
    assert code == 1 and "lessons" in err


# L15 -------------------------------------------------------------------

def test_usage_and_file_errors_exit_2(capsys, tmp_path, policy_file):
    flows = write_flows(tmp_path, [flow("c1")])
    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("{broken", encoding="utf-8")
    inc = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-30-a-x", "one.json")
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    missing = tmp_path / "missing.json"
    bad_policy = tmp_path / "bad-policy.json"
    bad_policy.write_text("[]", encoding="utf-8")
    cases = [
        (),
        ("frobnicate",),
        ("check",),
        ("check", "--flows", missing, "--policy", policy_file),
        ("check", "--ledger", missing, "--policy", policy_file),
        ("check", "--ledger", corrupt, "--policy", policy_file),
        ("check", "--flows", flows, "--policy", missing),
        ("check", "--flows", flows, "--policy", bad_policy),
        ("aggregate", "--flows", flows, "--policy", policy_file),
        ("aggregate", "--flows", missing, "--batch", "b", "--out", tmp_path / "o.json", "--policy", policy_file),
        ("apply", "--ledger", missing, "--increment", inc, "--policy", policy_file),
        ("apply", "--ledger", corrupt, "--increment", inc, "--policy", policy_file),
        ("apply", "--ledger", ledg, "--increment", missing, "--policy", policy_file),
        ("apply", "--ledger", ledg, "--policy", policy_file),
    ]
    for argv in cases:
        code, _, err = run(capsys, *argv)
        assert code == 2, argv
        assert err.strip(), argv


def test_missing_input_does_not_create_the_output(capsys, tmp_path, policy_file):
    out = tmp_path / "o.json"
    run(capsys, "aggregate", "--flows", tmp_path / "nope.jsonl", "--batch", "b", "--out", out, "--policy", policy_file)
    assert not out.exists()


# After-merge defects, ledger-level batches, unrecorded usage -------------

def test_a_writer_block_found_after_merge_counts_as_a_defect_but_keeps_the_first_round_verdict(capsys, tmp_path, policy_file):
    late = dict(defect("D9", cls="lint"), found="after-merge")
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, [flow("c1", 1, [late, defect("D2", blocking=False)])])
    cell = cell_of(inc)
    assert (cell["first_pass"], cell["first_no_writer_block"], cell["within_two"]) == (1, 1, 1)
    assert cell["writer_defects"] == {"blocking": 1, "nonblocking": 1}


def test_a_review_found_block_still_fails_the_round_and_found_review_is_the_default(capsys, tmp_path, policy_file):
    explicit = dict(defect("D1"), found="review")
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, [flow("c1", 1, [explicit]), flow("c1", 2)])
    cell = cell_of(inc)
    assert (cell["first_pass"], cell["first_no_writer_block"], cell["within_two"]) == (0, 0, 1)
    assert cell["writer_defects"]["blocking"] == 1


def test_found_accepts_only_review_or_after_merge(capsys, tmp_path, policy_file):
    bad = flow("c1", 1, [dict(defect("D1"), found="later")])
    code, _, err = run(capsys, "check", "--flows", write_flows(tmp_path, [bad]), "--policy", policy_file)
    assert code == 1 and "found" in err


def test_a_spec_owned_after_merge_block_counts_as_a_spec_defect_only(capsys, tmp_path, policy_file):
    late = dict(defect("S1", owner="spec"), found="after-merge")
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, [flow("c1", 1, [late])])
    cell = cell_of(inc)
    assert (cell["spec_defects"], cell["first_pass"], cell["writer_defects"]["blocking"]) == (1, 1, 0)


def test_apply_records_the_batch_of_an_increment_with_no_rows(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    bad = flow("c1")
    bad["acceptance"]["report"] = "tmp/only-local.md"
    inc = make_increment(capsys, tmp_path, policy_file, [bad], "2026-10-30-a-x", "one.json")
    assert json.loads(inc.read_text(encoding="utf-8"))["rows"] == []
    code, out, _ = run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)
    assert code == 0 and "already-applied" not in out
    assert json.loads(ledg.read_text(encoding="utf-8")) == {"schemaVersion": 1, "rows": [], "batches": ["2026-10-30-a-x"]}
    before = ledg.read_bytes()
    code, out, _ = run(capsys, "apply", "--ledger", ledg, "--increment", inc, "--policy", policy_file)
    assert code == 0 and "already-applied 2026-10-30-a-x" in out
    assert ledg.read_bytes() == before


def test_the_ledger_batches_are_sorted_and_hold_every_applied_batch(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    later = make_increment(capsys, tmp_path, policy_file, [flow("c1")], "2026-10-31-b-y", "later.json")
    earlier = make_increment(capsys, tmp_path, policy_file, [flow("c2")], "2026-10-30-a-x", "earlier.json")
    assert run(capsys, "apply", "--ledger", ledg, "--increment", later, earlier, "--policy", policy_file)[0] == 0
    assert json.loads(ledg.read_text(encoding="utf-8"))["batches"] == ["2026-10-30-a-x", "2026-10-31-b-y"]


def test_check_ledger_ties_cell_batches_to_the_ledger_batches(capsys, tmp_path, policy_file):
    inc = ledger_from(tmp_path, capsys, policy_file, [flow("c1")])
    rows = inc["rows"]
    cases = {
        "missing": {"schemaVersion": 1, "rows": rows},
        "not-listed": {"schemaVersion": 1, "rows": rows, "batches": []},
        "duplicate": {"schemaVersion": 1, "rows": rows, "batches": ["2026-10-30-w7-main", "2026-10-30-w7-main"]},
        "not-text": {"schemaVersion": 1, "rows": rows, "batches": [1]},
    }
    for name, doc in cases.items():
        code, _, _ = run(capsys, "check", "--ledger", write_json(tmp_path / f"{name}.json", doc), "--policy", policy_file)
        assert code == 1, name
    code, _, err = run(capsys, "check", "--ledger", tmp_path / "not-listed.json", "--policy", policy_file)
    assert "batches" in err


@pytest.mark.parametrize("field", ["minutes", "tokens_reported", "tool_calls"])
def test_unrecorded_usage_may_be_null_but_not_other_non_numbers(capsys, tmp_path, policy_file, field):
    ok = flow("c1")
    ok[field] = None
    assert run(capsys, "check", "--flows", write_flows(tmp_path, [ok]), "--policy", policy_file)[0] == 0
    for junk in ("n/a", -1, True):
        bad = flow("c1")
        bad[field] = junk
        code, _, err = run(capsys, "check", "--flows", write_flows(tmp_path, [bad]), "--policy", policy_file)
        assert code == 1 and field in err, junk


def test_rounds_without_recorded_usage_are_left_out_of_sums_and_denominators(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1")], minutes=None, tokens_reported=100),
        flow("c1", 2, minutes=6.0, tokens_reported=None, tool_calls=None),
        flow("c2", minutes=None, tokens_reported=None),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    assert (cell["minutes_sum"], cell["minutes_n"]) == (6.0, 1)
    assert (cell["tokens_reported_sum"], cell["tokens_n"]) == (100, 1)


def test_escalated_rounds_keep_their_own_usage_counts(capsys, tmp_path, policy_file):
    rows = [
        flow("c1", 1, [defect("D1")], minutes=4.0, tokens_reported=10),
        flow("c1", 2, model="claude-fable-5-1", minutes=None, tokens_reported=70, escalation=escalation()),
        flow("c1", 3, model="claude-fable-5-1", minutes=5.0, tokens_reported=None, escalation=escalation()),
    ]
    _, inc, _ = aggregate(capsys, tmp_path, policy_file, rows)
    cell = cell_of(inc)
    item = cell["escalations"][0]
    assert (cell["minutes_sum"], cell["minutes_n"], cell["tokens_reported_sum"], cell["tokens_n"]) == (4.0, 1, 10, 1)
    assert (item["minutes_sum"], item["minutes_n"], item["tokens_reported_sum"], item["tokens_n"]) == (5.0, 1, 70, 1)


def test_apply_adds_the_usage_counts_and_check_ties_sums_to_counts(capsys, tmp_path, policy_file):
    ledg = write_json(tmp_path / "ledger.json", empty_ledger())
    one = make_increment(capsys, tmp_path, policy_file, [flow("c1", minutes=3.0, tokens_reported=None)], "2026-10-30-a-x", "one.json")
    two = make_increment(capsys, tmp_path, policy_file, [flow("c2", minutes=None, tokens_reported=40)], "2026-10-31-b-y", "two.json")
    assert run(capsys, "apply", "--ledger", ledg, "--increment", one, two, "--policy", policy_file)[0] == 0
    merged = json.loads(ledg.read_text(encoding="utf-8"))
    cell = cell_of(merged)
    assert (cell["minutes_sum"], cell["minutes_n"], cell["tokens_reported_sum"], cell["tokens_n"]) == (3.0, 1, 40, 1)
    cell["minutes_n"] = 0
    code, _, err = run(capsys, "check", "--ledger", write_json(tmp_path / "bad.json", merged), "--policy", policy_file)
    assert code == 1 and "minutes_n" in err


# Drift and entry point ---------------------------------------------------

def test_schema_enumerations_match_the_tool():
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    defs = schema["$defs"]
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert defs["row"]["properties"]["category"]["properties"]["clarity"]["enum"] == list(ledger.CLARITY)
    assert defs["row"]["properties"]["category"]["properties"]["role"]["anyOf"][1]["enum"] == list(ledger.PSEUDO_ROLES)
    cell = defs["cell"]["properties"]
    assert cell["source"]["enum"] == list(ledger.SOURCES)
    assert cell["evidence"]["enum"] == list(ledger.EVIDENCE)
    assert cell["usage_source"]["enum"] == list(ledger.CELL_USAGE_SOURCES)
    assert set(defs["cell"]["required"]) == set(cell) == set(ledger.CELL_KEYS)
    assert set(defs["row"]["required"]) == set(defs["row"]["properties"]) == set(ledger.ROW_KEYS)
    assert set(schema["oneOf"][0]["required"]) == set(schema["oneOf"][0]["properties"]) == set(ledger.LEDGER_KEYS)
    assert set(defs["escalation"]["required"]) == set(defs["escalation"]["properties"]) == set(ledger.ESCALATION_ITEM_KEYS)
    assert schema["oneOf"][1]["properties"]["lessons"]["maxItems"] == ledger.MAX_LESSONS
    assert set(schema["oneOf"][1]["required"]) == set(ledger.INCREMENT_KEYS)


def test_the_script_runs_as_a_command(tmp_path, policy_file):
    flows = write_flows(tmp_path, [flow("c1")])
    done = subprocess.run([sys.executable, str(SCRIPT), "check", "--flows", str(flows), "--policy", str(policy_file)], capture_output=True, text=True)
    assert done.returncode == 0, done.stderr
    done = subprocess.run([sys.executable, str(SCRIPT), "check"], capture_output=True, text=True)
    assert done.returncode == 2
