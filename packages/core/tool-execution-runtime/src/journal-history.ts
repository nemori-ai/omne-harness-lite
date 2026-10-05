import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { compareInteger, type LogEntry } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { inspectToolJournalEntry, type InspectedToolJournalEntry } from './journal-codec.ts'
import type { ToolJournalPayload } from './tool-journal.ts'

type RecordOf<K extends ToolJournalPayload['kind']> = InspectedToolJournalEntry & {
  readonly value: Extract<ToolJournalPayload, { kind: K }>
}
export interface ToolJournalHistory {
  readonly intent: RecordOf<'execution_intended'>
  started?: RecordOf<'execution_started'>
  waiting?: RecordOf<'execution_waiting'>
  readonly answers: Map<number, RecordOf<'execution_answered'>>
  readonly contextReads: RecordOf<'execution_context_read'>[]
  readonly resources: Map<
    string,
    {
      readonly planned: RecordOf<'resource_planned'>
      permitted?: RecordOf<'resource_permitted'>
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
function apply(state: ToolJournalHistory, record: InspectedToolJournalEntry): void {
  const value = record.value,
    live = state.terminal === undefined
  check(
    record.entry.run === state.intent.entry.run &&
      record.entry.attempt !== undefined &&
      state.intent.entry.attempt !== undefined &&
      compareInteger(record.entry.attempt, state.intent.entry.attempt) === 0,
  )
  switch (value.kind) {
    case 'execution_intended':
      throw new InvalidHistory()
    case 'execution_started':
      check(live && state.started === undefined && state.intent.value.selected !== undefined)
      state.started = { ...record, value }
      break
    case 'execution_context_read':
      check(live && value.readIndex === state.contextReads.length + 1)
      state.contextReads.push({ ...record, value })
      break
    case 'resource_planned':
      check(live && !state.resources.has(value.resource.key))
      state.resources.set(value.resource.key, { planned: { ...record, value }, observations: [] })
      break
    case 'resource_permitted': {
      const resource = state.resources.get(value.key)
      check(
        live &&
          state.started !== undefined &&
          resource !== undefined &&
          resource.permitted === undefined,
      )
      resource.permitted = { ...record, value }
      break
    }
    case 'physical_stop_observed': {
      const resource = state.resources.get(value.key)
      check(resource !== undefined)
      resource.observations.push({ ...record, value })
      break
    }
    case 'execution_waiting':
      check(
        live &&
          state.started !== undefined &&
          state.waiting === undefined &&
          value.waitIndex === state.waitIndex + 1,
      )
      state.waitIndex = value.waitIndex
      state.waiting = { ...record, value }
      break
    case 'execution_answered':
      check(
        live &&
          state.waiting?.value.waitIndex === value.waitIndex &&
          !state.answers.has(value.waitIndex),
      )
      state.answers.set(value.waitIndex, { ...record, value })
      delete state.waiting
      break
    case 'execution_ended':
      check(
        live &&
          (value.terminal.outcome !== 'no_answer' ||
            state.waiting?.value.waitIndex === value.terminal.waitIndex),
      )
      if (
        value.terminal.outcome === 'completed' ||
        (value.terminal.outcome === 'failed' &&
          ['business_failure', 'implementation_error', 'result_rejected'].includes(
            value.terminal.code,
          ))
      )
        check(state.started !== undefined)
      state.terminal = { ...record, value }
      delete state.waiting
      break
    case 'delivery_ready':
      check(
        state.terminal !== undefined &&
          state.ready === undefined &&
          value.result.outcome === state.terminal.value.terminal.outcome,
      )
      if (value.basis.kind === 'recovered_without_after_action')
        check(value.basis.pass === state.terminal.value.delivery.pass)
      state.ready = { ...record, value }
      break
    case 'delivery_confirmed':
      check(state.ready !== undefined && state.confirmed === undefined)
      if (value.message.type === 'tool')
        // before_persist_message may rewrite the message projection. Its provenance belongs
        // to the common-prefix owner; the tool domain preserves call and terminal outcome.
        check(value.message.blocks[0].outcome === state.ready.value.result.outcome)
      state.confirmed = { ...record, value }
      break
  }
}

/** Checks this domain's ordered state transitions. Other domains still require their owner's decoder. */
export function projectToolJournal(
  scope: SessionScope,
  entries: readonly LogEntry[],
): { readonly executions: ReadonlyMap<string, ToolJournalHistory> } | { readonly invalid: true } {
  const copied = copyJsonValue({ scope, entries })
  if ('failed' in copied) return { invalid: true }
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
    return { invalid: true }
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
