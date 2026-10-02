from __future__ import annotations

import json
import sys
from pathlib import Path

TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

import spec_retention  # noqa: E402

BASELINE = "baseline-1"


def coordinate(contract_id: str, version: int) -> dict:
    return {"baseline_id": BASELINE, "contract_id": contract_id, "version": version}


def entry(contract_id: str, version: int, dependencies=()) -> dict:
    family = {"data": "data", "capability": "capabilities", "composition": "compositions"}[contract_id.split(".")[0]]
    topic = contract_id.split(".", 1)[1]
    directory = f"spec/{family}/{topic}/v{version}"
    return {
        "coordinate": coordinate(contract_id, version),
        "family": family,
        "topic": topic,
        "status": "accepted",
        "contract_path": f"{directory}/contract.md",
        "resources": [f"{directory}/contract.md"],
        "dependencies": [{"coordinate": coordinate(*target), "clauses": ["S-1"], "rebase_relation": None}
                         for target in dependencies],
    }


def write(root: Path, relative: str, text: str) -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def tree(tmp_path: Path) -> Path:
    """shape 有 v1、v2、v3；gate 的最新版 v2 依赖 shape v1，旧版 v1 依赖 shape v2；solo 只有一版。"""
    root = tmp_path / "design"
    contracts = [
        entry("data.shape", 1), entry("data.shape", 2), entry("data.shape", 3),
        entry("capability.gate", 1, [("data.shape", 2)]),
        entry("capability.gate", 2, [("data.shape", 1), ("data.shape", 3)]),
        entry("capability.solo", 1),
    ]
    write(root, "registry/catalog.json", json.dumps({"format": 1, "baseline_id": BASELINE, "contracts": contracts}))
    write(root, "registry/covers.json", json.dumps({"covers": [
        {"requirement": {"topic": "PF-1", "clause": "a"}, "target": {"contract_id": "data.shape", "version": 1,
                                                                    "clauses": ["S-1"]}},
        {"requirement": {"topic": "PF-1", "clause": "b"}, "target": {"contract_id": "data.shape", "version": 1,
                                                                    "clauses": ["S-2"]}},
        {"requirement": {"topic": "PF-1", "clause": "c"}, "target": {"contract_id": "data.shape", "version": 3,
                                                                    "clauses": ["S-1"]}},
    ]}))
    write(root, "registry/formal-tasks.json", json.dumps({"tasks": [
        {"id": "gate-v1-order", "kind": "tla",
         "artifacts": ["spec/capabilities/gate/v1/formal/Order.tla", "spec/capabilities/gate/v1/formal/Order.cfg"]},
        {"id": "gate-v2-order", "kind": "tla", "artifacts": ["spec/capabilities/gate/v2/formal/Order.tla"]},
    ]}))
    for item in contracts:
        write(root, item["contract_path"], "# contract\n")
    write(root, "spec/capabilities/gate/v1/formal/Order.tla", "---- MODULE Order ----\n")
    write(root, "spec/capabilities/gate/v2/formal/Order.tla", "---- MODULE Order ----\n")
    write(root, "spec/capabilities/gate/v2/formal/Extra.tla", "---- MODULE Extra ----\n")
    write(root, "spec/capabilities/solo/v1/formal/Shape.als", "sig A {}\n")
    # 最新版规格里指向旧版的链接：两条；同一版本目录内部的链接不算。
    write(root, "spec/capabilities/gate/v2/contract.md",
          "# contract\n[旧形状](../../../data/shape/v1/contract.md#s-1) [再一次](../../../data/shape/v1/contract.md)\n"
          "[自己](examples.md) [最新形状](../../../data/shape/v3/contract.md)\n")
    # 规格 topic 的入口（不在版本目录里）与旧版规格里的链接：归「别的规格文件」。
    write(root, "spec/data/shape/README.md", "[v2](v2/contract.md)\n")
    write(root, "spec/capabilities/gate/v1/contract.md", "[形状](../../../data/shape/v2/contract.md)\n")
    # 其余设计文档；围栏里的不算，带 scheme 的不算，指到设计根外面的不算。
    write(root, "realization/packages/core/gate/design.md",
          "[旧契约](../../../../spec/capabilities/gate/v1/contract.md)\n```\n"
          "[围栏里](../../../../spec/capabilities/gate/v1/contract.md)\n```\n"
          "[外链](https://example.com/spec/capabilities/gate/v1/) [根外](../../../../../outside.md)\n")
    write(root, "realization/packages/core/gate/bindings.yaml",
          'bindings:\n  - clause: "capability.gate/v1#S-3"\n    evidence: x\n'
          '  - clause: "capability.gate/v1#S-4"\n  - clause: "capability.gate/v2#S-3"\n'
          '  - clause: "data.shape/v2#S-1"\n')
    # 模板不算。
    write(root, "spec/.templates/topic/README.md", "[x](../../data/shape/v1/contract.md)\n")
    return root


def by_coordinate(report: dict) -> dict[str, dict]:
    return {item["coordinate"]: item for item in report["old_versions"]}


def test_counts_every_kind_of_consumer_of_each_old_version(tmp_path: Path):
    report = spec_retention.build_report(tree(tmp_path), [])

    assert (report["contracts"], report["version_directories"], report["old_version_directories"]) == (3, 6, 3)
    assert report["contracts_with_old_versions"] == 2
    old = by_coordinate(report)
    assert set(old) == {"data.shape/v1", "data.shape/v2", "capability.gate/v1"}
    assert old["data.shape/v1"]["latest"] == 3
    assert old["data.shape/v1"]["consumers"] == {
        "dependencies_from_latest": 1, "dependencies_from_old": 0, "covers": 2, "formal_tasks": 0,
        "binding_rows": 0, "links_from_latest_specs": 2, "links_from_other_specs": 0, "links_from_elsewhere": 0}
    assert old["data.shape/v2"]["consumers"] == {
        "dependencies_from_latest": 0, "dependencies_from_old": 1, "covers": 0, "formal_tasks": 0,
        "binding_rows": 1, "links_from_latest_specs": 0, "links_from_other_specs": 2, "links_from_elsewhere": 0}
    assert old["capability.gate/v1"]["consumers"] == {
        "dependencies_from_latest": 0, "dependencies_from_old": 0, "covers": 0, "formal_tasks": 1,
        "binding_rows": 2, "links_from_latest_specs": 0, "links_from_other_specs": 0, "links_from_elsewhere": 1}
    assert report["removable"] == []


def test_orders_old_versions_by_registered_references_first(tmp_path: Path):
    report = spec_retention.build_report(tree(tmp_path), [])

    assert [(item["coordinate"], item["registered"]) for item in report["old_versions"]] == [
        ("data.shape/v2", 2), ("capability.gate/v1", 3), ("data.shape/v1", 3)]


def test_latest_models_without_a_task_are_listed_and_old_ones_are_not(tmp_path: Path):
    report = spec_retention.build_report(tree(tmp_path), [])

    assert report["latest_models_without_task"] == [
        "spec/capabilities/gate/v2/formal/Extra.tla", "spec/capabilities/solo/v1/formal/Shape.als"]


def test_an_old_version_nothing_refers_to_is_reported_as_removable(tmp_path: Path):
    root = tree(tmp_path)
    catalog = json.loads((root / "registry/catalog.json").read_text(encoding="utf-8"))
    catalog["contracts"].append(entry("capability.solo", 2))
    (root / "registry/catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    write(root, "spec/capabilities/solo/v2/contract.md", "# contract\n")

    report = spec_retention.build_report(root, [])

    assert report["removable"] == ["capability.solo/v1"]
    assert report["old_versions"][0]["coordinate"] == "capability.solo/v1"
    # solo/v1 不再是最新版，它那份没有任务的模型不再列入「最新版里没有任务的模型」。
    assert report["latest_models_without_task"] == ["spec/capabilities/gate/v2/formal/Extra.tla"]


def test_contract_filter_narrows_the_report_and_rejects_unknown_contracts(tmp_path: Path, capsys):
    root = tree(tmp_path)

    report = spec_retention.build_report(root, ["capability.gate"])
    assert (report["contracts"], report["old_version_directories"]) == (1, 1)
    assert report["latest_models_without_task"] == ["spec/capabilities/gate/v2/formal/Extra.tla"]

    assert spec_retention.main(["--root", str(root), "--contract", "capability.nope"]) == 1
    assert "capability.nope" in capsys.readouterr().err


def test_text_report_states_totals_and_what_it_did_not_count(tmp_path: Path, capsys):
    assert spec_retention.main(["--root", str(tree(tmp_path))]) == 0
    out = capsys.readouterr().out

    assert "3 份契约、6 个版本目录，其中旧版 3 个（分属 2 份契约）" in out
    assert "| `data.shape/v1` | v3 | 1 | 0 | 2 | 0 | 0 | 2 | 0 | 0 |" in out
    assert "可以先删的旧版：没有。" in out
    assert "没有数的：" in out and "语义上是否等价" in out


def test_json_output_is_the_same_report(tmp_path: Path, capsys):
    root = tree(tmp_path)
    assert spec_retention.main(["--root", str(root), "--format", "json"]) == 0

    assert json.loads(capsys.readouterr().out) == spec_retention.build_report(root, [])


def test_unreadable_registry_is_an_error_not_an_empty_report(tmp_path: Path, capsys):
    root = tree(tmp_path)
    (root / "registry/catalog.json").write_text("{", encoding="utf-8")

    assert spec_retention.main(["--root", str(root)]) == 1
    assert "invalid JSON" in capsys.readouterr().err
