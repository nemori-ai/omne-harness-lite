import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type ParentSnapshot,
  ancestorChain,
  parseOrganizationId,
  shareAncestor,
  unwrap,
} from '../src/index.ts'
import { affiliationFixture } from './fixtures/affiliation-alloy.ts'

const org = (id: string) => unwrap(parseOrganizationId(id))
const parentOf: ParentSnapshot = organization => {
  const edge = affiliationFixture.parent.find(([child]) => child === organization)
  return edge === undefined ? null : org(edge[1])
}

describe('S-14 / S-15：与已采用 Affiliation.als 的实际求值对照', () => {
  it('fixture 对应当前冻结模型，模型变化时不得沿用旧结果', () => {
    const model = readFileSync(
      resolve(import.meta.dirname, '../../../..', affiliationFixture.provenance.model),
    )
    expect(createHash('sha256').update(model).digest('hex')).toBe(
      affiliationFixture.provenance.modelSha256,
    )
  })

  for (const organization of affiliationFixture.organizations) {
    it(`ancestorChain(${organization}) 与 Alloy 传递闭包同集且不含自身`, () => {
      const expected = affiliationFixture.ancestors
        .filter(([child]) => child === organization)
        .map(([, ancestor]) => ancestor)
        .sort()
      const actual = ancestorChain(org(organization), parentOf)
      expect(actual).toHaveProperty('ok')
      if ('ok' in actual) {
        expect([...actual.ok].sort()).toEqual(expected)
        expect(actual.ok).not.toContain(organization)
      }
    })
    for (const other of affiliationFixture.organizations) {
      it(`shareAncestor(${organization}, ${other}) 与 Alloy 自反传递闭包同判`, () => {
        const expected = affiliationFixture.shared.some(
          ([a, b]) => a === organization && b === other,
        )
        expect(shareAncestor(org(organization), org(other), parentOf)).toEqual({ ok: expected })
      })
    }
  }
})
