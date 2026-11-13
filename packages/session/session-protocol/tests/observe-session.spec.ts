// observe-session (card #1266 C7, RFC-0015 §8): a login opens it on a tenant and a session; it
// sends five kinds of frame; its own end reason is only `refresh-exhausted`.
import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const observation = sessionProtocol.observations['observe-session']

const target = { projection: 'model-output-v1' }
const frames = [
  [
    'state, nothing running',
    { kind: 'state', run: null, revision: '0', phase: null, target: null },
  ],
  ['state, a run', { kind: 'state', run: 'run-1', revision: '12', phase: 'running', target }],
  [
    'state, a run, no phase',
    { kind: 'state', run: 'run-1', revision: '12', phase: null, target: null },
  ],
  ['snapshot', { kind: 'snapshot', projection: 'model-output-v1', value: { text: 'He' } }],
  ['delta', { kind: 'delta', projection: 'model-output-v1', value: ['llo', 1, true, null] }],
  ['gap, buffer', { kind: 'gap', reason: 'buffer' }],
  ['gap, source history', { kind: 'gap', reason: 'source-history' }],
  ['refreshing', { kind: 'refreshing' }],
] as const

const badFrames = [
  ['unknown kind', { kind: 'ended', reason: 'refresh-exhausted' }],
  ['state without revision', { kind: 'state', run: null, phase: null, target: null }],
  ['state with empty run', { kind: 'state', run: '', revision: '1', phase: null, target: null }],
  ['other projection', { kind: 'snapshot', projection: 'model-output-v2', value: 1 }],
  ['gap, other reason', { kind: 'gap', reason: 'other' }],
  ['refreshing with a field', { kind: 'refreshing', at: 1 }],
] as const

describe('observe-session', () => {
  it('needs a login, counts as access and ends on its own only for refresh-exhausted', () => {
    expect(observation.identity).toBe('login')
    expect(observation.ends).toEqual(['refresh-exhausted'])
    expect(observation.countsAsAccess).toBe(true)
    expect('limit' in observation).toBe(false)
  })

  it('opens on a tenant and a session', () => {
    expectRoundTrip(observation.open, { tenant, session })
    expect(readSample(observation.open, { tenant })).toEqual({ ok: false })
    expect(readSample(observation.open, { tenant, session: 'short' })).toEqual({ ok: false })
  })

  it.each(frames)('a %s frame reads and writes back the same', (_name, frame) => {
    expectRoundTrip(observation.frame, frame)
  })

  it.each(badFrames)('a frame that is %s is rejected', (_name, frame) => {
    expect(readSample(observation.frame, frame)).toEqual({ ok: false })
  })
})
