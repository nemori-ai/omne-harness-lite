"""Observe registered documentation gaps without changing policy or sources."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

from .doc_support import repository_root
from .documentation_inputs import Inputs, discover, load
from .documentation_markdown import METHOD_VERSION, inspect, parse, sections

GAPS = {"missing-file", "empty-body", "placeholder-only", "missing-section"}
INDETERMINATE = {"unknown", "error", "not-applicable"}


def _row(document: dict, section: dict | None, status: str, reason: str,
         physical: str, signature: str, *, dependency: bool = False) -> dict:
    return {
        "identity": {"owner": document["owner"]["id"], "document": document["id"],
                     "section": section["id"] if section else None},
        "owner": document["owner"], "path": document["path"],
        "anchor": section["anchor"] if section else None,
        "registry": document["registry"], "kind": document["kind"],
        "visibility": document["visibility"], "required": document["required"],
        "basis": document["basis"], "applicability": document["applicability"],
        "expectationSource": document["expectationSource"],
        "gapAllowanceSource": document.get("gapAllowanceSource"),
        "inspectionProfile": document["inspectionProfile"], "status": status,
        "reason": reason, "physicalObservation": physical,
        "dependencyMissing": dependency, "requirementFingerprint": signature,
    }


def _signature(document: dict, inputs: Inputs) -> str:
    value = {key: item for key, item in document.items() if key != "registry"}
    sources = [document["owner"]["source"], document["expectationSource"]]
    if "gapAllowanceSource" in document:
        sources.append(document["gapAllowanceSource"])
    value["basisHashes"] = {source["path"]: inputs.files[source["path"]]["sha256"]
                            for source in sources}
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def observe(document: dict, inputs: Inputs) -> list[dict]:
    signature = _signature(document, inputs)
    try:
        text = inputs.read(document["path"])
        parsed = parse(text) if text is not None else []
        physical = inspect(parsed, document["inspectionProfile"], whole=True) if text is not None else "missing-file"
        if document["basis"] == "unknown" or document["applicability"] == "unknown":
            status, reason = "unknown", "basis or applicability is not determined"
        elif document["applicability"] == "not-applicable":
            status, reason = "not-applicable", "explicit basis declares this target inapplicable"
        else:
            status, reason = physical, "bounded Markdown structure observation"
    except (OSError, ValueError) as error:
        parsed, physical, status, reason = [], "error", "error", str(error)
    rows = [_row(document, None, status, reason, physical, signature)]
    ranges = sections(parsed)
    for section in document["requiredSections"]:
        dependency = physical in {"missing-file", "empty-body", "placeholder-only", "error"}
        if status in INDETERMINATE:
            child_status, child_reason = status, f"parent target: {reason}"
        elif dependency:
            child_status, child_reason = "missing-section", f"parent target is {physical}; dependent gap"
        elif section["anchor"] not in ranges:
            child_status, child_reason = "missing-section", "required anchor absent"
        else:
            start, end = ranges[section["anchor"]]
            observation = inspect(parsed[start:end], document["inspectionProfile"])
            child_status = "missing-section" if observation in GAPS else observation
            child_reason = f"section body: {observation}"
        rows.append(_row(document, section, child_status, child_reason, physical,
                         signature, dependency=dependency))
    return rows


def summary(rows: list[dict]) -> dict:
    def counts(selected):
        statuses = Counter(row["status"] for row in selected)
        gaps = [row for row in selected if row["status"] in GAPS]
        return {"units": len(selected), "statuses": dict(sorted(statuses.items())),
                "gapUnits": len(gaps), "independentGapUnits": sum(not row["dependencyMissing"] for row in gaps),
                "allowedGapUnits": sum(row["gapAllowanceSource"] is not None for row in gaps),
                "unallowedGapUnits": sum(row["gapAllowanceSource"] is None for row in gaps)}
    groups = {}
    for row in rows:
        key = f"{row['basis']}/{row['applicability']}/{'required' if row['required'] else 'optional'}"
        groups.setdefault(key, []).append(row)
    return {"documents": counts([row for row in rows if row["identity"]["section"] is None]),
            "sections": counts([row for row in rows if row["identity"]["section"] is not None]),
            "groups": {key: counts(value) for key, value in sorted(groups.items())}}


def inventory(root: Path, registries: list[str] | None = None) -> dict:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"inventory root is not a directory: {root}")
    inputs = Inputs(root)
    registry_paths = sorted(set(registries)) if registries else discover(root)
    documents, schema_hash = load(inputs, registry_paths)
    rows = [row for document in documents for row in observe(document, inputs)]
    inputs.verify()
    if not registries and registry_paths != discover(root):
        raise ValueError("registry discovery changed during inventory")
    code = b"".join((Path(__file__).parent / name).read_bytes() for name in
                    ("documentation_inventory.py", "documentation_inputs.py", "documentation_markdown.py", "doc_support.py"))
    return {"schemaVersion": 1, "kind": "documentation-inventory", "execution": {
        "status": "error" if any(row["status"] == "error" for row in rows) else "complete",
        "root": str(root), "registries": registry_paths, "registrySchemaVersion": 2,
        "schemaSha256": schema_hash, "method": METHOD_VERSION,
        "methodSha256": hashlib.sha256(code).hexdigest()},
        "inputs": sorted(inputs.files.values(), key=lambda item: item["path"]),
        "rows": rows, "summary": summary(rows), "delta": {"available": False,
        "reason": "no independent BASE supplied", "rows": []}, "limitations": [
            "Only registered targets and supported Markdown structures are inspected.",
            "Inspectable does not establish content sufficiency, adoption, implementation or reader experience.",
            "Unknown placeholder forms and HTML-only content are not semantic proof.",
            "Source hashes conservatively change the comparison basis; unrelated edits may make deltas incomparable.",
        ]}


def compare(base: dict, current: dict) -> dict:
    def keyed(report):
        return {json.dumps(row["identity"], sort_keys=True): row for row in report["rows"]}
    before, after, rows = keyed(base), keyed(current), []
    same_method = all(base["execution"][key] == current["execution"][key]
                      for key in ("schemaSha256", "methodSha256", "method"))
    for key in sorted(before.keys() | after.keys()):
        left, right = before.get(key), after.get(key)
        if not left or not right or not same_method or left["requirementFingerprint"] != right["requirementFingerprint"]:
            category = "measurement-change"
        elif left["status"] in INDETERMINATE or right["status"] in INDETERMINATE:
            category = "uncompared"
        elif left["status"] in GAPS and right["status"] in GAPS:
            category = "persistent"
        elif left["status"] in GAPS:
            category = "resolved"
        elif right["status"] in GAPS:
            category = "introduced"
        else:
            category = "unchanged"
        rows.append({"identity": (right or left)["identity"], "category": category,
                     "before": left["status"] if left else None,
                     "after": right["status"] if right else None})
    return {"available": True, "base": base["execution"], "baseInputs": base["inputs"],
            "summary": dict(sorted(Counter(row["category"] for row in rows).items())), "rows": rows}


def render(report: dict) -> str:
    lines = ["# 文档结构缺项报告", "", f"执行：{report['execution']['status']}。仅检查登记范围，不代表正文接受或实现符合。", ""]
    for key in ("documents", "sections"):
        count = report["summary"][key]
        lines += [f"{key}：{count['units']} 项；缺项 {count['gapUnits']}，其中允许暂缺 {count['allowedGapUnits']}；独立缺项根因 {count['independentGapUnits']}。", ""]
    if report.get("errors"):
        lines += ["执行错误：" + "; ".join(report["errors"]), ""]
    lines += ["| 目标 | 拥有者 | 状态 | 依据／适用 | 留空依据 | 原因 |", "|---|---|---|---|---|---|"]
    def cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ")
    for row in report["rows"]:
        target = row["path"] + ("#" + row["anchor"] if row["anchor"] else "")
        allowance = row["gapAllowanceSource"]
        allowance_text = allowance["path"] + ("#" + allowance["anchor"] if allowance.get("anchor") else "") if allowance else "无"
        values = [target, row["owner"]["id"], row["status"], row["basis"] + "/" + row["applicability"], allowance_text, row["reason"]]
        lines.append("| " + " | ".join(cell(value) for value in values) + " |")
    lines += ["", "增减：" + (json.dumps(report["delta"].get("summary", {}), ensure_ascii=False)
                                if report["delta"]["available"] else report["delta"]["reason"]), "",
              "限制：" + " ".join(report["limitations"]), ""]
    return "\n".join(lines)


def _publish(output: Path, filename: str, text: str) -> None:
    # Replace the directory entry; never follow a pre-existing output-file link.
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output,
                                     prefix=".inventory-", delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(text)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, output / filename)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("inventory", help="Observe current registered targets")
    command.add_argument("--root", type=Path)
    command.add_argument("--registry", action="append", help="Root-relative registry; repeat for local owners")
    command.add_argument("--base", type=Path, help="Independent baseline root with its own bindings and sources")
    command.add_argument("--out", type=Path, help="Explicit output directory outside source material (normally tmp)")
    command.add_argument("--summary", action="store_true", help="Print only JSON execution/counts; --out keeps full detail")
    args = parser.parse_args(argv)
    root = args.root.resolve() if args.root else None
    try:
        root = root if root is not None else repository_root()
        report = inventory(root, args.registry)
        if args.base:
            if args.base.resolve() == root:
                raise ValueError("BASE must be an independent root")
            base = inventory(args.base, args.registry)
            if base["execution"]["status"] == "error":
                raise ValueError("BASE inventory failed; current inputs cannot replace BASE")
            report["delta"] = compare(base, report)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        report = {"schemaVersion": 1, "kind": "documentation-inventory",
                  "execution": {"status": "error"}, "errors": [str(error)], "inputs": [],
                  "rows": [], "summary": summary([]), "delta": {"available": False,
                  "reason": "execution failed", "rows": []}, "limitations": ["Execution did not complete."]}
    try:
        if args.out:
            output = args.out.resolve()
            inspected = [path.resolve() for path in (root, args.base) if path is not None]
            if any(output.is_relative_to(path) and not output.is_relative_to(path / "tmp") for path in inspected):
                raise ValueError("output must not overlap inspected source directories; use tmp or an external directory")
            output.mkdir(parents=True, exist_ok=True)
            _publish(output, "inventory.json", json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            _publish(output, "inventory.md", render(report))
    except (OSError, ValueError) as error:
        print(f"ERROR: cannot publish inventory output: {error}", file=sys.stderr)
        return 2
    selected = {key: report[key] for key in ("execution", "summary")} if args.summary else report
    if args.summary:
        selected["delta"] = {key: value for key, value in report["delta"].items()
                             if key not in {"rows", "baseInputs"}}
        if report.get("errors"):
            selected["errors"] = report["errors"]
    print(json.dumps(selected, ensure_ascii=False, indent=2))
    return 2 if report["execution"]["status"] == "error" else 0


if __name__ == "__main__":
    raise SystemExit(main())
