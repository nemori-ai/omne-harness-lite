from __future__ import annotations

import sys
from pathlib import Path

import pytest

TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

import domain_objects  # noqa: E402
from domain_objects import Reconciler  # noqa: E402

TOPIC = "product/PF-001-identity"
VOLUME = "ubiquitous_language/terms/subjects.md"


def term(uid: str, zh: str, en: str, morph: str, rev: int = 2, extra: str = "") -> str:
    return (f"### {uid} · {zh} · {en}\n\n> **中**：……\n\n- **形态**：{morph}\n"
            f"- **出处**：[PF-001 §4](../../{TOPIC}/design.md#{zh})（rev {rev}）\n{extra}\n")


def card(uid: str, zh: str, rev: int = 2, host: str = "—") -> str:
    return (f"### {uid} · {zh}\n\n- **宿主**：{host}\n- **身份**：登录标识\n- **生灭**：注册 → 激活；无注销\n"
            f"- **依据**：[PF-001 §4](../{TOPIC}/design.md#{zh})（rev {rev}）\n\n")


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    root = tmp_path / "design"
    files = {
        f"{TOPIC}/README.md": "---\nid: PF-001\nrevision: 2\n---\n# PF-001\n",
        f"{TOPIC}/design.md": ("# PF-001\n\n- 修订：rev 2\n\n## 账号\n\n"
                               "见[登录状态](../../ubiquitous_language/terms/subjects.md#ul-login-state--登录状态--login-state)。\n\n"
                               "## 登录状态\n\n## 个人组织\n\n## 组织\n"),
        f"{TOPIC}/changelog.md": "# 变更\n\n## rev 2 — 2026-09-19\n",
        VOLUME: ("# 主体与归属\n\n" + term("UL-account", "账号", "Account", "对象")
                 + term("UL-login-state", "登录状态", "Login State", "对象")
                 + term("UL-organization", "组织", "Organization", "对象")
                 + term("UL-personal-organization", "个人组织", "Personal Organization",
                        "变体（父：[组织](#ul-organization--组织--organization)）")),
        "ubiquitous_language/index.md": "# 索引\n\n| ID | 中文 | English | 一句话 |\n|---|---|---|---|\n" + "".join(
            f"| [{uid}](terms/subjects.md#{uid.lower()}--{zh}--{en.lower().replace(' ', '-')}) | {zh} | {en} | …… |\n"
            for uid, zh, en in (("UL-account", "账号", "Account"), ("UL-login-state", "登录状态", "Login State"),
                                ("UL-organization", "组织", "Organization"),
                                ("UL-personal-organization", "个人组织", "Personal Organization"))),
        "ubiquitous_language/conflicts.md": "# 对不上的地方\n",
        "domain_objects/objects.md": ("# 对象条目\n\n" + card("UL-account", "账号")
                                      + card("UL-login-state", "登录状态", host="[账号](#ul-account--账号)")
                                      + card("UL-organization", "组织")),
        "domain_objects/pending.md": ("# 待裁\n\n### 存储\n\n- **现象**：没有定义\n"
                                      f"- **牵涉**：[PF-001 §4](../{TOPIC}/design.md#账号)（rev 2）\n"
                                      "- **谁来裁**：PF-001 的 owner\n- **闭合条件**：有 topic 定义它\n"),
        "views/README.md": "# 派生视图\n",
    }
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return root


def errors(root: Path, **options: str) -> list[str]:
    reconciler = Reconciler(root, **options)
    reconciler.load()
    reconciler.reconcile()
    return reconciler.errors


def edit(root: Path, name: str, old: str, new: str) -> None:
    path = root / name
    text = path.read_text(encoding="utf-8")
    assert old in text
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def test_consistent_tree_passes_and_view_round_trips(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert errors(tree) == []
    assert domain_objects.main(["--root", str(tree)]) == 1  # 总表还没生成
    assert domain_objects.main(["--root", str(tree), "--write"]) == 0
    assert domain_objects.main(["--root", str(tree)]) == 0
    view = (tree / "views/domain-object-map.md").read_text(encoding="utf-8")
    assert "derived-from" in view and "个人组织" in view
    # 宿主里的站内链接搬到 views/ 下要补上文件名；指向词条的产品正文链接算进「还有谁在讲」
    assert "[账号](../domain_objects/objects.md#ul-account--账号)" in view
    assert "| [登录状态](../domain_objects/objects.md#ul-login-state--登录状态) |" in view
    capsys.readouterr()


def test_view_marks_objects_whose_basis_is_a_draft_topic(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    domain_objects.main(["--root", str(tree), "--write"])
    assert "PF-001（草稿）" not in (tree / "views/domain-object-map.md").read_text(encoding="utf-8")
    edit(tree, f"{TOPIC}/README.md", "revision: 2\n", "revision: 2\nstatus: draft\n")
    assert domain_objects.main(["--root", str(tree)]) == 1  # topic 状态变了，总表就该重出
    domain_objects.main(["--root", str(tree), "--write"])
    assert "| PF-001（草稿） |" in (tree / "views/domain-object-map.md").read_text(encoding="utf-8")
    capsys.readouterr()


def test_stamp_alone_does_not_make_the_view_stale(tree: Path) -> None:
    domain_objects.main(["--root", str(tree), "--write"])
    edit(tree, "views/domain-object-map.md", domain_objects.STAMP, domain_objects.STAMP + "1999-01-01 旧：")
    assert domain_objects.main(["--root", str(tree)]) == 0
    edit(tree, "domain_objects/objects.md", "- **宿主**：—", "- **宿主**：部署")
    assert domain_objects.main(["--root", str(tree)]) == 1


def test_object_term_without_card_and_card_without_object_term(tree: Path) -> None:
    edit(tree, "domain_objects/objects.md", card("UL-organization", "组织"), "")
    assert any("UL-organization" in e and "没有它的条目" in e for e in errors(tree))
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)",
         "- **形态**：属性\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)")
    assert any("UL-login-state" in e and "不该有对象条目" in e for e in errors(tree))


def test_card_needs_a_term_and_all_required_fields(tree: Path) -> None:
    edit(tree, "domain_objects/objects.md", "# 对象条目\n\n", "# 对象条目\n\n" + card("UL-invitation", "邀请"))
    edit(tree, "domain_objects/objects.md", "- **身份**：登录标识\n- **生灭**：注册 → 激活；无注销\n- **依据**：[PF-001 §4](../product/PF-001-identity/design.md#账号)",
         "- **生灭**：注册 → 激活；无注销\n- **依据**：[PF-001 §4](../product/PF-001-identity/design.md#账号)")
    found = errors(tree)
    assert any("UL-invitation" in e and "没有这个词条" in e for e in found)
    assert any("UL-account" in e and "缺「身份」" in e for e in found)


def test_stale_revision_fails_by_default_and_can_be_reported(tree: Path) -> None:
    edit(tree, f"{TOPIC}/README.md", "revision: 2", "revision: 3")
    found = errors(tree)
    assert any("objects.md UL-account「依据」" in e and "rev 2" in e and "rev 3" in e for e in found)
    assert any("UL-account「出处」" in e for e in found)
    assert any("design.md" in e and "以 front-matter 为准" in e for e in found)
    assert not any("changelog.md" in e for e in found)
    reported = Reconciler(tree, stale="report")
    reported.load()
    reported.reconcile()
    assert all("复核后再改 rev" not in e for e in reported.errors)
    assert any("复核后再改 rev" in n for n in reported.notes)


def test_every_citation_must_carry_a_revision_and_point_at_product_text(tree: Path) -> None:
    edit(tree, "domain_objects/objects.md", "（rev 2）\n\n### UL-login-state", "\n\n### UL-login-state")
    assert any("UL-account「依据」" in e and "后面没有「（rev N）」" in e for e in errors(tree))
    edit(tree, "domain_objects/objects.md", f"../{TOPIC}/design.md#登录状态", f"../{TOPIC}/changelog.md")
    assert any("UL-login-state「依据」" in e and "不是某个 topic 的 design.md 或 flows.md" in e for e in errors(tree))


def test_links_into_one_topic_may_share_a_revision_or_each_carry_their_own(tree: Path) -> None:
    one = "[PF-001 §4](../../product/PF-001-identity/design.md#账号)"
    other = "[§4 登录状态](../../product/PF-001-identity/design.md#登录状态)"
    edit(tree, VOLUME, f"- **出处**：{one}（rev 2）", f"- **出处**：{one} · {other}（rev 2）")
    assert errors(tree) == []
    edit(tree, VOLUME, f"{one} · {other}（rev 2）", f"{one}（rev 2） · {other}（rev 2）")
    assert errors(tree) == []
    edit(tree, VOLUME, f"{one}（rev 2） · {other}（rev 2）", f"{one} · {other}（rev 2 / rev 1）")
    assert any("UL-account「出处」" in e and "配不上对" in e for e in errors(tree))


def test_morphology_is_required_valid_and_variants_need_an_object_parent(tree: Path) -> None:
    edit(tree, VOLUME, "- **形态**：对象\n", "")
    edit(tree, VOLUME, "- **形态**：变体（父：[组织](#ul-organization--组织--organization)）",
         "- **形态**：变体（父：[账号](#ul-nowhere)）")
    found = errors(tree)
    assert any("UL-account" in e and "缺「形态」" in e for e in found)
    assert any("UL-personal-organization" in e and "没有指向一个词条" in e for e in found)
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)",
         "- **形态**：实体\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)")
    assert any("UL-login-state" in e and "不在取值表里" in e for e in errors(tree))


def test_undecided_terms_must_surface_in_pending_and_conflicts(tree: Path) -> None:
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)",
         "- **形态**：未定\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)")
    edit(tree, "domain_objects/objects.md", card("UL-login-state", "登录状态", host="[账号](#ul-account--账号)"), "")
    found = errors(tree)
    assert any("UL-login-state" in e and "pending.md" in e for e in found)
    assert any("UL-login-state" in e and "conflicts.md" in e for e in found)
    edit(tree, "domain_objects/pending.md", "### 存储", "### 登录状态\n\n- **现象**：UL-login-state 未定\n"
         "- **牵涉**：—\n- **谁来裁**：PF-001\n- **闭合条件**：裁了\n\n### 存储")
    edit(tree, "ubiquitous_language/conflicts.md", "# 对不上的地方\n", "# 对不上的地方\n\nC-1 见 UL-login-state。\n")
    assert errors(tree) == []


def test_index_must_agree_with_volumes(tree: Path) -> None:
    edit(tree, "ubiquitous_language/index.md", "| [UL-login-state](", "| [UL-login](")
    edit(tree, "ubiquitous_language/index.md", "| 组织 | Organization |", "| 组织 | Organisation |")
    found = errors(tree)
    assert any("UL-login 在分卷里找不到" in e and "指向的是 UL-login-state" in e for e in found)
    assert any("UL-login-state 没有登记进索引" in e for e in found)
    assert any("UL-organization" in e and "Organisation" in e for e in found)


def test_handwritten_revision_tables_follow_the_front_matter(tree: Path) -> None:
    (tree / "product/README.md").write_text(
        "| Topic | 状态 | rev |\n|---|---|---|\n| [PF-001 身份](PF-001-identity/README.md) | active | 2 |\n", encoding="utf-8")
    (tree / "product/architecture-core.md").write_text(
        "| 编号 | 立了什么 | 状态 |\n|---|---|---|\n| [PF-001 身份](PF-001-identity/README.md) | 谁是谁 | rev 1（草稿） |\n",
        encoding="utf-8")
    found = errors(tree)
    assert not any("product/README.md" in e for e in found)
    assert any("product/architecture-core.md:3" in e and "rev 1" in e and "rev 2" in e for e in found)


def test_variant_of_a_variant_resolves_to_its_root_object(tree: Path) -> None:
    edit(tree, VOLUME, "- **形态**：变体（父：[组织](#ul-organization--组织--organization)）",
         "- **形态**：变体（父：[登录状态](#ul-login-state--登录状态--login-state)）")
    assert errors(tree) == []  # 父是对象
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)",
         "- **形态**：变体（父：[账号](#ul-account--账号--account)）\n- **出处**：[PF-001 §4](../../product/PF-001-identity/design.md#登录状态)")
    edit(tree, "domain_objects/objects.md", card("UL-login-state", "登录状态", host="[账号](#ul-account--账号)"), "")
    reconciler = Reconciler(tree)
    reconciler.load()
    reconciler.reconcile()
    assert reconciler.errors == []
    assert reconciler.root_object("UL-personal-organization") == "UL-account"  # 个人组织 → 登录状态 → 账号


def test_pending_items_need_an_owner_and_a_closing_condition(tree: Path) -> None:
    edit(tree, "domain_objects/pending.md", "- **谁来裁**：PF-001 的 owner\n", "")
    assert any("「存储」" in e and "缺「谁来裁」" in e for e in errors(tree))
