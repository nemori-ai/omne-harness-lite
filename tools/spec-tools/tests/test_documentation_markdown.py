import pytest

from omne_harness_lite_spec_tools.documentation_markdown import parse, sections, section_excerpt


def test_original_lines_setext_subsection_and_repeated_title():
    text = "---\ntitle: ignored\n---\n# Root\n\nRole\n----\nFirst.\n### Child\nNested.\n## Role\nSecond.\n## End\nOther.\n"
    tokens = parse(text)
    assert section_excerpt(text, tokens, "role") == "Role\n----\nFirst.\n### Child\nNested.\n"
    assert section_excerpt(text, tokens, "role-1") == "## Role\nSecond.\n"


@pytest.mark.parametrize("prefix", ['<a id="stable"></a>\n', '<a name="stable"></a>\n\n'])
def test_actual_html_anchor_locates_heading(prefix):
    text = prefix + "## Role\nActual body.\n"
    assert section_excerpt(text, parse(text), "stable") == "## Role\nActual body.\n"


@pytest.mark.parametrize("prefix", ['`<a id="stable"></a>`\n', '<!-- <a id="stable"></a> -->\n',
                                     '\\<a id="stable"></a>\n', '```\n<a id="stable"></a>\n```\n'])
def test_fake_html_anchor_does_not_create_section(prefix):
    assert "stable" not in sections(parse(prefix + "## Role\nActual body.\n"))


def test_unclosed_fence_cannot_supply_section():
    assert "role" not in sections(parse("```\n## Role\nbody\n"))


def test_placeholder_keeps_original_excerpt_and_empty_section_has_none():
    text = "## Role\n<!-- documentation:placeholder -->\nPending.\n## Empty\n"
    assert section_excerpt(text, parse(text), "role") == text.split("## Empty")[0]
    assert section_excerpt(text, parse(text), "empty") is None
