// Test resources of the Session cursor signing: a fixed HMAC-SHA-256 double and its conformance
// suite. The keys are public test bytes. The double reads no environment, disk or real key and
// must not enter a production plugin tree.
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { conformanceCase, type ConformanceCase } from '@omne-harness/session-contract/testing'
import type {
  SessionCursorSignature,
  SessionCursorSigning,
  SessionCursorSignResult,
  SessionCursorVerifyResult,
} from './cursor-signing.ts'

const keyFrom = (start: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => start + i)
const KEYS = [
  { keyId: 'test-session-cursor-1', bytes: keyFrom(0x00) },
  { keyId: 'test-session-cursor-2', bytes: keyFrom(0x20) },
] as const

/** The controls of the double. They are not part of the production service. */
export interface FixedSessionCursorSigningControls {
  /** Switch to the second public key (`test-session-cursor-2`). */
  rotate(): void
  /** The key source cannot be read: sign and verify answer `unavailable`. */
  setUnavailable(unavailable: boolean): void
  /** The provider unloads: every later and every pending call answers `unavailable`. */
  unload(): void
}
export interface FixedSessionCursorSigning extends SessionCursorSigning {
  readonly durability: 'none'
  readonly controls: FixedSessionCursorSigningControls
}

export function createFixedSessionCursorSigning(): FixedSessionCursorSigning {
  let current = 0
  let unavailable = false
  let unloaded = false
  const mac = (key: Uint8Array, payload: Uint8Array): Buffer =>
    createHmac('sha256', key).update(payload).digest()
  return Object.freeze({
    durability: 'none' as const,
    async sign(payload: Uint8Array): Promise<SessionCursorSignResult> {
      // Input bytes are captured and the key is chosen before the first await.
      const bytes = Uint8Array.from(payload)
      const key = KEYS[current]!
      const closedNow = unavailable || unloaded
      await Promise.resolve()
      if (closedNow || unloaded) return { kind: 'unavailable' }
      return {
        kind: 'signed',
        value: { keyId: key.keyId, signature: Uint8Array.from(mac(key.bytes, bytes)) },
      }
    },
    async verify(
      input: Parameters<SessionCursorSigning['verify']>[0],
    ): Promise<SessionCursorVerifyResult> {
      const payload = Uint8Array.from(input.payload)
      const { keyId } = input.signature
      const given = Uint8Array.from(input.signature.signature)
      const key = KEYS[current]!
      const closedNow = unavailable || unloaded
      await Promise.resolve()
      if (closedNow || unloaded) return { kind: 'unavailable' }
      // A rotation during the call makes the key chosen before the await stale: not a success of the old key.
      if (keyId !== key.keyId || KEYS[current] !== key) return { kind: 'invalid' }
      const expected = mac(key.bytes, payload)
      return given.length === expected.length && timingSafeEqual(given, expected)
        ? { kind: 'valid' }
        : { kind: 'invalid' }
    },
    controls: Object.freeze({
      rotate: () => {
        current = 1
      },
      setUnavailable: (value: boolean) => {
        unavailable = value
      },
      unload: () => {
        unloaded = true
      },
    }),
  })
}

export interface SessionCursorSigningFixture {
  readonly signing: SessionCursorSigning
  readonly controls: FixedSessionCursorSigningControls
}

const text = (value: string): Uint8Array => new TextEncoder().encode(value)

async function signed(signing: SessionCursorSigning, payload: Uint8Array) {
  const result = await signing.sign(payload)
  assert.equal(result.kind, 'signed', 'sign')
  return (result as Extract<SessionCursorSignResult, { kind: 'signed' }>).value
}

export function sessionCursorSigningConformance(): readonly ConformanceCase<SessionCursorSigningFixture>[] {
  return [
    conformanceCase(
      'RD-CURSOR',
      'a signature verifies for the same payload',
      async ({ signing }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        assert.deepEqual(await signing.verify({ payload, signature: value }), { kind: 'valid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'any changed payload byte, key id or signature byte is invalid',
      async ({ signing }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        for (let at = 0; at < payload.length; at += 1) {
          const changed = Uint8Array.from(payload)
          changed[at] = changed[at]! ^ 1
          assert.deepEqual(await signing.verify({ payload: changed, signature: value }), {
            kind: 'invalid',
          })
        }
        const other: SessionCursorSignature = { ...value, keyId: `${value.keyId}-x` }
        assert.deepEqual(await signing.verify({ payload, signature: other }), { kind: 'invalid' })
        const flipped = Uint8Array.from(value.signature)
        flipped[0] = flipped[0]! ^ 1
        assert.deepEqual(
          await signing.verify({ payload, signature: { ...value, signature: flipped } }),
          { kind: 'invalid' },
        )
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'a rotated-out key is invalid and the new key signs',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const old = await signed(signing, payload)
        controls.rotate()
        assert.deepEqual(await signing.verify({ payload, signature: old }), { kind: 'invalid' })
        const fresh = await signed(signing, payload)
        assert.notEqual(fresh.keyId, old.keyId)
        assert.deepEqual(await signing.verify({ payload, signature: fresh }), { kind: 'valid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'a verify in flight at a rotation is invalid, not a success of the old key',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        const pending = signing.verify({ payload, signature: value })
        controls.rotate()
        assert.deepEqual(await pending, { kind: 'invalid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'an unreadable key source is unavailable, never invalid',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        controls.setUnavailable(true)
        assert.deepEqual(await signing.sign(payload), { kind: 'unavailable' })
        assert.deepEqual(await signing.verify({ payload, signature: value }), {
          kind: 'unavailable',
        })
        controls.setUnavailable(false)
        assert.deepEqual(await signing.verify({ payload, signature: value }), { kind: 'valid' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'a call pending at unload does not answer as current',
      async ({ signing, controls }) => {
        const payload = text('cursor-payload')
        const value = await signed(signing, payload)
        const pending = signing.verify({ payload, signature: value })
        controls.unload()
        assert.deepEqual(await pending, { kind: 'unavailable' })
        assert.deepEqual(await signing.sign(payload), { kind: 'unavailable' })
      },
    ),
    conformanceCase(
      'RD-CURSOR',
      'input bytes are captured before the first await and the output is exclusive',
      async ({ signing }) => {
        const payload = text('cursor-payload')
        const kept = Uint8Array.from(payload)
        const pending = signing.sign(payload)
        payload.fill(0)
        const result = (await pending) as Extract<SessionCursorSignResult, { kind: 'signed' }>
        assert.equal(result.kind, 'signed')
        assert.deepEqual(await signing.verify({ payload: kept, signature: result.value }), {
          kind: 'valid',
        })
        result.value.signature.fill(0)
        const again = await signed(signing, kept)
        assert.deepEqual(await signing.verify({ payload: kept, signature: again }), {
          kind: 'valid',
        })
      },
    ),
  ]
}
