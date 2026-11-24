import { describe, expect, it } from 'vitest'
import { qualifyTargetAvailability } from '../src/start-guard.ts'

const input = { principal: 'p', tenant: 't', call: 'c', request: {} } as never
const answering = (answer: unknown) =>
  qualifyTargetAvailability({ qualify: async () => answer as never } as never, input)
const UNAVAILABLE = { kind: 'unavailable', diagnostic: 'target availability unavailable' }

describe('what the target availability provider answers, read as data', () => {
  it('allows when no provider is installed', async () => {
    expect(await qualifyTargetAvailability(undefined, input)).toEqual({ kind: 'allowed' })
  })

  it('passes an allowance, a denial with its reason and an unavailable answer with its diagnostic', async () => {
    expect(await answering({ kind: 'allowed', more: 1 })).toEqual({ kind: 'allowed' })
    expect(await answering({ kind: 'denied', reason: 'target-not-included', more: 1 })).toEqual({
      kind: 'denied',
      reason: 'target-not-included',
    })
    expect(await answering({ kind: 'unavailable', diagnostic: 'later' })).toEqual({
      kind: 'unavailable',
      diagnostic: 'later',
    })
  })

  it.each([
    ['nothing', undefined],
    ['a text', 'allowed'],
    ['an unknown kind', { kind: 'granted' }],
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
    expect(await qualifyTargetAvailability(thrown as never, input)).toEqual(UNAVAILABLE)
    expect(await qualifyTargetAvailability(rejected as never, input)).toEqual(UNAVAILABLE)
  })
})
