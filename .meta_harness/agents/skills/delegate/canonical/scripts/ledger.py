#!/usr/bin/env python3
"""Dispatch ledger tool: check flows or a ledger, aggregate flows into an increment, apply increments.

Python 3.12 standard library only. Field meanings and counting rules are owned by
`delegate/canonical/references/ledger.md`; the file structure by
`evaluation/dispatch-ledger/ledger.schema.json`. This script enforces both and never calls a model.

Exit codes: 0 success; 1 content errors (flow lines, ledger structure, merge result); 2 usage or file errors.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SCHEMA_VERSION = 1
DEFAULT_POLICY = ".meta_harness/agents/roles/dispatch-policy.json"

CLARITY = ("定", "界", "探")
PSEUDO_ROLES = ("docs", "read-only")
SOURCES = ("field", "owner-experiment")
EVIDENCE = ("field-small-n", "field")
USAGE_SOURCES = ("notification", "transcript")
CELL_USAGE_SOURCES = ("notification", "transcript", "mixed")
OWNERS = ("writer", "spec", "env")
MODES = ("takeover", "redo")
OUTCOMES = ("merged", "discarded", "stopped", "pending")
SMALL_SAMPLE = 5
MAX_LESSONS = 3

ROW_KEYS = ("category", "policy_scope", "cells")
CELL_KEYS = (
    "model", "effort", "source", "dispatched", "first_pass", "first_no_writer_block", "within_two",
    "escalated", "escalations", "appends", "spec_defects", "writer_defects", "minutes_sum",
    "tokens_reported_sum", "usage_source", "evidence", "batches",
)
LEDGER_KEYS = ("schemaVersion", "rows")
INCREMENT_KEYS = ("schemaVersion", "batch", "produced_by", "rows", "excluded", "lessons")
ESCALATION_ITEM_KEYS = ("to", "mode", "n", "success", "minutes_sum", "tokens_reported_sum")
EXCLUDED_KEYS = ("task", "closure", "round", "report", "reason")
LESSON_KEYS = ("phenomenon", "evidence", "route")
FLOW_KEYS = (
    "ts", "task", "closure", "round", "role", "work", "risk", "clarity", "model", "effort", "host",
    "policy_version", "role_source_tree", "minutes", "tokens_reported", "tool_calls", "usage_source",
    "appends", "acceptance", "escalation", "outcome", "experiment",
)
ESCALATION_KEYS = ("to_model", "to_effort", "mode", "reason", "trigger_report")

DURABLE_REPORT = re.compile(
    r"^https://github\.com/[^/\s]+/[^/\s]+/(?:issues|pull)/\d+#(?:issuecomment-|pullrequestreview-|discussion_r)\d+$"
)
BATCH_ID = re.compile(r"^\d{4}-\d{2}-\d{2}-\S+$")
TREE_HASH = re.compile(r"^[0-9a-f]{40}$")


class UsageError(Exception):
    """Bad arguments or unreadable input: exit 2."""


# ---------------------------------------------------------------- small helpers

def is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_str(v) -> bool:
    return isinstance(v, str) and v != ""


def dumps(doc) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_text(path: Path, text: str) -> None:
    try:
        path.write_bytes(text.encode("utf-8"))
    except OSError as e:
        raise UsageError(f"写不了文件 {path}：{e}") from e


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        raise UsageError(f"读不了文件 {path}：{e}") from e


def read_json(path: Path):
    text = read_text(path)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise UsageError(f"{path} 不是合法 JSON：{e}") from e


def load_policy(path: Path) -> dict:
    policy = read_json(path)
    if not isinstance(policy, dict) or not isinstance(policy.get("roles"), dict):
        raise UsageError(f"{path} 不是派发策略（缺 roles 对象）")
    return policy


def keys_problem(obj: dict, expected: tuple, where: str) -> list[str]:
    errors = [f"{where}: 缺字段 {k}" for k in expected if k not in obj]
    errors += [f"{where}: 多出字段 {k}" for k in obj if k not in expected]
    return errors


def round_sum(v):
    return round(float(v), 3)


# ---------------------------------------------------------------- category vocabulary

def category_errors(role, work, risk, policy: dict, where: str) -> list[str]:
    """Vocabulary check for role, work and risk. Pseudo roles never consult the policy."""
    if role in PSEUDO_ROLES:
        errors = []
        if work != "none":
            errors.append(f"{where}: 伪角色 {role} 的 work 必须是 none，现为 {work!r}")
        if risk != "none":
            errors.append(f"{where}: 伪角色 {role} 的 risk 必须是 none，现为 {risk!r}")
        return errors
    roles = policy["roles"]
    if role not in roles:
        return [f"{where}: role {role!r} 不在策略里，也不是伪角色 {list(PSEUDO_ROLES)}"]
    spec = roles[role]
    errors = []
    works = spec.get("work", {})
    if work not in works:
        errors.append(f"{where}: work {work!r} 不在角色 {role} 的词表 {sorted(works)} 里")
    if risk != "none" and risk not in spec.get("top_risks", []):
        errors.append(f"{where}: risk {risk!r} 不是 none，也不在角色 {role} 的 top_risks 里")
    return errors


def policy_scope_of(role: str) -> str:
    return "none" if role in PSEUDO_ROLES else f"{role}.work"


# ---------------------------------------------------------------- flows

def flow_errors(row, policy: dict, where: str) -> list[str]:
    if not isinstance(row, dict):
        return [f"{where}: 每行必须是 JSON 对象"]
    errors = keys_problem(row, FLOW_KEYS, where)
    if errors:
        return errors

    def bad(field, why):
        errors.append(f"{where}: {field} {why}")

    ts = row["ts"]
    try:
        if not isinstance(ts, str) or datetime.fromisoformat(ts).tzinfo is None:
            raise ValueError
    except ValueError:
        bad("ts", "必须是带时区的 ISO 时间（UTC 用 Z）")
    for f in ("task", "closure", "model", "effort", "host", "policy_version"):
        if not is_str(row[f]):
            bad(f, "必须是非空字符串")
    if not is_int(row["round"]) or row["round"] < 1:
        bad("round", "必须是从 1 起的整数")
    if row["clarity"] not in CLARITY:
        bad("clarity", f"必须是 {list(CLARITY)} 之一")
    if row["usage_source"] not in USAGE_SOURCES:
        bad("usage_source", f"必须是 {list(USAGE_SOURCES)} 之一")
    if row["outcome"] not in OUTCOMES:
        bad("outcome", f"必须是 {list(OUTCOMES)} 之一")
    if row["experiment"] not in (None, "owner-experiment"):
        bad("experiment", "必须是 null 或 owner-experiment")
    for f in ("tokens_reported", "tool_calls", "appends"):
        if not is_int(row[f]) or row[f] < 0:
            bad(f, "必须是非负整数")
    if not is_num(row["minutes"]) or row["minutes"] < 0:
        bad("minutes", "必须是非负数")

    role = row["role"]
    if not is_str(role) or not is_str(row["work"]) or not is_str(row["risk"]):
        bad("role/work/risk", "必须是非空字符串")
    else:
        errors += category_errors(role, row["work"], row["risk"], policy, where)
        tree = row["role_source_tree"]
        if role in PSEUDO_ROLES:
            if tree is not None:
                bad("role_source_tree", "伪角色必须是 null")
        elif not isinstance(tree, str) or not TREE_HASH.match(tree):
            bad("role_source_tree", "必须是 40 位十六进制哈希")

    acc = row["acceptance"]
    if not isinstance(acc, dict):
        bad("acceptance", "必须是对象")
    else:
        errors += keys_problem(acc, ("report", "verdict", "defects"), f"{where}: acceptance")
        if not isinstance(acc.get("report"), str):
            bad("acceptance.report", "必须是字符串")
        if not is_str(acc.get("verdict")):
            bad("acceptance.verdict", "必须是非空字符串")
        defects = acc.get("defects")
        if not isinstance(defects, list):
            bad("acceptance.defects", "必须是数组")
        else:
            for i, d in enumerate(defects):
                at = f"{where}: acceptance.defects[{i}]"
                if not isinstance(d, dict):
                    errors.append(f"{at} 必须是对象")
                    continue
                errors += keys_problem(d, ("id", "owner", "blocking", "class"), at)
                if not is_str(d.get("id")):
                    errors.append(f"{at}: id 必须是非空字符串")
                if d.get("owner") not in OWNERS:
                    errors.append(f"{at}: owner 必须是 {list(OWNERS)} 之一")
                if not isinstance(d.get("blocking"), bool):
                    errors.append(f"{at}: blocking 必须是布尔值")
                if not is_str(d.get("class")):
                    errors.append(f"{at}: class 必须是非空字符串")

    esc = row["escalation"]
    if esc is not None:
        if not isinstance(esc, dict):
            bad("escalation", "必须是 null 或对象")
        else:
            at = f"{where}: escalation"
            errors += keys_problem(esc, ESCALATION_KEYS, at)
            for f in ("to_model", "to_effort", "reason", "trigger_report"):
                if not is_str(esc.get(f)):
                    errors.append(f"{at}: {f} 必须是非空字符串")
            if esc.get("mode") not in MODES:
                errors.append(f"{at}: mode 必须是 {list(MODES)} 之一")
    return errors


class Flow:
    def __init__(self, path: Path, line: int, data: dict):
        self.path, self.line, self.d = path, line, data

    @property
    def where(self) -> str:
        return f"{self.path}:{self.line}"

    @property
    def closure_key(self):
        return (self.d["task"], self.d["closure"])

    @property
    def blocking(self):
        return [x for x in self.d["acceptance"]["defects"] if x["blocking"]]

    @property
    def passed(self) -> bool:
        return not self.blocking


def load_flows(paths: list[Path], policy: dict) -> tuple[list[Flow], list[str]]:
    flows, errors = [], []
    for path in paths:
        for no, raw in enumerate(read_text(path).split("\n"), 1):
            if not raw.strip():
                continue
            where = f"{path}:{no}"
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as e:
                errors.append(f"{where}: 不是合法 JSON：{e}")
                continue
            problems = flow_errors(data, policy, where)
            if problems:
                errors += problems
            else:
                flows.append(Flow(path, no, data))
    errors += round_errors(flows)
    return flows, errors


def round_errors(flows: list[Flow]) -> list[str]:
    errors, by_closure = [], defaultdict(list)
    for f in flows:
        by_closure[f.closure_key].append(f)
    for (task, closure), rows in by_closure.items():
        seen: dict[int, Flow] = {}
        for f in rows:
            if f.d["round"] in seen:
                errors.append(f"{f.where}: 闭包 {task}/{closure} 的 round {f.d['round']} 重复（另见 {seen[f.d['round']].where}）")
            else:
                seen[f.d["round"]] = f
        for expected, r in enumerate(sorted(seen), 1):
            if r != expected:
                errors.append(f"{seen[r].where}: 闭包 {task}/{closure} 的 round 必须从 1 起连续，缺 {expected}")
                break
    return errors


# ---------------------------------------------------------------- ledger and increment structure

def cell_errors(cell, where: str) -> list[str]:
    if not isinstance(cell, dict):
        return [f"{where}: 必须是对象"]
    errors = keys_problem(cell, CELL_KEYS, where)
    if errors:
        return errors
    for f in ("model", "effort"):
        if not is_str(cell[f]):
            errors.append(f"{where}: {f} 必须是非空字符串")
    if cell["source"] not in SOURCES:
        errors.append(f"{where}: source 必须是 {list(SOURCES)} 之一")
    if cell["evidence"] not in EVIDENCE:
        errors.append(f"{where}: evidence 必须是 {list(EVIDENCE)} 之一")
    if cell["usage_source"] not in CELL_USAGE_SOURCES:
        errors.append(f"{where}: usage_source 必须是 {list(CELL_USAGE_SOURCES)} 之一")
    counts = ("dispatched", "first_pass", "first_no_writer_block", "within_two", "escalated", "appends", "spec_defects", "tokens_reported_sum")
    for f in counts:
        if not is_int(cell[f]) or cell[f] < 0:
            errors.append(f"{where}: {f} 必须是非负整数")
    if not is_num(cell["minutes_sum"]) or cell["minutes_sum"] < 0:
        errors.append(f"{where}: minutes_sum 必须是非负数")
    wd = cell["writer_defects"]
    if not isinstance(wd, dict) or set(wd) != {"blocking", "nonblocking"} or not all(is_int(v) and v >= 0 for v in wd.values()):
        errors.append(f"{where}: writer_defects 必须是 blocking、nonblocking 两个非负整数")
    if not errors:
        for f in ("first_pass", "first_no_writer_block", "within_two", "escalated"):
            if cell[f] > cell["dispatched"]:
                errors.append(f"{where}: {f} 不能大于 dispatched")
    esc = cell["escalations"]
    if not isinstance(esc, list):
        errors.append(f"{where}: escalations 必须是数组")
    else:
        seen = set()
        for i, item in enumerate(esc):
            at = f"{where}: escalations[{i}]"
            if not isinstance(item, dict):
                errors.append(f"{at} 必须是对象")
                continue
            errors += keys_problem(item, ESCALATION_ITEM_KEYS, at)
            if not is_str(item.get("to")) or item.get("mode") not in MODES:
                errors.append(f"{at}: to 必须是非空字符串，mode 必须是 {list(MODES)} 之一")
            else:
                key = (item["to"], item["mode"])
                if key in seen:
                    errors.append(f"{at}: （to、mode）重复 {key}")
                seen.add(key)
            for f in ("n", "success", "tokens_reported_sum"):
                if not is_int(item.get(f)) or item[f] < 0:
                    errors.append(f"{at}: {f} 必须是非负整数")
            if not is_num(item.get("minutes_sum")) or item["minutes_sum"] < 0:
                errors.append(f"{at}: minutes_sum 必须是非负数")
    batches = cell["batches"]
    if not isinstance(batches, list) or not all(is_str(b) for b in batches):
        errors.append(f"{where}: batches 必须是非空字符串数组")
    elif len(set(batches)) != len(batches):
        errors.append(f"{where}: batches 有重复项")
    return errors


def rows_errors(rows, policy: dict, where: str) -> list[str]:
    if not isinstance(rows, list):
        return [f"{where}: rows 必须是数组"]
    errors, seen = [], set()
    for i, row in enumerate(rows):
        at = f"{where}: rows[{i}]"
        if not isinstance(row, dict):
            errors.append(f"{at} 必须是对象")
            continue
        errors += keys_problem(row, ROW_KEYS, at)
        cat = row.get("category")
        if not isinstance(cat, dict) or set(cat) != {"role", "work", "risk", "clarity"} or not all(is_str(v) for v in cat.values()):
            errors.append(f"{at}: category 必须是 role、work、risk、clarity 四个非空字符串")
            continue
        errors += category_errors(cat["role"], cat["work"], cat["risk"], policy, at)
        if cat["clarity"] not in CLARITY:
            errors.append(f"{at}: clarity 必须是 {list(CLARITY)} 之一")
        key = tuple(cat[k] for k in ("role", "work", "risk", "clarity"))
        if key in seen:
            errors.append(f"{at}: 类别行重复 {key}")
        seen.add(key)
        if row.get("policy_scope") != policy_scope_of(cat["role"]):
            errors.append(f"{at}: policy_scope 应为 {policy_scope_of(cat['role'])!r}")
        cells = row.get("cells")
        if not isinstance(cells, list) or not cells:
            errors.append(f"{at}: cells 必须是非空数组")
            continue
        cell_seen = set()
        for j, cell in enumerate(cells):
            errors += cell_errors(cell, f"{at}.cells[{j}]")
            if isinstance(cell, dict) and all(k in cell for k in ("model", "effort", "source")):
                ck = (cell["model"], cell["effort"], cell["source"])
                if ck in cell_seen:
                    errors.append(f"{at}.cells[{j}]: 格键重复 {ck}")
                cell_seen.add(ck)
    return errors


def document_errors(doc, policy: dict, where: str) -> list[str]:
    """Check a ledger, or an increment when the document has a `batch` key."""
    if not isinstance(doc, dict):
        return [f"{where}: 顶层必须是对象"]
    increment = "batch" in doc
    errors = keys_problem(doc, INCREMENT_KEYS if increment else LEDGER_KEYS, where)
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"{where}: schemaVersion 必须是 {SCHEMA_VERSION}")
    errors += rows_errors(doc.get("rows"), policy, where) if "rows" in doc else []
    if not increment:
        return errors
    batch = doc.get("batch")
    if not isinstance(batch, str) or not BATCH_ID.match(batch):
        errors.append(f"{where}: batch 必须是 <UTC 日期>-<任务>-<会话简称>")
    if not is_str(doc.get("produced_by")):
        errors.append(f"{where}: produced_by 必须是非空字符串")
    excluded = doc.get("excluded")
    if not isinstance(excluded, list) or not all(isinstance(e, dict) and set(e) == set(EXCLUDED_KEYS) for e in excluded):
        errors.append(f"{where}: excluded 必须是带 {list(EXCLUDED_KEYS)} 的对象数组")
    lessons = doc.get("lessons")
    if not isinstance(lessons, list):
        errors.append(f"{where}: lessons 必须是数组")
    else:
        if len(lessons) > MAX_LESSONS:
            errors.append(f"{where}: lessons 至多 {MAX_LESSONS} 条，现有 {len(lessons)} 条")
        for i, item in enumerate(lessons):
            if not isinstance(item, dict) or set(item) != set(LESSON_KEYS) or not all(is_str(v) for v in item.values()):
                errors.append(f"{where}: lessons[{i}] 必须是 {list(LESSON_KEYS)} 三个非空字符串")
    for i, row in enumerate(doc.get("rows") or []):
        cells = row.get("cells") if isinstance(row, dict) else None
        for j, cell in enumerate(cells if isinstance(cells, list) else []):
            if isinstance(cell, dict) and cell.get("batches") != [batch]:
                errors.append(f"{where}: rows[{i}].cells[{j}]: 增量里 batches 必须只有本批次 [{batch!r}]")
    return errors


# ---------------------------------------------------------------- aggregate

def evidence_for(dispatched: int) -> str:
    return "field-small-n" if dispatched < SMALL_SAMPLE else "field"


def new_cell(model: str, effort: str, source: str) -> dict:
    return {
        "model": model, "effort": effort, "source": source, "dispatched": 0, "first_pass": 0,
        "first_no_writer_block": 0, "within_two": 0, "escalated": 0, "escalations": [], "appends": 0,
        "spec_defects": 0, "writer_defects": {"blocking": 0, "nonblocking": 0}, "minutes_sum": 0.0,
        "tokens_reported_sum": 0, "usage_source": "", "evidence": "field-small-n", "batches": [],
    }


def combine_usage(a: str, b: str) -> str:
    return b if not a else a if not b or a == b else "mixed"


def escalation_item(cell: dict, to: str, mode: str) -> dict:
    for item in cell["escalations"]:
        if (item["to"], item["mode"]) == (to, mode):
            return item
    item = {"to": to, "mode": mode, "n": 0, "success": 0, "minutes_sum": 0.0, "tokens_reported_sum": 0}
    cell["escalations"].append(item)
    return item


def add_closure(cell: dict, rows: list[Flow]) -> None:
    """Fold one closure's rounds (sorted by round) into its starting cell."""
    first = rows[0].d
    merged = rows[-1].d["outcome"] == "merged"
    cell["dispatched"] += 1
    cell["first_pass"] += int(rows[0].passed)
    cell["first_no_writer_block"] += int(not any(d["owner"] == "writer" for d in rows[0].blocking))
    escalated = any(r.d["escalation"] for r in rows)
    cell["escalated"] += int(escalated)
    cell["within_two"] += int(not escalated and any(r.passed for r in rows[:2]))
    cell["appends"] += sum(r.d["appends"] for r in rows)

    seen = {}
    for r in rows:
        for d in r.d["acceptance"]["defects"]:
            seen.setdefault(d["id"], d)
    cell["spec_defects"] += sum(d["owner"] == "spec" for d in seen.values())
    cell["writer_defects"]["blocking"] += sum(d["owner"] == "writer" and d["blocking"] for d in seen.values())
    cell["writer_defects"]["nonblocking"] += sum(d["owner"] == "writer" and not d["blocking"] for d in seen.values())

    # Rounds from the first escalated one onward belong to that escalation, not to the starting cell.
    target = None
    for r in rows:
        esc = r.d["escalation"]
        if esc:
            to = f"{esc['to_model']}@{esc['to_effort']}"
            if target is None or (target["to"], target["mode"]) != (to, esc["mode"]):
                target = escalation_item(cell, to, esc["mode"])
                target["n"] += 1
                target["success"] += int(merged)
        holder = target if target is not None else cell
        holder["minutes_sum"] = round_sum(holder["minutes_sum"] + r.d["minutes"])
        holder["tokens_reported_sum"] += r.d["tokens_reported"]
    for r in rows:
        cell["usage_source"] = combine_usage(cell["usage_source"], r.d["usage_source"])


def aggregate(flows: list[Flow], batch: str, produced_by: str) -> dict:
    closures = defaultdict(list)
    for f in flows:
        closures[f.closure_key].append(f)
    excluded, table = [], {}
    for key in sorted(closures):
        rows = sorted(closures[key], key=lambda f: f.d["round"])
        if any(not DURABLE_REPORT.match(r.d["acceptance"]["report"]) for r in rows):
            for r in rows:
                durable = bool(DURABLE_REPORT.match(r.d["acceptance"]["report"]))
                excluded.append({
                    "task": key[0], "closure": key[1], "round": r.d["round"], "report": r.d["acceptance"]["report"],
                    "reason": ("同一闭包的其他轮验收报告不是 GitHub 评论或 PR 评审 URL，整个闭包不计数" if durable
                               else "验收报告不是 GitHub 评论或 PR 评审 URL，闭包不计数"),
                })
            continue
        head = rows[0].d
        category = {k: head[k] for k in ("role", "work", "risk", "clarity")}
        source = head["experiment"] or "field"
        row = table.setdefault(tuple(category.values()), {"category": category, "policy_scope": policy_scope_of(head["role"]), "cells": {}})
        cell = row["cells"].setdefault((head["model"], head["effort"], source), new_cell(head["model"], head["effort"], source))
        add_closure(cell, rows)
    out_rows = []
    for key in sorted(table):
        cells = []
        for ck in sorted(table[key]["cells"]):
            cell = table[key]["cells"][ck]
            cell["evidence"] = evidence_for(cell["dispatched"])
            cell["batches"] = [batch]
            cells.append(cell)
        out_rows.append({**table[key], "cells": cells})
    return {"schemaVersion": SCHEMA_VERSION, "batch": batch, "produced_by": produced_by, "rows": out_rows, "excluded": excluded, "lessons": []}


# ---------------------------------------------------------------- apply

def merge_cell(dst: dict, src: dict) -> None:
    for f in ("dispatched", "first_pass", "first_no_writer_block", "within_two", "escalated", "appends", "spec_defects", "tokens_reported_sum"):
        dst[f] += src[f]
    for f in ("blocking", "nonblocking"):
        dst["writer_defects"][f] += src["writer_defects"][f]
    dst["minutes_sum"] = round_sum(dst["minutes_sum"] + src["minutes_sum"])
    for item in src["escalations"]:
        mine = escalation_item(dst, item["to"], item["mode"])
        for f in ("n", "success", "tokens_reported_sum"):
            mine[f] += item[f]
        mine["minutes_sum"] = round_sum(mine["minutes_sum"] + item["minutes_sum"])
    dst["usage_source"] = combine_usage(dst["usage_source"], src["usage_source"])
    dst["batches"] = sorted(set(dst["batches"]) | set(src["batches"]))
    dst["evidence"] = evidence_for(dst["dispatched"])


def known_batches(doc: dict) -> set:
    return {b for row in doc["rows"] for cell in row["cells"] for b in cell["batches"]}


def normalize(doc: dict) -> dict:
    """Sort rows, cells and escalation items so the written bytes do not depend on merge order."""
    doc["rows"].sort(key=lambda r: tuple(r["category"][k] for k in ("role", "work", "risk", "clarity")))
    for row in doc["rows"]:
        row["cells"].sort(key=lambda c: (c["model"], c["effort"], c["source"]))
        for cell in row["cells"]:
            cell["escalations"].sort(key=lambda i: (i["to"], i["mode"]))
            cell["batches"].sort()
    return doc


def merge_increments(ledger: dict, increments: list[tuple[Path, dict]]) -> tuple[dict, list[str], list[str]]:
    merged, applied, skipped = copy.deepcopy(ledger), [], []
    known = known_batches(merged)
    for _, inc in increments:
        if inc["batch"] in known:
            skipped.append(inc["batch"])
            continue
        index = {tuple(r["category"][k] for k in ("role", "work", "risk", "clarity")): r for r in merged["rows"]}
        for row in inc["rows"]:
            key = tuple(row["category"][k] for k in ("role", "work", "risk", "clarity"))
            target = index.get(key)
            if target is None:
                target = {"category": row["category"], "policy_scope": row["policy_scope"], "cells": []}
                merged["rows"].append(target)
                index[key] = target
            cells = {(c["model"], c["effort"], c["source"]): c for c in target["cells"]}
            for cell in row["cells"]:
                ck = (cell["model"], cell["effort"], cell["source"])
                if ck not in cells:
                    cells[ck] = new_cell(*ck)
                    target["cells"].append(cells[ck])
                merge_cell(cells[ck], cell)
        known.add(inc["batch"])
        applied.append(inc["batch"])
    return normalize(merged), applied, skipped


# ---------------------------------------------------------------- commands

def report(errors: list[str]) -> None:
    for e in errors:
        print(e, file=sys.stderr)


def cmd_check(args, policy: dict) -> int:
    if bool(args.flows) == bool(args.ledger):
        raise UsageError("check 需要且只要一个：--flows 或 --ledger")
    if args.flows:
        flows, errors = load_flows(args.flows, policy)
        if errors:
            report(errors)
            return 1
        print(f"ok: {len(flows)} 行流水")
        return 0
    errors = document_errors(read_json(args.ledger), policy, str(args.ledger))
    if errors:
        report(errors)
        return 1
    print(f"ok: {args.ledger}")
    return 0


def cmd_aggregate(args, policy: dict) -> int:
    flows, errors = load_flows(args.flows, policy)
    if errors:
        report(errors)
        return 1
    increment = aggregate(flows, args.batch, args.produced_by)
    errors = document_errors(increment, policy, "增量")
    if errors:
        report(errors)
        return 1
    write_text(args.out, dumps(increment))
    print(f"ok: {args.out}（{len(increment['rows'])} 类，剔除 {len(increment['excluded'])} 行）")
    return 0


def cmd_apply(args, policy: dict) -> int:
    ledger = read_json(args.ledger)
    increments = [(p, read_json(p)) for p in args.increment]
    errors = []
    for path, inc in increments:
        errors += document_errors(inc, policy, str(path))
        if isinstance(inc, dict) and "batch" not in inc:
            errors.append(f"{path}: 不是增量文件（缺 batch）")
    if errors:
        report(errors)
        return 1
    # The ledger is checked as it stands (`document_errors` on the merge result below covers the rest).
    if not isinstance(ledger, dict) or not isinstance(ledger.get("rows"), list) or "batch" in ledger:
        report([f"{args.ledger}: 不是台账文件"])
        return 1
    try:
        merged, applied, skipped = merge_increments(ledger, increments)
    except (KeyError, TypeError) as e:
        report([f"{args.ledger}: 合并失败，台账结构不完整（{e!r}）"])
        return 1
    errors = document_errors(merged, policy, str(args.ledger))
    if errors:
        report(errors)
        return 1
    for batch in skipped:
        print(f"already-applied {batch}")
    if applied:
        write_text(args.ledger, dumps(merged))
        print(f"applied {' '.join(applied)}")
    return 0


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise UsageError(f"{self.prog}: {message}")


def build_parser() -> Parser:
    p = Parser(prog="ledger.py", description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="command", required=True, parser_class=Parser)

    def common(s):
        s.add_argument("--policy", type=Path, default=Path(DEFAULT_POLICY), help="dispatch-policy.json（缺省：当前目录下的 %s）" % DEFAULT_POLICY)

    c = sub.add_parser("check", help="核对流水或台账")
    c.add_argument("--flows", nargs="+", type=Path)
    c.add_argument("--ledger", type=Path)
    common(c)
    a = sub.add_parser("aggregate", help="把流水汇总成增量文件")
    a.add_argument("--flows", nargs="+", type=Path, required=True)
    a.add_argument("--batch", required=True)
    a.add_argument("--out", type=Path, required=True)
    a.add_argument("--produced-by", default="ledger.py aggregate")
    common(a)
    p_apply = sub.add_parser("apply", help="把增量合进台账")
    p_apply.add_argument("--ledger", type=Path, required=True)
    p_apply.add_argument("--increment", nargs="+", type=Path, required=True)
    common(p_apply)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(sys.argv[1:] if argv is None else argv)
        policy = load_policy(args.policy)
        return {"check": cmd_check, "aggregate": cmd_aggregate, "apply": cmd_apply}[args.command](args, policy)
    except UsageError as e:
        print(str(e), file=sys.stderr)
        return 2
    except SystemExit as e:  # --help
        return e.code if isinstance(e.code, int) else 0


if __name__ == "__main__":
    sys.exit(main())
