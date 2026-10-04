import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  CallKey,
  CreationKey,
  ModelCallAcknowledgedRecord,
  ModelCallCreatedRecord,
  ModelCallEndedRecord,
  ModelCallReplyReadyRecord,
  ModelCallDispatchedRecord,
  ModelCallOpenedRecord,
  ModelCallPayloadRef,
  ModelCallCreatedPayload,
} from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry, ReadResult } from '@omne-harness-lite/session-log'
import { encodeModelLogKey, inspectModelLogEntry, type CapturedModelLogValue } from '@omne-harness-lite/model-request-runtime'
import { settlementGenerationCurrent } from './settlement-prefix.ts'
import {
  acknowledgedAttempts,
  attemptFromFinal,
  originOfEntry,
  type AcknowledgedDispatch,
} from './acknowledged-view.ts'
import type {
  AcknowledgedCallFacts,
  CallFacts,
  CallPresence,
  RetainedCallReadView,
  CallOrigin,
  ModelCallContentStore,
  CallResultFact,
  CallLifecycleState,
  ModelCallContentValue,
  CallPresenceFact,
  CallSource,
} from './reference-types.ts'
import type { SettlementLogBinding } from './settlement-types.ts'
import type { ServiceInvalidInput, ServiceUnavailable } from './service-types.ts'

type RelevantRecord =
  | ModelCallAcknowledgedRecord
  | ModelCallCreatedRecord
  | ModelCallEndedRecord
  | ModelCallReplyReadyRecord
  | ModelCallDispatchedRecord
  | ModelCallOpenedRecord
interface ProjectedCall {
  readonly created?: ModelCallCreatedRecord
  readonly rejected?: ModelCallEndedRecord & {
    readonly ending: 'undispatched'
    readonly creationKey: CreationKey
    readonly payload: ModelCallPayloadRef & { readonly kind: 'created' }
  }
  readonly dispatched?: ModelCallDispatchedRecord
  readonly opened?: ModelCallOpenedRecord
  readonly ready?: ModelCallReplyReadyRecord
  readonly final?: ModelResponse
  readonly ended?: ModelCallEndedRecord
  /** RT12 S-97: every dispatch in order, with only the small facts of its durable final. */
  readonly attempts?: readonly AcknowledgedDispatch[]
  /**
   * RT12 S-97: once present, this index never serves the pre-ACK full view again, and it no
   * longer holds a full final value.
   */
  readonly acknowledged?: { readonly record: ModelCallAcknowledgedRecord; readonly entry: LogEntry }
}
interface Scope {
  readonly binding: SettlementLogBinding
  cursor: JsonNumber
  readonly calls: Map<string, ProjectedCall>
  readonly creations: Map<CreationKey, string>
  updating: Promise<{ readonly current: true } | { readonly unavailable: true }> | undefined
}
const unavailable = Object.freeze({ unavailable: true } as const)
const notFound = Object.freeze({ callNotFound: true } as const)
function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function isModelResponse(value: unknown): value is ModelResponse {
  return 'ok' in judgeModelResponse(value)
}
function validPage(
  value: ReadResult,
  session: string,
  tenant: SettlementLogBinding['tenant'],
  after: JsonNumber,
): value is Extract<ReadResult, { readonly entries: readonly LogEntry[] }> {
  if (
    !('entries' in value) ||
    !isNonNegativeJsonInteger(value.tail) ||
    ExactDecimal.from(value.tail).compare(ExactDecimal.from(after)) < 0 ||
    !Array.isArray(value.entries)
  )
    return false
  let cursor = ExactDecimal.from(after)
  for (const entry of value.entries) {
    cursor = cursor.add(ExactDecimal.from(1))
    if (
      entry.session !== session ||
      !tenantIdEquals(entry.tenant, tenant) ||
      !isNonNegativeJsonInteger(entry.position) ||
      ExactDecimal.from(entry.position).compare(cursor) !== 0
    )
      return false
  }
  return cursor.compare(ExactDecimal.from(value.tail)) === 0
}
function relevant(record: unknown): record is RelevantRecord {
  return (
    object(record) &&
    (record.kind === 'model_call_created' ||
      record.kind === 'model_call_ended' ||
      record.kind === 'model_call_reply_ready' ||
      record.kind === 'model_call_dispatched' ||
      record.kind === 'model_call_opened' ||
      record.kind === 'model_call_acknowledged')
  )
}
type Projection =
  | { readonly call: string; readonly next: ProjectedCall; readonly creationKey?: CreationKey }
  | undefined
  | typeof unavailable

function project(entry: LogEntry, existing: ProjectedCall | undefined): Projection {
  if (!object(entry.payload) || entry.payload.format !== 'mrr/3') return undefined
  const category = entry.payload.category
  if (category !== 'record' && category !== 'response') return undefined
  const inspected = inspectModelLogEntry({
    session: entry.session,
    tenant: entry.tenant,
    entry,
    purpose: { kind: category },
    messagePrefix: null,
  })
  if (!('ok' in inspected)) return unavailable
  const captured = inspected.ok.captured
  if (category === 'response') return projectResponse(entry, captured, existing)

  const record = captured.record
  if (!relevant(record) || !('call' in record)) return undefined
  return projectRecord(entry, record, existing)
}

function projectResponse(
  entry: LogEntry,
  captured: CapturedModelLogValue,
  existing: ProjectedCall | undefined,
): Projection {
  if (!isModelResponse(captured.value) || captured.response === null) return unavailable
  const call = captured.value.call.callId
  if (existing?.ready !== undefined && existing.ready.response !== captured.value.id)
    return unavailable
  const value = captured.value
  const attempts = existing?.attempts?.map(item =>
    item.response === value.id ? { ...item, final: attemptFromFinal(value, entry) } : item,
  )
  const next = { ...existing, ...(attempts === undefined ? {} : { attempts }) }
  // After ACK a later final (RT12 S-99) only adds its small facts; no full value is kept.
  return { call, next: existing?.acknowledged === undefined ? { ...next, final: value } : next }
}

function projectRecord(
  entry: LogEntry,
  record: RelevantRecord,
  existing: ProjectedCall | undefined,
): Projection {
  const call = record.call
  if (record.kind === 'model_call_acknowledged') {
    if (existing?.acknowledged !== undefined) return unavailable
    const { final: _final, ...retained } = existing ?? {}
    return { call, next: { ...retained, acknowledged: { record, entry } } }
  }
  if (record.kind === 'model_call_created') {
    if (existing?.created !== undefined || existing?.rejected !== undefined) return unavailable
    return { call, next: { ...existing, created: record }, creationKey: record.creationKey }
  }
  if (record.kind === 'model_call_ended') return projectEnded(record, existing, call)
  if (record.kind === 'model_call_dispatched') return projectDispatched(record, existing, call)
  if (record.kind === 'model_call_opened') return projectOpened(record, existing, call)
  return projectReady(record, existing, call)
}

function projectEnded(
  record: ModelCallEndedRecord,
  existing: ProjectedCall | undefined,
  call: string,
): Projection {
  if (
    existing?.ended !== undefined ||
    (record.creationKey !== undefined &&
      (existing?.created !== undefined || existing?.rejected !== undefined))
  )
    return unavailable
  if (
    record.ending === 'undispatched' &&
    record.creationKey !== undefined &&
    record.payload !== undefined
  )
    return {
      call,
      next: { ...existing, ended: record, rejected: record },
      creationKey: record.creationKey,
    }
  return { call, next: { ...existing, ended: record } }
}

function projectDispatched(
  record: ModelCallDispatchedRecord,
  existing: ProjectedCall | undefined,
  call: string,
): Projection {
  const { opened: _opened, ready: _ready, final: _final, ...remaining } = existing ?? {}
  const attempts = [
    ...(existing?.attempts ?? []),
    { response: record.response, dispatch: record.dispatch, final: null },
  ]
  return { call, next: { ...remaining, dispatched: record, attempts } }
}

function projectOpened(
  record: ModelCallOpenedRecord,
  existing: ProjectedCall | undefined,
  call: string,
): Projection {
  if (
    existing?.dispatched === undefined ||
    ExactDecimal.from(existing.dispatched.dispatch).compare(ExactDecimal.from(record.dispatch)) !==
      0
  )
    return unavailable
  return { call, next: { ...existing, opened: record } }
}

function projectReady(
  record: ModelCallReplyReadyRecord,
  existing: ProjectedCall | undefined,
  call: string,
): Projection {
  if (
    existing?.dispatched === undefined ||
    existing.dispatched.response !== record.response ||
    ExactDecimal.from(existing.dispatched.dispatch).compare(ExactDecimal.from(record.dispatch)) !==
      0 ||
    existing.ready !== undefined
  )
    return unavailable
  return { call, next: { ...existing, ready: record } }
}

function entryCall(entry: LogEntry): string | undefined {
  const raw = object(entry.payload) && object(entry.payload.value) ? entry.payload.value : undefined
  return raw !== undefined && typeof raw.call === 'string'
    ? raw.call
    : raw !== undefined && object(raw.call) && typeof raw.call.callId === 'string'
      ? raw.call.callId
      : undefined
}

function projectEntry(
  entry: LogEntry,
  calls: Map<string, ProjectedCall>,
  creations: Map<CreationKey, string>,
): boolean {
  const callId = entryCall(entry)
  const next = project(entry, callId === undefined ? undefined : calls.get(callId))
  if (next === undefined) return true
  if ('unavailable' in next) return false
  if (next.call !== callId) return false
  if (next.creationKey !== undefined) {
    const prior = creations.get(next.creationKey)
    if (prior !== undefined && prior !== next.call) return false
    creations.set(next.creationKey, next.call)
  }
  calls.set(next.call, next.next)
  return true
}

function projectPage(
  scope: Scope,
  page: Extract<ReadResult, { readonly entries: readonly LogEntry[] }>,
): { readonly current: true } | typeof unavailable {
  const calls = new Map(scope.calls),
    creations = new Map(scope.creations)
  for (const entry of page.entries) {
    if (!projectEntry(entry, calls, creations)) return unavailable
  }
  scope.calls.clear()
  for (const [key, value] of calls) scope.calls.set(key, value)
  scope.creations.clear()
  for (const [key, value] of creations) scope.creations.set(key, value)
  scope.cursor = page.tail
  return { current: true } as const
}

type ContentRead = Awaited<ReturnType<ModelCallContentStore['read']>>
type CreationMarker = NonNullable<ProjectedCall['created'] | ProjectedCall['rejected']>

function validCreationRead(original: ReadResult, scope: Scope): boolean {
  return !(
    !('entries' in original) ||
    original.entries.length !== 1 ||
    original.entries[0]?.session !== scope.binding.session ||
    !tenantIdEquals(original.entries[0].tenant, scope.binding.tenant) ||
    !settlementGenerationCurrent(scope.binding)
  )
}

function isCreationContent(
  content: ContentRead,
): content is { readonly content: Extract<ModelCallContentValue, { readonly kind: 'created' }> } {
  return !(!('content' in content) || content.content.kind !== 'created')
}

function matchesCreation(
  created: ModelCallCreatedPayload,
  ref: CallKey,
  marker: CreationMarker,
  projected: ProjectedCall,
  scope: Scope,
): boolean {
  return !(
    created.ref.session !== ref.session ||
    created.ref.callId !== ref.callId ||
    created.creationKey !== marker.creationKey ||
    !tenantIdEquals(created.origin.tenant, scope.binding.tenant) ||
    created.origin.session !== scope.binding.session ||
    (projected.created !== undefined && created.status !== 'accepted') ||
    (projected.rejected !== undefined && created.status !== 'rejected')
  )
}

function matchesReadyContent(
  pending: ContentRead,
  response: string,
  ref: CallKey,
): pending is {
  readonly content: Extract<ModelCallContentValue, { readonly kind: 'reply_ready' }>
} {
  return !(
    !('content' in pending) ||
    pending.content.kind !== 'reply_ready' ||
    pending.content.value.id !== response ||
    pending.content.value.call.callId !== ref.callId
  )
}

function currentPresence(
  observed: { readonly read: CallPresenceFact } | ServiceInvalidInput | ServiceUnavailable,
  scope: Scope,
  source: CallSource,
): observed is { readonly read: Exclude<CallPresenceFact, { readonly kind: 'notFound' }> } {
  return !(
    !('read' in observed) ||
    observed.read.kind === 'notFound' ||
    observed.read.source.generation !== source.generation ||
    ExactDecimal.from(observed.read.source.progress).compare(ExactDecimal.from(source.progress)) !==
      0 ||
    !settlementGenerationCurrent(scope.binding)
  )
}

function callState(
  projected: ProjectedCall,
  result: CallResultFact | undefined,
): CallLifecycleState {
  return projected.ended?.ending === 'interrupted'
    ? 'interrupted'
    : projected.ended !== undefined
      ? 'handed_up'
      : result !== undefined
        ? 'pending' in result
          ? result.pending.outcome === 'interrupted'
            ? 'interrupted'
            : 'complete'
          : result.response.outcome === 'failed'
            ? 'awaiting_decision'
            : result.response.outcome === 'interrupted'
              ? 'interrupted'
              : 'complete'
        : projected.dispatched === undefined
          ? 'open'
          : projected.opened === undefined
            ? 'in_flight'
            : 'speaking'
}

/** Runtime-owned bounded index. A cold source rebuild scans once; a current lookup reads only
 * the new tail and one keyed creation marker. It never uses process absence as lost execution. */
export function createModelCallFacts(input: {
  readonly content: ModelCallContentStore
  readonly presence: CallPresence
  readonly maxScopes: number
}): CallFacts {
  if (
    !Number.isSafeInteger(input.maxScopes) ||
    input.maxScopes <= 0 ||
    typeof input.content?.read !== 'function' ||
    typeof input.presence?.read !== 'function'
  )
    throw new TypeError('trusted content, presence and finite scope limit required')
  const scopes = new Map<object, Scope>()
  let closed = false
  function scopeFor(binding: SettlementLogBinding): Scope | undefined {
    if (!settlementGenerationCurrent(binding)) return undefined
    const found = scopes.get(binding.generation)
    if (found !== undefined) {
      if (
        found.binding.session !== binding.session ||
        !tenantIdEquals(found.binding.tenant, binding.tenant) ||
        found.binding.log !== binding.log
      )
        return undefined
      scopes.delete(binding.generation)
      scopes.set(binding.generation, found)
      return found
    }
    if (scopes.size >= input.maxScopes) {
      const idle = [...scopes].find(([, scope]) => scope.updating === undefined)
      if (idle !== undefined) scopes.delete(idle[0])
      else return undefined
    }
    const created: Scope = {
      binding,
      cursor: 0,
      calls: new Map(),
      creations: new Map(),
      updating: undefined,
    }
    scopes.set(binding.generation, created)
    return created
  }
  async function update(
    scope: Scope,
  ): Promise<{ readonly current: true } | { readonly unavailable: true }> {
    if (scope.updating !== undefined) return await scope.updating
    const task = (async () => {
      const { binding } = scope
      if (!settlementGenerationCurrent(binding)) return unavailable
      let page: ReadResult, head: ReadResult
      try {
        page = await binding.log.readSince(binding.session, scope.cursor)
        if (!validPage(page, binding.session, binding.tenant, scope.cursor)) return unavailable
        head = await binding.log.readSince(binding.session, page.tail)
      } catch {
        return unavailable
      }
      if (
        !validPage(head, binding.session, binding.tenant, page.tail) ||
        head.entries.length !== 0 ||
        ExactDecimal.from(head.tail).compare(ExactDecimal.from(page.tail)) !== 0 ||
        !settlementGenerationCurrent(binding)
      )
        return unavailable
      return projectPage(scope, page)
    })()
    scope.updating = task
    try {
      return await task
    } finally {
      if (scope.updating === task) scope.updating = undefined
    }
  }
  /**
   * RT12 S-97/S-101: the durable acknowledged facts from the index alone. No payload is read:
   * the ACK precedes any full-content requirement, and released content is not damage.
   */
  function acknowledgedFacts(
    scope: Scope,
    ref: CallKey,
    projected: ProjectedCall,
  ): { readonly acknowledged: AcknowledgedCallFacts } | typeof unavailable {
    const acknowledged = projected.acknowledged
    const marker = projected.created ?? projected.rejected
    if (acknowledged === undefined || marker === undefined) return unavailable
    const { record, entry } = acknowledged
    const target = record.target
    const last = projected.attempts?.at(-1)
    if (
      record.call !== ref.callId ||
      record.creationKey !== marker.creationKey ||
      entry.session !== scope.binding.session ||
      !tenantIdEquals(entry.tenant, scope.binding.tenant) ||
      (target.kind === 'ended'
        ? projected.ended?.ending !== target.ending
        : last?.response !== target.response)
    )
      return unavailable
    const attempts = acknowledgedAttempts(record, projected.attempts ?? [])
    if (attempts === undefined) return unavailable
    return {
      acknowledged: Object.freeze({
        ref: Object.freeze({ session: ref.session, callId: ref.callId }),
        record,
        origin: originOfEntry(entry),
        terminalState: record.terminalState,
        source: Object.freeze({ generation: scope.binding.generation, progress: scope.cursor }),
        attempts,
      }),
    }
  }
  function prepareView(
    scope: Scope,
    ref: CallKey,
  ):
    | { readonly result: Awaited<ReturnType<CallFacts['lookup']>> }
    | {
        readonly projected: ProjectedCall
        readonly marker: CreationMarker
        readonly contentRef: ModelCallPayloadRef
        readonly key: string
      } {
    const projected = scope.calls.get(ref.callId)
    if (projected === undefined) return { result: notFound }
    if (projected.acknowledged !== undefined)
      return { result: acknowledgedFacts(scope, ref, projected) }
    const marker = projected.created ?? projected.rejected
    if (marker === undefined) return { result: unavailable }
    const contentRef = marker.payload
    const keyed = encodeModelLogKey({ kind: 'creation', creationKey: marker.creationKey })
    if (!('ok' in keyed)) return { result: unavailable }
    return { projected, marker, contentRef, key: keyed.ok }
  }
  async function view(
    scope: Scope,
    ref: CallKey,
  ): Promise<
    | { readonly view: RetainedCallReadView }
    | { readonly acknowledged: AcknowledgedCallFacts }
    | typeof notFound
    | typeof unavailable
  > {
    const prepared = prepareView(scope, ref)
    if ('result' in prepared) return prepared.result
    const { projected, marker, contentRef, key } = prepared
    let original: ReadResult
    try {
      original = await scope.binding.log.readByKey(scope.binding.session, key)
    } catch {
      return unavailable
    }
    if (!validCreationRead(original, scope)) return unavailable
    const content = await input.content.read({
      binding: scope.binding,
      call: ref.callId,
      ref: contentRef,
    })
    if (!isCreationContent(content)) return unavailable
    const created = content.content.value
    if (!matchesCreation(created, ref, marker, projected, scope)) return unavailable
    const source = { generation: scope.binding.generation, progress: scope.cursor }
    let result: CallResultFact | undefined
    if (projected.final !== undefined) result = { disposition: 'final', response: projected.final }
    else if (projected.ready !== undefined) {
      const pending = await input.content.read({
        binding: scope.binding,
        call: ref.callId,
        ref: projected.ready.payload,
      })
      if (!matchesReadyContent(pending, projected.ready.response, ref)) return unavailable
      result = { disposition: 'disposition_pending', pending: pending.content.value }
    }
    const state = callState(projected, result)
    const origin: CallOrigin = created.origin
    const observed = await input.presence.read(
      { ref, origin, source, executionGeneration: null },
      async fact => fact,
    )
    if (!currentPresence(observed, scope, source)) return unavailable
    return {
      view: Object.freeze({
        ref,
        origin,
        state,
        source,
        presence: observed.read,
        ...(result === undefined ? {} : { result }),
      }),
    }
  }
  return Object.freeze<CallFacts>({
    content: input.content,
    async refresh(binding) {
      if (closed) return unavailable
      const scope = scopeFor(binding)
      return scope === undefined ? unavailable : await update(scope)
    },
    async lookup({ binding, ref }) {
      if (binding.session !== ref.session) return unavailable
      const scope = scopeFor(binding)
      if (scope === undefined || !('current' in (await update(scope)))) return unavailable
      return await view(scope, ref)
    },
    async creation({ binding, creationKey }) {
      const scope = scopeFor(binding)
      if (scope === undefined || !('current' in (await update(scope)))) return unavailable
      const callId = scope.creations.get(creationKey)
      if (callId === undefined) return notFound
      const found = await view(scope, { session: binding.session, callId })
      if (!('view' in found)) return found
      const marker = scope.calls.get(callId)?.created ?? scope.calls.get(callId)?.rejected
      if (marker === undefined) return unavailable
      const content = await input.content.read({ binding, call: callId, ref: marker.payload })
      return 'content' in content && content.content.kind === 'created'
        ? { payload: content.content.value, view: found.view }
        : unavailable
    },
    async close() {
      closed = true
      const ended = await input.content.close()
      if ('released' in ended) scopes.clear()
      return ended
    },
  })
}
