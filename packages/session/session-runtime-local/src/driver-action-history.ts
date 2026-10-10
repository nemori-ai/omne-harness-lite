import type { ParameterJudge } from '@omne-harness-lite/tool-definition'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import { compareInteger, type CheckedPrefix } from '@omne-harness-lite/session-log'
import type {
  ToolActionFacts,
  ToolActionHistoryOperations,
} from '@omne-harness-lite/tool-admission'
import { projectToolJournal } from '@omne-harness-lite/tool-execution-runtime'
import {
  DriverHistoryInvalid,
  readDriverModelHistory,
  requireHistory,
} from './driver-model-history.ts'
import { readDriverRunState } from './run-history.ts'
import { readDriverToolBatch, type DriverToolBatch } from './driver-tool-source.ts'
import {
  inspectActionBatch,
  type DriverActionBatchRecord,
  type ReadActionConclusions,
} from './driver-action-facts.ts'
import { actionRecords, checkActionBatch } from './driver-action-check.ts'

export interface SessionToolActionHistoryOptions {
  /** Root-selected mature Runner replay interpreter. This is a pure data function, never a grant. */
  readonly readConclusions: ReadActionConclusions
  readonly parameters?: ParameterJudge | undefined
}
export function createSessionToolActionHistory(
  options: SessionToolActionHistoryOptions,
): ToolActionHistoryOperations {
  const { readConclusions: read, parameters } = options
  return Object.freeze({
    inspect(prefix: CheckedPrefix, call: string) {
      try {
        const copy = copyJsonValue(prefix)
        requireHistory('ok' in copy, 'tool action prefix is not owned JSON')
        return inspect(read, copy.ok as unknown as CheckedPrefix, call, parameters)
      } catch (error) {
        if (error instanceof DriverHistoryInvalid) return { kind: 'unavailable' as const }
        throw error
      }
    },
  })
}
function inspect(
  read: ReadActionConclusions,
  prefix: CheckedPrefix,
  call: string,
  parameters?: ParameterJudge,
): ReturnType<ToolActionHistoryOperations['inspect']> {
  const batches = new Map<string, DriverToolBatch>(),
    completed = new Map<string, DriverActionBatchRecord>()
  for (const reply of readDriverModelHistory(prefix).replies.values()) {
    const result = readDriverToolBatch(prefix, reply.message.id, parameters)
    requireHistory(result.kind !== 'unavailable', 'uninterpretable original Model batch')
    if (result.kind === 'batch') batches.set(reply.message.id, result.batch)
  }
  for (const entry of prefix.entries) {
    const record = inspectActionBatch(prefix, entry)
    if (!record) continue
    const message = record.value.origin.assistantMessage,
      batch = batches.get(message)
    requireHistory(
      batch !== undefined && !completed.has(message),
      'completion has no unique original batch',
    )
    checkActionBatch(read, prefix, record, batch)
    completed.set(message, record)
  }
  checkRunnerOrigins(prefix, batches)
  const routes = readRoutes(prefix, batches, completed)
  const batch = [...batches.values()].find(batch => batch.calls.some(item => item.callId === call))
  if (!batch) return { kind: 'notFound' }
  const completion = completed.get(batch.origin.assistantMessage)
  return {
    kind: 'known',
    facts: {
      origin: batch.origin,
      latestAttempt: batch.latestAttempt,
      runState: batch.runState,
      adoption: { key: batch.adoption.key, ...batch.adoption.adoption },
      calls: batch.calls,
      batch: completion
        ? { kind: 'complete', completion: completion.value.completion }
        : { kind: 'pending' },
      route: routes.get(call) ?? { kind: 'none' },
    },
  }
}
function checkRunnerOrigins(prefix: CheckedPrefix, batches: ReadonlyMap<string, DriverToolBatch>) {
  for (const record of actionRecords(prefix)) {
    const batch = [...batches.values()].find(batch =>
      batch.calls.some(call => call.callId === record.inspected.conclusion.callId),
    )
    requireHistory(
      batch !== undefined &&
        record.entry.run === batch.origin.run &&
        record.entry.attempt !== undefined &&
        compareInteger(record.entry.attempt, batch.origin.attempt) === 0 &&
        compareInteger(record.entry.position, batch.reply.entry.position) > 0,
      'Runner conclusion lacks actual Model origin',
    )
  }
}
function readRoutes(
  prefix: CheckedPrefix,
  batches: ReadonlyMap<string, DriverToolBatch>,
  completed: ReadonlyMap<string, DriverActionBatchRecord>,
) {
  const tools = projectToolJournal(prefix.scope, prefix.entries)
  requireHistory('executions' in tools, 'invalid original Tool journal')
  const routes = new Map<string, ToolActionFacts['route']>()
  for (const [call, execution] of tools.executions) {
    const record = execution.intent,
      value = record.value
    const batch = [...batches.values()].find(batch =>
      batch.calls.some(item => item.callId === call),
    )
    requireHistory(batch !== undefined, 'native Tool has no actual Model batch')
    const completion = completed.get(batch.origin.assistantMessage)
    const item = completion?.value.completion.items.find(item => item.callId === call)
    requireHistory(
      completion !== undefined &&
        item !== undefined &&
        item.decision.kind !== 'denied' &&
        equal(value.origin, batch.origin) &&
        record.entry.run === batch.origin.run &&
        record.entry.attempt !== undefined &&
        compareInteger(record.entry.attempt, batch.origin.attempt) === 0 &&
        compareInteger(record.entry.position, completion.entry.position) > 0,
      'Tool intent lacks original completed disposition',
    )
    checkCurrentIntent(prefix, batch, record.entry.position)
    checkSelectedTool(batch, item, value.selected)
    routes.set(call, { kind: 'execution', intentKey: record.key })
  }
  return routes
}
function checkCurrentIntent(
  prefix: CheckedPrefix,
  batch: DriverToolBatch,
  position: import('@omne-harness-lite/session-log').LogEntry['position'],
) {
  const prior = prefix.entries.filter(entry => compareInteger(entry.position, position) < 0)
  const state = readDriverRunState(prior, batch.origin.run, batch.origin.attempt)
  requireHistory(
    state?.original &&
      !state.ended &&
      state.latest !== undefined &&
      compareInteger(state.latest, batch.origin.attempt) === 0,
    'Tool intent outside its original active attempt',
  )
}
function checkSelectedTool(
  batch: DriverToolBatch,
  item: import('@omne-harness-lite/tool-admission').FinalAction,
  selectedValue: Extract<
    import('@omne-harness-lite/tool-execution-runtime').ToolJournalPayload,
    { kind: 'execution_intended' }
  >['selected'],
) {
  const selected = batch.adoption.adoption.tools.find(tool => tool.name === item.effectiveCall.tool)
  requireHistory(
    (selectedValue !== undefined) === (item.decision.kind === 'allow'),
    'Tool selection changes disposition',
  )
  if (selectedValue)
    requireHistory(
      selected !== undefined &&
        equal(selectedValue, {
          capability: selected.capability,
          asset: selected.asset,
          version: selected.version,
          definition: selected.definition,
          adoption: batch.adoption.key,
        }),
      'Tool intent changes original selected implementation',
    )
}
