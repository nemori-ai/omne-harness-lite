// The fixed signing double and its conformance suite (RD-CURSOR), plus the Cordis loading of the
// signing service under its own key.
import { Context } from '@deepseek-ai/cordis'
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isNotApplicable } from '@omne-harness/session-contract/testing'
import {
  SessionCursorSigningService,
  sessionCursorSigningKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  createFixedSessionCursorSigning,
  sessionCursorSigningConformance,
  type SessionCursorSigningFixture,
} from '@omne-harness/session-cordis-contract/testing'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'

const fresh = (): SessionCursorSigningFixture => {
  const double = createFixedSessionCursorSigning()
  return { signing: double, controls: double.controls }
}
const cases = sessionCursorSigningConformance()

describe('the cursor signing suite on the fixed double', () => {
  for (const item of cases)
    it(item.name, async () => {
      try {
        await item.run(fresh())
      } catch (error) {
        if (!isNotApplicable(error)) throw error
      }
    })
})

describe('the fixed double', () => {
  const payload = new TextEncoder().encode('p')
  const keyBytes = (start: number) => Uint8Array.from({ length: 32 }, (_, i) => start + i)

  it('signs with HMAC-SHA-256 under the public test keys', async () => {
    const f = fresh()
    const first = await f.signing.sign(payload)
    expect(first).toMatchObject({ kind: 'signed', value: { keyId: 'test-session-cursor-1' } })
    const expected = createHmac('sha256', keyBytes(0x00)).update(payload).digest()
    expect(first.kind === 'signed' && Buffer.from(first.value.signature)).toEqual(expected)
    f.controls.rotate()
    const second = await f.signing.sign(payload)
    expect(second).toMatchObject({ kind: 'signed', value: { keyId: 'test-session-cursor-2' } })
    const other = createHmac('sha256', keyBytes(0x20)).update(payload).digest()
    expect(second.kind === 'signed' && Buffer.from(second.value.signature)).toEqual(other)
  })

  it('has no way to read a raw key', () => {
    expect(Object.keys(fresh().signing).sort()).toEqual([
      'controls',
      'durability',
      'sign',
      'verify',
    ])
  })
})

describe('the signing service', () => {
  it('loads a subclass under its own key and removes it on unload', async () => {
    class Probe extends SessionCursorSigningService {
      readonly sign: SessionCursorSigning['sign'] = async () => ({ kind: 'unavailable' })
      readonly verify: SessionCursorSigning['verify'] = async () => ({ kind: 'unavailable' })
    }
    expect(sessionCursorSigningKey).toBe('sessionCursorSigning')
    const ctx = new Context()
    const fiber = await ctx.plugin(Probe)
    expect(ctx.get(sessionCursorSigningKey)).toBeInstanceOf(Probe)
    await fiber.dispose()
    expect(ctx.get(sessionCursorSigningKey)).toBeUndefined()
  })
})
