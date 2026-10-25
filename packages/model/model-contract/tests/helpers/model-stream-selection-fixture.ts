import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelInvocationRef,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type CallState,
  type ModelFailure,
  type ModelInvocationRef,
  type ModelStreamReferences,
  type ModelStreamSelection,
} from '@omne-harness/model-contract'
import { judgeStreamRef, readStreamRef, type StreamCallCodec } from '@omne-harness/stream-arrival'
import { frozenCopy } from './result-delivery-values.ts'

type AccessDecision = 'allow' | 'deny' | 'unavailable'
type FixtureEvent = Readonly<{ sequence: number; action: string; key: string | null }>
export type ModelStreamFixture<P> = Readonly<{
  references: ModelStreamReferences<P>
  confirmSelection(
    input: Readonly<{ reference: ModelInvocationRef; selection: ModelStreamSelection }>,
  ): void
  establishWithoutTarget(input: Readonly<{ reference: ModelInvocationRef; state: CallState }>): void
  withdrawTarget(reference: ModelInvocationRef): void
  setAccess(access: Access<P>, decision: AccessDecision): void
  setSource(state: 'available' | 'unavailable'): void
  holdResponse(requestId: number): void
  reached(requestId: number): Promise<void>
  releaseResponse(requestId: number): void
  events(): readonly FixtureEvent[]
}>
type Confirmed = Readonly<{ reference: ModelInvocationRef; selection: ModelStreamSelection }>
type Barrier = Readonly<{
  arrived: PromiseWithResolvers<void>
  released: PromiseWithResolvers<void>
}>
const codec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant }) {
    const resolved = resolveModelInvocationRef(text, tenant)
    if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
    const encoded = encodeModelInvocationRef(resolved.ok)
    if ('failure' in encoded) throw new TypeError('Invalid resolved invocation')
    return encoded
  },
}
function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('Unminted fixture tenant')
  return encoded.value
}
function original(reference: ModelInvocationRef) {
  const decoded = decodeModelInvocationRef(reference)
  if ('failure' in decoded || decoded.ok !== reference)
    throw new TypeError('Fixture invocation must be canonical')
  const tuple: unknown = JSON.parse(decoded.ok)
  if (!Array.isArray(tuple) || typeof tuple[2] !== 'string')
    throw new TypeError('Invalid invocation tenant')
  const tenant = tenantCodec.parse(tuple[2])
  if (!tenant.ok) throw new TypeError('Invalid invocation tenant')
  const resolved = resolveModelInvocationRef(decoded.ok, tenant.value)
  if ('failure' in resolved) throw new TypeError('Invalid fixture invocation')
  return resolved.ok
}
function key(tenant: TenantId, call: string): string {
  return JSON.stringify([tenantText(tenant), call])
}
function unavailable(): ModelFailure {
  return { kind: 'unavailable', dependency: 'stream-references', diagnostic: 'fixture-source' }
}

export function createModelStreamFixture<P>(): ModelStreamFixture<P> {
  const records = new Map<string, Confirmed>()
  const grants: { tenant: string; principal: P; decision: AccessDecision }[] = []
  const barriers = new Map<number, Barrier>()
  const events: FixtureEvent[] = []
  let source: 'available' | 'unavailable' = 'available'
  let requestId = 0

  function qualify(access: Access<P>): ModelFailure | null {
    const tenant = tenantText(access.tenant)
    const decision =
      grants.find(grant => grant.tenant === tenant && Object.is(grant.principal, access.principal))
        ?.decision ?? 'deny'
    if (decision === 'allow') return null
    return decision === 'deny' ? { kind: 'denied', action: 'current' } : unavailable()
  }
  function confirmSelection(input: Confirmed): void {
    const parts = original(input.reference)
    if (input.selection.state.call !== parts.call)
      throw new TypeError('State belongs to another call')
    const target = input.selection.current
    if (target !== null) {
      const ref = judgeStreamRef({ value: target.ref, tenant: parts.tenant }, codec)
      if (
        'failure' in ref ||
        readStreamRef(ref.ok).call !== input.reference ||
        target.projection !== 'model-output-v1'
      )
        throw new TypeError('Target belongs to another invocation or projection')
    }
    const identity = key(parts.tenant, parts.call)
    const prior = records.get(identity)
    if (prior && prior.reference !== input.reference)
      throw new TypeError('Original admission cannot change')
    records.set(identity, frozenCopy(input))
  }
  function barrierFor(id: number): Barrier {
    const barrier = barriers.get(id)
    if (!barrier) throw new TypeError('Response was not held')
    return barrier
  }
  const references: ModelStreamReferences<P> = {
    async current(input) {
      const id = ++requestId
      const access = { tenant: input.access.tenant, principal: input.access.principal }
      const reference = input.reference
      const resolved = resolveModelInvocationRef(reference, access.tenant)
      if ('failure' in resolved) {
        switch (resolved.failure.kind) {
          case 'invalid-tenant':
            return { failure: { kind: 'denied', action: 'tenant' } }
          case 'foreign-tenant':
            return { failure: { kind: 'denied', action: 'current' } }
          case 'malformed':
            return {
              failure: {
                kind: 'invalid',
                field: 'reference',
                reason: `reference-${resolved.failure.rejection.reason}`,
              },
            }
        }
      }
      const denied = qualify(access)
      if (denied) return { failure: denied }
      const barrier = barriers.get(id)
      if (barrier) {
        barrier.arrived.resolve()
        await barrier.released.promise
        barriers.delete(id)
        const rechecked = qualify(access)
        if (rechecked) return { failure: rechecked }
      }
      const identity = key(access.tenant, resolved.ok.call)
      events.push(
        Object.freeze({ sequence: events.length + 1, action: 'owner-read', key: identity }),
      )
      if (source === 'unavailable') return { failure: unavailable() }
      const confirmed = records.get(identity)
      if (!confirmed)
        return { failure: { kind: 'invalid', field: 'reference', reason: 'not-accepted' } }
      const canonical = encodeModelInvocationRef(resolved.ok)
      if ('failure' in canonical) throw new TypeError('Invalid resolved invocation')
      if (canonical.ok !== confirmed.reference)
        return { failure: { kind: 'invalid', field: 'admission', reason: 'not-original' } }
      return { ok: confirmed.selection }
    },
  }
  return {
    references,
    confirmSelection,
    establishWithoutTarget({ reference, state }) {
      confirmSelection({ reference, selection: { state, current: null } })
    },
    withdrawTarget(reference) {
      const parts = original(reference)
      const confirmed = records.get(key(parts.tenant, parts.call))
      if (!confirmed || confirmed.reference !== reference)
        throw new TypeError('Unknown original invocation')
      confirmSelection({
        reference,
        selection: { state: confirmed.selection.state, current: null },
      })
    },
    setAccess(access, decision) {
      const tenant = tenantText(access.tenant)
      const found = grants.find(
        grant => grant.tenant === tenant && Object.is(grant.principal, access.principal),
      )
      if (found) found.decision = decision
      else grants.push({ tenant, principal: access.principal, decision })
    },
    setSource(state) {
      source = state
    },
    holdResponse(id) {
      if (!Number.isSafeInteger(id) || id <= requestId || barriers.has(id))
        throw new TypeError('Hold a future request exactly once')
      barriers.set(id, {
        arrived: Promise.withResolvers<void>(),
        released: Promise.withResolvers<void>(),
      })
    },
    reached(id) {
      return barrierFor(id).arrived.promise
    },
    releaseResponse(id) {
      barrierFor(id).released.resolve()
    },
    events() {
      return Object.freeze([...events])
    },
  }
}
