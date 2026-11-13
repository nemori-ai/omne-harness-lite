// observe-session (card #1266 C7, RFC-0015 §8): a login opens it on a tenant and a session; it
// sends five kinds of frame; its own end reason is only `refresh-exhausted`.
import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import { sessionProtocol } from '@omne-harness/session-protocol'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const session = '0123456789abcdef'.repeat(4)
const observation = sessionProtocol.observations['observe-session']
const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

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
    const open = { tenant, session }
    const read = observation.open.read(tree(open), limits)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const written = observation.open.write(read.value, limits)
    expect(written.ok && JSON.parse(writeJsonText(written.value))).toEqual(open)
    expect(observation.open.read(tree({ tenant }), limits)).toEqual({ ok: false })
    expect(observation.open.read(tree({ tenant, session: 'short' }), limits)).toEqual({ ok: false })
  })

  it.each(frames)('a %s frame reads and writes back the same', (_name, frame) => {
    const read = observation.frame.read(tree(frame), limits)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const written = observation.frame.write(read.value, limits)
    expect(written.ok).toBe(true)
    if (written.ok) expect(JSON.parse(writeJsonText(written.value))).toEqual(frame)
  })

  it.each(badFrames)('a frame that is %s is rejected', (_name, frame) => {
    expect(observation.frame.read(tree(frame), limits)).toEqual({ ok: false })
  })
})
