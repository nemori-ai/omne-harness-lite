import { describe, expect, it } from 'vitest'
import { qualifyRequestAccess } from '../src/start-guard.ts'

const input = { principal: 'p', tenant: 't', call: 'c', request: {} } as never
const answering = (answer: unknown) =>
  qualifyRequestAccess({ qualify: async () => answer as never } as never, input)
const UNAVAILABLE = { kind: 'unavailable', diagnostic: 'request-access unavailable' }
const MALFORMED = {
  kind: 'unavailable',
  diagnostic: 'request-access answered a malformed authorization',
}
const condition = { commands: [] }
const consumption = {
  permit: { tenant: { organization: 'o', account: 'a' }, permit: 'permit-1' },
  consumer: { owner: 'agent', work: 'exe-1', position: 'act-1' },
  evidence: { owner: 'session', record: 'r', revision: '1', digest: 'd' },
}

describe('what the request-access provider answers, read as data', () => {
  it('allows with no condition when no provider is installed', async () => {
    expect(await qualifyRequestAccess(undefined, input)).toEqual({
      kind: 'allowed',
      condition: null,
    })
  })

  it('passes an allowance with its condition, and its consumptions only when there are some', async () => {
    expect(await answering({ kind: 'allowed', condition: null })).toEqual({
      kind: 'allowed',
      condition: null,
    })
    expect(await answering({ kind: 'allowed', condition, authorizations: [] })).toEqual({
      kind: 'allowed',
      condition,
    })
    expect(await answering({ kind: 'allowed', condition, authorizations: [consumption] })).toEqual({
      kind: 'allowed',
      condition,
      authorizations: [consumption],
    })
  })

  it('passes a denial with its reason and an unavailable answer with its diagnostic', async () => {
    expect(await answering({ kind: 'denied', reason: 'rule/1', more: 1 })).toEqual({
      kind: 'denied',
      reason: 'rule/1',
    })
    expect(await answering({ kind: 'unavailable', diagnostic: 'later' })).toEqual({
      kind: 'unavailable',
      diagnostic: 'later',
    })
  })

  it.each([
    ['nothing', undefined],
    ['a text', 'allowed'],
    ['an unknown kind', { kind: 'granted', condition: null }],
    ['an allowance with no condition', { kind: 'allowed' }],
    ['an allowance whose condition is a text', { kind: 'allowed', condition: 'yes' }],
    ['a denial with no reason', { kind: 'denied' }],
    ['an unavailable answer with no diagnostic', { kind: 'unavailable' }],
  ])('answers unavailable to %s', async (_what, answer) => {
    expect(await answering(answer)).toEqual(UNAVAILABLE)
  })

  it('answers unavailable when the provider throws or rejects', async () => {
    const thrown = {
      qualify: () => {
        throw new Error('x')
      },
    }
    const rejected = { qualify: async () => Promise.reject(new Error('x')) }
    expect(await qualifyRequestAccess(thrown as never, input)).toEqual(UNAVAILABLE)
    expect(await qualifyRequestAccess(rejected as never, input)).toEqual(UNAVAILABLE)
  })

  it.each([
    ['not a list', consumption],
    ['a list with an entry that is not a consumption', [consumption, 7]],
    ['a permit with no tenant', [{ ...consumption, permit: { permit: 'permit-1' } }]],
    ['a permit whose tenant is null', [{ ...consumption, permit: { tenant: null, permit: 'p' } }]],
    ['a permit whose tenant is a text', [{ ...consumption, permit: { tenant: 't', permit: 'p' } }]],
    [
      'a permit with an empty id',
      [{ ...consumption, permit: { ...consumption.permit, permit: '' } }],
    ],
    ['a consumer with no position', [{ ...consumption, consumer: { owner: 'a', work: 'w' } }]],
    [
      'evidence with an empty digest',
      [{ ...consumption, evidence: { ...consumption.evidence, digest: '' } }],
    ],
  ])(
    'calls the allowance malformed when its consumptions are %s',
    async (_what, authorizations) => {
      expect(await answering({ kind: 'allowed', condition: null, authorizations })).toEqual(
        MALFORMED,
      )
    },
  )
})
