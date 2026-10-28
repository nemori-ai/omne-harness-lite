import { describe, expect, it } from 'vitest'
import {
  adoption,
  creation,
  memoryAccess,
  operationId,
  testingWorkspace,
} from '@omne-harness/session-contract/testing'
import { initializationPlan, initializationRegistrationCommit } from '../src/initialization-plan.ts'

const access = memoryAccess('tester')
const base = { ...access, createOperation: operationId('create'), owner: 'owner', item: 'item' }
const schema = adoption('registration-material')
const input = {
  need: { schema, value: { kind: 'string', value: 'need' } as const },
  binding: { schema, value: { kind: 'string', value: 'binding' } as const },
  parameters: { schema, value: { kind: 'null' } as const },
}

describe('the original initialization registration identity', () => {
  const vectors: readonly (readonly [readonly number[], string])[] = [
    [[], '2222'],
    [[0x61], '226122'],
    [[0x22, 0x5c, 0x2f], '225c225c5c2f22'],
    [[0, 8, 9, 10, 11, 12, 13, 31], '225c75303030305c625c745c6e5c75303030625c665c725c753030316622'],
    [[0x4e2d, 0xe9, 0x2028, 0x2029], '22e4b8adc3a9e280a8e280a922'],
    [[0x65, 0x301], '2265cc8122'],
    [[0xd83d, 0xde00], '22f09f988022'],
    [[0xd800], '225c756438303022'],
    [[0xdc00], '225c756463303022'],
    [[0xd800, 0x61, 0xdc00], '225c7564383030615c756463303022'],
  ]
  it.each(vectors)('preserves the specified UTF-16 encoding %j', (units, hex) => {
    const item = `x${String.fromCharCode(...units)}`
    const encoded = initializationRegistrationCommit({ ...base, item })
    const encodedItem = encoded.slice(encoded.lastIndexOf(',') + 1, -1)
    expect(Buffer.from(encodedItem.replace(/^"x/u, '"')).toString('hex')).toBe(hex)
  })
  it('separates owner/item boundaries and preserves normalization differences', () => {
    const identities = [
      { owner: 'a:b', item: 'c' },
      { owner: 'a', item: 'b:c' },
      { owner: 'é', item: 'item' },
      { owner: 'e\u0301', item: 'item' },
    ].map(key => initializationRegistrationCommit({ ...base, ...key }))
    expect(new Set(identities).size).toBe(identities.length)
    expect(JSON.parse(identities[0]!)).toHaveLength(7)
    expect(initializationRegistrationCommit(base)).toBe(
      initializationRegistrationCommit({ ...base }),
    )
  })
})

describe('initialization plan normalization', () => {
  it('retains ordered sources, original identity input and codec-encoded workspace binding', () => {
    const selected = testingWorkspace('wsp_c0nf0rmance000000000000000')
    const plan = initializationPlan(
      creation({
        requiredIdentities: [{ capability: 'login', name: 'account' }],
        workspace: selected,
        workspaceAttachment: { instance: 'instance-1', basis: 'load-v1' },
        initialization: {
          sources: [
            {
              kind: 'context-registration',
              owner: 'context',
              item: 'first',
              protocol: schema,
              input,
            },
            { kind: 'workspace-load', owner: 'workspace', item: 'selected', protocol: schema },
            { kind: 'execution-adoption', owner: 'assembly', item: 'ready', protocol: schema },
          ],
          results: [],
        },
      }),
    )
    expect(plan.map(item => item.kind)).toEqual([
      'identity',
      'context-registration',
      'workspace-load',
      'execution-adoption',
    ])
    expect(plan[0]?.originalInput).toEqual({
      kind: 'object',
      entries: [
        { key: 'capability', value: { kind: 'string', value: 'login' } },
        { key: 'name', value: { kind: 'string', value: 'account' } },
      ],
    })
    expect(plan[2]?.originalInput).toMatchObject({
      kind: 'object',
      entries: [
        { key: 'workspace', value: { kind: 'string', value: 'wsp_c0nf0rmance000000000000000' } },
        { key: 'workspaceAttachment' },
      ],
    })
  })
  it('rejects duplicate original keys instead of silently deduplicating them', () => {
    expect(() =>
      initializationPlan(
        creation({
          requiredIdentities: [{ capability: 'assembly', name: 'ready' }],
          initialization: {
            sources: [
              { kind: 'execution-adoption', owner: 'assembly', item: 'ready', protocol: schema },
            ],
            results: [],
          },
        }),
      ),
    ).toThrow('duplicate initialization owner/item')
  })
  it('refuses a workspace source without a workspace and results outside the original plan', () => {
    expect(() =>
      initializationPlan(
        creation({
          initialization: {
            sources: [
              { kind: 'workspace-load', owner: 'workspace', item: 'load', protocol: schema },
            ],
            results: [],
          },
        }),
      ),
    ).toThrow('original workspace attachment')
    expect(() =>
      initializationPlan(
        creation({
          initialization: {
            sources: [],
            results: [
              {
                owner: 'unknown',
                item: 'unknown',
                result: {
                  kind: 'failed',
                  diagnostic: 'failed',
                  recovery: { owner: 'test', record: 'r', revision: '1', digest: 'd' },
                },
              },
            ],
          },
        }),
      ),
    ).toThrow('original initialization item')
  })
})
