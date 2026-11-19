import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const select = sessionProtocol.operations['select-model']
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied', 'unknown']
const model = 'anthropic/claude-sonnet-5'

describe('select-model', () => {
  it('is a login commit of the small limit that counts as access', () => {
    expect({
      identity: select.identity,
      effect: select.effect,
      limit: select.limit,
      counts: select.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'commit', limit: 'small', counts: true })
    expect(
      Object.keys(select.outcomes)
        .filter(name => !always.includes(name))
        .sort(),
    ).toEqual(['archived', 'conflict', 'frozen', 'invalid', 'not-found'])
  })

  it('names the target route under a control identity', () => {
    expectRoundTrip(select.body, { tenant, session, controlId: 'control', model })
    for (const sample of [
      { tenant, session, controlId: 'control', model: '' },
      { tenant, session, controlId: '', model },
      { tenant, session, model },
      { tenant, session, controlId: 'control', model, extra: 1 },
    ])
      expect(readSample(select.body, sample)).toEqual({ ok: false })
  })

  it('answers the selection with what it knows of the credential', () => {
    for (const credential of ['available', 'missing', 'unknown'])
      expectRoundTrip(select.outcomes.succeeded, { controlId: 'control', model, credential })
    expect(
      readSample(select.outcomes.succeeded, { controlId: 'control', model, credential: 'stale' }),
    ).toEqual({ ok: false })
  })

  it('refuses a target it cannot select with one of the six reasons', () => {
    for (const reason of ['unknown-name', 'withdrawn', 'excluded', 'modality', 'locked', 'scope'])
      expectRoundTrip(select.outcomes.invalid, { reason })
    expect(readSample(select.outcomes.invalid, { reason: 'other' })).toEqual({ ok: false })
  })
})
