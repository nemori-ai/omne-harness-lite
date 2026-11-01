import { describe, expect, it } from 'vitest'
import {
  ownerIdentityDrift,
  parseOwnerIdentityManifest,
  type OwnerIdentityManifest,
} from '../src/delivery/api-review-owners.ts'
import { table } from './fixtures/lines.ts'

const sha = 'b'.repeat(64)
function fact(lineId: string, login: string) {
  return {
    lineId,
    owner: { login, nodeId: `U_${login}` },
    adoption: {
      comment: {
        url: `https://github.com/nemori-ai/omne-harness-lite/issues/1#issuecomment-${lineId.length}`,
        bodySha256: sha,
        updatedAt: '2026-11-01T00:00:00Z',
      },
      authorNodeId: 'U_accepter',
    },
  }
}
/** A valid manifest document over the fixture table; `patch` edits a fresh copy. */
function document(patch: (doc: any) => void = () => {}): any {
  const doc = {
    schemaVersion: 1,
    repository: { name: 'nemori-ai/omne-harness-lite', nodeId: 'R_repo' },
    owners: [fact('model', 'model-owner'), fact('session-agent', 'session-owner')],
  }
  patch(doc)
  return doc
}
const text = (doc: unknown) => JSON.stringify(doc)
const manifest = (patch?: (doc: any) => void): OwnerIdentityManifest =>
  parseOwnerIdentityManifest(text(document(patch)))
const drift = (patch: (doc: any) => void, lines = table()) =>
  ownerIdentityDrift(manifest(patch), lines)

describe('owner identity manifest parsing', () => {
  it('accepts a complete manifest and keeps every field', () => {
    const parsed = manifest()
    expect(parsed.owners.map(o => o.lineId)).toEqual(['model', 'session-agent'])
    expect(parsed.owners[0]?.owner).toEqual({ login: 'model-owner', nodeId: 'U_model-owner' })
    expect(parsed.repository.nodeId).toBe('R_repo')
  })

  it('accepts an empty owners list', () => {
    expect(manifest(d => (d.owners = [])).owners).toEqual([])
  })

  it.each([
    ['unknown top-level key', (d: any) => (d.extra = 1)],
    ['unknown owner key', (d: any) => (d.owners[0].extra = 1)],
    ['unknown adoption key', (d: any) => (d.owners[0].adoption.extra = 1)],
    ['unknown comment key', (d: any) => (d.owners[0].adoption.comment.extra = 1)],
    ['unknown repository key', (d: any) => (d.repository.extra = 1)],
    ['missing key', (d: any) => delete d.repository],
    ['wrong schema version', (d: any) => (d.schemaVersion = 2)],
    ['string schema version', (d: any) => (d.schemaVersion = '1')],
    ['numeric login', (d: any) => (d.owners[0].owner.login = 7)],
    ['empty nodeId', (d: any) => (d.owners[0].owner.nodeId = '')],
    ['null authorNodeId', (d: any) => (d.owners[0].adoption.authorNodeId = null)],
    ['owners not an array', (d: any) => (d.owners = {})],
    ['uppercase digest', (d: any) => (d.owners[0].adoption.comment.bodySha256 = 'B'.repeat(64))],
    ['short digest', (d: any) => (d.owners[0].adoption.comment.bodySha256 = 'b'.repeat(63))],
    ['malformed lineId', (d: any) => (d.owners[0].lineId = 'Model')],
    ['duplicate lineId', (d: any) => d.owners.push(structuredClone(d.owners[1]))],
    ['unsorted lineIds', (d: any) => d.owners.reverse()],
  ])('rejects %s', (_name, patch) => {
    expect(() => manifest(patch)).toThrow()
  })

  it.each([
    [
      'a duplicate key',
      '{"schemaVersion":1,"schemaVersion":1,"repository":{"name":"a","nodeId":"b"},"owners":[]}',
    ],
    [
      'an escaped duplicate key',
      '{"schemaVersion":1,"\u0073chemaVersion":1,"repository":{"name":"a","nodeId":"b"},"owners":[]}',
    ],
    ['invalid JSON', '{'],
    ['a non-object root', '[]'],
  ])('rejects %s in the source text', (_name, source) => {
    expect(() => parseOwnerIdentityManifest(source)).toThrow()
  })
})

describe('owner identity drift', () => {
  it('reports nothing when every fact matches the table', () => {
    expect(drift(() => {})).toEqual([])
  })

  it('reports a login that differs from the table owner', () => {
    expect(drift(d => (d.owners[0].owner.login = 'someone-else'))).toMatchObject([
      { code: 'owner-identity-drift', at: 'owners[0]' },
    ])
  })

  it('compares logins case-sensitively', () => {
    expect(drift(d => (d.owners[0].owner.login = 'Model-Owner'))).toMatchObject([
      { code: 'owner-identity-drift', at: 'owners[0]' },
    ])
  })

  it('reports a lineId that the table does not list', () => {
    expect(drift(d => (d.owners[1].lineId = 'zzz-gone'))).toMatchObject([
      { code: 'owner-identity-drift', at: 'owners[1]' },
    ])
  })

  it('does not report a table line that has no identity entry', () => {
    expect(drift(d => d.owners.splice(1, 1))).toEqual([])
  })
})
