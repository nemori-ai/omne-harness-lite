import subprocess
import sys
from pathlib import Path

import pytest

DOCS = "omne_harness_lite_spec_tools.check_docs"


def run(root):
    return subprocess.run([sys.executable, "-m", DOCS, "--root", str(root)],
                          text=True, capture_output=True)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def base(tmp_path):
    write(tmp_path / "README.md", "# Root\n")


def test_rejects_bad_link_and_anchor(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/a.md",
          "[missing](no.md) [bad](../README.md#none)\n```\n[ignored](nope.md)\n```")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "broken link" in result.stdout and "broken anchor" in result.stdout


def test_contribution_entry_links_and_development_anchors_are_checked(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/development.md", "# Development\n## Setup\n")
    entry = tmp_path / "CONTRIBUTING.md"
    write(entry, "[setup](docs/development.md#setup)")
    assert run(tmp_path).returncode == 0
    write(entry, "[setup](docs/development.md#missing)")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "CONTRIBUTING.md: broken anchor" in result.stdout


def test_explicit_anchors_preserve_renamed_sections_but_not_code_examples(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/target.md",
          '<a id="旧-坐标"></a>\n\n# Current title\n\n'
          "A <a href='#' name='inline-coordinate'></a> link.\n\n"
          '`<a id="inline-code"></a>`\n\n'
          '```html\n<a id="fenced-code"></a>\n```\n')
    source = tmp_path / "docs/source.md"
    write(source, "[old](target.md#旧-坐标) [new](target.md#current-title) "
                  "[inline](target.md#inline-coordinate)\n")
    assert run(tmp_path).returncode == 0
    with source.open("a") as handle:
        handle.write("[code](target.md#inline-code) [fence](target.md#fenced-code)\n")
    result = run(tmp_path)
    assert result.returncode == 1
    assert result.stdout.count("broken anchor") == 2


@pytest.mark.parametrize("area", ["apps", "tools", "scripts", ".codex", ".meta_harness"])
def test_source_area_navigation_is_checked(tmp_path, area):
    base(tmp_path)
    write(tmp_path / area / "README.md", "[missing](missing.md)")
    result = run(tmp_path)
    assert result.returncode == 1
    assert f"{area}/README.md: broken link" in result.stdout


def test_dependency_and_build_documentation_is_not_project_navigation(tmp_path):
    base(tmp_path)
    for directory in ("tools/check/.venv/lib", "apps/web/node_modules/dependency",
                      "packages/lib/dist"):
        write(tmp_path / directory / "README.md", "[external package link](missing.md)")
    assert run(tmp_path).returncode == 0


def test_real_heading_tokens_unicode_duplicates_and_reference_links(tmp_path):
    base(tmp_path)
    write(tmp_path / "docs/a.md",
          "# 中文 **标题**\n[本页](#中文-标题)\n# 中文 **标题**\n[再次](#中文-标题-1)\n"
          "[ref][ok]\n\n[ok]: ../README.md#root\n\n~~~\n[ignored](missing.md)\n~~~\n")
    assert run(tmp_path).returncode == 0
    write(tmp_path / "docs/b.md", "# Title\n[bad](#missing)\n")
    assert "broken anchor" in run(tmp_path).stdout


def test_design_sources_have_no_originals_link_exemption(tmp_path):
    base(tmp_path)
    write(tmp_path / ".meta_harness/design/architecture/topic/README.md", "[missing](../../old/place.md)")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "broken link" in result.stdout


def test_research_has_no_retained_originals_link_exemption(tmp_path):
    base(tmp_path)
    write(tmp_path / ".meta_harness/research/legacy_backup/topic/README.md",
          "[missing](../../old/place.md)")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "broken link" in result.stdout


def test_research_resource_and_neighbors_use_normal_link_checks(tmp_path):
    base(tmp_path)
    area = tmp_path / ".meta_harness/research/mechanism/sources"
    write(area / "upstream.md", "[broken source](missing.md)")
    write(area.parent / "README.md", "[broken neighbor](missing.md)")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "upstream.md: broken link" in result.stdout
    assert "README.md: broken link" in result.stdout


def test_templates_are_excluded(tmp_path):
    base(tmp_path)
    write(tmp_path / ".meta_harness/design/x/.templates/topic/README.md",
          "[placeholder]({{YYYY-MM-DD-topic}}.md)")
    assert run(tmp_path).returncode == 0


def test_skill_mirror_difference_is_reported(tmp_path):
    base(tmp_path)
    write(tmp_path / ".agents/skills/a/SKILL.md", "left\n")
    write(tmp_path / ".claude/skills/a/SKILL.md", "right\n")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "skill mirror differs" in result.stdout


def test_skill_inventory_difference_is_reported(tmp_path):
    base(tmp_path)
    write(tmp_path / ".agents/skills/a/SKILL.md", "same\n")
    write(tmp_path / ".claude/skills/a/SKILL.md", "same\n")
    write(tmp_path / ".claude/skills/b/SKILL.md", "extra\n")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "skill inventory differs" in result.stdout


def test_checkout_without_compiled_artefacts_has_nothing_to_mirror(tmp_path):
    base(tmp_path)
    assert run(tmp_path).returncode == 0


def test_one_sided_skill_directory_is_reported(tmp_path):
    base(tmp_path)
    write(tmp_path / ".agents/skills/a/SKILL.md", "only left\n")
    result = run(tmp_path)
    assert result.returncode == 1
    assert "only one of the generated skill directories exists" in result.stdout


def test_navigation_rejects_existing_process_owner(tmp_path):
    base(tmp_path)
    write(tmp_path / '.meta_harness/design/record/decisions/past/current.md', '# Current\n')
    write(tmp_path / 'docs/current.md', '[owner](../.meta_harness/design/record/decisions/past/current.md)\n')
    result = run(tmp_path)
    assert result.returncode == 1 and 'process record is not a current owner' in result.stdout


def test_navigation_does_not_recover_missing_owner_from_snapshots(tmp_path):
    base(tmp_path)
    write(tmp_path / '.meta_harness/design/registry/retired-sources.json', '{"format":1,"targets":[],"references":[]}')
    write(tmp_path / '.meta_harness/design/record/evidence/past/input.txt', '# Original\n')
    write(tmp_path / 'docs/current.md', '[owner](../packages/core/absent/SPEC.md)\n')
    result = run(tmp_path)
    assert result.returncode == 1 and 'broken link' in result.stdout


def test_git_cannot_track_process_record_even_if_ignored(tmp_path):
    import subprocess
    base(tmp_path)
    subprocess.run(['git', 'init', str(tmp_path)], check=True, capture_output=True)
    write(tmp_path / '.gitignore', '.meta_harness/design/record/\n')
    write(tmp_path / '.meta_harness/design/record/decisions/past/decision.md', '# Past\n')
    subprocess.run(['git', '-C', str(tmp_path), 'add', '-f', '.meta_harness/design/record'], check=True)
    result = run(tmp_path)
    assert result.returncode == 1 and 'must not be tracked' in result.stdout


def test_current_method_research_cannot_hide_broken_links(tmp_path):
    base(tmp_path)
    write(tmp_path / ".meta_harness/agents/research/topic/README.md", "[broken](missing.md)")
    assert "broken link" in run(tmp_path).stdout
