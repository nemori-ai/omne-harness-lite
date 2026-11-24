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
    for (const reasoningEffort of ['low', 'medium', 'high', 'xhigh'])
      expectRoundTrip(select.body, {
        tenant,
        session,
        controlId: 'control',
        model,
        reasoningEffort,
      })
    for (const sample of [
      { tenant, session, controlId: 'control', model, reasoningEffort: 'max' },
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
    expectRoundTrip(select.outcomes.invalid, { reason: 'excluded', detail: 'unsupported-effort' })
    expect(readSample(select.outcomes.invalid, { reason: 'other' })).toEqual({ ok: false })
  })

  it('may name the blocks of the history the target cannot read', () => {
    const blocks = [
      { message: 'msg_one', block: 'blk_picture' },
      { message: 'msg_two', block: 'blk_scan' },
    ]
    expectRoundTrip(select.outcomes.invalid, { reason: 'modality', blocks })
    expectRoundTrip(select.outcomes.invalid, { reason: 'modality', blocks: [] })
    for (const bad of [
      { reason: 'modality', blocks: [{ message: 'msg_one' }] },
      { reason: 'modality', blocks: [{ message: 'msg_one', block: '' }] },
      { reason: 'modality', blocks: [{ message: 'msg_one', block: 'b', more: 1 }] },
      { reason: 'modality', blocks: 'blk_picture' },
      { reason: 'modality', blocks: Array.from({ length: 17 }, () => blocks[0]) },
    ])
      expect(readSample(select.outcomes.invalid, bad)).toEqual({ ok: false })
  })
})

describe('read-model-selection', () => {
  const read = sessionProtocol.operations['read-model-selection']

  it('is a login read of the small limit that counts as access', () => {
    expect({
      identity: read.identity,
      effect: read.effect,
      limit: read.limit,
      counts: read.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'read', limit: 'small', counts: true })
    expect(
      Object.keys(read.outcomes)
        .filter(name => !always.includes(name))
        .sort(),
    ).toEqual(['invalid'])
    expect('unknown' in read.outcomes).toBe(false)
  })

  it('names one session, and answers the route it stands at with the revision read', () => {
    expectRoundTrip(read.body, { tenant, session })
    expect(readSample(read.body, { tenant })).toEqual({ ok: false })
    expect(readSample(read.body, { tenant, session, model })).toEqual({ ok: false })
    expectRoundTrip(read.outcomes.succeeded, { model, revision: '7' })
    expectRoundTrip(read.outcomes.succeeded, { model, reasoningEffort: 'xhigh', revision: '7' })
    for (const sample of [{ model: '', revision: '7' }, { model }, { revision: '7' }])
      expect(readSample(read.outcomes.succeeded, sample)).toEqual({ ok: false })
  })
})

describe('create-session with a model', () => {
  const create = sessionProtocol.operations['create-session']

  it('takes the route of the model the session starts with, or none', () => {
    const base = { createCallId: 'create', purpose: '' }
    expectRoundTrip(create.body, base)
    expectRoundTrip(create.body, { ...base, definition: 'coding', model })
    expectRoundTrip(create.body, { ...base, model })
    expect(readSample(create.body, { ...base, model: '' })).toEqual({ ok: false })
    expect(readSample(create.body, { ...base, model: 7 })).toEqual({ ok: false })
  })
})
