import type { Access, TenantId } from '@omne-harness/legal-identity'
import { judgeStreamRef, readStreamRef } from '@omne-harness/stream-arrival'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  CallState,
  ModelFailure,
  ModelInvocationParts,
  ModelInvocationRef,
  ModelReferenceFailure,
  ModelStreamReferences,
  ModelStreamSelection,
} from '../index.ts'
import {
  decodeModelInvocationRef,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
} from '../reference.ts'
import { createAccessRules, type ScriptedAccessDecision } from './access.ts'
import { misuse } from './error.ts'
import { modelStreamCodec } from './stream-codec.ts'
import { frozenCopy, tenantText } from './values.ts'

export type ScriptedEvent = Readonly<{ sequence: number; action: 'owner-read'; key: string }>

export type ScriptedStreamReferences<P> = Readonly<{
  references: ModelStreamReferences<P>
  confirmSelection(
    input: Readonly<{
      tenant: TenantId
      reference: ModelInvocationRef
      selection: ModelStreamSelection
    }>,
  ): void
  establishWithoutTarget(
    input: Readonly<{ tenant: TenantId; reference: ModelInvocationRef; state: CallState }>,
  ): void
  withdrawTarget(input: Readonly<{ tenant: TenantId; reference: ModelInvocationRef }>): void
  setAccess(access: Access<P>, decision: ScriptedAccessDecision): void
  setSource(state: 'available' | 'unavailable'): void
  holdResponse(requestId: number): void
  reached(requestId: number): Promise<void>
  releaseResponse(requestId: number): void
  events(): readonly ScriptedEvent[]
}>

type Confirmed = Readonly<{ reference: ModelInvocationRef; selection: ModelStreamSelection }>
type Scripted = Confirmed & Readonly<{ tenant: TenantId }>
type Barrier = Readonly<{
  arrived: PromiseWithResolvers<void>
  released: PromiseWithResolvers<void>
}>

function original(tenant: TenantId, reference: ModelInvocationRef) {
  const decoded = decodeModelInvocationRef(reference)
  if ('failure' in decoded || decoded.ok !== reference)
    throw misuse('the invocation reference must be canonical')
  const resolved = resolveModelInvocationRef(decoded.ok, tenant)
  if ('failure' in resolved) throw misuse('the invocation reference does not resolve')
  return resolved.ok
}

function key(tenant: TenantId, call: string): string {
  return JSON.stringify([tenantText(tenant), call])
}

function unavailable(): ModelFailure {
  return { kind: 'unavailable', dependency: 'stream-references', diagnostic: 'scripted-source' }
}

function referenceFailure(failure: ModelReferenceFailure): ModelFailure {
  switch (failure.kind) {
    case 'invalid-tenant':
      return { kind: 'denied', action: 'tenant' }
    case 'malformed':
      return {
        kind: 'invalid',
        field: 'reference',
        reason: `reference-${failure.rejection.reason}`,
      }
  }
}

export function createScriptedStreamReferences<P>(): ScriptedStreamReferences<P> {
  const records = new Map<string, Confirmed>()
  const rules = createAccessRules<P>()
  const barriers = new Map<number, Barrier>()
  const events: ScriptedEvent[] = []
  let source: 'available' | 'unavailable' = 'available'
  let requestId = 0

  function qualify(access: Access<P>): ModelFailure | null {
    const decision = rules.decide(access)
    if (decision === 'allow') return null
    return decision === 'deny' ? { kind: 'denied', action: 'current' } : unavailable()
  }

  function confirmSelection(input: Scripted): void {
    const parts = original(input.tenant, input.reference)
    if (input.selection.state.call !== parts.call) throw misuse('the state belongs to another call')
    const target = input.selection.current
    if (target !== null) {
      const ref = judgeStreamRef({ value: target.ref, tenant: parts.tenant }, modelStreamCodec)
      if (
        'failure' in ref ||
        readStreamRef(ref.ok).call !== input.reference ||
        target.projection !== 'model-output-v1'
      )
        throw misuse('the target belongs to another invocation or projection')
    }
    const identity = key(parts.tenant, parts.call)
    const prior = records.get(identity)
    if (prior !== undefined && prior.reference !== input.reference)
      throw misuse('the original admission cannot change')
    records.set(identity, frozenCopy({ reference: input.reference, selection: input.selection }))
  }

  function barrierFor(id: number): Barrier {
    const barrier = barriers.get(id)
    if (barrier === undefined) throw misuse(`the response ${id} was not held`)
    return barrier
  }

  async function waitHeld(
    id: number,
    barrier: Barrier,
    access: Access<P>,
  ): Promise<ModelFailure | null> {
    barrier.arrived.resolve()
    await barrier.released.promise
    barriers.delete(id)
    return qualify(access)
  }

  function readConfirmed(
    access: Access<P>,
    parts: ModelInvocationParts,
  ): Outcome<ModelStreamSelection, ModelFailure> {
    const identity = key(access.tenant, parts.call)
    events.push(Object.freeze({ sequence: events.length + 1, action: 'owner-read', key: identity }))
    if (source === 'unavailable') return { failure: unavailable() }
    const confirmed = records.get(identity)
    if (confirmed === undefined)
      return { failure: { kind: 'invalid', field: 'reference', reason: 'not-accepted' } }
    const canonical = encodeModelInvocationRef(parts)
    if ('failure' in canonical) throw new TypeError('a resolved invocation could not be encoded')
    if (canonical.ok !== confirmed.reference)
      return { failure: { kind: 'invalid', field: 'admission', reason: 'not-original' } }
    return { ok: confirmed.selection }
  }

  const references: ModelStreamReferences<P> = {
    async current(input) {
      const id = ++requestId
      const access = { tenant: input.access.tenant, principal: input.access.principal }
      const resolved = resolveModelInvocationRef(input.reference, access.tenant)
      if ('failure' in resolved) return { failure: referenceFailure(resolved.failure) }
      const denied = qualify(access)
      if (denied !== null) return { failure: denied }
      const barrier = barriers.get(id)
      if (barrier !== undefined) {
        const rechecked = await waitHeld(id, barrier, access)
        if (rechecked !== null) return { failure: rechecked }
      }
      return readConfirmed(access, resolved.ok)
    },
  }

  return {
    references,
    confirmSelection,
    establishWithoutTarget({ tenant, reference, state }) {
      confirmSelection({ tenant, reference, selection: { state, current: null } })
    },
    withdrawTarget({ tenant, reference }) {
      const parts = original(tenant, reference)
      const confirmed = records.get(key(parts.tenant, parts.call))
      if (confirmed === undefined || confirmed.reference !== reference)
        throw misuse('the original invocation is unknown')
      confirmSelection({
        tenant,
        reference,
        selection: { state: confirmed.selection.state, current: null },
      })
    },
    setAccess(access, decision) {
      rules.set(access, decision)
    },
    setSource(state) {
      source = state
    },
    holdResponse(id) {
      if (!Number.isSafeInteger(id) || id <= requestId || barriers.has(id))
        throw misuse('hold a future request exactly once')
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
