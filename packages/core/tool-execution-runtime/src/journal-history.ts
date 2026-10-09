import { isResourceJournalValue } from './journal-resources.ts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { compareInteger, type LogEntry } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { inspectToolJournalEntry, type InspectedToolJournalEntry } from './journal-codec.ts'
import { environmentToolOf } from './environment-tool.ts'
import type { ExecutionTerminal } from './tool-execution.ts'
import type { ToolJournalPayload } from './tool-journal.ts'

type RecordOf<K extends ToolJournalPayload['kind']> = InspectedToolJournalEntry & {
  readonly value: Extract<ToolJournalPayload, { kind: K }>
}
export interface ToolJournalHistory {
  readonly intent: RecordOf<'execution_intended'>
  started?: RecordOf<'execution_started'>
  environment?: RecordOf<'execution_environment_adopted'>
  waiting?: RecordOf<'execution_waiting'>
  readonly answers: Map<number, RecordOf<'execution_answered'>>
  readonly contextReads: RecordOf<'execution_context_read'>[]
  readonly resources: Map<
    string,
    {
      readonly planned: RecordOf<'resource_planned'>
      permitted?: RecordOf<'resource_permitted'>
      adopted?: RecordOf<'resource_adopted'>
      readonly observations: RecordOf<'physical_stop_observed'>[]
    }
  >
  terminal?: RecordOf<'execution_ended'>
  ready?: RecordOf<'delivery_ready'>
  confirmed?: RecordOf<'delivery_confirmed'>
  waitIndex: number
}
class InvalidHistory extends Error {}
function check(condition: unknown): asserts condition {
  if (!condition) throw new InvalidHistory()
}
function environmentRequired(state: ToolJournalHistory): boolean {
  return state.intent.value.selected?.definition.settings?.targetEnvironment !== undefined
}
function authorTerminal(value: ExecutionTerminal): boolean {
  return (
    value.outcome === 'completed' ||
    value.outcome === 'no_answer' ||
    (value.outcome === 'failed' &&
      ['business_failure', 'implementation_error', 'result_rejected'].includes(value.code))
  )
}
function applyPermission(
  state: ToolJournalHistory,
  record: RecordOf<'resource_permitted' | 'resource_adopted'>,
): void {
  const value = record.value,
    resource = state.resources.get(value.key)
  check(!state.terminal && state.started && state.environment && resource)
  check(!resource.adopted && resource.observations.length === 0)
  if (value.kind === 'resource_permitted') {
    check(!resource.permitted)
    resource.permitted = { ...record, value }
  } else {
    check(resource.permitted)
    resource.adopted = { ...record, value }
  }
}
function applyResources(
  state: ToolJournalHistory,
  record: RecordOf<
    'resource_planned' | 'resource_permitted' | 'resource_adopted' | 'physical_stop_observed'
  >,
): void {
  const value = record.value
  switch (value.kind) {
    case 'resource_planned':
      check(!state.terminal && !state.resources.has(value.resource.key))
      state.resources.set(value.resource.key, { planned: { ...record, value }, observations: [] })
      break
    case 'resource_permitted':
    case 'resource_adopted':
      applyPermission(state, { ...record, value })
      break
    case 'physical_stop_observed': {
      const resource = state.resources.get(value.key)
      check(resource !== undefined)
      resource.observations.push({ ...record, value })
      break
    }
  }
}
function applyWait(
  state: ToolJournalHistory,
  record: RecordOf<'execution_waiting' | 'execution_answered'>,
): void {
  const value = record.value
  check(state.terminal === undefined)
  if (value.kind === 'execution_waiting') {
    check(state.started && state.waiting === undefined && value.waitIndex === state.waitIndex + 1)
    check(!environmentRequired(state) || state.environment !== undefined)
    state.waitIndex = value.waitIndex
    state.waiting = { ...record, value }
  } else {
    check(state.waiting?.value.waitIndex === value.waitIndex && !state.answers.has(value.waitIndex))
    state.answers.set(value.waitIndex, { ...record, value })
    delete state.waiting
  }
}
function applyDelivery(
  state: ToolJournalHistory,
  record: RecordOf<'delivery_ready' | 'delivery_confirmed'>,
): void {
  const value = record.value
  if (value.kind === 'delivery_ready') {
    check(
      state.terminal &&
        state.ready === undefined &&
        value.result.outcome === state.terminal.value.terminal.outcome,
    )
    if (value.basis.kind === 'recovered_without_after_action')
      check(value.basis.pass === state.terminal.value.delivery.pass)
    state.ready = { ...record, value }
  } else {
    check(state.ready && state.confirmed === undefined)
    // Message review may rewrite the projection. Its provenance belongs to the common-prefix owner.
    if (value.message.type === 'tool')
      check(value.message.blocks[0].outcome === state.ready.value.result.outcome)
    state.confirmed = { ...record, value }
  }
}
function applyTerminal(state: ToolJournalHistory, record: RecordOf<'execution_ended'>): void {
  const value = record.value
  check(state.terminal === undefined)
  if (value.terminal.outcome === 'no_answer')
    check(state.waiting?.value.waitIndex === value.terminal.waitIndex)
  if (authorTerminal(value.terminal)) {
    check(state.started !== undefined)
    check(!environmentRequired(state) || state.environment !== undefined)
  }
  state.terminal = record
  delete state.waiting
}
function applyLifecycle(
  state: ToolJournalHistory,
  record: RecordOf<
    | 'execution_started'
    | 'execution_context_read'
    | 'execution_environment_adopted'
    | 'execution_ended'
  >,
): void {
  const value = record.value
  check(state.terminal === undefined)
  switch (value.kind) {
    case 'execution_started':
      check(state.started === undefined && state.intent.value.selected !== undefined)
      state.started = { ...record, value }
      break
    case 'execution_context_read':
      check(value.readIndex === state.contextReads.length + 1)
      state.contextReads.push({ ...record, value })
      break
    case 'execution_environment_adopted': {
      const selected = state.intent.value.selected
      check(
        state.started && state.environment === undefined && selected && environmentRequired(state),
      )
      const tool = environmentToolOf(selected)
      check(
        value.adoption.placement.tool.name === tool.name &&
          value.adoption.placement.tool.definition === tool.definition,
      )
      state.environment = { ...record, value }
      break
    }
    case 'execution_ended':
      applyTerminal(state, { ...record, value })
      break
  }
}
function sameOrigin(state: ToolJournalHistory, record: InspectedToolJournalEntry): boolean {
  return (
    record.entry.run === state.intent.entry.run &&
    record.entry.attempt !== undefined &&
    state.intent.entry.attempt !== undefined &&
    compareInteger(record.entry.attempt, state.intent.entry.attempt) === 0
  )
}
function apply(state: ToolJournalHistory, record: InspectedToolJournalEntry): void {
  check(sameOrigin(state, record))
  const value = record.value
  if (isResourceJournalValue(value)) {
    applyResources(state, { ...record, value })
    return
  }
  switch (value.kind) {
    case 'execution_intended':
      throw new InvalidHistory()
    case 'execution_waiting':
    case 'execution_answered':
      applyWait(state, { ...record, value })
      break
    case 'delivery_ready':
    case 'delivery_confirmed':
      applyDelivery(state, { ...record, value })
      break
    default:
      applyLifecycle(state, { ...record, value })
  }
}

function captureHistoryInput(scope: SessionScope, entries: readonly LogEntry[]) {
  const copied = copyJsonValue({ scope, entries })
  if ('failed' in copied) return undefined
  const captured = copied.ok as unknown as {
    readonly scope: SessionScope
    readonly entries: readonly LogEntry[]
  }
  const ownedScope = captured.scope
  if (
    ownedScope === null ||
    typeof ownedScope !== 'object' ||
    Object.keys(ownedScope).length !== 2 ||
    !('ok' in parseTenantId(ownedScope.tenant)) ||
    !('ok' in parseOpaqueIdentifier(ownedScope.session, 'SessionRef')) ||
    !Array.isArray(captured.entries)
  )
    return undefined
  return captured
}
/** Checks this domain's ordered state transitions. Other domains still require their owner's decoder. */
export function projectToolJournal(
  scope: SessionScope,
  entries: readonly LogEntry[],
): { readonly executions: ReadonlyMap<string, ToolJournalHistory> } | { readonly invalid: true } {
  const captured = captureHistoryInput(scope, entries)
  if (captured === undefined) return { invalid: true }
  const ownedScope = captured.scope
  const executions = new Map<string, ToolJournalHistory>(),
    keys = new Set<string>()
  let position = 0 as import('@omne-harness-lite/content-blocks').JsonNumber
  try {
    for (const entry of captured.entries) {
      const record = inspectToolJournalEntry(ownedScope, entry)
      check(!('invalid' in record))
      if ('unrelated' in record) continue
      check(compareInteger(record.entry.position, position) > 0 && !keys.has(record.key))
      position = record.entry.position
      keys.add(record.key)
      const value = record.value,
        callId = value.ref.callId
      const state = executions.get(callId)
      if (value.kind === 'execution_intended') {
        check(state === undefined)
        executions.set(callId, {
          intent: { ...record, value },
          answers: new Map(),
          contextReads: [],
          resources: new Map(),
          waitIndex: 0,
        })
      } else {
        check(state !== undefined)
        apply(state, record)
      }
    }
    return { executions }
  } catch (error) {
    if (error instanceof InvalidHistory) return { invalid: true }
    throw error
  }
}
