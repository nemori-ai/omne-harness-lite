// The conformance suite of `UseEligibility`, and an in-memory double that passes it.
import assert from 'node:assert/strict'
import type { Access } from '@omne-harness/legal-identity'
import type { BlockedReason } from './outcomes.ts'
import type { EligibilityVerdict, UseEligibility } from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'
import type { EndpointRef } from './values.ts'

export type UseEligibilityFixture<P> = Readonly<{
  port: UseEligibility<P>
  /** A principal with use eligibility for the endpoint. */
  eligible: Readonly<{ access: Access<P>; endpoint: EndpointRef }>
  /** A principal without eligibility for `existing`, and an endpoint that does not exist. */
  ineligible: Readonly<{ access: Access<P>; existing: EndpointRef; missing: EndpointRef }>
  /** An eligible principal whom a setting blocks. */
  blocked?: Readonly<{ access: Access<P>; endpoint: EndpointRef; reason: BlockedReason }>
  /** Withdraws the eligibility of `eligible`. */
  revoke?: () => Promise<void>
  /** A question the port cannot decide now. */
  unreadable?: Readonly<{ access: Access<P>; endpoint: EndpointRef }>
}>

const NOT_ELIGIBLE: EligibilityVerdict = { kind: 'refused', reason: 'not-eligible' }

export function mcpUseEligibilityConformance<P>(): readonly ConformanceCase<
  UseEligibilityFixture<P>
>[] {
  return [
    conformanceCase('UE1', 'answers granted to an eligible principal', async fixture => {
      const { access, endpoint } = fixture.eligible
      assert.deepStrictEqual(await fixture.port.check(access, endpoint), { kind: 'granted' })
    }),
    conformanceCase(
      'UE2',
      'answers an ineligible principal the same for an existing and a missing endpoint',
      async fixture => {
        const { access, existing, missing } = fixture.ineligible
        const forExisting = await fixture.port.check(access, existing)
        const forMissing = await fixture.port.check(access, missing)
        assert.deepStrictEqual(forExisting, NOT_ELIGIBLE)
        assert.deepStrictEqual(forMissing, forExisting)
      },
    ),
    conformanceCase('UE3', 'gives a blocked reason to an eligible principal', async fixture => {
      const { access, endpoint, reason } = handle(fixture.blocked, 'blocked principal')
      assert.deepStrictEqual(await fixture.port.check(access, endpoint), {
        kind: 'refused',
        reason,
      })
    }),
    conformanceCase('UE4', 'decides again at the next use after a revocation', async fixture => {
      const revoke = handle(fixture.revoke, 'revoke')
      const { access, endpoint } = fixture.eligible
      assert.deepStrictEqual(await fixture.port.check(access, endpoint), { kind: 'granted' })
      await revoke()
      assert.deepStrictEqual(await fixture.port.check(access, endpoint), NOT_ELIGIBLE)
    }),
    conformanceCase(
      'UE5',
      'answers unknown instead of a refusal when it cannot decide',
      async fixture => {
        const { access, endpoint } = handle(fixture.unreadable, 'unreadable question')
        assert.deepStrictEqual(await fixture.port.check(access, endpoint), { kind: 'unknown' })
      },
    ),
  ]
}

type Entry = Readonly<{ verdict: 'granted' | BlockedReason; unreadable: boolean }>

export type MemoryUseEligibility<P> = UseEligibility<P> &
  Readonly<{
    grant(access: Access<P>, endpoint: EndpointRef): void
    block(access: Access<P>, endpoint: EndpointRef, reason: BlockedReason): void
    revoke(access: Access<P>, endpoint: EndpointRef): void
    setUnreadable(access: Access<P>, endpoint: EndpointRef, unreadable: boolean): void
  }>

/**
 * Eligibility by tenant, principal and endpoint. Anything not granted is `not-eligible`, whether
 * the endpoint exists or not. A block implies eligibility. It keeps nothing durable.
 */
export function createMemoryUseEligibility<P>(
  options: Readonly<{ principalKey: (principal: P) => string }>,
): MemoryUseEligibility<P> {
  const entries = new Map<string, Entry>()
  const keyOf = (access: Access<P>, endpoint: EndpointRef) =>
    JSON.stringify([
      tenantText(access.tenant),
      options.principalKey(access.principal),
      endpoint.name,
      endpoint.holding,
    ])
  const set = (access: Access<P>, endpoint: EndpointRef, change: Partial<Entry>) => {
    const key = keyOf(access, endpoint)
    const previous = entries.get(key) ?? { verdict: 'granted', unreadable: false }
    entries.set(key, { ...previous, ...change })
  }
  return {
    async check(access, endpoint) {
      const entry = entries.get(keyOf(access, endpoint))
      if (entry === undefined) return NOT_ELIGIBLE
      if (entry.unreadable) return { kind: 'unknown' }
      return entry.verdict === 'granted'
        ? { kind: 'granted' }
        : { kind: 'refused', reason: entry.verdict }
    },
    grant: (access, endpoint) => set(access, endpoint, { verdict: 'granted' }),
    block: (access, endpoint, reason) => set(access, endpoint, { verdict: reason }),
    revoke: (access, endpoint) => entries.delete(keyOf(access, endpoint)),
    setUnreadable: (access, endpoint, unreadable) => set(access, endpoint, { unreadable }),
  }
}
