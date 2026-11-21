import { describe, expect, it } from 'vitest'
import type { ForkPoint, SessionAccess } from '@omne-harness/session-contract'
import { readForkPointOf } from '../../../src/rows/dispatch-session/fork-point.ts'

const ACCESS = { principal: 'p', tenant: 't', session: 's' } as unknown as SessionAccess<string>
const POINT: ForkPoint = { epoch: 'key/epoch:0', upper: '3', position: '44' }

describe('the fork point of a session as a dispatch reads it', () => {
  it('hands on the point Session names, read under the access it was given', async () => {
    const asked: unknown[] = []
    const answer = await readForkPointOf(async access => {
      asked.push(access)
      return { ok: { kind: 'point', point: POINT } }
    }, ACCESS)
    expect(answer).toEqual({ kind: 'read', value: POINT })
    expect(asked).toEqual([ACCESS])
  })

  it('is null when the session names no point', async () => {
    expect(await readForkPointOf(async () => ({ ok: { kind: 'none' } }), ACCESS)).toEqual({
      kind: 'read',
      value: null,
    })
  })

  it.each([
    ['refuses the read', { kind: 'denied', action: 'history.readModelView' }],
    ['cannot make the read', { kind: 'unavailable', owner: 'o', diagnostic: 'd' }],
  ] as const)('is no answer, not "none", when Session %s', async (_name, failure) => {
    expect(await readForkPointOf(async () => ({ failure }), ACCESS)).toEqual({
      kind: 'unavailable',
    })
  })
})
