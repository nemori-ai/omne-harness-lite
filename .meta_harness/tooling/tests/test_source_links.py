from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from design_sources import check_links
from source_links import ModuleSources


def save(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding='utf-8')


def markdown(root: Path, source_root: Path | None = None) -> list[str]:
    return check_links(root, source_root)


@pytest.mark.parametrize('kind', ['proposals', 'decisions', 'evidence'])
def test_process_directory_cannot_supply_current_owner(tmp_path: Path, kind: str) -> None:
    root = tmp_path / '.meta_harness/design'
    save(root / f'record/{kind}/prior/current.md', '# Shape\n')
    save(root / 'architecture/current.md', f'[owner](../record/{kind}/prior/current.md#shape)\n')
    assert any('process record is not a current owner' in error for error in markdown(root))


def test_missing_owner_cannot_be_recovered_by_old_record_catalog(tmp_path: Path) -> None:
    root = tmp_path / '.meta_harness/design'
    save(root / 'record/evidence/past/snapshot.txt', '# Original\n')
    save(root / 'registry/retired-sources.json', '{"format":1,"targets":[],"references":[]}')
    save(root / 'architecture/current.md', '[owner](../realization/absent.md#original)\n')
    assert any('broken local link' in error for error in markdown(root))


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







@pytest.mark.parametrize('parent_alias', [False, True])
def test_alias_cannot_make_process_document_a_current_owner(tmp_path: Path, parent_alias: bool) -> None:
    root = tmp_path / '.meta_harness/design'
    target = root / 'record/decisions/past/current.md'
    save(target, '# Shape\n')
    alias = root / 'architecture/alias'
    alias.parent.mkdir(parents=True)
    if parent_alias:
        alias.symlink_to(target.parent, target_is_directory=True)
        href = 'alias/current.md'
    else:
        alias.symlink_to(target)
        href = 'alias'
    save(root / 'architecture/README.md', f'[owner]({href}#shape)\n')
    assert any('process record is not a current owner' in error for error in markdown(root))


@pytest.mark.parametrize('name', ['spec', 'realization', 'registry'])
@pytest.mark.parametrize('kind', ['empty', 'file', 'dangling-alias'])
def test_retired_root_cannot_return_as_empty_tree_or_alias(tmp_path: Path, name: str, kind: str) -> None:
    root = tmp_path / '.meta_harness/design'
    save(root / 'architecture/README.md', '# Current\n')
    target = root / name
    if kind == 'empty':
        target.mkdir()
    elif kind == 'file':
        target.write_text('not a maintained owner', encoding='utf-8')
    else:
        target.symlink_to(tmp_path / 'missing')
    assert f'retired design root exists: {name}' in markdown(root)


@pytest.mark.parametrize('target', ['requirements.md', 'architecture/runtime/assembly.md', 'domains/identity/README.md', 'architecture/constraints.json', 'engineering/documentation.md', 'engineering/delivery.md', 'engineering/work-types.md', 'engineering/agent-delivery.md', 'engineering/github-delivery.json', 'rfcs/README.md'])
def test_adopted_documents_require_their_explicit_execution_checkout(tmp_path: Path, target: str) -> None:
    root = tmp_path / '.meta_harness/design'
    save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    save(tmp_path / 'docs' / target, '# Guarantee\n' if target.endswith('.md') else '{}\n')
    fragment = '#guarantee' if target.endswith('.md') else ''
    save(root / 'product/README.md', f'[basis](../../../docs/{target}{fragment})\n')
    assert markdown(root, tmp_path) == []
    assert any('escapes design root' in error for error in markdown(root))


@pytest.mark.parametrize('target', ['README.md', 'development.md', 'engineering/rule.md', 'architecture-other/rule.md', 'domain/rule.md'])
def test_adoption_does_not_open_all_docs(tmp_path: Path, target: str) -> None:
    root = tmp_path / '.meta_harness/design'
    save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    save(tmp_path / 'docs' / target, '# Guarantee\n')
    save(root / 'product/README.md', f'[basis](../../../docs/{target}#guarantee)\n')
    assert any('escapes design root' in error for error in markdown(root, tmp_path))


@pytest.mark.parametrize('target_name', ['requirements.md', 'engineering/agent-delivery.md'])
@pytest.mark.parametrize('mutation', ['missing', 'anchor', 'symlink', 'encoded-traversal', 'other-checkout'])
def test_adopted_document_boundaries_fail_closed(tmp_path: Path, mutation: str, target_name: str) -> None:
    execution = tmp_path / 'execution'
    other = tmp_path / 'other'
    root = execution / '.meta_harness/design'
    save(execution / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    save(other / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    target = execution / 'docs' / target_name
    save(target, '# Guarantee\n')
    href = f'../../../docs/{target_name}#guarantee'
    if mutation == 'missing':
        target.unlink()
    elif mutation == 'anchor':
        href = f'../../../docs/{target_name}#absent'
    elif mutation == 'symlink':
        save(other / 'docs' / target_name, '# Guarantee\n')
        target.unlink()
        target.symlink_to(other / 'docs' / target_name)
    elif mutation == 'encoded-traversal':
        save(execution / 'secret.md', '# Guarantee\n')
        href = '../../../docs/architecture/%2e%2e/%2e%2e/secret.md#guarantee'
    save(root / 'product/README.md', f'[basis]({href})\n')
    assert markdown(root, other if mutation == 'other-checkout' else execution)


def test_same_document_path_uses_each_checkouts_actual_revision(tmp_path: Path) -> None:
    for revision in ['old', 'new']:
        checkout = tmp_path / revision
        root = checkout / '.meta_harness/design'
        save(checkout / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
        save(checkout / 'docs/requirements.md', f'# {revision}\n')
        save(root / 'product/README.md', f'[basis](../../../docs/requirements.md#{revision})\n')
        assert markdown(root, checkout) == []
        save(root / 'product/README.md', '[basis](../../../docs/requirements.md#new)\n')
        result = markdown(root, checkout)
        assert bool(result) == (revision == 'old')
