import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const observation = sessionProtocol.observations['observe-session']

const target = { projection: 'model-output-v1' }
const attempts = {
  allowed: 2,
  made: 2,
  last: { cause: 'upstream-unavailable', upstreamStatus: '503' },
  notBefore: '2026-11-17T00:00:01.000Z',
}
const running = { kind: 'state', run: 'run-1', revision: '12', phase: 'running', target }
const frames = [
  [
    'state, nothing running',
    { kind: 'state', run: null, revision: '0', phase: null, target: null },
  ],
  ['state, a run', running],
  [
    'state, a run, no phase',
    { kind: 'state', run: 'run-1', revision: '12', phase: null, target: null },
  ],
  ['state, a run on its second dispatch', { ...running, attempts }],
  [
    'state, a run before any dispatch failed',
    { ...running, attempts: { allowed: 3, made: 1, last: null, notBefore: null } },
  ],
  [
    'state, a last fault without an upstream status',
    { ...running, attempts: { ...attempts, last: { cause: 'stream-lost', upstreamStatus: null } } },
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
  ['state with a null dispatch progress', { ...running, attempts: null }],
  ['state with a negative count', { ...running, attempts: { ...attempts, made: -1 } }],
  [
    'state whose last fault carries a diagnostic',
    {
      ...running,
      attempts: { ...attempts, last: { ...attempts.last, diagnostic: 'http-503' } },
    },
  ],
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
    expect(readSample(observation.open, { tenant }).ok).toBe(false)
    expect(readSample(observation.open, { tenant, session: 'short' }).ok).toBe(false)
  })

  it.each(frames)('a %s frame reads and writes back the same', (_name, frame) => {
    expectRoundTrip(observation.frame, frame)
  })

  it.each(badFrames)('a frame that is %s is rejected', (_name, frame) => {
    expect(readSample(observation.frame, frame).ok).toBe(false)
  })
})
