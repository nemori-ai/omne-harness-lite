import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const read = sessionProtocol.operations['read-permission-mode']
const change = sessionProtocol.operations['change-permission-mode']
const modes = ['never', 'auto_permission', 'bypass-permissions'] as const

describe('read-permission-mode', () => {
  it('names the session and answers the mode with its permission revision', () => {
    expectRoundTrip(read.body, { tenant, session })
    for (const mode of modes) expectRoundTrip(read.outcomes.succeeded, { mode, revision: '3' })
    expect(readSample(read.outcomes.succeeded, { mode: 'ask', revision: '3' })).toEqual({
      ok: false,
    })
    expect(readSample(read.outcomes.succeeded, { mode: 'never' })).toEqual({ ok: false })
  })
})

describe('change-permission-mode', () => {
  it('carries the wanted mode and the permission revision it was read at', () => {
    for (const mode of modes)
      expectRoundTrip(change.body, { tenant, session, mode, expectedRevision: '0' })
  })

  it.each([
    ['without an expected revision', { tenant, session, mode: 'never' }],
    ['with an empty expected revision', { tenant, session, mode: 'never', expectedRevision: '' }],
    ['with a mode outside the three', { tenant, session, mode: 'ask', expectedRevision: '0' }],
    [
      'with another axis',
      { tenant, session, mode: 'never', expectedRevision: '0', collaboration: 'co-work' },
    ],
  ])('refuses a body %s', (_label, sample) => {
    expect(readSample(change.body, sample)).toEqual({ ok: false })
  })

  it('answers changed and no-change with the mode and revision now; the conflict empty', () => {
    expectRoundTrip(change.outcomes.succeeded, { mode: 'auto_permission', revision: '1' })
    expectRoundTrip(change.outcomes['no-change'], { mode: 'never', revision: '0' })
    expect(expectRoundTrip(change.outcomes.conflict, {})).toEqual({})
    expect(change.outcomes.unknown).toBe(true)
  })
})
