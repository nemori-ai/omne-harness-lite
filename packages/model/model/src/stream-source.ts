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
  type StreamCursor,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import {
  diffModelStream,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type CallState,
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
  type StreamMeasure,
} from './stream-bounds.ts'
import {
  createStreamObservation,
  type StreamEndReason,
  type StreamTarget,
  type StreamWatcher,
  type StreamCheckFailure,
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

type Target = NonNullable<ConfirmedObservationRecord['target']>
type Material = ObservationFacts['material']
type Delta = ReturnType<typeof diffModelStream> | null
/** Why confirmed facts install nothing; only a conflict makes the call unavailable. */
type Refusal = 'older' | 'conflict' | 'unchanged'
/** Confirmed facts judged against the record already held for their call. */
type Plan = Readonly<{
  key: string
  facts: ObservationFacts
  old: Entry | undefined
  dispatch: DispatchId | null
  outputCursor: OutputCursor | null
  /** The attached publication, when it still names the execution of the facts. */
  publication: Publication | null
  /** The old public target, when the publication and the dispatch continue it. */
  continued: Target | null
}>
type Draft = Readonly<{
  reuse: Snapshot | null
  snapshot: Snapshot | null
  stream: ModelStreamSnapshot | null
  serial: string
  cursor: StreamCursor | null
}>
type Held = Readonly<{ measured: StreamMeasure; scratch(): void; reservation(): void }>
type Frozen = Readonly<{ state: CallState; saved: Snapshot | null; target: Target | null }>

/** Facts must carry the call and the admission that their own reference encodes. */
function checkBinding(facts: ObservationFacts): void {
  const resolved = resolveModelInvocationRef(facts.reference, facts.tenant)
  if (
    'failure' in resolved ||
    resolved.ok.call !== facts.state.call ||
    resolved.ok.admission !== facts.admission
  )
    throw new TypeError('observation facts binding')
}
/** Metadata that contradicts the call itself or the reference already held for it. */
function contradicts(facts: ObservationFacts, old: Entry | undefined): boolean {
  if (old && old.record.reference !== facts.reference) return true
  if (
    facts.execution &&
    (facts.execution.call !== facts.state.call ||
      !tenantEquals(facts.execution.tenant, facts.tenant))
  )
    return true
  return (
    facts.material.kind === 'retained' &&
    (facts.material.snapshot.call !== facts.state.call ||
      canonical(facts.material.snapshot.state) !== canonical(facts.state))
  )
}
function dispatchOf(material: Material): DispatchId | null {
  return material.kind === 'before-dispatch' ? null : material.dispatch
}
function outputCursorOf(material: Material): OutputCursor | null {
  if (material.kind === 'before-dispatch') return null
  return material.kind === 'retained' ? material.snapshot.cursor : material.cursor
}
/** A same-revision confirmation may only repeat the held one; a forced or unavailable repeat reinstalls. */
function sameRevision(
  old: Entry,
  facts: ObservationFacts,
  dispatch: DispatchId | null,
  outputCursor: OutputCursor | null,
  force: boolean,
): 'conflict' | 'unchanged' | null {
  if (
    !sameExecution(old.execution, facts.execution) ||
    old.dispatch !== dispatch ||
    old.outputCursor !== outputCursor ||
    canonical(old.record.state) !== canonical(facts.state)
  )
    return 'conflict'
  return !force && !old.unavailable ? 'unchanged' : null
}
function continuation(
  found: Publication | undefined,
  facts: ObservationFacts,
  old: Entry | undefined,
  dispatch: DispatchId | null,
): Pick<Plan, 'publication' | 'continued'> {
  const publication =
    found !== undefined && sameExecution(found.execution, facts.execution) ? found : null
  const target = old?.record.target ?? null
  const continued =
    target !== null &&
    publication !== null &&
    samePublication(target.publication, publication) &&
    target.snapshot.dispatch === dispatch
      ? target
      : null
  return { publication, continued }
}
/** Blocks are reused only for the same execution, dispatch and content cursor. */
function reusable(plan: Plan): Snapshot | null {
  const { old } = plan
  return old?.saved &&
    old.dispatch === plan.dispatch &&
    old.saved.cursor === plan.outputCursor &&
    sameExecution(old.execution, plan.facts.execution)
    ? old.saved
    : null
}
/** The private snapshot of the confirmed state, from retained material or from reused blocks. */
function snapshotOf(facts: ObservationFacts, reuse: Snapshot | null): Snapshot | null {
  const material = facts.material.kind === 'retained' ? facts.material.snapshot : reuse
  return material
    ? {
        call: facts.state.call,
        cursor: material.cursor,
        state: facts.state,
        blocks: reuse?.blocks ?? material.blocks,
      }
    : null
}
/** Freezes the drafted values that the record shares with its readers and watchers. */
function freezeDraft(plan: Plan, draft: Draft): Frozen {
  const state = freezeStreamValue(plan.facts.state)
  const raw = draft.snapshot
  const saved = raw
    ? Object.freeze({
        ...raw,
        state,
        blocks: draft.reuse ? draft.reuse.blocks : freezeStreamValue(raw.blocks),
      })
    : null
  const snapshot = draft.stream && saved ? Object.freeze({ ...draft.stream, value: saved }) : null
  const target =
    snapshot && draft.cursor && plan.publication
      ? Object.freeze({ publication: plan.publication, snapshot, cursor: draft.cursor })
      : null
  return { state, saved, target }
}
/** A continued target keeps its live stream and watchers; another target starts a new stream. */
function liveStream(
  old: Entry | undefined,
  continued: Target | null,
  target: Target | null,
): StreamTarget | null {
  if (!target) return null
  return continued && old?.stream
    ? old.stream
    : { snapshot: target.snapshot, cursor: target.cursor, watchers: new Set() }
}
/** Moves the live stream to the target; only a delta tells the watchers of the change. */
function advance(stream: StreamTarget, target: Target, delta: Delta): void {
  const from = stream.cursor
  stream.snapshot = target.snapshot
  stream.cursor = target.cursor
  if (!delta || !('ok' in delta)) return
  const value = freezeStreamValue(delta.ok)
  for (const watcher of stream.watchers)
    watcher.push({ kind: 'delta', from, cursor: target.cursor, value })
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
  /** Judges confirmed facts against the held record; older, contradictory and unchanged facts install nothing. */
  function judge(key: string, facts: ObservationFacts, force: boolean): Plan | Refusal {
    const old = records.get(key)
    const relation = old ? compareRevisions(facts.state.revision, old.record.state.revision) : 1
    if (relation < 0) return 'older'
    if (contradicts(facts, old)) return 'conflict'
    const dispatch = dispatchOf(facts.material)
    const outputCursor = outputCursorOf(facts.material)
    if (old && relation === 0) {
      const repeated = sameRevision(old, facts, dispatch, outputCursor, force)
      if (repeated) return repeated
    }
    return {
      key,
      facts,
      old,
      dispatch,
      outputCursor,
      ...continuation(publications.get(key), facts, old, dispatch),
    }
  }
  /** The continued stream keeps its reference; a new publication or dispatch mints one. */
  function publicRef(plan: Plan, snapshot: Snapshot | null): StreamRef | null {
    if (!plan.publication || !snapshot || !plan.dispatch) return null
    return plan.continued ? plan.continued.snapshot.ref : newRef(plan.facts)
  }
  /** Drafts the next record: its private snapshot, its public stream and the next public position. */
  function draftRecord(plan: Plan): Draft | null {
    const reuse = reusable(plan)
    const snapshot = snapshotOf(plan.facts, reuse)
    const ref = publicRef(plan, snapshot)
    const serial = String(BigInt(plan.old?.record.serial ?? '0') + 1n)
    const position = decodeStreamPosition(serial)
    if ('failure' in position) return null
    const cursor = ref ? take(encodeStreamCursor({ ref, position: position.ok })) : null
    const stream =
      ref && plan.dispatch && snapshot ? { ref, dispatch: plan.dispatch, value: snapshot } : null
    return { reuse, snapshot, stream, serial, cursor }
  }
  /** Measures the drafted record, makes room for it and reserves its bytes and the diff scratch. */
  function reserveRecord(plan: Plan, draft: Draft): Held | null {
    const { facts, old } = plan
    const measured = measureStreamValue(
      {
        reference: facts.reference,
        admission: facts.admission,
        serial: draft.serial,
        publication: plan.publication,
        execution: facts.execution,
        value: draft.stream ?? draft.snapshot ?? facts.state,
      },
      limits.maxRetainedBytes,
    )
    if (!measured || !makeRoom(plan.key, measured.bytes, old)) return null
    const scratch = budget.reserve(
      draft.stream ? (old?.bytes ?? 0) + 2 * measured.bytes + 2048 : measured.bytes,
    )
    const reservation = scratch ? budget.reserve(measured.bytes) : null
    if (!scratch || !reservation) {
      scratch?.()
      return null
    }
    return { measured, scratch, reservation }
  }
  /** Replaces the held record and moves its live stream to the new target. */
  function adoptRecord(plan: Plan, draft: Draft, frozen: Frozen, held: Held, delta: Delta): void {
    const { key, facts, old, continued } = plan
    const { target } = frozen
    if (old && !continued) retireTarget(old)
    const stream = liveStream(old, continued, target)
    const record: ConfirmedObservationRecord = Object.freeze({
      tenant: facts.tenant,
      reference: facts.reference,
      admission: facts.admission,
      serial: draft.serial,
      state: frozen.state,
      target,
    })
    const entry: Entry = {
      record,
      execution: facts.execution && Object.freeze({ ...facts.execution }),
      saved: frozen.saved,
      outputCursor: plan.outputCursor,
      dispatch: plan.dispatch,
      stream,
      unavailable: false,
      bytes: held.measured.bytes,
      nodes: held.measured.nodes,
      containers: held.measured.containers,
      release: held.reservation,
    }
    records.delete(key)
    records.set(key, entry)
    retainedBytes += held.measured.bytes - (old?.bytes ?? 0)
    old?.release()
    if (stream && target) advance(stream, target, continued ? delta : null)
  }
  /** Installs the drafted record under its reservation; a failed diff or a throw makes the call unavailable. */
  function commitRecord(plan: Plan, draft: Draft, held: Held): void {
    try {
      const frozen = freezeDraft(plan, draft)
      const target = frozen.target
      const delta = target
        ? diffModelStream({
            tenant: plan.facts.tenant,
            before: plan.continued ? plan.continued.snapshot : target.snapshot,
            after: target.snapshot,
          })
        : null
      if (delta && 'failure' in delta) {
        held.reservation()
        failTarget(plan.key)
        return
      }
      adoptRecord(plan, draft, frozen, held, delta)
    } catch {
      held.reservation()
      failTarget(plan.key)
    } finally {
      held.scratch()
    }
  }
  function install(facts: ObservationFacts, force = false): void {
    if (closed) return
    checkBinding(facts)
    const key = identity(facts.tenant, facts.state.call)
    const plan = judge(key, facts, force)
    if (typeof plan === 'string') {
      if (plan === 'conflict') failTarget(key)
      return
    }
    const draft = draftRecord(plan)
    const held = draft && reserveRecord(plan, draft)
    if (!draft || !held) {
      failTarget(key)
      return
    }
    commitRecord(plan, draft, held)
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
      ): Outcome<StreamTarget, StreamCheckFailure> {
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
        if (!entry) return { failure: 'cold' }
        if (entry.unavailable) return { failure: 'unavailable' }
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
