from __future__ import annotations

import sys
from pathlib import Path

import pytest

TOOLING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLING / "src"))

import stories  # noqa: E402
from stories import Checker  # noqa: E402

CLI = "product/PF-016-cli"
CENTER = "product/PF-017-center"

ACCEPTANCE = """# PF-016 验收标准

## 一、可观察场景

| # | 场景 | 应有表现 |
|---|---|---|
| **S1** | 第一次安装后运行 | 看到版本号 |
| **S2** | 没登录就查成员 | 被要求先登录 |
| S3 | 登录后查成员 | 看到成员名单 |
| `S4b` | 断网时查成员 | 明说连不上 |

## 二、绝不能发生的事

| 绝不能发生 | 如果发生了意味着什么 |
|---|---|
| 没登录看到名单 | 泄露 |
"""

CENTER_ACCEPTANCE = """# PF-017 验收标准

| 编号 | 情形 | 可观察判据 |
|---|---|---|
| A01 | 中心没启动 | 明说连不上 |
"""


def card(identifier: str = "ST-016-01", *, title: str = "装好就能看到版本", scenarios: str = "[S1](acceptance.md#一可观察场景)",
         demo: str = "\n  1. 运行 `omne --version` → 看到版本号", without: str = "登录", before: str = "无",
         ready: str = "是", value: str = "新用户装完能确认装对了") -> str:
    return (f"### {identifier} · {title}\n\n- **价值**：{value}\n- **覆盖场景**：{scenarios}\n- **演示**：{demo}\n"
            f"- **不含**：{without}\n- **前置**：{before}\n- **就绪**：{ready}\n")


def tree(tmp_path: Path, cards: str, *, center_cards: str | None = None, acceptance: str = ACCEPTANCE,
         high_water: str = "**已发到**：ST-016-02\n\n") -> Path:
    root = tmp_path / "design"
    for topic, text in ((CLI, acceptance), (CENTER, CENTER_ACCEPTANCE)):
        (root / topic).mkdir(parents=True)
        (root / topic / "acceptance.md").write_text(text, encoding="utf-8")
    (root / CLI / "stories.md").write_text(f"# PF-016 故事卡\n\n{high_water}说明文字。\n\n{cards}", encoding="utf-8")
    if center_cards is not None:
        (root / CENTER / "stories.md").write_text(f"# PF-017 故事卡\n\n**已发到**: ST-017-01\n\n{center_cards}",
                                                  encoding="utf-8")
    return root


def errors(root: Path) -> list[str]:
    checker = Checker(root)
    checker.check()
    return checker.errors


def test_a_well_formed_card_passes_and_uncovered_scenarios_are_only_listed(tmp_path: Path) -> None:
    root = tree(tmp_path, card())
    checker = Checker(root)
    checker.check()
    assert checker.errors == []
    assert len(checker.cards) == 1 and checker.cards[0].title == "装好就能看到版本"
    assert checker.notes == [f"{CLI}/acceptance.md: 3 条带编号的场景还不属于任何卡：S2、S3、S4b"]


def test_scenario_ids_are_read_through_emphasis_and_code_marks(tmp_path: Path) -> None:
    cards = card(scenarios="[S1](acceptance.md#一可观察场景)、[S3](acceptance.md)、[S4b](acceptance.md)")
    checker = Checker(tree(tmp_path, cards))
    checker.check()
    assert checker.errors == []
    assert checker.notes == [f"{CLI}/acceptance.md: 1 条带编号的场景还不属于任何卡：S2"]


def test_no_stories_file_is_not_an_error(tmp_path: Path) -> None:
    root = tree(tmp_path, card())
    (root / CLI / "stories.md").unlink()
    assert errors(root) == []
    assert stories.main(["--root", str(root)]) == 0


def test_a_missing_product_directory_is_reported(tmp_path: Path) -> None:
    assert errors(tmp_path) == ["product/ 不存在：--root 要指向设计根"]


def test_card_ids_are_unique_across_topics(tmp_path: Path) -> None:
    root = tree(tmp_path, card(), center_cards=card("ST-016-01", scenarios="[A01](acceptance.md)"))
    found = errors(root)
    assert any("卡号 ST-016-01 已在" in error for error in found)
    assert any("中间三位要等于所在 topic 的编号 017" in error for error in found)


def test_a_malformed_card_heading_is_reported(tmp_path: Path) -> None:
    root = tree(tmp_path, card() + "\n### ST-16-2 装好就能登录\n\n- **价值**：x\n")
    assert any("卡的标题要写成" in error for error in errors(root))


@pytest.mark.parametrize("name", stories.FIELDS)
def test_every_field_is_required(tmp_path: Path, name: str) -> None:
    text = "\n".join(line for line in card().splitlines() if not line.startswith(f"- **{name}**")
                     and not (name == "演示" and line.startswith("  1.")))
    found = errors(tree(tmp_path, text + "\n"))
    assert any(f"缺必填字段：{name}" in error for error in found)


def test_a_field_written_twice_is_reported(tmp_path: Path) -> None:
    assert any("「价值」写了两次" in error for error in errors(tree(tmp_path, card() + "- **价值**：再写一次\n")))


def test_a_scenario_without_a_link_is_reported(tmp_path: Path) -> None:
    assert any("至少链接一条验收场景" in error for error in errors(tree(tmp_path, card(scenarios="S1"))))


def test_a_scenario_that_does_not_exist_is_reported(tmp_path: Path) -> None:
    found = errors(tree(tmp_path, card(scenarios="[S9](acceptance.md#一可观察场景)")))
    assert any("引用的场景 S9" in error and "没有带这个编号的行" in error for error in found)


def test_a_scenario_link_has_to_point_at_an_acceptance_file(tmp_path: Path) -> None:
    root = tree(tmp_path, card(scenarios="[S1](design.md)"))
    assert any("要链接到某个 topic 的 acceptance.md" in error for error in errors(root))


def test_a_scenario_link_to_a_missing_topic_is_reported(tmp_path: Path) -> None:
    root = tree(tmp_path, card(scenarios="[S1](../PF-099-nowhere/acceptance.md)"))
    assert any("不存在" in error for error in errors(root))


def test_a_scenario_of_another_topic_can_be_covered(tmp_path: Path) -> None:
    cards = card(scenarios="[S1](acceptance.md)、[A01](../PF-017-center/acceptance.md)")
    assert errors(tree(tmp_path, cards)) == []


def test_a_scenario_belongs_to_one_card_at_most(tmp_path: Path) -> None:
    cards = card() + "\n" + card("ST-016-02", title="再证一次", scenarios="[S1](acceptance.md)")
    found = errors(tree(tmp_path, cards))
    assert any("S1 已属于 ST-016-01" in error and "不能再属于 ST-016-02" in error for error in found)


def test_one_scenario_across_topics_belongs_to_one_card_at_most(tmp_path: Path) -> None:
    root = tree(tmp_path, card(scenarios="[A01](../PF-017-center/acceptance.md)"),
                center_cards=card("ST-017-01", scenarios="[A01](acceptance.md)"))
    assert any("A01 已属于 ST-016-01" in error for error in errors(root))


def test_the_same_scenario_twice_in_one_card_is_not_two_cards(tmp_path: Path) -> None:
    assert errors(tree(tmp_path, card(scenarios="[S1](acceptance.md)、[S1](acceptance.md#一可观察场景)"))) == []


def test_a_duplicated_scenario_id_is_reported_when_a_card_points_at_it(tmp_path: Path) -> None:
    acceptance = ACCEPTANCE + "\n| S1 | 重复的编号 | 不该有 |\n"
    found = errors(tree(tmp_path, card(), acceptance=acceptance))
    assert any("场景编号 S1 重复" in error for error in found)


def test_a_demo_needs_steps_that_say_what_is_seen(tmp_path: Path) -> None:
    assert any("至少写一步" in error for error in errors(tree(tmp_path / "a", card(demo="跑一下看看"))))
    found = errors(tree(tmp_path / "b", card(demo="\n  1. 运行 `omne --version` → 看到版本号\n  2. 再运行一次")))
    assert any("演示第 2 步要写成" in error for error in found)


def test_readiness_is_yes_or_no_with_what_is_missing(tmp_path: Path) -> None:
    assert errors(tree(tmp_path, card(ready="否——卡在待裁决 Q3"))) == []
    assert any("未就绪，要写明缺什么" in error for error in errors(tree(tmp_path / "a", card(ready="否"))))
    assert any("只写「是」或「否——缺什么」" in error for error in errors(tree(tmp_path / "b", card(ready="差不多"))))


def test_prerequisites_have_to_exist_and_not_be_the_card_itself(tmp_path: Path) -> None:
    assert any("前置 ST-016-07 不存在" in error for error in errors(tree(tmp_path / "a", card(before="ST-016-07"))))
    assert any("把自己列成了前置" in error for error in errors(tree(tmp_path / "b", card(before="ST-016-01"))))


def test_prerequisites_may_cross_topics_and_must_not_form_a_cycle(tmp_path: Path) -> None:
    second = card("ST-016-02", title="能登录", scenarios="[S2](acceptance.md)", before="ST-016-01；待裁决 Q3")
    root = tree(tmp_path / "ok", card(before="ST-017-01") + "\n" + second,
                center_cards=card("ST-017-01", scenarios="[A01](acceptance.md)"))
    assert errors(root) == []
    looped = tree(tmp_path / "loop", card(before="ST-016-02") + "\n" + second)
    found = errors(looped)
    assert sum("前置成环" in error for error in found) == 1


def test_cards_inside_a_code_fence_are_examples(tmp_path: Path) -> None:
    fenced = "````markdown\n" + card("ST-016-09", scenarios="[S9](acceptance.md)") + "````\n\n"
    checker = Checker(tree(tmp_path, fenced + card()))
    checker.check()
    assert checker.errors == [] and [found.id for found in checker.cards] == ["ST-016-01"]


def test_a_queue_with_only_the_high_water_line_is_valid(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = tree(tmp_path, "", high_water="**已发到**：ST-016-03\n\n")
    checker = Checker(root)
    checker.check()
    assert checker.errors == [] and checker.cards == []
    assert checker.notes == [f"{CLI}/acceptance.md: 4 条带编号的场景还不属于任何卡：S1、S2、S3、S4b"]
    assert stories.main(["--root", str(root)]) == 0
    assert "PASS: 1 个 topic 有 stories.md，眼下没有待交付的卡，对账一致。" in capsys.readouterr().out


def test_the_high_water_line_is_required(tmp_path: Path) -> None:
    found = errors(tree(tmp_path, card(), high_water=""))
    assert found == [f"{CLI}/stories.md: 缺「已发到」一行；在文件开头写 `**已发到**：ST-<三位>-<两位>`，值是这个 topic 发出过的最大卡号"]


def test_the_high_water_line_appears_once(tmp_path: Path) -> None:
    found = errors(tree(tmp_path, card(), high_water="**已发到**：ST-016-02\n**已发到**：ST-016-03\n\n"))
    assert found == [f"{CLI}/stories.md:4: 「已发到」只能有一行，现在有 2 行（第 3、4 行）"]


def test_the_high_water_card_belongs_to_the_topic(tmp_path: Path) -> None:
    found = errors(tree(tmp_path, card(), high_water="**已发到**：ST-017-02\n\n"))
    assert found == [f"{CLI}/stories.md:3: 「已发到」ST-017-02 的中间三位要等于所在 topic 的编号 016"]


def test_the_high_water_value_is_a_card_id(tmp_path: Path) -> None:
    found = errors(tree(tmp_path, card(), high_water="**已发到**：第二张\n\n"))
    assert found == [f"{CLI}/stories.md:3: 「已发到」的值要写成卡号 ST-<三位>-<两位>，现在是「第二张」"]


def test_no_card_is_numbered_past_the_high_water(tmp_path: Path) -> None:
    cards = card() + "\n" + card("ST-016-03", title="能登录", scenarios="[S2](acceptance.md)")
    found = errors(tree(tmp_path, cards))
    assert len(found) == 1
    assert "ST-016-03 的序号超过了「已发到」ST-016-02" in found[0] and found[0].startswith(f"{CLI}/stories.md:")


def test_a_high_water_line_inside_a_code_fence_is_an_example(tmp_path: Path) -> None:
    fenced = "```markdown\n**已发到**：ST-016-09\n```\n\n"
    assert errors(tree(tmp_path, fenced + card())) == []


def test_the_entry_point_reports_and_fails(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    good = tree(tmp_path / "good", card())
    assert stories.main(["--root", str(good)]) == 0
    out = capsys.readouterr().out
    assert "NOTE: " in out and "PASS: 1 张故事卡（1 个 topic），对账一致。" in out
    bad = tree(tmp_path / "bad", card(scenarios="[S9](acceptance.md)"))
    assert stories.main(["--root", str(bad)]) == 1
    assert "FAIL: 故事卡对账发现 1 处问题。" in capsys.readouterr().err


def observation_fixture(tmp_path: Path):
    import hashlib
    import json
    import subprocess
    root = tree(tmp_path, card(before='ST-017-01'))
    subprocess.run(['git', 'init', '-q'], cwd=tmp_path, check=True)
    subprocess.run(['git', 'add', '.'], cwd=tmp_path, check=True)
    subprocess.run(['git', '-c', 'user.name=someone', '-c', 'user.email=someone@example.com', 'commit', '-qm', 'fixture'], cwd=tmp_path, check=True)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=tmp_path, text=True).strip()
    config = tmp_path / 'docs/engineering/github-delivery.json'
    config.parent.mkdir(parents=True)
    config.write_text('{}')
    (tmp_path / 'capture.json').write_text('{}')
    files = [root / CLI / 'stories.md', config, tmp_path / 'docs/engineering/source-cutovers.json', tmp_path / 'capture.json']
    value = {'schemaVersion': 1, 'kind': 'current-source-observation', 'root': str(tmp_path), 'productRoot': str(root / 'product'), 'head': head, 'dailyEnabled': False, 'completeness': 'partial', 'bindings': [{'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None} for p in files], 'cards': [], 'findings': [], 'aliases': [{'id': 'ST-017-01', 'resolution': {'kind': 'issue', 'identity': {'repository': 'owner/repo', 'id': 'I_1', 'url': 'https://github.com/owner/repo/issues/1', 'number': 1}, 'observed': False}}]}
    value['inputRoles'] = {'config': {'selection': 'default', 'path': str(config)}, 'cutovers': {'path': str(tmp_path / 'docs/engineering/source-cutovers.json')}, 'capture': {'kind': 'file', 'path': str(tmp_path / 'capture.json')}}
    path = tmp_path / 'projection.json'
    path.write_text(json.dumps(value))
    return root, path, value


def test_mixed_prerequisite_identity_is_known_but_result_and_graph_remain_unknown(tmp_path: Path):
    root, path, _ = observation_fixture(tmp_path)
    checker = Checker(root, path)
    checker.check()
    assert not checker.errors
    assert any('结果满足 unknown' in note and '跨源前置图不完整' in note for note in checker.notes)


@pytest.mark.parametrize('changed', ['stories', 'config', 'cutovers', 'capture', 'new-stories'])
def test_same_head_changed_input_rejects_projection(tmp_path: Path, changed: str):
    root, path, _ = observation_fixture(tmp_path)
    target = {'stories': root / CLI / 'stories.md', 'config': tmp_path / 'docs/engineering/github-delivery.json', 'cutovers': tmp_path / 'docs/engineering/source-cutovers.json', 'capture': tmp_path / 'capture.json', 'new-stories': root / CENTER / 'stories.md'}[changed]
    target.write_text('changed')
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2


@pytest.mark.parametrize('damage', ['head', 'root', 'duplicate-binding', 'duplicate-alias', 'schema', 'resolution', 'json'])
def test_damaged_projection_is_input_error_without_legacy_fallback(tmp_path: Path, damage: str):
    import json
    root, path, value = observation_fixture(tmp_path)
    if damage in ('head', 'root'):
        value[damage] = 'bad'
    elif damage == 'duplicate-binding':
        value['bindings'].append(value['bindings'][0])
    elif damage == 'duplicate-alias':
        value['aliases'].append(value['aliases'][0])
    elif damage == 'schema':
        value['schemaVersion'] = 2
    elif damage == 'resolution':
        value['aliases'][0]['resolution'] = {'kind': 'missing'}
    path.write_text('{' if damage == 'json' else json.dumps(value))
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2


def test_mixed_prerequisite_conflict_keeps_existing_structural_failure(tmp_path: Path):
    import json
    root, path, value = observation_fixture(tmp_path)
    value['aliases'][0]['resolution'] = {'kind': 'conflict', 'sources': ['one', 'two']}
    path.write_text(json.dumps(value))
    checker = Checker(root, path)
    checker.check()
    assert any('当前来源冲突' in error for error in checker.errors)


@pytest.mark.parametrize('field,value', [('url', 'https://github.com/other/repo/issues/1'), ('repository', 'invalid'), ('number', 2), ('number', True)])
def test_projection_rejects_issue_identity_mismatch(tmp_path: Path, field: str, value):
    import json
    root, path, observation = observation_fixture(tmp_path)
    observation['aliases'][0]['resolution']['identity'][field] = value
    path.write_text(json.dumps(observation))
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2


@pytest.mark.parametrize('damage', ['roles', 'config-role', 'capture-role', 'config-binding', 'capture-binding', 'extra-binding', 'null-explicit', 'null-capture', 'digest', 'capture-none-path', 'default-path', 'cutovers-path'])
def test_selected_input_closure_rejects_damaged_projection(tmp_path: Path, damage: str):
    import json
    root, path, value = observation_fixture(tmp_path)
    roles = value['inputRoles']
    if damage == 'roles':
        del value['inputRoles']
    elif damage.endswith('-role'):
        del roles[damage.removesuffix('-role')]
    elif damage in ('config-binding', 'capture-binding'):
        omitted = roles[damage.removesuffix('-binding')]['path']
        value['bindings'] = [b for b in value['bindings'] if b['path'] != omitted]
    elif damage == 'extra-binding':
        value['bindings'].append({'path': str(tmp_path / 'absent'), 'sha256': None})
    elif damage in ('null-explicit', 'null-capture'):
        key = 'config' if damage == 'null-explicit' else 'capture'
        if key == 'config':
            roles[key]['selection'] = 'explicit'
        Path(roles[key]['path']).unlink()
        next(b for b in value['bindings'] if b['path'] == roles[key]['path'])['sha256'] = None
    elif damage == 'digest':
        value['bindings'][0]['sha256'] = 17
    elif damage == 'capture-none-path':
        roles['capture']['kind'] = 'none'
    else:
        roles['config' if damage == 'default-path' else 'cutovers']['path'] = str(tmp_path / 'other')
    path.write_text(json.dumps(value))
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2


@pytest.mark.parametrize('enabled,issue', [(True, False), (False, True)])
@pytest.mark.parametrize('completeness', ['complete', 'partial'])
def test_no_capture_rejects_contradictory_completeness(tmp_path: Path, enabled: bool, issue: bool, completeness: str):
    import json
    root, path, value = observation_fixture(tmp_path)
    value['bindings'] = [b for b in value['bindings'] if b['path'] != value['inputRoles']['capture']['path']]
    value['inputRoles']['capture'] = {'kind': 'none'}
    value['dailyEnabled'] = enabled
    value['completeness'] = completeness
    if not issue:
        value['aliases'] = []
    path.write_text(json.dumps(value))
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2
    value['completeness'] = 'unknown'
    path.write_text(json.dumps(value))
    Checker(root, path)


@pytest.mark.parametrize('role', ['config', 'capture'])
def test_missing_required_file_cannot_share_optional_cutover_binding(tmp_path: Path, role: str):
    import json
    root, path, value = observation_fixture(tmp_path)
    selected = value['inputRoles'][role]
    original = selected['path']
    selected['path'] = value['inputRoles']['cutovers']['path']
    if role == 'config':
        selected['selection'] = 'explicit'
    value['bindings'] = [b for b in value['bindings'] if b['path'] != original]
    path.write_text(json.dumps(value))
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2


def test_missing_default_config_requires_disabled_observation(tmp_path: Path):
    import json
    root, path, value = observation_fixture(tmp_path)
    config_path = value['inputRoles']['config']['path']
    Path(config_path).unlink()
    next(b for b in value['bindings'] if b['path'] == config_path)['sha256'] = None
    value['dailyEnabled'] = True
    path.write_text(json.dumps(value))
    assert stories.main(['--root', str(root), '--source-observation', str(path)]) == 2
