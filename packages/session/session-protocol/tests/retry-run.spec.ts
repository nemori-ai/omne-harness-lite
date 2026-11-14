import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const retry = sessionProtocol.operations['retry-run']
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied', 'unknown']

describe('retry-run', () => {
  it('is a login commit of the small limit that counts as access', () => {
    expect({ identity: retry.identity, effect: retry.effect, limit: retry.limit }).toEqual({
      identity: 'login',
      effect: 'commit',
      limit: 'small',
    })
    expect(retry.countsAsAccess).toBe(true)
  })

  it('has its own six outcomes besides the ones every commit has', () => {
    expect(
      Object.keys(retry.outcomes)
        .filter(name => !always.includes(name))
        .sort(),
    ).toEqual(['archived', 'conflict', 'frozen', 'invalid', 'no-change', 'not-found'])
  })

  it('reads a body that names the failed Run and writes it back as it was', () => {
    expectRoundTrip(retry.body, { tenant, session, controlId: 'control', run: 'run-1' })
  })

  it.each([
    ['without a run', { tenant, session, controlId: 'control' }],
    ['with an empty run', { tenant, session, controlId: 'control', run: '' }],
    ['without a control identity', { tenant, session, run: 'run-1' }],
    ['with an urgency', { tenant, session, controlId: 'control', run: 'run-1', urgency: 'force' }],
  ])('refuses a body %s', (_label, sample) => {
    expect(readSample(retry.body, sample)).toEqual({ ok: false })
  })

  it('answers succeeded with whether the answer is recalled, and the other outcomes empty', () => {
    expectRoundTrip(retry.outcomes.succeeded, { recovered: false })
    expectRoundTrip(retry.outcomes.succeeded, { recovered: true })
    expect(readSample(retry.outcomes.succeeded, {})).toEqual({ ok: false })
    for (const outcome of ['invalid', 'archived', 'frozen', 'not-found', 'no-change'] as const) {
      expect(expectRoundTrip(retry.outcomes[outcome], {})).toEqual({})
      expect(readSample(retry.outcomes[outcome], { reason: 'x' })).toEqual({ ok: false })
    }
  })
})
