from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

import realization_nodes  # noqa: E402
from realization_nodes import Checker  # noqa: E402

TOPIC = "product/PF-020-cli"
CLI = "realization/apps/cli"
CORE = "realization/packages/core"
UP = "../../.."  # 节点目录到设计根

ENTRY = f"""# CLI

- kind：assembly
- 源码位置：`apps/cli`（尚未建包）
- 交付面：[PF-020 命令行](%s/{TOPIC}/README.md)（rev 3）

| 当前问题 | 阅读入口 |
|---|---|
| 这个应用是什么形状 | [应用形状](architecture.md) |
| 哪条承诺靠哪份证据 | [绑定表](bindings.yaml) |
""" % UP

SHAPE = f"""# CLI 的形状

## 交付面与非目标

这是 [PF-020 命令行]({UP}/{TOPIC}/README.md)（rev 3）的交付面；不做 Web。

## 拓扑与进程模型

| 进程 | 生命周期与所有者 | 承载什么 | 崩溃或退出时谁收口 |
|---|---|---|---|
| cli | 用户起停 | 会话前台 | 在途请求随进程消失 |

**与其他应用的边**——只写本侧：

| 边 | 对端 | 契约坐标 | 本侧责任 |
|---|---|---|---|
| 登录 | 尚无节点 | `capability.account-identity/v1` | 发起认证 |
| 治理 | 尚无节点 | 待立：capability.governance | 发起请求 |

## 交互面

| 面 | 入口 | 语义归谁 | 精确形状归谁 |
|---|---|---|---|
| 人用 | 命令族 | PF-020 §2 | `data.identity-values/v1` |

## 包分层与依赖规则

| 层 | 包 | 可以依赖 | 不可以依赖 |
|---|---|---|---|
| 装配 | apps/cli | 能力包 | 提供者内部 |

## 技术栈采用

| 选型点 | 采用 | 精确版本 | 状态 | 依据 |
|---|---|---|---|---|
| 运行时 | Node.js | 24.1.0 | 已采用 | [决定]({UP}/record/decisions/cli-runtime/decision.md) |
| 渲染层 | Ink | 未钉 | candidate | [提案]({UP}/record/proposals/cli-renderer/alternatives.md) |

## 分发与升级

单文件分发。
"""

BINDINGS = """version: 1
node: "cli"
kind: "assembly"

bindings: []
"""

PROVIDER_ENTRY = """# core

- kind：provider
- 源码位置：`packages/core`
- 契约采用与边界依据：`capability.account-identity/v1`

| 当前问题 | 阅读入口 |
|---|---|
| 怎样实现 | [实现设计](design.md) |
"""

PROVIDER_BINDINGS = """version: 1
node: "core"
kind: "provider"

bindings:
  - clause: "capability.account-identity/v1#S-1"
    evidence: "test:core-identity"
    assumptions: []
    alignment_checked: "2026-09-22"
"""

CATALOG = {
    "format": 1,
    "baseline_id": "fixture-baseline",
    "contracts": [
        {"coordinate": {"baseline_id": "fixture-baseline", "contract_id": name, "version": 1}}
        for name in ("capability.account-identity", "data.identity-values")
    ],
}


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    root = tmp_path / "design"
    files = {
        f"{TOPIC}/README.md": "---\nid: PF-020\nrevision: 3\nstatus: active\n---\n# PF-020 命令行\n",
        "registry/catalog.json": json.dumps(CATALOG, ensure_ascii=False, indent=2) + "\n",
        "record/decisions/cli-runtime/decision.md": "# 采用 Node.js\n",
        "record/proposals/cli-renderer/alternatives.md": "# 渲染层候选\n",
        f"{CLI}/README.md": ENTRY,
        f"{CLI}/architecture.md": SHAPE,
        f"{CLI}/bindings.yaml": BINDINGS,
        f"{CORE}/README.md": PROVIDER_ENTRY,
        f"{CORE}/design.md": "# core 的实现\n",
        f"{CORE}/bindings.yaml": PROVIDER_BINDINGS,
    }
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return root


def errors(root: Path, **options: str) -> list[str]:
    checker = Checker(root, **options)
    checker.check()
    return checker.errors


def edit(root: Path, name: str, old: str, new: str) -> None:
    path = root / name
    text = path.read_text(encoding="utf-8")
    assert old in text
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def test_clean_tree_passes(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert errors(tree) == []
    assert realization_nodes.main(["--root", str(tree)]) == 0
    assert "2 个实现映射节点（apps 1、packages 1）" in capsys.readouterr().out


def test_empty_realization_passes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (tmp_path / "design/realization/apps").mkdir(parents=True)
    assert realization_nodes.main(["--root", str(tmp_path / "design")]) == 0
    assert "还没有节点" in capsys.readouterr().out


def test_missing_realization_directory_fails(tmp_path: Path) -> None:
    (tmp_path / "design").mkdir()
    assert any("realization/ 不存在" in message for message in errors(tmp_path / "design"))


# ── 1 kind 与目录名 ────────────────────────────────────────────────────
def test_kind_must_be_one_of_the_two(tree: Path) -> None:
    edit(tree, f"{CLI}/README.md", "- kind：assembly", "- kind：应用")
    assert any("kind 写的是「应用」" in message for message in errors(tree))
    edit(tree, f"{CLI}/README.md", "- kind：应用\n", "")
    assert any("没有「- kind：」行" in message for message in errors(tree))


def test_bindings_node_and_kind_must_match_the_directory_and_entry(tree: Path) -> None:
    edit(tree, f"{CLI}/bindings.yaml", 'node: "cli"', 'node: "cli-app"')
    found = errors(tree)
    assert any("node 写的是「cli-app」" in message and "bindings.yaml:2" in message for message in found)
    edit(tree, f"{CLI}/bindings.yaml", 'kind: "assembly"', 'kind: "provider"')
    assert any("kind 写的是「provider」，README 里是「assembly」" in message for message in errors(tree))


def test_missing_bindings_file_is_reported(tree: Path) -> None:
    (tree / CORE / "bindings.yaml").unlink()
    assert any("节点缺 bindings.yaml" in message for message in errors(tree))


# ── 2 architecture.md 的有无 ──────────────────────────────────────────
def test_assembly_needs_architecture_and_provider_must_not_have_one(tree: Path) -> None:
    (tree / CLI / "architecture.md").unlink()
    assert any("assembly 节点必须有 architecture.md" in message for message in errors(tree))
    (tree / CORE / "architecture.md").write_text("# core 的形状\n", encoding="utf-8")
    assert any("provider 节点不该有 architecture.md" in message for message in errors(tree))


# ── 3 源码位置 ────────────────────────────────────────────────────────
def test_source_path_last_segment_and_area_must_match(tree: Path) -> None:
    edit(tree, f"{CLI}/README.md", "源码位置：`apps/cli`", "源码位置：`apps/console`")
    assert any("源码位置是「apps/console」" in message for message in errors(tree))
    edit(tree, f"{CLI}/README.md", "源码位置：`apps/console`", "源码位置：`packages/cli`")
    assert any("源码位置是「packages/cli」" in message for message in errors(tree))


def test_packages_group_without_readme_holds_two_layer_nodes(tree: Path) -> None:
    # packages/<group>/<node>：第一层没有 README 的目录是 group，节点在下一层；源码位置要写完整两层。
    import shutil
    group = tree / "realization/packages/tenancy"
    group.mkdir()
    shutil.move(str(tree / CORE), str(group / "core"))
    node = "realization/packages/tenancy/core"
    assert any("源码位置是「packages/core」" in message and "packages/tenancy/core" in message
               for message in errors(tree))
    edit(tree, f"{node}/README.md", "源码位置：`packages/core`", "源码位置：`packages/tenancy/core`")
    assert errors(tree) == []


def test_source_path_may_say_not_built_yet(tree: Path) -> None:
    edit(tree, f"{CLI}/README.md", "源码位置：`apps/cli`（尚未建包）", "源码位置：尚未建包")
    assert errors(tree) == []
    edit(tree, f"{CLI}/README.md", "源码位置：尚未建包", "源码位置：待定")
    assert any("要么写「尚未建包」" in message for message in errors(tree))


# ── 4 交付面 PF 的 rev ────────────────────────────────────────────────
def test_delivery_face_needs_a_pf_link_with_rev(tree: Path) -> None:
    edit(tree, f"{CLI}/README.md", f"README.md)（rev 3）", "README.md)")
    assert any("指向 PF-020 的链接后面没有「（rev N）」" in message for message in errors(tree))
    edit(tree, f"{CLI}/README.md", f"- 交付面：[PF-020 命令行]({UP}/{TOPIC}/README.md)\n", "- 交付面：CLI\n")
    assert any("交付面没有指向 product/PF-*/README.md 的链接" in message for message in errors(tree))


def test_delivery_rev_drift_fails_by_default_and_warns_on_demand(tree: Path) -> None:
    edit(tree, f"{TOPIC}/README.md", "revision: 3", "revision: 4")
    found = errors(tree)
    assert len(found) == 2  # README 的交付面行与 architecture.md 的那一节各一处
    assert all("标的是 PF-020 rev 3，该 topic 现在是 rev 4" in message for message in found)
    assert errors(tree, stale="warn") == []
    assert realization_nodes.main(["--root", str(tree), "--stale", "warn"]) == 0


def test_architecture_delivery_section_must_exist(tree: Path) -> None:
    edit(tree, f"{CLI}/architecture.md", "## 交付面与非目标", "## 交付面")
    assert any("没有「交付面与非目标」一节" in message for message in errors(tree))


# ── 5 技术栈采用 ──────────────────────────────────────────────────────
def test_stack_status_has_only_two_values(tree: Path) -> None:
    edit(tree, f"{CLI}/architecture.md", "| 24.1.0 | 已采用 |", "| 24.1.0 | 试用 |")
    assert any("状态写的是「试用」" in message for message in errors(tree))


def test_adopted_needs_a_decision_and_candidate_needs_a_proposal(tree: Path) -> None:
    edit(tree, f"{CLI}/architecture.md", f"[决定]({UP}/record/decisions/cli-runtime/decision.md)",
         f"[提案]({UP}/record/proposals/cli-renderer/alternatives.md)")
    assert any("「已采用」的依据要链到 record/decisions/<topic>/decision.md" in message for message in errors(tree))
    edit(tree, f"{CLI}/architecture.md", f"| Ink | 未钉 | candidate | [提案]({UP}/record/proposals/cli-renderer/alternatives.md) |",
         "| Ink | 未钉 | candidate | 待定 |")
    assert any("「candidate」的依据要链到 record/proposals/<topic>/ 下的文件" in message for message in errors(tree))


def test_basis_link_must_point_at_a_file_that_exists(tree: Path) -> None:
    (tree / "record/decisions/cli-runtime/decision.md").unlink()
    found = errors(tree)
    assert any("依据链到 record/decisions/cli-runtime/decision.md，但这个文件不存在" in message for message in found)
    assert any("链接解析不到" in message for message in found)  # 同一条链接也进相对链接检查


def test_stack_section_must_carry_the_table(tree: Path) -> None:
    edit(tree, f"{CLI}/architecture.md", "| 选型点 | 采用 | 精确版本 | 状态 | 依据 |", "| 选型点 | 采用 |")
    assert any("没有带「状态」「依据」两列的表" in message for message in errors(tree))


# ── 6 契约坐标 ────────────────────────────────────────────────────────
def test_contract_coordinates_must_exist_in_the_catalog(tree: Path) -> None:
    edit(tree, f"{CLI}/architecture.md", "`capability.account-identity/v1`", "`capability.account-identity/v2`")
    assert any("`capability.account-identity/v2` 不在 registry/catalog.json 里" in message for message in errors(tree))
    edit(tree, f"{CLI}/architecture.md", "`data.identity-values/v1`", "`composition.unknown/v1`")
    assert any("`composition.unknown/v1` 不在 registry/catalog.json 里" in message for message in errors(tree))


def test_coordinate_cell_accepts_only_a_coordinate_or_an_announced_gap(tree: Path) -> None:
    assert not any("契约坐标" in message for message in errors(tree))  # 「待立：…」那一行照常通过
    edit(tree, f"{CLI}/architecture.md", "待立：capability.governance", "以后再说")
    assert any("「契约坐标」写的是「以后再说」" in message for message in errors(tree))
    edit(tree, f"{CLI}/architecture.md", "| 人用 | 命令族 | PF-020 §2 | `data.identity-values/v1` |",
         "| 人用 | 命令族 | PF-020 §2 | 见文档 |")
    assert any("「精确形状归谁」写的是「见文档」" in message for message in errors(tree))


def test_missing_catalog_is_reported_once(tree: Path) -> None:
    (tree / "registry/catalog.json").unlink()
    found = [message for message in errors(tree) if "registry/catalog.json 不存在" in message]
    assert len(found) == 1


# ── 7 draft 的交付面不得登记绑定 ──────────────────────────────────────
def test_draft_delivery_face_forbids_bindings(tree: Path) -> None:
    edit(tree, f"{TOPIC}/README.md", "status: active", "status: draft")
    assert errors(tree) == []  # 空表照常通过
    edit(tree, f"{CLI}/bindings.yaml", "bindings: []", 'bindings:\n  - clause: "capability.account-identity/v1#S-1"')
    assert any("PF-020 的 status 还是 draft" in message and "现在有 1 条" in message for message in errors(tree))
    edit(tree, f"{TOPIC}/README.md", "status: draft", "status: active")
    assert errors(tree) == []  # topic 被接受之后，同样的绑定就不再是错


def test_unreadable_bindings_yaml_is_reported(tree: Path) -> None:
    (tree / CLI / "bindings.yaml").write_text("node: [cli\n", encoding="utf-8")
    assert any("YAML 解析失败" in message for message in errors(tree))


# ── 8 相对链接 ────────────────────────────────────────────────────────
def test_relative_links_must_resolve(tree: Path) -> None:
    edit(tree, f"{CLI}/README.md", "[应用形状](architecture.md)", "[应用形状](shape.md)")
    assert any(f"{CLI}/README.md:9: 链接解析不到：shape.md" in message for message in errors(tree))
    edit(tree, f"{CLI}/README.md", "[应用形状](shape.md)", "[应用形状](https://example.invalid/shape)")
    assert errors(tree) == []  # 外链不查


# ── 装配声明 ──────────────────────────────────────────────────────────
PROVIDER_DESIGN = "# core 的实现\n\n## 插件边界与服务面\n\n一个插件。\n"

ASSEMBLY = """
assembly:
  defines:
    - key: accounts
      contract: capability.account-identity
      source: design.md#插件边界与服务面
  plugins:
    - name: core-accounts
      source: design.md#插件边界与服务面
      provides: [accounts]
      injects: [storage]
      emits:
        - event: core/account-activated
          mode: emit
"""

COMPOSITION = """
composition:
  plugins:
    - id: accounts
      node: packages/core
      plugin: core-accounts
      layer: distribution
      source: architecture.md#拓扑与进程模型
"""


def declare(root, provider: str = ASSEMBLY, assembly: str = COMPOSITION) -> None:
    (root / f"{CORE}/design.md").write_text(PROVIDER_DESIGN, encoding="utf-8")
    with (root / f"{CORE}/bindings.yaml").open("a", encoding="utf-8") as out:
        out.write(provider)
    with (root / f"{CLI}/bindings.yaml").open("a", encoding="utf-8") as out:
        out.write(assembly)


def test_declarations_that_follow_the_shape_pass(tree) -> None:
    declare(tree)
    assert errors(tree) == []


def test_existing_nodes_without_declarations_still_pass(tree) -> None:
    assert errors(tree) == []


def test_unknown_top_level_key_fails(tree) -> None:
    with (tree / f"{CORE}/bindings.yaml").open("a", encoding="utf-8") as out:
        out.write("plugins: []\n")
    assert any("顶层键 `plugins` 不认识" in e for e in errors(tree))


def test_mode_must_be_one_of_the_five_dispatches(tree) -> None:
    declare(tree, provider=ASSEMBLY.replace("mode: emit", "mode: broadcast"))
    text = (tree / f"{CORE}/bindings.yaml").read_text(encoding="utf-8")
    line = text.splitlines().index("          mode: broadcast") + 1
    found = [e for e in errors(tree) if "mode「broadcast」不在五种派发里" in e]
    assert len(found) == 1 and f"bindings.yaml:{line}: assembly.plugins[0].emits[0].mode" in found[0]


def test_service_key_provided_twice_in_one_node_fails(tree) -> None:
    twice = ASSEMBLY + """    - name: core-accounts-copy
      source: design.md#插件边界与服务面
      provides: [accounts]
"""
    declare(tree, provider=twice)
    assert any("服务键「accounts」在本节点的 provides 里写了两次" in e for e in errors(tree))


def test_source_anchor_must_exist(tree) -> None:
    declare(tree, provider=ASSEMBLY.replace("design.md#插件边界与服务面\n      provides",
                                            "design.md#没有这一节\n      provides"))
    assert any("锚点在 design.md 里找不到：#没有这一节" in e for e in errors(tree))


def test_composition_naming_a_plugin_the_provider_does_not_declare_fails(tree) -> None:
    declare(tree, assembly=COMPOSITION.replace("plugin: core-accounts", "plugin: core-ledger"))
    assert any("assembly.plugins 里没有「core-ledger」" in e for e in errors(tree))


def test_composition_naming_an_undeclared_provider_only_hints(tree) -> None:
    declare(tree, provider="")
    checker = Checker(tree)
    checker.check()
    assert checker.errors == []
    assert any("还没声明 assembly" in hint for hint in checker.hints)


def test_composition_belongs_to_assembly_nodes_only(tree) -> None:
    declare(tree, provider=ASSEMBLY + COMPOSITION)
    assert any("composition 只给装配节点" in e for e in errors(tree))


def test_layer_is_distribution_or_operator(tree) -> None:
    declare(tree, assembly=COMPOSITION.replace("layer: distribution", "layer: tenant"))
    assert any("layer「tenant」只能是 distribution 或 operator" in e for e in errors(tree))


def test_defines_takes_a_contract_id_known_to_the_catalog(tree) -> None:
    declare(tree, provider=ASSEMBLY.replace("contract: capability.account-identity",
                                            "contract: capability.account-identity/v1"))
    assert any("不在 registry/catalog.json 里（只写 contract_id）" in e for e in errors(tree))


def test_defines_may_name_an_owner_node_instead_of_a_contract(tree) -> None:
    declare(tree, provider=ASSEMBLY.replace("contract: capability.account-identity",
                                            "owner: packages/core"))
    assert errors(tree) == []


def test_defines_takes_exactly_one_of_contract_and_owner(tree) -> None:
    declare(tree, provider=ASSEMBLY.replace("contract: capability.account-identity",
                                            "contract: capability.account-identity\n      owner: packages/core"))
    assert any("contract 与 owner 恰写其一" in e for e in errors(tree))


def test_defines_owner_must_be_a_node(tree) -> None:
    declare(tree, provider=ASSEMBLY.replace("contract: capability.account-identity",
                                            "owner: packages/core/nowhere"))
    assert any("owner「packages/core/nowhere」不是一个实现映射节点" in e for e in errors(tree))


IMPORT_EXCEPTION = """
  importExceptions:
    - target: packages/tenancy/ledger
      symbols: [readAccountInTransaction]
      sharedStorage: accountRows
      source: design.md#插件边界与服务面
"""


def declare_import_exception(root: Path, declaration: str = IMPORT_EXCEPTION) -> None:
    target = root / "realization/packages/tenancy/ledger"
    target.mkdir(parents=True)
    (target / "README.md").write_text(
        PROVIDER_ENTRY.replace("# core", "# ledger").replace("`packages/core`", "`packages/tenancy/ledger`"),
        encoding="utf-8",
    )
    (target / "design.md").write_text(PROVIDER_DESIGN, encoding="utf-8")
    (target / "bindings.yaml").write_text('version: 1\nnode: ledger\nkind: provider\nbindings: []\n', encoding="utf-8")
    declare(root, provider=ASSEMBLY + declaration)


def test_import_exception_names_a_target_symbol_storage_and_source(tree) -> None:
    declare_import_exception(tree)
    assert errors(tree) == []


@pytest.mark.parametrize(("old", "new", "message"), [
    ("target: packages/tenancy/ledger", "target: packages/tenancy/missing", "不是一个实现映射节点"),
    ("target: packages/tenancy/ledger", "target: packages/core", "不能指向本节点"),
    ("symbols: [readAccountInTransaction]", "symbols: []", "至少点名一个事务内读函数"),
    ("symbols: [readAccountInTransaction]", "symbols: ['*']", "不许用 `*`"),
    ("symbols: [readAccountInTransaction]", "symbols: [readAccountInTransaction, readAccountInTransaction]", "符号「readAccountInTransaction」重复"),
    ("symbols: [readAccountInTransaction]", "symbols: [false]", "非空字符串的列表"),
    ("sharedStorage: accountRows", "sharedStorage: '  '", "sharedStorage 要点名"),
    ("source: design.md#插件边界与服务面", "source: design.md#没有这一节", "锚点在 design.md 里找不到"),
])
def test_import_exception_rejects_incomplete_or_blanket_permissions(tree, old, new, message) -> None:
    declare_import_exception(tree, IMPORT_EXCEPTION.replace(old, new))
    assert any(message in error for error in errors(tree))


def test_import_exception_requires_shared_storage(tree) -> None:
    declare_import_exception(tree, IMPORT_EXCEPTION.replace("      sharedStorage: accountRows\n", ""))
    assert any("sharedStorage 要点名" in error for error in errors(tree))


def test_import_exception_duplicate_across_rows_reports_the_later_symbol_line(tree) -> None:
    row = IMPORT_EXCEPTION.split("  importExceptions:\n", 1)[1]
    declare_import_exception(tree, IMPORT_EXCEPTION + row)
    text = (tree / f"{CORE}/bindings.yaml").read_text(encoding="utf-8")
    line = max(number for number, value in enumerate(text.splitlines(), 1) if "symbols:" in value)
    found = [error for error in errors(tree) if "符号「readAccountInTransaction」重复" in error]
    assert len(found) == 1
    assert f"bindings.yaml:{line}: assembly.importExceptions[1].symbols" in found[0]


def test_defines_cannot_be_declared_outside_core(tree) -> None:
    declare_import_exception(tree)
    target = tree / "realization/packages/tenancy/ledger/bindings.yaml"
    with target.open("a", encoding="utf-8") as out:
        out.write(ASSEMBLY)
    found = [error for error in errors(tree) if "服务定义声明只给 packages/core" in error]
    assert len(found) == 1
    assert "realization/packages/tenancy/ledger/bindings.yaml" in found[0]
