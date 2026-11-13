import { describe, expect, it } from 'vitest'
import { documentViolations } from '../src/hygiene/checks.ts'
import { isAllowedDocument } from '../src/hygiene/documents.ts'
import { emptyBaseline, measured } from './fixtures/hygiene/support.ts'

const open = () => false

describe('hygiene-document-allowlist', () => {
  it.each([
    'README.md',
    'CONTRIBUTING.md',
    'AGENTS.md',
    'CLAUDE.md',
    'docs/requirements.md',
    'docs/architecture/layers.md',
    'docs/domains/session/overview.md',
    'packages/session/SPEC.md',
    'packages/session/session/api/session.api.md',
    'tools/x/UPSTREAM.md',
    'packages/a/b/LICENSE-extra.md',
    '.meta_harness/design/ubiquitous_language/volume-1.md',
    '.meta_harness/design/product/topic/index.md',
    '.meta_harness/agents/skills/omne-card/canonical/SKILL.md',
    '.github/ISSUE_TEMPLATE/card.md',
    'packages/session/session/README.md',
    'apps/cli/README.md',
  ])('accepts %s', path => {
    expect(isAllowedDocument(path, open)).toBe(true)
  })

  it.each([
    'docs/development.md',
    'notes.md',
    'packages/session/session/docs/design.md',
    'packages/session/session/SPEC.md',
    'tools/repo-toolchain/README.md',
    'packages/session/session/README_ZH.md',
    'tmp/card/plan.md',
  ])('rejects %s', path => {
    expect(isAllowedDocument(path, open)).toBe(false)
  })

  it('rejects the README of a private member and accepts a public one', () => {
    const isPrivate = (directory: string) => directory === 'packages/tool/secret'
    expect(isAllowedDocument('packages/tool/secret/README.md', isPrivate)).toBe(false)
    expect(isAllowedDocument('apps/secret/README.md', isPrivate)).toBe(true)
    expect(isAllowedDocument('packages/tool/public/README.md', isPrivate)).toBe(true)
    expect(
      isAllowedDocument(
        'apps/private-app/README.md',
        directory => directory === 'apps/private-app',
      ),
    ).toBe(false)
  })

  it('reports documents outside the allowlist unless the baseline lists them', () => {
    const current = measured({
      documents: ['README.md', 'notes.md', 'extra.md', 'packages/tool/secret/README.md'],
      privateMembers: ['packages/tool/secret'],
    })
    const violations = documentViolations(current, emptyBaseline({ documents: ['notes.md'] }))
    expect(violations.map(v => v.path)).toEqual(['extra.md', 'packages/tool/secret/README.md'])
    expect(violations[0]).toMatchObject({ rule: 'hygiene-document-allowlist', line: 1 })
    expect(violations[0]?.message).toContain('白名单之外的文档')
    expect(documentViolations(current, emptyBaseline())).toHaveLength(3)
  })
})
