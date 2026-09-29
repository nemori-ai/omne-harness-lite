import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isNonNegativeJsonInteger, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  CallKey,
  CreationKey,
  ModelCallCreatedRecord,
  ModelCallEndedRecord,
  ModelCallReplyReadyRecord,
  ModelCallDispatchedRecord,
  ModelCallOpenedRecord,
  ModelCallPayloadRef,
} from '@omne-harness-lite/messages'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import type { LogEntry, ReadResult } from '@omne-harness-lite/session-log-jsonl'
import { encodeModelLogKey, inspectModelLogEntry } from './log-codec.ts'
import { settlementGenerationCurrent } from './settlement-prefix.ts'
import type {
  CallFacts,
  CallPresence,
  CallReadView,
  CallOrigin,
  ModelCallContentStore,
  CallResultFact,
  CallLifecycleState,
} from './reference-types.ts'
import type { SettlementLogBinding } from './settlement-types.ts'

type RelevantRecord =
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
      record.kind === 'model_call_opened')
  )
}
function project(
  entry: LogEntry,
  existing: ProjectedCall | undefined,
):
  | { readonly call: string; readonly next: ProjectedCall; readonly creationKey?: CreationKey }
  | undefined
  | typeof unavailable {
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
  if (category === 'response') {
    if (!isModelResponse(captured.value) || captured.response === null) return unavailable
    const call = captured.value.call.callId
    if (existing?.ready !== undefined && existing.ready.response !== captured.value.id)
      return unavailable
    return { call, next: { ...existing, final: captured.value } }
  }
  const record = captured.record
  if (!relevant(record) || !('call' in record)) return undefined
  const call = record.call
  if (record.kind === 'model_call_created') {
    if (existing?.created !== undefined || existing?.rejected !== undefined) return unavailable
    return { call, next: { ...existing, created: record }, creationKey: record.creationKey }
  }
  if (record.kind === 'model_call_ended') {
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
  if (record.kind === 'model_call_dispatched') {
    const { opened: _opened, ready: _ready, final: _final, ...remaining } = existing ?? {}
    return { call, next: { ...remaining, dispatched: record } }
  }
  if (record.kind === 'model_call_opened') {
    if (
      existing?.dispatched === undefined ||
      ExactDecimal.from(existing.dispatched.dispatch).compare(
        ExactDecimal.from(record.dispatch),
      ) !== 0
    )
      return unavailable
    return { call, next: { ...existing, opened: record } }
  }
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
      const calls = new Map(scope.calls),
        creations = new Map(scope.creations)
      for (const entry of page.entries) {
        const raw =
          object(entry.payload) && object(entry.payload.value) ? entry.payload.value : undefined
        const callId =
          raw !== undefined && typeof raw.call === 'string'
            ? raw.call
            : raw !== undefined && object(raw.call) && typeof raw.call.callId === 'string'
              ? raw.call.callId
              : undefined
        const next = project(entry, callId === undefined ? undefined : calls.get(callId))
        if (next === undefined) continue
        if ('unavailable' in next) return unavailable
        if (next.call !== callId) return unavailable
        if (next.creationKey !== undefined) {
          const prior = creations.get(next.creationKey)
          if (prior !== undefined && prior !== next.call) return unavailable
          creations.set(next.creationKey, next.call)
        }
        calls.set(next.call, next.next)
      }
      scope.calls.clear()
      for (const [key, value] of calls) scope.calls.set(key, value)
      scope.creations.clear()
      for (const [key, value] of creations) scope.creations.set(key, value)
      scope.cursor = page.tail
      return { current: true } as const
    })()
    scope.updating = task
    try {
      return await task
    } finally {
      if (scope.updating === task) scope.updating = undefined
    }
  }
  async function view(
    scope: Scope,
    ref: CallKey,
  ): Promise<{ readonly view: CallReadView } | typeof notFound | typeof unavailable> {
    const projected = scope.calls.get(ref.callId)
    if (projected === undefined) return notFound
    const marker = projected.created ?? projected.rejected
    if (marker === undefined) return unavailable
    const contentRef = marker.payload
    const keyed = encodeModelLogKey({ kind: 'creation', creationKey: marker.creationKey })
    if (!('ok' in keyed)) return unavailable
    let original: ReadResult
    try {
      original = await scope.binding.log.readByKey(scope.binding.session, keyed.ok)
    } catch {
      return unavailable
    }
    if (
      !('entries' in original) ||
      original.entries.length !== 1 ||
      original.entries[0]?.session !== scope.binding.session ||
      !tenantIdEquals(original.entries[0].tenant, scope.binding.tenant) ||
      !settlementGenerationCurrent(scope.binding)
    )
      return unavailable
    const content = await input.content.read({ binding: scope.binding, ref: contentRef })
    if (!('content' in content) || content.content.kind !== 'created') return unavailable
    const created = content.content.value
    if (
      created.ref.session !== ref.session ||
      created.ref.callId !== ref.callId ||
      created.creationKey !== marker.creationKey ||
      !tenantIdEquals(created.origin.tenant, scope.binding.tenant) ||
      created.origin.session !== scope.binding.session ||
      (projected.created !== undefined && created.status !== 'accepted') ||
      (projected.rejected !== undefined && created.status !== 'rejected')
    )
      return unavailable
    const source = { generation: scope.binding.generation, progress: scope.cursor }
    let result: CallResultFact | undefined
    if (projected.final !== undefined) result = { disposition: 'final', response: projected.final }
    else if (projected.ready !== undefined) {
      const pending = await input.content.read({
        binding: scope.binding,
        ref: projected.ready.payload,
      })
      if (
        !('content' in pending) ||
        pending.content.kind !== 'reply_ready' ||
        pending.content.value.id !== projected.ready.response ||
        pending.content.value.call.callId !== ref.callId
      )
        return unavailable
      result = { disposition: 'disposition_pending', pending: pending.content.value }
    }
    const state: CallLifecycleState =
      projected.ended?.ending === 'interrupted'
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
    const origin: CallOrigin = created.origin
    const observed = await input.presence.read(
      { ref, origin, source, executionGeneration: null },
      async fact => fact,
    )
    if (
      !('read' in observed) ||
      observed.read.kind === 'notFound' ||
      observed.read.source.generation !== source.generation ||
      ExactDecimal.from(observed.read.source.progress).compare(
        ExactDecimal.from(source.progress),
      ) !== 0 ||
      !settlementGenerationCurrent(scope.binding)
    )
      return unavailable
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
      const content = await input.content.read({ binding, ref: marker.payload })
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
