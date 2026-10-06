from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from design_validation import DesignValidator
from source_links import ModuleSources, RetiredSources


def save(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding='utf-8')


def historical(repo: Path) -> tuple[Path, Path, Path, Path]:
    root = repo / '.meta_harness/design'
    target = root / 'realization/packages/core/kernel-basis/design.md'
    snapshot = root / 'record/evidence/retirement/inputs/design.md.txt'
    source = root / 'record/evidence/prior/README.md'
    save(snapshot, '# Original\n')
    save(source, '[original](../../../realization/packages/core/kernel-basis/design.md#original)\n')
    catalog = root / 'registry/retired-sources.json'
    save(root / 'registry/baseline.json', '{}')
    data = {'format': 1, 'targets': [{'path':str(target.relative_to(root)), 'snapshot':str(snapshot.relative_to(root)), 'sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(), 'commit':'1'*40}], 'references':[{'source':str(source.relative_to(root)), 'sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'links':[{'target':str(target.relative_to(root)), 'fragment':'original'}]}]}
    save(catalog, json.dumps(data))
    return root, source, snapshot, catalog


def markdown(root: Path, source_root: Path | None = None) -> list[str]:
    validator = DesignValidator(root, source_root=source_root)
    validator._markdown()
    return validator.errors


def test_historical_recovery_checks_original_anchor(tmp_path: Path) -> None:
    root, _, _, _ = historical(tmp_path)
    assert markdown(root) == []


@pytest.mark.parametrize('source', ['architecture/new.md', 'record/proposals/new/design.md', 'record/decisions/new/decision.md'])
def test_new_current_or_record_consumer_cannot_recover_old_source(tmp_path: Path, source: str) -> None:
    root, _, _, _ = historical(tmp_path)
    p = root / source
    import os
    href = os.path.relpath(root / 'realization/packages/core/kernel-basis/design.md', p.parent)
    save(p, f'[wrong]({href}#original)\n')
    assert any('broken local link' in error for error in markdown(root))


@pytest.mark.parametrize('mutation', ['body', 'snapshot', 'missing', 'source-outside', 'snapshot-outside', 'commit', 'fragment', 'present-target'])
def test_retirement_integrity_negative_controls(tmp_path: Path, mutation: str) -> None:
    root, source, snapshot, catalog = historical(tmp_path)
    data = json.loads(catalog.read_text())
    if mutation == 'body': source.write_text(source.read_text()+'[new](../../../realization/packages/core/kernel-basis/design.md#original)\n')
    elif mutation == 'snapshot': snapshot.write_text('# Replacement\n')
    elif mutation == 'missing': snapshot.unlink()
    elif mutation == 'source-outside': data['references'][0]['source'] = '../outside.md'
    elif mutation == 'snapshot-outside': data['targets'][0]['snapshot'] = 'architecture/current.txt'
    elif mutation == 'commit': data['targets'][0]['commit'] = 'main'
    elif mutation == 'fragment': data['references'][0]['links'][0]['fragment'] = 'other'
    elif mutation == 'present-target': save(root/data['targets'][0]['path'], '# Original\n')
    catalog.write_text(json.dumps(data))
    assert markdown(root)


def test_explicit_source_owner_positive_and_absent_owner_negative(tmp_path: Path) -> None:
    root = tmp_path / '.meta_harness/design'
    save(tmp_path/'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n  - apps/*\n')
    save(tmp_path/'packages/core/sample/package.json', '{"name":"sample"}')
    save(tmp_path/'packages/core/sample/SPEC.md', '# Shape\n')
    save(root/'architecture/README.md', '[owner](../../../packages/core/sample/SPEC.md#shape)\n')
    assert markdown(root, tmp_path) == []
    assert any('escapes design root' in error for error in markdown(root))


@pytest.mark.parametrize('mutation', ['missing', 'anchor', 'nonmember', 'excluded', 'symlink'])
def test_owner_link_negative_controls(tmp_path: Path, mutation: str) -> None:
    root = tmp_path / '.meta_harness/design'
    save(tmp_path/'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    save(tmp_path/'packages/core/sample/package.json', '{"name":"sample"}')
    target = tmp_path/'packages/core/sample/SPEC.md'
    save(target, '# Shape\n')
    if mutation == 'missing': target.unlink()
    elif mutation == 'nonmember': (target.parent/'package.json').unlink()
    elif mutation == 'excluded': save(tmp_path/'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n  - "!packages/core/sample"\n')
    elif mutation == 'symlink':
        outside = tmp_path.parent / (tmp_path.name+'-outside.md')
        save(outside, '# Shape\n'); target.unlink();target.symlink_to(outside)
    fragment = 'absent' if mutation == 'anchor' else 'shape'
    save(root/'architecture/README.md', f'[owner](../../../packages/core/sample/SPEC.md#{fragment})\n')
    assert markdown(root, tmp_path)


def test_unsupported_workspace_fails_closed(tmp_path: Path) -> None:
    save(tmp_path/'pnpm-workspace.yaml', 'packages: ["packages/*/*"]\n')
    with pytest.raises(ValueError, match='supported workspace'):
        ModuleSources(tmp_path)


def test_no_arbitrary_tool_or_tmp_owner(tmp_path: Path) -> None:
    save(tmp_path/'pnpm-workspace.yaml', 'packages:\n  - tools/*\n  - tmp/*\n')
    save(tmp_path/'tools/sample/package.json', '{"name":"tool"}')
    assert not ModuleSources(tmp_path).owns(tmp_path/'tools/sample/SPEC.md')


def test_current_file_alias_cannot_borrow_historical_identity(tmp_path: Path) -> None:
    root, source, _, _ = historical(tmp_path)
    alias = root / 'architecture/a/b/current.md'
    alias.parent.mkdir(parents=True)
    alias.symlink_to(source)
    assert any('broken local link' in error for error in markdown(root))


def test_parent_alias_cannot_borrow_historical_identity(tmp_path: Path) -> None:
    root, source, _, catalog = historical(tmp_path)
    alias = root / 'architecture/alias'
    alias.parent.mkdir(parents=True)
    alias.symlink_to(source.parent, target_is_directory=True)
    links = RetiredSources(root, catalog)
    target = root / 'realization/packages/core/kernel-basis/design.md'
    assert links.recover(alias / source.name, target, 'original') is None


def test_catalog_cannot_declare_source_alias_as_original(tmp_path: Path) -> None:
    root, source, _, catalog = historical(tmp_path)
    alias = source.parent / 'alias.md'
    alias.symlink_to(source)
    data = json.loads(catalog.read_text())
    data['references'][0]['source'] = str(alias.relative_to(root))
    catalog.write_text(json.dumps(data))
    assert any('identity cannot contain aliases' in error for error in markdown(root))
