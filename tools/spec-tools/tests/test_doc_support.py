from pathlib import Path

import pytest

from omne_harness_lite_spec_tools.doc_support import local_target, markdown_links, navigation_path


@pytest.mark.parametrize("href", ["bad%", "bad%2", "bad%xx", "%ff.md", "%5csecret", "%00.md",
                                  "file:///etc/passwd", "../outside", "tmp/a.md", "%74mp/a.md",
                                  ".meta_harness/design/record/a.md", "a\\b", "a%7fb", "a\nb", "a%C2%85b", "a?query=%ff"])
def test_local_uri_rejects_invalid_or_process_targets(tmp_path, href):
    with pytest.raises(ValueError):
        target, _ = local_target(tmp_path / "README.md", href, tmp_path, resolve=False)
        navigation_path(tmp_path, target)


def test_decodes_once_and_keeps_remote_links_unread(tmp_path):
    assert local_target(tmp_path / "README.md", "%252e.md#%252f", tmp_path) == (tmp_path / "%2e.md", "%2f")
    assert local_target(tmp_path / "README.md", "https://example.org/a", tmp_path) == (None, None)


def test_parser_does_not_hide_rejected_file_uri(tmp_path):
    source = tmp_path / "README.md"
    source.write_text("[bad](file:///etc/passwd)")
    assert list(markdown_links(source)) == ["file:///etc/passwd"]


def test_symlink_process_alias_is_rejected(tmp_path):
    (tmp_path / "tmp").mkdir()
    (tmp_path / "alias").symlink_to(tmp_path / "tmp", target_is_directory=True)
    with pytest.raises(ValueError, match="temporary/process"):
        target, _ = local_target(tmp_path / "README.md", "alias/a.md", tmp_path, resolve=False)
        navigation_path(tmp_path, target)


def test_symlink_parent_traversal_cannot_be_lexically_rewritten(tmp_path):
    (tmp_path / "tmp/child").mkdir(parents=True)
    (tmp_path / "alias").symlink_to(tmp_path / "tmp/child", target_is_directory=True)
    with pytest.raises(ValueError):
        local_target(tmp_path / "README.md", "alias/../secret.md", tmp_path)


def test_generated_source_alias_uses_its_physical_parent(tmp_path):
    source = tmp_path / ".meta_harness/.claude/agents/reviewer.md"
    source.parent.mkdir(parents=True)
    source.write_text("[rule](../../../docs/rule.md)")
    (tmp_path / ".claude").symlink_to(".meta_harness/.claude", target_is_directory=True)
    target = tmp_path / "docs/rule.md"
    target.parent.mkdir()
    target.write_text("Rule")
    assert local_target(tmp_path / ".claude/agents/reviewer.md", "../../../docs/rule.md", tmp_path) == (target, "")


def test_ordinary_navigation_can_identify_a_temporary_candidate(tmp_path):
    target = tmp_path / "tmp/candidate.md"
    target.parent.mkdir()
    target.write_text("Unaccepted candidate")
    assert local_target(tmp_path / "README.md", "tmp/candidate.md", tmp_path) == (target, "")
