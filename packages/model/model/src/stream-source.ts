import { randomUUID } from 'node:crypto'
import { tenantCodec, tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
  judgeStreamRef,
  readStreamRef,
  type StreamCallCodec,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import {
  diffModelStream,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type DispatchId,
  type ModelCallId,
  type ModelFailure,
  type ModelStreamSnapshot,
  type OutputCursor,
  type Reply,
  type Snapshot,
} from '@omne-harness/model-contract'
import {
  compareRevisions,
  type ExecutionRef,
  type Publication,
} from '@omne-harness/model-contract/provider'
import type { ModelCommandsAuthority } from './commands/types.ts'
import { canonical, take } from './commands/value.ts'
import {
  checkStreamLimits,
  createStreamBudget,
  freezeStreamValue,
  measureStreamValue,
} from './stream-bounds.ts'
import {
  createStreamObservation,
  type StreamEndReason,
  type StreamTarget,
  type StreamWatcher,
} from './stream-observation.ts'
import type {
  ConfirmedObservationRecord,
  ModelObservationHost,
  ModelObservationLimits,
  ModelObservationSource,
  ModelObservationTiming,
  ObservationFacts,
  ObservationRead,
} from './stream-types.ts'

const streamCodec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant }) {
    const resolved = resolveModelInvocationRef(text, tenant)
    return 'failure' in resolved
      ? { failure: { kind: resolved.failure.kind } }
      : { ok: take(encodeModelInvocationRef(resolved.ok)) }
  },
}
type Entry = {
  record: ConfirmedObservationRecord
  execution: ExecutionRef | null
  saved: Snapshot | null
  outputCursor: OutputCursor | null
  dispatch: DispatchId | null
  stream: StreamTarget | null
  unavailable: boolean
  bytes: number
  nodes: number
  containers: number
  release(): void
}
function identity(tenant: TenantId, call: ModelCallId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('unminted observation tenant')
  return JSON.stringify([encoded.value, call])
}
function sameExecution(left: ExecutionRef | null, right: ExecutionRef | null): boolean {
  if (left === null || right === null) return left === right
  return (
    tenantEquals(left.tenant, right.tenant) &&
    left.call === right.call &&
    left.instance === right.instance &&
    left.generation === right.generation
  )
}
function samePublication(left: Publication, right: Publication): boolean {
  return left.registration === right.registration && sameExecution(left.execution, right.execution)
}
function unavailable(diagnostic = 'source-unavailable'): ModelFailure {
  return { kind: 'unavailable', dependency: 'stream-references', diagnostic }
}
function readFailure(failure: ModelFailure): StreamEndReason {
  return failure.kind === 'denied' ? 'denied' : 'unavailable'
}

/** The storage bridge alone calls confirm; public readers cannot register call facts. */
export function createModelObservationSource<P>(
  input: Readonly<{
    authority: ModelCommandsAuthority<P>
    limits: ModelObservationLimits
    timing: ModelObservationTiming
    refresh(input: ObservationRead<P>): Reply<void>
  }>,
): Readonly<{
  source: ModelObservationSource<P>
  confirm(input: ObservationFacts): void
  unavailable(target: Pick<ExecutionRef, 'tenant' | 'call'>): void
}> {
  checkStreamLimits(input.limits)
  const limits = Object.freeze({ ...input.limits })
  const budget = createStreamBudget(limits.maxTotalBytes)
  const records = new Map<string, Entry>()
  const publications = new Map<string, Publication>()
  const publicationReleases = new Map<string, () => void>()
  const observerTenants = new Map<string, number>()
  let retainedBytes = 0
  let pendingReads = 0
  let observers = 0
  let closed = false
  let activeHost: ModelObservationHost<P> | null = null

  function retireTarget(entry: Entry, reason: StreamEndReason = 'stale-stream'): void {
    const stream = entry.stream
    entry.stream = null
    entry.record = Object.freeze({ ...entry.record, target: null })
    if (stream) for (const watcher of stream.watchers) watcher.end(reason)
  }
  function remove(key: string, entry: Entry): void {
    retireTarget(entry)
    entry.release()
    retainedBytes -= entry.bytes
    records.delete(key)
  }
  function makeRoom(key: string, bytes: number, old: Entry | undefined): boolean {
    for (const [candidate, entry] of records) {
      if (
        records.size - (old ? 1 : 0) < limits.maxRetainedCalls &&
        retainedBytes - (old?.bytes ?? 0) + bytes <= limits.maxRetainedBytes &&
        budget.used() + bytes <= limits.maxTotalBytes
      )
        break
      if (candidate !== key && !entry.stream?.watchers.size) remove(candidate, entry)
    }
    return (
      records.size - (old ? 1 : 0) < limits.maxRetainedCalls &&
      retainedBytes - (old?.bytes ?? 0) + bytes <= limits.maxRetainedBytes
    )
  }
  function failTarget(key: string): void {
    const entry = records.get(key)
    if (!entry) return
    entry.unavailable = true
    retireTarget(entry, 'unavailable')
  }
  function authorize(
    access: Access<P>,
    call: ModelCallId,
    action: 'facts' | 'observe',
  ): ModelFailure | null {
    try {
      const entry = records.get(identity(access.tenant, call))
      const result = input.authority.authorize({
        action,
        access,
        resource: { kind: 'call', call, consumer: entry?.record.state.consumer ?? null },
      })
      if ('ok' in result) return null
      return result.failure.kind === 'denied'
        ? { kind: 'denied', action: action === 'facts' ? 'current' : 'observe' }
        : unavailable('qualification-unavailable')
    } catch {
      return unavailable('qualification-unavailable')
    }
  }
  async function refresh(read: ObservationRead<P>): Reply<void> {
    if (closed) return { failure: unavailable() }
    if (pendingReads >= limits.maxPendingSourceOperations)
      return { failure: unavailable('read-capacity') }
    const release = budget.reserve(256)
    if (!release) return { failure: unavailable('read-capacity') }
    pendingReads += 1
    try {
      return await input.refresh(read)
    } catch {
      return { failure: unavailable() }
    } finally {
      pendingReads -= 1
      release()
    }
  }
  function newRef(facts: ObservationFacts): StreamRef {
    const stream = take(decodeStreamId(`str_${randomUUID()}`))
    return take(
      encodeStreamRef(
        { tenant: facts.tenant, producer: 'model', call: facts.reference, stream },
        streamCodec,
      ),
    )
  }
  function install(facts: ObservationFacts, force = false): void {
    if (closed) return
    const resolved = resolveModelInvocationRef(facts.reference, facts.tenant)
    if (
      'failure' in resolved ||
      resolved.ok.call !== facts.state.call ||
      resolved.ok.admission !== facts.admission
    )
      throw new TypeError('observation facts binding')
    const key = identity(facts.tenant, facts.state.call)
    const old = records.get(key)
    const relation = old ? compareRevisions(facts.state.revision, old.record.state.revision) : 1
    if (relation < 0) return
    if (old && old.record.reference !== facts.reference) {
      failTarget(key)
      return
    }
    const dispatch = facts.material.kind === 'before-dispatch' ? null : facts.material.dispatch
    if (
      facts.execution &&
      (facts.execution.call !== facts.state.call ||
        !tenantEquals(facts.execution.tenant, facts.tenant))
    ) {
      failTarget(key)
      return
    }
    if (
      facts.material.kind === 'retained' &&
      (facts.material.snapshot.call !== facts.state.call ||
        canonical(facts.material.snapshot.state) !== canonical(facts.state))
    ) {
      failTarget(key)
      return
    }
    const publication = publications.get(key)
    const canPublish =
      publication !== undefined && sameExecution(publication.execution, facts.execution)
    const oldTarget = old?.record.target ?? null
    const sameTarget =
      oldTarget !== null &&
      canPublish &&
      samePublication(oldTarget.publication, publication) &&
      oldTarget.snapshot.dispatch === dispatch
    const incomingCursor =
      facts.material.kind === 'before-dispatch'
        ? null
        : facts.material.kind === 'retained'
          ? facts.material.snapshot.cursor
          : facts.material.cursor
    const unchanged =
      old &&
      relation === 0 &&
      sameExecution(old.execution, facts.execution) &&
      old.dispatch === dispatch &&
      old.outputCursor === incomingCursor
    if (
      old &&
      relation === 0 &&
      (!unchanged || canonical(old.record.state) !== canonical(facts.state))
    ) {
      failTarget(key)
      return
    }
    if (!force && unchanged && !old.unavailable) return
    const reuse =
      old?.saved &&
      old.dispatch === dispatch &&
      old.saved.cursor === incomingCursor &&
      sameExecution(old.execution, facts.execution)
        ? old.saved
        : null
    const material = facts.material.kind === 'retained' ? facts.material.snapshot : reuse
    const rawSnapshot: Snapshot | null = material
      ? {
          call: facts.state.call,
          cursor: material.cursor,
          state: facts.state,
          blocks: reuse?.blocks ?? material.blocks,
        }
      : null
    const ref =
      canPublish && rawSnapshot && dispatch
        ? sameTarget
          ? oldTarget.snapshot.ref
          : newRef(facts)
        : null
    const serial = String(BigInt(old?.record.serial ?? '0') + 1n)
    const position = decodeStreamPosition(serial)
    if ('failure' in position) {
      failTarget(key)
      return
    }
    const cursor = ref ? take(encodeStreamCursor({ ref, position: position.ok })) : null
    const rawStream: ModelStreamSnapshot | null =
      ref && dispatch && rawSnapshot ? { ref, dispatch, value: rawSnapshot } : null
    const measured = measureStreamValue(
      {
        reference: facts.reference,
        admission: facts.admission,
        serial,
        publication: canPublish ? publication : null,
        execution: facts.execution,
        value: rawStream ?? rawSnapshot ?? facts.state,
      },
      limits.maxRetainedBytes,
    )
    if (!measured || !makeRoom(key, measured.bytes, old)) {
      failTarget(key)
      return
    }
    const scratch = budget.reserve(
      rawStream ? (old?.bytes ?? 0) + 2 * measured.bytes + 2048 : measured.bytes,
    )
    const reservation = scratch ? budget.reserve(measured.bytes) : null
    if (!scratch || !reservation) {
      scratch?.()
      failTarget(key)
      return
    }
    try {
      const state = freezeStreamValue(facts.state)
      const saved = rawSnapshot
        ? Object.freeze({
            ...rawSnapshot,
            state,
            blocks: reuse ? reuse.blocks : freezeStreamValue(rawSnapshot.blocks),
          })
        : null
      const snapshot = rawStream && saved ? Object.freeze({ ...rawStream, value: saved }) : null
      const target =
        snapshot && cursor && publication ? Object.freeze({ publication, snapshot, cursor }) : null
      const delta = target
        ? diffModelStream({
            tenant: facts.tenant,
            before: sameTarget ? oldTarget.snapshot : target.snapshot,
            after: target.snapshot,
          })
        : null
      if (delta && 'failure' in delta) {
        reservation()
        failTarget(key)
        return
      }
      if (old && !sameTarget) retireTarget(old)
      const stream: StreamTarget | null = target
        ? sameTarget && old?.stream
          ? old.stream
          : {
              snapshot: target.snapshot,
              cursor: target.cursor,
              watchers: new Set(),
            }
        : null
      const record: ConfirmedObservationRecord = Object.freeze({
        tenant: facts.tenant,
        reference: facts.reference,
        admission: facts.admission,
        serial,
        state,
        target,
      })
      const entry: Entry = {
        record,
        execution: facts.execution && Object.freeze({ ...facts.execution }),
        saved,
        outputCursor: incomingCursor,
        dispatch,
        stream,
        unavailable: false,
        bytes: measured.bytes,
        nodes: measured.nodes,
        containers: measured.containers,
        release: reservation,
      }
      records.delete(key)
      records.set(key, entry)
      retainedBytes += measured.bytes - (old?.bytes ?? 0)
      old?.release()
      if (stream && target) {
        const from = stream.cursor
        stream.snapshot = target.snapshot
        stream.cursor = target.cursor
        if (sameTarget && delta && 'ok' in delta) {
          const value = freezeStreamValue(delta.ok)
          for (const watcher of stream.watchers)
            watcher.push({ kind: 'delta', from, cursor: target.cursor, value })
        }
      }
    } catch {
      reservation()
      failTarget(key)
    } finally {
      scratch()
    }
  }
  function factsOf(entry: Entry): ObservationFacts {
    return {
      tenant: entry.record.tenant,
      reference: entry.record.reference,
      admission: entry.record.admission,
      state: entry.record.state,
      execution: entry.execution,
      material:
        entry.saved && entry.dispatch
          ? { kind: 'retained', dispatch: entry.dispatch, snapshot: entry.saved }
          : entry.outputCursor
            ? { kind: 'released', dispatch: entry.dispatch, cursor: entry.outputCursor }
            : { kind: 'before-dispatch' },
    }
  }
  const source: ModelObservationSource<P> = {
    openHost() {
      if (closed || activeHost)
        return { failure: unavailable(closed ? 'source-closed' : 'host-already-open') }
      let hostClosed = false
      const hostWatchers = new Set<StreamWatcher>()
      function check(
        request: Parameters<ModelObservationHost<P>['observation']['observe']>[0],
      ): Outcome<StreamTarget, StreamEndReason> {
        const judged = judgeStreamRef(
          { value: request.ref, tenant: request.access.tenant },
          streamCodec,
        )
        if (
          'failure' in judged &&
          ['foreign-tenant', 'invalid-tenant'].includes(judged.failure.kind)
        )
          return { failure: 'denied' }
        if ('failure' in judged && judged.failure.kind === 'invalid-envelope')
          return { failure: 'stale-stream' }
        const envelope = 'ok' in judged ? readStreamRef(judged.ok) : null
        const parts = envelope && resolveModelInvocationRef(envelope.call, request.access.tenant)
        if (!parts || 'failure' in parts) {
          try {
            const auth = input.authority.authorize({
              action: 'observe',
              access: request.access,
              resource: { kind: 'tenant' },
            })
            return { failure: 'failure' in auth ? readFailure(auth.failure) : 'stale-stream' }
          } catch {
            return { failure: 'unavailable' }
          }
        }
        const failure = authorize(request.access, parts.ok.call, 'observe')
        if (failure) return { failure: readFailure(failure) }
        if (closed) return { failure: 'source-closed' }
        if (hostClosed) return { failure: 'stale-stream' }
        const entry = records.get(identity(request.access.tenant, parts.ok.call))
        if (!entry || entry.unavailable) return { failure: 'unavailable' }
        const target = entry.record.target
        const published = publications.get(identity(request.access.tenant, parts.ok.call))
        if (
          !target ||
          target.snapshot.ref !== request.ref ||
          !published ||
          !samePublication(target.publication, published)
        )
          return { failure: 'stale-stream' }
        return entry.stream ? { ok: entry.stream } : { failure: 'unavailable' }
      }
      const observation = createStreamObservation<P>({
        limits,
        timing: input.timing,
        check,
        reserve: bytes => budget.reserve(bytes),
        track(watcher) {
          hostWatchers.add(watcher)
          return () => {
            hostWatchers.delete(watcher)
          }
        },
        async refresh(request) {
          const parts = resolveModelInvocationRef(
            readStreamRef(request.ref).call,
            request.access.tenant,
          )
          if ('failure' in parts) return 'stale-stream'
          const result = await refresh({
            access: request.access,
            reference: take(encodeModelInvocationRef(parts.ok)),
            purpose: 'observe',
          })
          if ('failure' in result)
            return result.failure.kind === 'unavailable' &&
              result.failure.diagnostic === 'read-capacity'
              ? 'capacity'
              : readFailure(result.failure)
          return null
        },
        admit(request) {
          const encoded = tenantCodec.encode(request.access.tenant)
          if (
            !encoded.ok ||
            observers >= limits.maxObservers ||
            (observerTenants.get(encoded.value) ?? 0) >= limits.maxObserversPerTenant
          )
            return null
          const key = encoded.value
          observers += 1
          observerTenants.set(key, (observerTenants.get(key) ?? 0) + 1)
          return () => {
            observers -= 1
            const count = (observerTenants.get(key) ?? 1) - 1
            if (count === 0) observerTenants.delete(key)
            else observerTenants.set(key, count)
          }
        },
      })
      const host: ModelObservationHost<P> = {
        observation,
        references: {
          async current(original) {
            const access = { tenant: original.access.tenant, principal: original.access.principal }
            const parts = resolveModelInvocationRef(original.reference, access.tenant)
            if ('failure' in parts) {
              const failure = parts.failure
              return {
                failure:
                  failure.kind === 'invalid-tenant'
                    ? { kind: 'denied', action: 'tenant' }
                    : failure.kind === 'foreign-tenant'
                      ? { kind: 'denied', action: 'current' }
                      : {
                          kind: 'invalid',
                          field: 'reference',
                          reason: `reference-${failure.rejection.reason}`,
                        },
              }
            }
            const denied = authorize(access, parts.ok.call, 'facts')
            if (denied) return { failure: denied }
            if (closed || hostClosed) return { failure: unavailable() }
            const refreshed = await refresh({
              access,
              reference: original.reference,
              purpose: 'current',
            })
            const revoked = authorize(access, parts.ok.call, 'facts')
            if (revoked) return { failure: revoked }
            if (closed || hostClosed) return { failure: unavailable() }
            if ('failure' in refreshed) return refreshed
            const key = identity(access.tenant, parts.ok.call)
            const entry = records.get(key)
            if (!entry || entry.unavailable) return { failure: unavailable() }
            if (entry.record.admission !== parts.ok.admission)
              return { failure: { kind: 'invalid', field: 'admission', reason: 'not-original' } }
            records.delete(key)
            records.set(key, entry)
            const target = entry.record.target
            return {
              ok: {
                state: entry.record.state,
                current: target
                  ? {
                      ref: target.snapshot.ref,
                      dispatch: target.snapshot.dispatch,
                      projection: 'model-output-v1',
                    }
                  : null,
              },
            }
          },
        },
        attach(original) {
          if (hostClosed || closed) return
          const publication: Publication = Object.freeze({
            registration: original.registration,
            execution: Object.freeze({ ...original.execution }),
          })
          const key = identity(publication.execution.tenant, publication.execution.call)
          const prior = publications.get(key)
          if (prior && samePublication(prior, publication)) return
          const entry = records.get(key)
          if (entry) retireTarget(entry)
          if (!prior && publications.size >= limits.maxRetainedCalls)
            throw new RangeError('observation publication capacity')
          const measured = measureStreamValue(publication, limits.maxTotalBytes)
          const release = measured && budget.reserve(measured.bytes)
          if (!release) throw new RangeError('observation publication capacity')
          publicationReleases.get(key)?.()
          publicationReleases.set(key, release)
          publications.set(key, publication)
          if (entry && !entry.unavailable) install(factsOf(entry), true)
        },
        retire(publication) {
          if (hostClosed || closed) return
          const key = identity(publication.execution.tenant, publication.execution.call)
          const current = publications.get(key)
          if (!current || !samePublication(current, publication)) return
          const entry = records.get(key)
          if (entry) retireTarget(entry)
          publications.delete(key)
          publicationReleases.get(key)?.()
          publicationReleases.delete(key)
        },
        close() {
          if (hostClosed) return
          hostClosed = true
          for (const watcher of hostWatchers) watcher.end(closed ? 'source-closed' : 'stale-stream')
          for (const entry of records.values()) retireTarget(entry)
          publications.clear()
          for (const release of publicationReleases.values()) release()
          publicationReleases.clear()
          if (activeHost === host) activeHost = null
        },
      }
      activeHost = host
      return { ok: host }
    },
    close() {
      if (closed) return
      closed = true
      for (const entry of records.values()) retireTarget(entry, 'source-closed')
      activeHost?.close()
      for (const [key, entry] of records) remove(key, entry)
      publications.clear()
    },
  }
  return {
    source,
    confirm: facts => install(facts),
    unavailable: target => failTarget(identity(target.tenant, target.call)),
  }
}
