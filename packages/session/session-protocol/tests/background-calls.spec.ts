import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const background = sessionProtocol.operations['background-call']
const list = sessionProtocol.operations['list-background-calls']
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied', 'unknown']
const producer = { kind: 'tool', call: 'tool-invocation:call' }

describe('background-call', () => {
  it('is a login commit of the small limit that counts as access', () => {
    expect({
      identity: background.identity,
      effect: background.effect,
      limit: background.limit,
      counts: background.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'commit', limit: 'small', counts: true })
    expect(
      Object.keys(background.outcomes)
        .filter(name => !always.includes(name))
        .sort(),
    ).toEqual(['conflict', 'invalid'])
  })

  it('names one Tool call by its reference under a control identity', () => {
    expectRoundTrip(background.body, { tenant, session, controlId: 'control', producer })
    for (const sample of [
      { tenant, session, controlId: 'control', producer: { kind: 'model', call: 'm' } },
      { tenant, session, controlId: 'control', producer: { kind: 'tool', call: '' } },
      { tenant, session, producer },
    ])
      expect(readSample(background.body, sample)).toEqual({ ok: false })
  })

  it('answers requested, or background when the relation is already established', () => {
    for (const kind of ['requested', 'background'])
      expectRoundTrip(background.outcomes.succeeded, { kind, controlId: 'control', producer })
    expect(
      readSample(background.outcomes.succeeded, { kind: 'stopped', controlId: 'c', producer }),
    ).toEqual({ ok: false })
  })
})

describe('list-background-calls', () => {
  it('is a login read of the small limit that counts as access, and invalid is its own outcome', () => {
    expect({
      identity: list.identity,
      effect: list.effect,
      limit: list.limit,
      counts: list.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'read', limit: 'small', counts: true })
    expect(Object.keys(list.outcomes).filter(name => !always.includes(name))).toEqual(['invalid'])
  })

  it('reads a session and answers the backgrounded calls by their references', () => {
    expectRoundTrip(list.body, { tenant, session })
    expectRoundTrip(list.outcomes.succeeded, { calls: [] })
    const item = (id: string, status: string) => ({
      id,
      producer,
      label: {
        intent: 'build the front end',
        tool: 'Shell',
        command: 'execute',
        preview: 'pnpm build',
      },
      source: 'threshold',
      status,
      lastLine: 'done 3/7',
    })
    expectRoundTrip(list.outcomes.succeeded, {
      calls: [item('b1', 'running'), { ...item('b2', 'unknown'), lastLine: null }],
    })
    expectRoundTrip(list.outcomes.succeeded, {
      calls: [
        {
          ...item('b3', 'queued'),
          label: { intent: null, tool: 'Shell', command: null, preview: '' },
        },
      ],
    })
    for (const wrong of [
      { ...item('b1', 'running'), producer: { kind: 'model', call: 'm' } },
      { ...item('b1', 'stopped') },
      { ...item('b1', 'running'), source: 'nowhere' },
    ])
      expect(readSample(list.outcomes.succeeded, { calls: [wrong] })).toEqual({ ok: false })
  })
})
