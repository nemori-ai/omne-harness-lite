"""The project pins the pqw-skills consumer contract version; skill text floats to the newest release with that version."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import pqw_contract

SLOTS = ["类型检查与 lint 命令", "验收处"]
SECTIONS = ["目标", "四问"]


def contract(version: int, slots=SLOTS, sections=SECTIONS) -> str:
    return json.dumps({"version": version, "slots": slots, "handoffSections": sections,
                       "residentCardSha256": "x"}, ensure_ascii=False)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def release(root: Path, version: int, marker: str) -> None:
    write(root / pqw_contract.CONTRACT, contract(version))
    write(root / "skills/a/SKILL.md", marker)


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "project"
    write(root / pqw_contract.PINNED, "1\n")
    release(root / pqw_contract.VENDOR, 1, "floor")
    write(root / "AGENTS.md", "# 入口\n\n## pqw-skills 接入\n\n说明。\n\n| 槽位 | omne 的值 |\n| --- | --- |\n"
          "| 类型检查与 lint 命令 | `x` |\n| 验收处 | 卡评论 |\n| 常驻卡片 | 本文件 |\n\n## 研发品味\n\n| 别的表 | 值 |\n")
    write(root / pqw_contract.CARD_TEMPLATE, "---\nname: 卡\n---\n\n# 交接信息包\n\n## 目标\n\n## 四问\n")
    return root


def git(cwd: Path, *args: str) -> str:
    done = subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd,
                          check=True, capture_output=True, text=True)
    return done.stdout.strip()


@pytest.fixture
def released(project):
    """The vendored checkout as a git repository: v1.0.0 is the pinned floor, two later releases follow."""
    vendor = project / pqw_contract.VENDOR
    git(vendor, "init", "-q")
    for tag, version, marker in (("v1.0.0", 1, "floor"), ("v1.1.0", 1, "newer"), ("v2.0.0", 2, "next contract")):
        release(vendor, version, marker)
        git(vendor, "add", "-A")
        git(vendor, "commit", "-q", "-m", tag)
        git(vendor, "tag", tag)
    git(vendor, "checkout", "-q", "v1.0.0")
    return project


def test_the_root_is_the_vendored_checkout_until_a_float_with_the_pinned_contract_exists(project):
    vendor, floated = project / pqw_contract.VENDOR, project / pqw_contract.FLOAT
    assert pqw_contract.root(project) == vendor
    release(floated, 2, "other contract")
    assert pqw_contract.root(project) == vendor
    release(floated, 1, "same contract")
    assert pqw_contract.root(project) == floated


def test_a_project_without_a_pinned_version_reads_the_vendored_checkout(project):
    (project / pqw_contract.PINNED).unlink()
    release(project / pqw_contract.FLOAT, 1, "same contract")
    assert pqw_contract.root(project) == project / pqw_contract.VENDOR


def test_a_project_that_satisfies_the_pinned_contract_has_no_problems(project):
    assert pqw_contract.problems(project) == []


def test_each_unmet_part_of_the_contract_is_one_problem(project):
    write(project / pqw_contract.VENDOR / pqw_contract.CONTRACT, contract(2, [*SLOTS, "跨会话协调用什么"], ["目标", "切片大纲", "四问"]))
    assert pqw_contract.problems(project) == [
        "the vendored pqw-skills has consumer contract version 2, the project pins 1 in .meta_harness/agents/pqw/contract-version",
        "AGENTS.md「pqw-skills 接入」lacks the slot「跨会话协调用什么」",
        ".github/ISSUE_TEMPLATE/card.md has the sections 目标、四问; the contract asks for 目标、切片大纲、四问",
    ]


def test_a_vendored_checkout_without_a_contract_is_a_problem(project):
    (project / pqw_contract.VENDOR / pqw_contract.CONTRACT).unlink()
    assert pqw_contract.problems(project) == [
        "the vendored pqw-skills has no design/consumer-contract.json; pin a release that has one",
    ]


def test_advance_extracts_the_newest_release_with_the_pinned_contract(released):
    floated = released / pqw_contract.FLOAT
    assert pqw_contract.advance(released, fetch=False) == "v1.1.0"
    assert (floated / "skills/a/SKILL.md").read_text() == "newer"
    assert pqw_contract.root(released) == floated
    assert git(released / pqw_contract.VENDOR, "describe", "--tags") == "v1.0.0"
    (floated / "skills/a/SKILL.md").write_text("edited by hand")
    assert pqw_contract.advance(released, fetch=False) == "v1.1.0"
    assert (floated / "skills/a/SKILL.md").read_text() == "edited by hand", "the same release is not extracted twice"


def test_advance_drops_the_float_when_the_vendored_checkout_is_already_the_newest(released):
    pqw_contract.advance(released, fetch=False)
    git(released / pqw_contract.VENDOR, "checkout", "-q", "v1.1.0")
    assert pqw_contract.advance(released, fetch=False) is None
    assert not (released / pqw_contract.FLOAT).exists()


def test_advance_never_goes_behind_the_vendored_checkout(released):
    vendor = released / pqw_contract.VENDOR
    git(vendor, "checkout", "-q", "v1.1.0")
    release(vendor, 1, "unreleased work on top of the newest release")
    git(vendor, "commit", "-q", "-am", "ahead")
    assert pqw_contract.advance(released, fetch=False) is None


def test_advance_replaces_a_float_left_from_an_older_contract(released):
    pqw_contract.advance(released, fetch=False)
    write(released / pqw_contract.PINNED, "2\n")
    git(released / pqw_contract.VENDOR, "checkout", "-q", "v2.0.0")
    assert pqw_contract.advance(released, fetch=False) is None
    assert not (released / pqw_contract.FLOAT).exists()


def test_check_mode_reports_problems_and_fails(project, capsys):
    assert pqw_contract.main(["--project-root", str(project), "--check"]) == 0
    write(project / pqw_contract.PINNED, "3\n")
    assert pqw_contract.main(["--project-root", str(project), "--check"]) == 1
    assert "pins 3" in capsys.readouterr().err
