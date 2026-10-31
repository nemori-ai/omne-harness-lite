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


def register(root: Path, *paths: str) -> None:
    save(root / 'docs/policy.md', '# Policy\nActual obligation.\n')
    documents = [{"id": path, "path": path, "kind": "standard", "required": True,
                  "visibility": "internal", "basis": "candidate", "applicability": "applicable",
                  "expectationSource": {"path": "docs/policy.md"}, "inspectionProfile": "prose-v1",
                  "requiredSections": []} for path in paths if path.endswith('.md')]
    save(root / 'docs/documentation.json', json.dumps({"schemaVersion": 2,
         "kind": "documentation-bindings", "owner": {"id": "project", "kind": "project",
         "source": {"path": "docs/policy.md"}}, "documents": documents}))


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
    register(tmp_path, 'packages/core/sample/SPEC.md')
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
    register(tmp_path)
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
    register(tmp_path, "docs/" + target)
    assert markdown(root, tmp_path) == []
    assert any('escapes design root' in error for error in markdown(root))


@pytest.mark.parametrize('target', ['README.md', 'development.md', 'engineering/rule.md', 'architecture-other/rule.md', 'domain/rule.md'])
def test_adoption_does_not_open_all_docs(tmp_path: Path, target: str) -> None:
    root = tmp_path / '.meta_harness/design'
    save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    save(tmp_path / 'docs' / target, '# Guarantee\n')
    save(root / 'product/README.md', f'[basis](../../../docs/{target}#guarantee)\n')
    register(tmp_path)
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
    register(execution, "docs/" + target_name)
    register(other, "docs/" + target_name)
    assert markdown(root, other if mutation == 'other-checkout' else execution)


def test_same_document_path_uses_each_checkouts_actual_revision(tmp_path: Path) -> None:
    for revision in ['old', 'new']:
        checkout = tmp_path / revision
        root = checkout / '.meta_harness/design'
        save(checkout / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
        save(checkout / 'docs/requirements.md', f'# {revision}\n')
        save(root / 'product/README.md', f'[basis](../../../docs/requirements.md#{revision})\n')
        register(checkout, "docs/requirements.md")
        assert markdown(root, checkout) == []
        save(root / 'product/README.md', '[basis](../../../docs/requirements.md#new)\n')
        result = markdown(root, checkout)
        assert bool(result) == (revision == 'old')


def test_registered_document_only_targets_are_exact(tmp_path):
    root = tmp_path / '.meta_harness/design'
    save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    for path in ['packages/group/README.md', 'packages/group/member/SPEC.md', 'packages/group/member/extra.md', 'tools/example/README.md']:
        save(tmp_path / path, '# Shape\nReal obligation.\n')
    register(tmp_path, 'packages/group/README.md', 'packages/group/member/SPEC.md', 'tools/example/README.md')
    save(root / 'README.md', '[Group](../../packages/group/README.md#shape)\n[Member](../../packages/group/member/SPEC.md#shape)\n[Tool](../../tools/example/README.md#shape)\n')
    assert check_links(root, tmp_path) == []
    save(root / 'README.md', '[Extra](../../packages/group/member/extra.md#shape)\n')
    assert any('escapes design root' in error for error in check_links(root, tmp_path))


@pytest.mark.parametrize('kind', ['packages', 'packages.0.0.1.legacy'])
@pytest.mark.parametrize('suffix', ['src/index.ts', 'SPEC.md'])
def test_real_member_origin_requires_workspace_and_manifest(tmp_path, kind, suffix):
    root = tmp_path / '.meta_harness/design'
    member = f'{kind}/core/example'
    save(tmp_path / 'pnpm-workspace.yaml', f'packages:\n  - {kind}/*/*\n')
    save(tmp_path / member / 'package.json', '{"name":"example"}')
    save(tmp_path / member / suffix, '# Shape\n')
    register(tmp_path)
    save(root / 'README.md', f'[Source](../../{member}/{suffix})\n')
    target = tmp_path / member / suffix
    modules = ModuleSources(tmp_path)
    assert modules.origin(target) == ('current-member' if kind == 'packages' else 'archived-member')
    assert modules.owns(target) == (kind == 'packages')
    assert check_links(root, tmp_path) == []
    (tmp_path / member / 'package.json').unlink()
    assert any('escapes design root' in error for error in check_links(root, tmp_path))
    save(tmp_path / member / 'package.json', '{"name":"example"}')
    save(tmp_path / 'pnpm-workspace.yaml', f'packages:\n  - {kind}/*/*\n  - "!{member}"\n')
    assert any('escapes design root' in error for error in check_links(root, tmp_path))


@pytest.mark.parametrize('mutation', ['missing-registry', 'bad-registry', 'duplicate', 'basis-anchor', 'registry-alias', 'registered-alias'])
def test_bad_registration_cannot_fall_back_to_old_docs_allowlist(tmp_path, mutation):
    root = tmp_path / '.meta_harness/design'
    save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    save(tmp_path / 'docs/architecture/README.md', '# Shape\n')
    register(tmp_path, 'docs/architecture/README.md')
    registry = tmp_path / 'docs/documentation.json'
    value = json.loads(registry.read_text())
    if mutation == 'missing-registry': registry.unlink()
    elif mutation == 'bad-registry': registry.write_text('{}')
    elif mutation == 'duplicate':
        value['documents'].append(value['documents'][0])
        registry.write_text(json.dumps(value))
    elif mutation == 'basis-anchor':
        value['owner']['source']['anchor'] = 'absent'
        registry.write_text(json.dumps(value))
    else:
        path = registry if mutation == 'registry-alias' else tmp_path / 'docs/architecture/README.md'
        moved = path.with_suffix('.actual')
        path.rename(moved)
        path.symlink_to(moved)
    save(root / 'README.md', '[Target](../../docs/architecture/README.md#shape)\n')
    assert check_links(root, tmp_path)


def test_templates_are_valid_targets_but_not_scan_sources(tmp_path):
    root = tmp_path / '.meta_harness/design'
    save(root / '.templates/example.md', '# Template\n[Missing](absent.md)\n')
    save(root / 'README.md', '[Template](.templates/example.md#template)\n')
    assert check_links(root) == []


@pytest.mark.parametrize('href', ['bad%', '%ff.md', '%5c.md', 'file:///etc/passwd', '../../../tmp/x.md'])
def test_invalid_local_uris_are_not_ignored(tmp_path, href):
    root = tmp_path / '.meta_harness/design'
    save(root / 'part/README.md', f'[Invalid]({href})\n')
    assert check_links(root)


def test_binary_target_and_invalid_markdown_are_distinct(tmp_path):
    root = tmp_path / '.meta_harness/design'
    save(root / 'README.md', '![Image](image.png)\n')
    (root / 'image.png').write_bytes(b'\xffPNG')
    assert check_links(root) == []
    (root / 'bad.md').write_bytes(b'\xff')
    assert check_links(root)


@pytest.mark.parametrize('mutation', ['workspace', 'manifest', 'registry-set', 'source-set', 'source-bytes', 'same-byte-alias', 'missing-manifest'])
def test_source_readset_and_discovery_changes_fail(tmp_path, monkeypatch, mutation):
    from omne_harness_lite_spec_tools.documentation_inputs import Inputs
    root = tmp_path / '.meta_harness/design'
    save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    register(tmp_path)
    member = tmp_path / 'packages/core/example'
    save(member / 'package.json', '{"name":"example"}')
    save(member / 'src/a.ts', 'export const a = 1\n')
    save(root / 'a.md', '# Same\n')
    save(root / 'b.md', '# Same\n')
    (root / 'alias').symlink_to(root / 'a.md')
    save(root / 'README.md', '[Code](../../packages/core/example/src/a.ts)\n[Alias](alias#same)\n')
    if mutation == 'missing-manifest': (member / 'package.json').unlink()
    original = Inputs.verify
    def mutate(inputs):
        if mutation == 'workspace': save(tmp_path / 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
        elif mutation == 'manifest': save(member / 'package.json', '{"name":"changed"}')
        elif mutation == 'missing-manifest': save(member / 'package.json', '{"name":"example"}')
        elif mutation == 'registry-set': save(tmp_path / 'tools/new/documentation.json', '{}')
        elif mutation == 'source-set': save(root / 'new.md', '# New\n')
        elif mutation == 'source-bytes': save(root / 'README.md', '# Changed\n')
        else:
            (root / 'alias').unlink()
            (root / 'alias').symlink_to(root / 'b.md')
        original(inputs)
    monkeypatch.setattr(Inputs, 'verify', mutate)
    assert any('changed' in error for error in check_links(root, tmp_path))


def test_source_disappearing_after_discovery_is_explicit_failure(tmp_path, monkeypatch):
    from omne_harness_lite_spec_tools.documentation_inputs import Inputs
    root = tmp_path / '.meta_harness/design'
    save(root / 'README.md', '# Source\nBody.\n')
    original = Inputs.read_bytes
    def remove(inputs, relative, **kwargs):
        if relative == '.meta_harness/design/README.md':
            (root / 'README.md').unlink(missing_ok=True)
        return original(inputs, relative, **kwargs)
    monkeypatch.setattr(Inputs, 'read_bytes', remove)
    assert any('disappeared' in error for error in check_links(root))


def test_nested_archived_design_material_is_not_scanned(tmp_path):
    root = tmp_path / '.meta_harness/design'
    save(root / 'README.md', '# Root\n')
    save(root / 'topic/archive.legacy/broken.md', '[Missing](absent.md)\n')
    assert check_links(root) == []
    save(root / 'topic/archive.legacy-not/broken.md', '[Missing](absent.md)\n')
    errors = check_links(root)
    assert errors
    assert any(str(Path('archive.legacy-not/broken.md')) in error for error in errors)
    assert not any('archive.legacy/broken.md' in error for error in errors)
