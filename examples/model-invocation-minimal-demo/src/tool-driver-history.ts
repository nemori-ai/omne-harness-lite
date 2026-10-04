import { copyJsonValue, type ToolCallBlock } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import { ContextHistoryInvalid, inspectContextLogEntry, projectContext } from '@omne-harness-lite/runtime-context-local'
import { compareInteger, type CheckedPrefix, type LogEntry } from '@omne-harness-lite/session-log'
import type { ActionOrigin, NonEmpty, ToolActionFacts, ToolActionHistoryOperations } from '@omne-harness-lite/tool-admission'
import { inspectToolJournalEntry, projectToolJournal, type InspectedToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { inspectDriverEntry } from './tool-driver-codec.ts'
import { checkCompletedActions, sameActionOrigin, type CompletedActions } from './tool-driver-action-history.ts'
import { DriverHistoryInvalid, readDriverModelHistory, requireHistory, type DriverModelReply } from './tool-driver-model-history.ts'
import { attemptIdentity, projectDriverRuns, type AdoptedAttempt, type DriverRecord, type DriverRunnerRecord } from './tool-driver-run-history.ts'

interface ActionBatch {
  readonly origin: ActionOrigin
  readonly reply: DriverModelReply
  readonly adoption: AdoptedAttempt
  readonly calls: NonEmpty<ToolCallBlock>
  completed?: CompletedActions
}
export interface DriverHistory {
  readonly prefix: CheckedPrefix
  readonly models: ReturnType<typeof readDriverModelHistory>
  readonly runs: ReturnType<typeof projectDriverRuns>
  readonly calls: ReadonlyMap<string, ToolActionFacts>
}
function capturePrefix(input: CheckedPrefix): CheckedPrefix {
  const copied = copyJsonValue(input)
  requireHistory('ok' in copied && copied.ok !== null && typeof copied.ok === 'object' && !Array.isArray(copied.ok), 'prefix is not owned JSON')
  const prefix = copied.ok as unknown as CheckedPrefix
  requireHistory(Object.keys(prefix).length === 4 && 'ok' in parseOpaqueIdentifier(prefix.ownerGeneration, 'LogGeneration') &&
    prefix.scope !== null && typeof prefix.scope === 'object' && Object.keys(prefix.scope).length === 2 &&
    Array.isArray(prefix.entries) && 'ok' in parseTenantId(prefix.scope.tenant) &&
    'ok' in parseOpaqueIdentifier(prefix.scope.session, 'SessionRef'), 'prefix has no scope or owner generation')
  return prefix
}

function checkAdoptedContexts(prefix: CheckedPrefix, drivers: readonly DriverRecord[]): void {
  // The context owner validates its own revision graph, including records after the last adoption.
  projectContext(prefix.scope, prefix.entries, prefix.tail)
  for (const record of drivers) {
    if (record.value.kind !== 'attempt_adopted') continue
    const prior = prefix.entries.filter(entry => compareInteger(entry.position, record.entry.position) < 0)
    const context = projectContext(prefix.scope, prior, record.entry.position)
    requireHistory(context.seed !== undefined && record.value.context.every(value => equal(context.contents.get(value.key), value)),
      'attempt context has no actual declared source')
    requireHistory(context.seed.required.every(value => record.value.kind === 'attempt_adopted' &&
      record.value.context.some(content => content.key === value.key)), 'attempt omits required context')
  }
}
function actionBatches(models: DriverHistory['models'], runs: DriverHistory['runs']) {
  const batches = new Map<string, ActionBatch>(), byCall = new Map<string, ActionBatch>()
  for (const reply of models.replies.values()) {
    const calls: ToolCallBlock[] = []
    for (const block of reply.message.blocks) if (block.kind === 'tool_call' && block.complete === true) calls.push(block)
    if (calls.length === 0) continue
    const { run, attempt } = reply.entry
    requireHistory(run !== undefined && attempt !== undefined, 'action reply has no execution origin')
    const adoption = runs.get(run)?.adoptions.get(attemptIdentity(attempt))
    requireHistory(adoption !== undefined, 'action reply has no adopted attempt')
    const batch: ActionBatch = { origin: { run, attempt, assistantMessage: reply.message.id }, reply, adoption, calls: [calls[0]!, ...calls.slice(1)] }
    batches.set(reply.message.id, batch)
    for (const call of calls) {
      requireHistory(!byCall.has(call.callId), 'call identity appears more than once in this session')
      byCall.set(call.callId, batch)
    }
  }
  return { batches, byCall }
}
function completeBatches(prefix: CheckedPrefix, drivers: readonly DriverRecord[], runners: readonly DriverRunnerRecord[], batches: Map<string, ActionBatch>) {
  for (const record of drivers) {
    if (record.value.kind !== 'actions_completed') continue
    const value = record.value, batch = batches.get(value.origin.assistantMessage)
    requireHistory(batch !== undefined && batch.completed === undefined && sameActionOrigin(batch.origin, value.origin) &&
      batch.adoption.key === value.adoption && compareInteger(batch.reply.entry.position, record.entry.position) < 0,
      'completion has wrong reply, origin, adoption or order')
    const completed: CompletedActions = { ...record, value }
    checkCompletedActions(prefix, completed, batch.calls, batch.adoption, runners)
    batch.completed = completed
  }
  for (const record of runners) {
    if (record.inspected.conclusion.position !== 'before_action') continue
    const batch = [...batches.values()].find(batch => batch.calls.some(call => call.callId === record.inspected.conclusion.callId))
    requireHistory(batch !== undefined && record.entry.run === batch.origin.run && record.entry.attempt !== undefined &&
      compareInteger(record.entry.attempt, batch.origin.attempt) === 0 &&
      compareInteger(record.entry.position, batch.reply.entry.position) > 0, 'action conclusion has no actual model origin')
  }
}

function currentAt(batch: ActionBatch, position: LogEntry['position'], runs: DriverHistory['runs']): boolean {
  const run = runs.get(batch.origin.run)
  if (run === undefined || (run.end !== undefined && compareInteger(run.end.entry.position, position) < 0)) return false
  const prior = [...run.adoptions.values()].filter(adoption => compareInteger(adoption.entry.position, position) < 0).at(-1)
  return prior !== undefined && compareInteger(prior.value.attempt, batch.origin.attempt) === 0
}
function routes(drivers: readonly DriverRecord[], tools: readonly InspectedToolJournalEntry[], byCall: Map<string, ActionBatch>, models: DriverHistory['models'], runs: DriverHistory['runs']) {
  const results = new Map<string, ToolActionFacts['route']>()
  const intended = new Map<string, DriverRecord>()
  for (const record of drivers) {
    const value = record.value
    if (value.kind !== 'action_denial_intended' && value.kind !== 'action_denied') continue
    const callId = value.kind === 'action_denial_intended' ? value.call.callId : value.callId
    const batch = byCall.get(callId), completed = batch?.completed
    const item = completed?.value.completion.items.find(item => item.callId === callId)
    requireHistory(batch !== undefined && completed !== undefined && item?.decision.kind === 'denied' &&
      sameActionOrigin(batch.origin, value.origin) && compareInteger(completed.entry.position, record.entry.position) < 0 &&
      equal(value.reason, item.decision.reason), 'denial lacks actual complete decision')
    if (value.kind === 'action_denial_intended') {
      requireHistory(currentAt(batch, record.entry.position, runs) && !results.has(callId) && value.adoption === batch.adoption.key && equal(value.call, item.effectiveCall), 'denial intent conflicts or starts outside its active attempt')
      intended.set(callId, record)
      results.set(callId, { kind: 'denial', intentKey: record.key })
    } else {
      const intent = intended.get(callId)
      const messages = models.entries.filter(model => model.captured.message?.id === value.message.id)
      requireHistory(intent !== undefined && compareInteger(intent.entry.position, record.entry.position) < 0 &&
        messages.length === 1 && equal(messages[0]?.captured.message, value.message) &&
        messages[0]?.entry.run === batch.origin.run && messages[0].entry.attempt !== undefined &&
        compareInteger(messages[0].entry.attempt, batch.origin.attempt) === 0,
        'denial confirmation lacks its actual message and intent')
    }
  }
  const executionOrigins = new Map<string, ActionOrigin>()
  for (const record of tools) {
    const value = record.value, callId = value.ref.callId, batch = byCall.get(callId), completed = batch?.completed
    const item = completed?.value.completion.items.find(item => item.callId === callId)
    requireHistory(batch !== undefined && completed !== undefined && item !== undefined && item.decision.kind !== 'denied' &&
      compareInteger(completed.entry.position, record.entry.position) < 0 && record.entry.run === batch.origin.run &&
      record.entry.attempt !== undefined && compareInteger(record.entry.attempt, batch.origin.attempt) === 0,
      'execution route lacks a completed executable origin')
    if (value.kind === 'execution_intended') {
      requireHistory(currentAt(batch, record.entry.position, runs) && !results.has(callId) && sameActionOrigin(batch.origin, value.origin), 'execution conflicts with an existing route, origin or active attempt')
      if (value.selected !== undefined) {
        const tool = batch.adoption.value.tools.find(tool => tool.name === item.effectiveCall.tool)
        requireHistory(tool !== undefined && equal(value.selected, { capability: tool.capability, asset: tool.asset,
          version: tool.version, definition: tool.definition, adoption: batch.adoption.key }), 'execution selected another adoption')
      }
      requireHistory((value.selected !== undefined) === (item.decision.kind === 'allow'), 'selection does not match actual disposition')
      results.set(callId, { kind: 'execution', intentKey: record.key })
      executionOrigins.set(callId, value.origin)
    } else {
      requireHistory(executionOrigins.has(callId), 'execution record precedes its intent')
      if (value.kind === 'execution_ended') requireHistory((value.account.late === true) === !currentAt(batch, record.entry.position, runs),
        'terminal account late flag does not match the same complete prefix')
      if (value.kind === 'delivery_confirmed') {
        const messages = models.entries.filter(model => model.captured.message?.id === value.message.id)
        requireHistory(messages.length === 1 && equal(messages[0]?.captured.message, value.message) &&
          messages[0]?.entry.run === batch.origin.run && messages[0].entry.attempt !== undefined &&
          compareInteger(messages[0].entry.attempt, batch.origin.attempt) === 0, 'tool confirmation lacks its actual original message')
      }
    }
  }
  for (const model of models.entries) {
    const message = model.captured.message
    if (message?.type !== 'tool') continue
    const denial = drivers.some(record => record.value.kind === 'action_denied' && equal(record.value.message, message))
    const execution = tools.some(record => record.value.kind === 'delivery_confirmed' && equal(record.value.message, message))
    requireHistory(denial !== execution, 'primary return has no unique confirmed route')
  }
  return results
}

/** Complete, synchronous common-prefix interpretation. It never reads a newer tail. */
export function projectToolDriverHistory(input: CheckedPrefix): DriverHistory {
    const prefix = capturePrefix(input), models = readDriverModelHistory(prefix)
    const drivers: DriverRecord[] = [], runners: DriverRunnerRecord[] = [], tools: InspectedToolJournalEntry[] = []
    const modelPositions = new Set(models.entries.map(item => attemptIdentity(item.entry.position)))
    for (const entry of prefix.entries) {
      const driver = inspectDriverEntry(prefix.scope, entry)
      const runner = inspectRunnerConclusion({ ...prefix.scope, entry })
      const context = inspectContextLogEntry(prefix.scope, entry)
      const tool = inspectToolJournalEntry(prefix.scope, entry)
      requireHistory(!('invalid' in driver) && !('invalid' in runner) && !('invalid' in context) && !('invalid' in tool), 'claimed record cannot be decoded')
      const owners = Number('value' in driver) + Number('conclusion' in runner) + Number('event' in context) + Number('value' in tool) + Number(modelPositions.has(attemptIdentity(entry.position)))
      requireHistory(owners === 1, 'record has no unique known owner')
      if ('value' in driver) drivers.push(driver)
      if ('conclusion' in runner) runners.push({ entry, inspected: runner })
      if ('value' in tool) tools.push(tool)
    }
    requireHistory('executions' in projectToolJournal(prefix.scope, prefix.entries), 'tool journal state transitions conflict')
    checkAdoptedContexts(prefix, drivers)
    const runs = projectDriverRuns(drivers, models, runners), { batches, byCall } = actionBatches(models, runs)
    completeBatches(prefix, drivers, runners, batches)
    const routeByCall = routes(drivers, tools, byCall, models, runs), calls = new Map<string, ToolActionFacts>()
    for (const [call, batch] of byCall) {
      const run = runs.get(batch.origin.run)
      requireHistory(run?.latest !== undefined, 'action has no latest adopted attempt')
      calls.set(call, { origin: batch.origin, latestAttempt: run.latest.value.attempt, runState: run.end === undefined ? 'open' : 'ended',
        adoption: { key: batch.adoption.key, report: batch.adoption.value.report, tools: batch.adoption.value.tools }, calls: batch.calls,
        batch: batch.completed === undefined ? { kind: 'pending' } : { kind: 'complete', completion: batch.completed.value.completion },
        route: routeByCall.get(call) ?? { kind: 'none' } })
    }
    return { prefix, models, runs, calls }
}
export function readToolDriverHistory(input: CheckedPrefix): DriverHistory | { readonly unavailable: true } {
  try { return projectToolDriverHistory(input) } catch (error) {
    if (error instanceof DriverHistoryInvalid || error instanceof ContextHistoryInvalid) return { unavailable: true }
    throw error
  }
}
export const toolActionHistory: ToolActionHistoryOperations = Object.freeze<ToolActionHistoryOperations>({
  inspect(prefix, call) {
    if (!('ok' in parseOpaqueIdentifier(call, 'CallId'))) return { kind: 'unavailable' }
    const history = readToolDriverHistory(prefix)
    if ('unavailable' in history) return { kind: 'unavailable' }
    const facts = history.calls.get(call)
    return facts === undefined ? { kind: 'notFound' } : { kind: 'known', facts }
  },
})
