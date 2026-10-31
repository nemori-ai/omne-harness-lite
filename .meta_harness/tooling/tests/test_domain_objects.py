from __future__ import annotations

import sys
from pathlib import Path

import pytest

TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

import domain_objects  # noqa: E402
from domain_objects import Reconciler  # noqa: E402

TOPIC = "product/identity"
VOLUME = "ubiquitous_language/terms/subjects.md"


def term(uid: str, zh: str, en: str, morph: str, rev: int = 2, extra: str = "") -> str:
    return (f"### {uid} · {zh} · {en}\n\n> **中**：……\n\n- **形态**：{morph}\n"
            f"- **出处**：[PD-identity §4](../../{TOPIC}/design.md#{zh})（rev {rev}）\n{extra}\n")


def card(uid: str, zh: str, rev: int = 2, host: str = "—") -> str:
    return (f"### {uid} · {zh}\n\n- **宿主**：{host}\n- **身份**：登录标识\n- **生灭**：注册 → 激活；无注销\n"
            f"- **依据**：[PD-identity §4](../{TOPIC}/design.md#{zh})（rev {rev}）\n\n")


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    root = tmp_path / "design"
    files = {
        f"{TOPIC}/README.md": "---\nid: PD-identity\nrevision: 2\nstatus: active\n---\n# PD-identity\n",
        f"{TOPIC}/design.md": ("# PD-identity\n\n- 修订：rev 2\n\n## 账号\n\n"
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
                                      f"- **牵涉**：[PD-identity §4](../{TOPIC}/design.md#账号)（rev 2）\n"
                                      "- **谁来裁**：PD-identity 的 owner\n- **闭合条件**：有 topic 定义它\n"),
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
    assert "PD-identity（草稿）" not in (tree / "views/domain-object-map.md").read_text(encoding="utf-8")
    edit(tree, f"{TOPIC}/README.md", "status: active", "status: draft")
    assert domain_objects.main(["--root", str(tree)]) == 1  # topic 状态变了，总表就该重出
    domain_objects.main(["--root", str(tree), "--write"])
    assert "| PD-identity（草稿） |" in (tree / "views/domain-object-map.md").read_text(encoding="utf-8")
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
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)",
         "- **形态**：属性\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)")
    assert any("UL-login-state" in e and "不该有对象条目" in e for e in errors(tree))


def test_card_needs_a_term_and_all_required_fields(tree: Path) -> None:
    edit(tree, "domain_objects/objects.md", "# 对象条目\n\n", "# 对象条目\n\n" + card("UL-invitation", "邀请"))
    edit(tree, "domain_objects/objects.md", "- **身份**：登录标识\n- **生灭**：注册 → 激活；无注销\n- **依据**：[PD-identity §4](../product/identity/design.md#账号)",
         "- **生灭**：注册 → 激活；无注销\n- **依据**：[PD-identity §4](../product/identity/design.md#账号)")
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
    one = "[PD-identity §4](../../product/identity/design.md#账号)"
    other = "[§4 登录状态](../../product/identity/design.md#登录状态)"
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
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)",
         "- **形态**：实体\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)")
    assert any("UL-login-state" in e and "不在取值表里" in e for e in errors(tree))


def test_undecided_terms_must_surface_in_pending_and_conflicts(tree: Path) -> None:
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)",
         "- **形态**：未定\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)")
    edit(tree, "domain_objects/objects.md", card("UL-login-state", "登录状态", host="[账号](#ul-account--账号)"), "")
    found = errors(tree)
    assert any("UL-login-state" in e and "pending.md" in e for e in found)
    assert any("UL-login-state" in e and "conflicts.md" in e for e in found)
    edit(tree, "domain_objects/pending.md", "### 存储", "### 登录状态\n\n- **现象**：UL-login-state 未定\n"
         "- **牵涉**：—\n- **谁来裁**：PD-identity\n- **闭合条件**：裁了\n\n### 存储")
    edit(tree, "ubiquitous_language/conflicts.md", "# 对不上的地方\n", "# 对不上的地方\n\nC-1 见 UL-login-state。\n")
    assert errors(tree) == []


def test_index_must_agree_with_volumes(tree: Path) -> None:
    edit(tree, "ubiquitous_language/index.md", "| [UL-login-state](", "| [UL-login](")
    edit(tree, "ubiquitous_language/index.md", "| 组织 | Organization |", "| 组织 | Organisation |")
    found = errors(tree)
    assert any("UL-login 在分卷里找不到" in e and "指向的是 UL-login-state" in e for e in found)
    assert any("UL-login-state 没有登记进索引" in e for e in found)
    assert any("UL-organization" in e and "Organisation" in e for e in found)


def test_variant_of_a_variant_resolves_to_its_root_object(tree: Path) -> None:
    edit(tree, VOLUME, "- **形态**：变体（父：[组织](#ul-organization--组织--organization)）",
         "- **形态**：变体（父：[登录状态](#ul-login-state--登录状态--login-state)）")
    assert errors(tree) == []  # 父是对象
    edit(tree, VOLUME, "- **形态**：对象\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)",
         "- **形态**：变体（父：[账号](#ul-account--账号--account)）\n- **出处**：[PD-identity §4](../../product/identity/design.md#登录状态)")
    edit(tree, "domain_objects/objects.md", card("UL-login-state", "登录状态", host="[账号](#ul-account--账号)"), "")
    reconciler = Reconciler(tree)
    reconciler.load()
    reconciler.reconcile()
    assert reconciler.errors == []
    assert reconciler.root_object("UL-personal-organization") == "UL-account"  # 个人组织 → 登录状态 → 账号


def test_pending_items_need_an_owner_and_a_closing_condition(tree: Path) -> None:
    edit(tree, "domain_objects/pending.md", "- **谁来裁**：PD-identity 的 owner\n", "")
    assert any("「存储」" in e and "缺「谁来裁」" in e for e in errors(tree))


def test_current_pd_metadata_is_the_only_revision_registry(tree: Path) -> None:
    (tree / 'product/README.md').write_text('# 当前产品导航\n', encoding='utf-8')
    edit(tree, f'{TOPIC}/design.md', '- 修订：rev 2\n', '')
    reconciler = Reconciler(tree)
    reconciler.load()
    reconciler.reconcile()
    assert reconciler.errors == []
    assert reconciler.revisions == {'PD-identity': 2}
    assert reconciler.topic_dirs == {'PD-identity': tree / TOPIC}
    assert reconciler.backlinks() == {'UL-login-state': {'PD-identity'}}


@pytest.mark.parametrize(('old', 'new', 'message'), [
    ('revision: 2\n', '', '没有 revision'),
    ('revision: 2', 'revision: 0', '必须是正整数'),
    ('revision: 2', 'revision: -1', '必须是正整数'),
    ('revision: 2', 'revision: 1.5', '必须是正整数'),
    ('revision: 2', 'revision: 2\nrevision: 3', 'revision 重复'),
    ('id: PD-identity', 'id: PD-other', 'slug 不一致'),
    ('id: PD-identity', 'id: PD-identity\nid: PD-identity', 'id 重复'),
    ('status: active\n', '', '没有 status'),
])
def test_bad_current_metadata_is_an_error(tree: Path, old: str, new: str, message: str) -> None:
    edit(tree, f'{TOPIC}/README.md', old, new)
    found = errors(tree)
    assert any(message in item for item in found)
    assert any('zero-current-input' in item for item in found)


def test_duplicate_current_identity_is_not_silently_overwritten(tree: Path) -> None:
    import shutil
    shutil.copytree(tree / TOPIC, tree / 'product/other')
    assert any('topic id PD-identity 重复' in item for item in errors(tree))


@pytest.mark.parametrize('missing', ['README.md', 'design.md'])
def test_current_topic_requires_real_files(tree: Path, missing: str) -> None:
    (tree / TOPIC / missing).unlink()
    assert any(f'{missing}' in item and '不存在' in item for item in errors(tree))


def test_empty_current_root_never_passes(tree: Path, capsys: pytest.CaptureFixture[str]) -> None:
    import shutil
    shutil.rmtree(tree / TOPIC)
    assert any('zero-current-input' in item for item in errors(tree))
    assert domain_objects.main(['--root', str(tree), '--write']) == 1
    output = capsys.readouterr()
    assert 'zero-current-input' in output.err
    assert 'PASS:' not in output.out
    assert not (tree / 'views/domain-object-map.md').exists()


def test_templates_are_not_current_products(tree: Path) -> None:
    path = tree / 'product/.templates/topic/README.md'
    path.parent.mkdir(parents=True)
    path.write_text('---\nid: PD-template\nrevision: 0\n---\n', encoding='utf-8')
    reconciler = Reconciler(tree)
    reconciler.load()
    reconciler.reconcile()
    assert reconciler.errors == []
    assert set(reconciler.revisions) == {'PD-identity'}


@pytest.mark.parametrize('alias', ['topic', 'README.md', 'design.md', 'flows.md', 'product-root'])
def test_product_symlinks_cannot_change_the_declared_source(tree: Path, tmp_path: Path, alias: str) -> None:
    import shutil
    outside = tmp_path / 'outside'
    if alias == 'topic':
        shutil.copytree(tree / TOPIC, outside)
        shutil.rmtree(tree / TOPIC)
        (tree / TOPIC).symlink_to(outside, target_is_directory=True)
    elif alias == 'product-root':
        shutil.move(tree / 'product', outside)
        (tree / 'product').symlink_to(outside, target_is_directory=True)
    else:
        path = tree / TOPIC / alias
        outside.write_text(path.read_text(encoding='utf-8') if path.exists() else '# 账号\n', encoding='utf-8')
        path.unlink(missing_ok=True)
        path.symlink_to(outside)
    assert any('别名' in item or '越界' in item for item in errors(tree))


@pytest.fixture
def sealed_tree(tree: Path) -> Path:
    import shutil
    sealed = 'product.0.0.1.legacy/PF-001-identity'
    shutil.copytree(tree / TOPIC, tree / sealed)
    edit(tree, f'{sealed}/README.md', 'id: PD-identity', 'id: PF-001')
    edit(tree, 'domain_objects/objects.md', f'../{TOPIC}/design.md#账号', f'../{sealed}/design.md#账号')
    edit(tree, VOLUME, f'../../{TOPIC}/design.md#账号', f'../../{sealed}/design.md#账号')
    return tree


def test_sealed_provenance_is_checked_without_becoming_current(sealed_tree: Path) -> None:
    reconciler = Reconciler(sealed_tree)
    reconciler.load()
    reconciler.reconcile()
    assert reconciler.errors == []
    assert reconciler.revisions == {'PD-identity': 2}
    assert reconciler.sealed_revisions == {'PF-001': 2}
    assert reconciler.sealed_citations == {'PF-001'}
    assert reconciler.backlinks() == {'UL-login-state': {'PD-identity'}}
    rendered = reconciler.render()
    assert 'PF-001（sealed provenance）' in rendered
    assert 'PF-001（草稿）' not in rendered


def test_sealed_bad_revision_cannot_be_downgraded_to_current_staleness(sealed_tree: Path) -> None:
    edit(sealed_tree, 'domain_objects/objects.md', '（rev 2）', '（rev 1）')
    assert any('sealed provenance PF-001' in item and '封存修订是 rev 2' in item
               for item in errors(sealed_tree, stale='report'))


@pytest.mark.parametrize(('old', 'new', 'message'), [
    ('design.md#账号', 'flows.md#账号', '引用文件不存在'),
    ('design.md#账号', 'design.md#没有这个标题', '引用锚点'),
    ('PF-001-identity/design.md#账号', 'PF-999-missing/design.md#账号', '没有有效 README'),
])
def test_sealed_citation_file_topic_and_anchor_must_exist(
        sealed_tree: Path, old: str, new: str, message: str) -> None:
    edit(sealed_tree, 'domain_objects/objects.md', old, new)
    assert any(message in item for item in errors(sealed_tree))


def test_current_citation_anchor_is_checked(tree: Path) -> None:
    edit(tree, VOLUME, 'design.md#账号', 'design.md#没有这个标题')
    assert any('UL-account「出处」' in item and '引用锚点' in item for item in errors(tree))


def test_sealed_topics_alone_do_not_hide_missing_current_input(sealed_tree: Path) -> None:
    import shutil
    shutil.rmtree(sealed_tree / 'product')
    assert any('zero-current-input' in item for item in errors(sealed_tree))


def test_old_handwritten_roster_no_longer_owns_revision(tree: Path) -> None:
    (tree / 'product/architecture-core.md').write_text(
        '| [PF-001 身份](PF-001-identity/README.md) | 来源 | rev 999 |\n', encoding='utf-8')
    assert errors(tree) == []


@pytest.mark.parametrize(('old', 'new', 'message'), [
    ('id: PF-001', 'id: PF-999', 'slug 不一致'),
    ('revision: 2', 'revision: 0', '必须是正整数'),
    ('revision: 2', 'revision: 2\nrevision: 2', 'revision 重复'),
])
def test_sealed_metadata_keeps_its_own_identity_and_revision(
        sealed_tree: Path, old: str, new: str, message: str) -> None:
    edit(sealed_tree, 'product.0.0.1.legacy/PF-001-identity/README.md', old, new)
    found = errors(sealed_tree)
    assert any('product.0.0.1.legacy' in item and message in item for item in found)
    reconciler = Reconciler(sealed_tree)
    reconciler.load()
    assert reconciler.revisions == {'PD-identity': 2}
    assert reconciler.sealed_revisions == {}


def test_dangling_topic_symlink_is_not_ignored(tree: Path) -> None:
    (tree / 'product/missing').symlink_to(tree / 'gone', target_is_directory=True)
    assert any(str(Path('product/missing')) in item and '别名' in item for item in errors(tree))


def test_current_and_sealed_citations_keep_separate_revision_checks(sealed_tree: Path) -> None:
    old = '[PD-identity §4](../product.0.0.1.legacy/PF-001-identity/design.md#账号)（rev 2）'
    new = (old + '；[PD-identity](../product/identity/design.md#账号)（rev 1）')
    edit(sealed_tree, 'domain_objects/objects.md', old, new)
    found = errors(sealed_tree)
    assert any('PD-identity rev 1' in item and 'rev 2' in item for item in found)
    assert not any('sealed provenance PF-001 标的是' in item for item in found)


def test_quoted_commented_readme_uses_yaml_metadata(tree: Path) -> None:
    (tree / TOPIC / 'README.md').write_text(
        '---\nid: "PD-identity"\nstatus: "draft"\nrevision: 2 # authoritative revision\n---\n# Identity\n',
        encoding='utf-8')
    edit(tree, f'{TOPIC}/design.md', '- 修订：rev 2\n', '')
    reconciler = Reconciler(tree)
    reconciler.load()
    reconciler.reconcile()
    assert reconciler.errors == []
    assert reconciler.revisions == {'PD-identity': 2}
    assert reconciler.drafts == {'PD-identity'}


@pytest.mark.parametrize('revision', ['2', '2.0', '2e0', '02', '0x2', '0o2'])
def test_yaml_revision_matches_safe_integer_metadata(tree: Path, revision: str) -> None:
    edit(tree, f'{TOPIC}/README.md', 'revision: 2', f'revision: {revision}')
    assert errors(tree) == []


@pytest.mark.parametrize('status', ['on', 'yes', '2026-10-12', '"In review"', "'draft'"])
def test_yaml_status_matches_nonempty_string_metadata(tree: Path, status: str) -> None:
    edit(tree, f'{TOPIC}/README.md', 'status: active', f'status: {status}')
    assert errors(tree) == []


@pytest.mark.parametrize(('field', 'value', 'message'), [
    ('revision', 'true', 'revision 必须是正整数'),
    ('revision', 'false', 'revision 必须是正整数'),
    ('revision', '"2"', 'revision 必须是正整数'),
    ('revision', '[2]', 'revision 必须是正整数'),
    ('revision', '{value: 2}', 'revision 必须是正整数'),
    ('revision', '2.5', 'revision 必须是正整数'),
    ('revision', '.nan', 'revision 必须是正整数'),
    ('revision', '.inf', 'revision 必须是正整数'),
    ('revision', '9007199254740992', 'revision 必须是正整数'),
    ('revision', '9' * 400, 'revision 必须是正整数'),
    ('revision', '2_0', 'revision 必须是正整数'),
    ('revision', '1:20', 'revision 必须是正整数'),
    ('id', 'true', 'id 必须是非空字符串'),
    ('id', '[PD-identity]', 'id 必须是非空字符串'),
    ('status', 'true', 'status 必须是非空状态名称'),
    ('status', '7', 'status 必须是非空状态名称'),
    ('status', '[draft]', 'status 必须是非空状态名称'),
    ('status', '{value: draft}', 'status 必须是非空状态名称'),
    ('status', '"  "', 'status 必须是非空状态名称'),
])
def test_yaml_metadata_rejects_wrong_types_and_unsafe_revision(
        tree: Path, field: str, value: str, message: str) -> None:
    old = {'id': 'PD-identity', 'revision': '2', 'status': 'active'}[field]
    edit(tree, f'{TOPIC}/README.md', f'{field}: {old}', f'{field}: {value}')
    assert any(message in item for item in errors(tree))


@pytest.mark.parametrize('metadata', [
    '- id: PD-identity\n- revision: 2\n- status: draft',
    'PD-identity',
    'id: [',
    '!!python/object:builtins.object {}',
    '{id: PD-identity, revision: 2, revision: 3, status: draft}',
    'id: PD-identity\n"id": PD-identity\nrevision: 2\nstatus: draft',
    'id: PD-identity\nrevision: 2\nstatus: draft\n"status": draft',
])
def test_yaml_metadata_rejects_bad_shape_syntax_tags_and_duplicate_keys(tree: Path, metadata: str) -> None:
    (tree / TOPIC / 'README.md').write_text(f'---\n{metadata}\n---\n# Identity\n', encoding='utf-8')
    assert any('front-matter' in item for item in errors(tree))


@pytest.mark.parametrize('body', [
    '```text\n~~~\n## fake\n```\n',
    '~~~text\n```\n## fake\n~~~\n',
    '````text\n```\n## fake\n````\n',
    '~~~~text\n~~~\n## fake\n~~~~\n',
    '```text\n    ```\n## fake\n```\n',
    '```text\n``` not a closing fence\n## fake\n```\n',
    '```text\n## fake\n',
    '~~~text\n## fake\n',
    '    ## fake\n',
    '```html\n<a id="fake"></a>\n```\n',
    '~~~html\n<a name="fake"></a>\n~~~\n',
])
@pytest.mark.parametrize('sealed', [False, True])
def test_markdown_code_cannot_supply_citation_anchor(tree: Path, body: str, sealed: bool) -> None:
    topic = 'product.0.0.1.legacy/PF-001-alpha' if sealed else TOPIC
    target = tree / topic
    if sealed:
        target.mkdir(parents=True)
        (target / 'README.md').write_text('---\nid: PF-001\nrevision: 2\nstatus: active\n---\n')
    (target / 'design.md').write_text('# Alpha\n\n' + body)
    reconciler = Reconciler(tree)
    reconciler._load_revisions()
    reconciler._cited('probe', tree / 'domain_objects/objects.md',
        f'[basis](../{topic}/design.md#fake)（rev 2）', strict=True)
    assert any('引用锚点 #fake 不存在' in error for error in reconciler.errors)
    assert reconciler.sealed_citations == set()


@pytest.mark.parametrize('body', [
    '```text\n## code\n```\n\n## visible\n',
    '```text\n## code\n`````\n\n## visible\n',
    '~~~text\n## code\n~~~~~\n\n## visible\n',
    '   ```text\n## code\n   ```\n\n## visible\n',
    '```text\n## code\n```   \n\n## visible\n',
    '~~~text\n## code\n  ~~~~ \n\n## visible\n',
    '<a id="visible"></a>\n',
    '<a name="visible"></a>\n',
    'text <a id="visible"></a> text\n',
])
def test_markdown_closed_fences_and_existing_explicit_anchors_are_legal(tree: Path, body: str) -> None:
    (tree / TOPIC / 'design.md').write_text('# Alpha\n\n' + body)
    reconciler = Reconciler(tree)
    reconciler._load_revisions()
    reconciler._cited('probe', tree / 'domain_objects/objects.md',
        f'[basis](../{TOPIC}/design.md#visible)（rev 2）', strict=True)
    assert reconciler.errors == []


@pytest.mark.parametrize('sealed', [False, True])
def test_markdown_duplicate_heading_suffixes_remain_citable(tree: Path, sealed: bool) -> None:
    topic = 'product.0.0.1.legacy/PF-001-alpha' if sealed else TOPIC
    target = tree / topic
    if sealed:
        target.mkdir(parents=True)
        (target / 'README.md').write_text('---\nid: PF-001\nrevision: 2\nstatus: active\n---\n')
    (target / 'design.md').write_text('# Alpha\n\n## Same\n\n## Same\n\n## Same\n')
    reconciler = Reconciler(tree)
    reconciler._load_revisions()
    for fragment in ('same', 'same-1', 'same-2'):
        reconciler._cited('probe', tree / 'domain_objects/objects.md',
            f'[basis](../{topic}/design.md#{fragment})（rev 2）', strict=True)
    assert reconciler.errors == []
    reconciler._cited('probe', tree / 'domain_objects/objects.md',
        f'[basis](../{topic}/design.md#same-3)（rev 2）', strict=True)
    assert any('引用锚点 #same-3 不存在' in error for error in reconciler.errors)


def test_next_reconciliation_observes_changed_markdown_anchors(tree: Path) -> None:
    path = tree / TOPIC / 'design.md'
    path.write_text('# Alpha\n\n## Visible\n')
    first = Reconciler(tree)
    first._load_revisions()
    href = f'../{TOPIC}/design.md#visible'
    assert first._product_reference(tree / 'domain_objects/objects.md', href, 'probe') == ('PD-identity', False)
    path.write_text('# Alpha\n\n```\n## Visible\n```\n')
    second = Reconciler(tree)
    second._load_revisions()
    assert second._product_reference(tree / 'domain_objects/objects.md', href, 'probe') is None
    assert any('引用锚点 #visible 不存在' in error for error in second.errors)


def test_current_topic_discovery_excludes_archive_suffix_but_keeps_similar_names(tree: Path) -> None:
    directory = tree / "product/ignored.legacy"
    directory.mkdir()
    (directory / "README.md").write_text("Invalid archived metadata\n")
    assert errors(tree) == []
    live = tree / "product/ignored.legacy-not"
    live.mkdir()
    (live / "README.md").write_text("Invalid live metadata\n")
    assert any("ignored.legacy-not" in item for item in errors(tree))
