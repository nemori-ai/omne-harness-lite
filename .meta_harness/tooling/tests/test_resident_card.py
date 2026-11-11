"""The resident card in the project entry file is the pinned pqw-skills card, byte for byte."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import resident_card

CARD_SOURCE = """# 常驻卡片

给接入的项目用。

---

## 做事方式

- **拆。** 先找独立变化的量。`think-orthogonal`
"""
CARD = """## 做事方式

- **拆。** 先找独立变化的量。`think-orthogonal`
"""


def entry(body: str) -> str:
    return (f"# 入口\n\n## 项目心智模型\n\n心智。\n\n{resident_card.BEGIN}\n\n{body}"
            f"\n{resident_card.END}\n\n## 知识放哪\n\n知识。\n")


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "project"
    source = root / resident_card.CARD
    source.parent.mkdir(parents=True)
    source.write_text(CARD_SOURCE)
    (root / resident_card.ENTRY).write_text(entry("旧的卡片\n"))
    return root


def run(project, *extra):
    return resident_card.main(["--project-root", str(project), *extra])


def test_write_places_the_card_between_the_markers_and_keeps_the_rest(project):
    assert run(project) == 0
    assert (project / "AGENTS.md").read_text() == entry(CARD)
    assert run(project) == 0
    assert run(project, "--check") == 0
    assert (project / "AGENTS.md").read_text() == entry(CARD)


def test_check_fails_on_one_changed_character_and_does_not_write(project):
    drifted = entry(CARD.replace("独立", "独力"))
    (project / "AGENTS.md").write_text(drifted)
    assert run(project, "--check") == 1
    assert (project / "AGENTS.md").read_text() == drifted


def test_check_fails_when_the_pinned_card_changes(project):
    assert run(project) == 0
    (project / resident_card.CARD).write_text(CARD_SOURCE + "- **证。** 带证据。`think-evidence`\n")
    assert run(project, "--check") == 1


@pytest.mark.parametrize("text", [
    "# 入口\n\n没有标记。\n",
    entry("卡片\n") + resident_card.BEGIN + "\n",
    entry("卡片\n").replace(resident_card.END, ""),
    f"{resident_card.END}\n\n{resident_card.BEGIN}\n",
])
def test_entry_without_one_ordered_marker_pair_is_rejected_unchanged(project, text):
    (project / "AGENTS.md").write_text(text)
    assert run(project) == 1
    assert (project / "AGENTS.md").read_text() == text


@pytest.mark.parametrize("source", ["# 常驻卡片\n\n没有分隔线。\n", "---\n\n---\n\n## 两条\n", "# 卡\n\n---\n\n"])
def test_card_without_one_separator_and_a_body_is_rejected(project, source):
    (project / resident_card.CARD).write_text(source)
    before = (project / "AGENTS.md").read_text()
    assert run(project) == 1
    assert (project / "AGENTS.md").read_text() == before


def test_missing_card_names_the_submodule_command(project, capsys):
    (project / resident_card.CARD).unlink()
    assert run(project, "--check") == 1
    assert "git submodule update --init" in capsys.readouterr().err
