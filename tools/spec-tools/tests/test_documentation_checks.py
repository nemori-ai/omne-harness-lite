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


@pytest.mark.parametrize("area", [
    ".meta_harness/design_legacy",
    ".meta_harness/research/legacy_backup",
    ".meta_harness/agents/research",
])
def test_retained_originals_keep_their_original_links(tmp_path, area):
    """Retained originals are excluded: rewriting their links would falsify the record."""
    base(tmp_path)
    write(tmp_path / area / "topic/README.md", "[as it was written](../../old/place.md)")
    assert run(tmp_path).returncode == 0


def test_sealed_upstream_file_keeps_original_links_but_not_its_neighbors(tmp_path):
    from omne_harness_lite_spec_tools.check_docs import RETAINED_FILES
    base(tmp_path)
    source_root = Path(__file__).resolve().parents[3]
    for relative in RETAINED_FILES:
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((source_root / relative).read_bytes())
        assert run(tmp_path).returncode == 0
        write(target.parent.parent / "README.md", "[missing](missing.md)")
        assert "README.md: broken link" in run(tmp_path).stdout
        target.write_bytes(target.read_bytes() + b"\nchanged\n")
        assert "retained upstream source digest differs" in run(tmp_path).stdout


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


def test_navigation_reuses_locked_historical_source_owner(tmp_path):
    import hashlib
    import json
    base(tmp_path)
    source = tmp_path / '.meta_harness/design/record/evidence/prior/README.md'
    snapshot = tmp_path / '.meta_harness/design/record/evidence/retirement/inputs/design.md.txt'
    write(source, '[old](../../../realization/packages/core/kernel-basis/design.md#original)\n')
    write(snapshot, '# Original\n')
    implementation = Path(__file__).resolve().parents[3] / '.meta_harness/tooling/src/source_links.py'
    write(tmp_path / '.meta_harness/tooling/src/source_links.py', implementation.read_text())
    target = 'realization/packages/core/kernel-basis/design.md'
    catalog = {'format':1, 'targets':[{'path':target,'snapshot':'record/evidence/retirement/inputs/design.md.txt','sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'commit':'1'*40}], 'references':[{'source':'record/evidence/prior/README.md','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'links':[{'target':target,'fragment':'original'}]}]}
    write(tmp_path / '.meta_harness/design/registry/retired-sources.json', json.dumps(catalog))
    result = run(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
    # A new proposal is not an old consumer, even though it is in record/.
    write(tmp_path / '.meta_harness/design/record/proposals/new/design.md', source.read_text())
    result = run(tmp_path)
    assert result.returncode == 1 and 'broken link' in result.stdout


def test_navigation_rejects_modified_historical_consumer(tmp_path):
    import hashlib
    import json
    base(tmp_path)
    source = tmp_path / '.meta_harness/design/record/evidence/prior/README.md'
    snapshot = tmp_path / '.meta_harness/design/record/evidence/retirement/inputs/design.md.txt'
    write(source, '[old](../../../realization/packages/core/kernel-basis/design.md#original)\n')
    write(snapshot, '# Original\n')
    implementation = Path(__file__).resolve().parents[3] / '.meta_harness/tooling/src/source_links.py'
    write(tmp_path / '.meta_harness/tooling/src/source_links.py', implementation.read_text())
    target = 'realization/packages/core/kernel-basis/design.md'
    write(tmp_path / '.meta_harness/design/registry/retired-sources.json', json.dumps({'format':1,'targets':[{'path':target,'snapshot':'record/evidence/retirement/inputs/design.md.txt','sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'commit':'1'*40}],'references':[{'source':'record/evidence/prior/README.md','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'links':[{'target':target,'fragment':'original'}]}]}))
    write(source, source.read_text()+'new text\n')
    result = run(tmp_path)
    assert result.returncode == 1 and 'consumer hash differs' in result.stdout


def test_navigation_current_alias_cannot_borrow_historical_identity(tmp_path):
    # Use the independently frozen original source and recreate IR's alias counterexample.
    import hashlib
    import json
    base(tmp_path)
    source = tmp_path / '.meta_harness/design/record/evidence/prior/README.md'
    snapshot = tmp_path / '.meta_harness/design/record/evidence/retirement/inputs/design.md.txt'
    write(source, '[old](../../../realization/packages/core/kernel-basis/design.md#original)\n')
    write(snapshot, '# Original\n')
    implementation = Path(__file__).resolve().parents[3] / '.meta_harness/tooling/src/source_links.py'
    write(tmp_path / '.meta_harness/tooling/src/source_links.py', implementation.read_text())
    target = 'realization/packages/core/kernel-basis/design.md'
    write(tmp_path / '.meta_harness/design/registry/retired-sources.json', json.dumps({'format':1,'targets':[{'path':target,'snapshot':'record/evidence/retirement/inputs/design.md.txt','sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'commit':'1'*40}],'references':[{'source':'record/evidence/prior/README.md','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'links':[{'target':target,'fragment':'original'}]}]}))
    alias = tmp_path / '.meta_harness/design/architecture/a/b/current.md'
    alias.parent.mkdir(parents=True)
    alias.symlink_to(source)
    result = run(tmp_path)
    assert result.returncode == 1 and 'broken link' in result.stdout
