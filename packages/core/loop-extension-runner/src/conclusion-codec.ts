import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  isConclusion,
  judgeOutput,
  judgeValue,
  type Conclusion,
} from '@omne-harness-lite/loop-extension'
import { judgeMessage, type SystemReminderMessage } from '@omne-harness-lite/messages'
import { encodeModelLogKey, modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import {
  checkAppendInput,
  type AppendFence,
  type LogEntry,
  type LogEntryInput,
} from '@omne-harness-lite/session-log'
import { claimsRunnerKey, passKeys, runnerFormat, type RunnerOccurrence } from './keys.ts'

export type RunnerExecution =
  | { readonly kind: 'noRun' }
  | { readonly kind: 'withRun'; readonly run: string; readonly attempt: JsonNumber }

export interface PrepareRunnerConclusionInput {
  readonly session: string
  readonly tenant: TenantId
  readonly execution: RunnerExecution
  readonly anchor: string
  readonly occurrence: RunnerOccurrence
  readonly value: Conclusion
  readonly reminders: readonly SystemReminderMessage[]
}

export interface InspectedRunnerConclusion {
  readonly conclusion: Conclusion
  readonly anchor: string
  readonly occurrence: RunnerOccurrence
  readonly reminders: readonly SystemReminderMessage[]
  readonly execution: RunnerExecution
}

const invalidInput = Object.freeze({ invalidInput: true } as const)
const invalid = Object.freeze({ invalid: true } as const)
const unrelated = Object.freeze({ unrelated: true } as const)

function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key))
}
function identity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'RunnerIdentity')
}
function conclusion(value: unknown): Conclusion | undefined {
  const judged = judgeValue('Conclusion', value)
  if (!('ok' in judged) || !isConclusion(judged.ok)) return undefined
  const record = judged.ok
  if (!object(record) || !Object.hasOwn(record, 'output')) {
    // The named LC6 schema closes this JSON branch; identity brands have no runtime methods.
    return record as Conclusion
  }
  const output = judgeOutput(record.output)
  if (!('ok' in output)) return undefined
  // Restore nested message/block values via the public LC6 output judgment.
  return Object.freeze({ ...record, output: output.ok }) as Conclusion
}
function occurrence(value: unknown): RunnerOccurrence | undefined {
  if (!object(value)) return undefined
  if (value.kind === 'final' && Object.keys(value).length === 1) return { kind: 'final' }
  if (value.kind === 'ask' && Object.keys(value).length === 2 && isJsonNumber(value.ordinal))
    return { kind: 'ask', ordinal: value.ordinal }
  return undefined
}
function allowsCopies(count: number, record: Conclusion, output: Conclusion['output']): boolean {
  if (output?.kind === 'inject' && count !== 1) return false
  if (output?.kind !== 'inject' && count > 1) return false
  if (
    count > 0 &&
    output?.kind !== 'inject' &&
    !(
      record.position === 'before_persist_message' &&
      ((record.skipped === 'unavailable' && record.unavailability === 'veto') ||
        output?.kind === 'veto')
    )
  )
    return false
  return true
}

function reminderCopy(
  raw: unknown,
  record: Conclusion,
  output: Conclusion['output'],
): SystemReminderMessage | undefined {
  const judged = judgeMessage(raw)
  if (!('ok' in judged) || judged.ok.type !== 'system_reminder') return undefined
  const item = judged.ok
  if (item.source.kind !== 'extension' || item.source.extension !== record.extension)
    return undefined
  if (output?.kind !== 'inject' && item.nature !== 'event') return undefined
  return item
}

function messageCopies(
  value: unknown,
  record: Conclusion,
): readonly SystemReminderMessage[] | undefined {
  if (!Array.isArray(value)) return undefined
  const output = 'output' in record ? record.output : undefined
  if (!allowsCopies(value.length, record, output)) return undefined
  const messages: SystemReminderMessage[] = []
  for (const raw of value) {
    const item = reminderCopy(raw, record, output)
    if (item === undefined) return undefined
    const key = encodeModelLogKey({ kind: 'message', message: item.id })
    if (!('ok' in key) || messages.some(previous => previous.id === item.id)) return undefined
    messages.push(item)
  }
  if (output?.kind === 'inject' && !modelLogJsonEqual(output.message, messages[0])) return undefined
  return Object.freeze(messages)
}
function execution(value: unknown, position: Conclusion['position']): RunnerExecution | undefined {
  if (!object(value)) return undefined
  if (
    value.kind === 'noRun' &&
    Object.keys(value).length === 1 &&
    position === 'before_persist_message'
  )
    return { kind: 'noRun' }
  if (value.kind !== 'withRun' || Object.keys(value).length !== 3 || !identity(value.run))
    return undefined
  return isNonNegativeJsonInteger(value.attempt) &&
    ExactDecimal.from(value.attempt).compare(ExactDecimal.from(0)) > 0
    ? { kind: 'withRun', run: value.run, attempt: value.attempt }
    : undefined
}

function conclusionKeys(value: Conclusion, anchor: string, kind: RunnerOccurrence) {
  const keys = passKeys({
    position: value.position,
    ...(value.dimension === undefined ? {} : { dimension: value.dimension }),
    anchor: anchor,
    extension: value.extension,
    occurrence: kind,
    ...(value.modelCallId === undefined ? {} : { modelCallId: value.modelCallId }),
  })
  return keys
}

function prepareValues(source: Record<string, unknown>) {
  const tenant = parseTenantId(source.tenant)
  const value = conclusion(source.value)
  if (!('ok' in tenant) || value === undefined) return undefined
  const kind = occurrence(source.occurrence)
  const exec = execution(source.execution, value.position)
  if (
    kind === undefined ||
    exec === undefined ||
    (value.output?.kind === 'ask') !== (kind.kind === 'ask')
  )
    return undefined
  const reminders = messageCopies(source.reminders, value)
  if (reminders === undefined) return undefined
  return { tenant: tenant.ok, value, kind, exec, reminders }
}

function prepareSource(input: PrepareRunnerConclusionInput) {
  const copied = copyJsonValue(input)
  if (
    'failed' in copied ||
    !object(copied.ok) ||
    !only(copied.ok, [
      'session',
      'tenant',
      'execution',
      'anchor',
      'occurrence',
      'value',
      'reminders',
    ])
  )
    return undefined
  const source = copied.ok
  if (!identity(source.session) || !identity(source.anchor)) return undefined
  return { ...source, session: source.session, anchor: source.anchor }
}

export function prepareRunnerConclusion(
  input: PrepareRunnerConclusionInput,
): { readonly entry: LogEntryInput } | typeof invalidInput {
  const source = prepareSource(input)
  if (source === undefined) return invalidInput
  const parsed = prepareValues(source)
  if (parsed === undefined) return invalidInput
  const { tenant, value, kind, exec, reminders } = parsed
  const keys = conclusionKeys(value, source.anchor, kind)
  if ('invalidInput' in keys) return invalidInput
  const dedupeKey = kind.kind === 'ask' ? keys.ask : keys.final
  if (dedupeKey === undefined) return invalidInput
  const readKeys = [
    dedupeKey,
    keys.pass,
    keys.all,
    ...(keys.modelCall === undefined ? [] : [keys.modelCall]),
  ]
  const payload = Object.freeze({
    format: runnerFormat,
    category: 'conclusion',
    anchor: source.anchor,
    occurrence: kind,
    value,
    reminders,
  })
  const entry: LogEntryInput = Object.freeze({
    tenant,
    ...(exec.kind === 'withRun' ? { run: exec.run, attempt: exec.attempt } : {}),
    dedupeKey,
    readKeys: Object.freeze(readKeys),
    payload,
  })
  const checked = checkAppendInput(
    source.session,
    [entry],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  const owned = 'ok' in checked ? checked.ok.entries[0] : undefined
  return owned === undefined ? invalidInput : { entry: owned }
}

function inspectShell(
  entry: Record<string, unknown>,
  session: string,
  tenantValue: unknown,
): LogEntryInput | undefined {
  const tenant = parseTenantId(tenantValue)
  if (
    !('ok' in tenant) ||
    !only(entry, [
      'tenant',
      'run',
      'attempt',
      'dedupeKey',
      'readKeys',
      'payload',
      'session',
      'position',
    ]) ||
    entry.session !== session
  )
    return undefined
  if (
    !isNonNegativeJsonInteger(entry.position) ||
    ExactDecimal.from(entry.position).compare(ExactDecimal.from(0)) <= 0
  )
    return undefined
  const { session: _session, position: _position, ...shell } = entry
  const checked = checkAppendInput(
    session,
    [shell],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if (!('ok' in checked)) return undefined
  const owned = checked.ok.entries[0]
  if (owned === undefined || !tenantIdEquals(owned.tenant, tenant.ok)) return undefined
  return owned
}

function claimsConclusion(entry: Record<string, unknown>, payload: unknown): boolean {
  const keyClaims =
    claimsRunnerKey(entry.dedupeKey) ||
    (Array.isArray(entry.readKeys) && entry.readKeys.some(claimsRunnerKey))
  const payloadClaims =
    object(payload) &&
    ((typeof payload.format === 'string' && payload.format.startsWith('runner/')) ||
      payload.category === 'conclusion')
  return keyClaims || payloadClaims
}

function conclusionPayload(payload: unknown): payload is Record<string, unknown> {
  return !(
    !object(payload) ||
    payload.format !== runnerFormat ||
    payload.category !== 'conclusion' ||
    !only(payload, ['format', 'category', 'anchor', 'occurrence', 'value', 'reminders']) ||
    Object.keys(payload).length !== 6
  )
}

export function inspectRunnerConclusion(input: {
  readonly session: string
  readonly tenant: TenantId
  readonly entry: LogEntry
}): InspectedRunnerConclusion | typeof unrelated | typeof invalid {
  const copied = copyJsonValue(input)
  if ('failed' in copied || !object(copied.ok)) return invalid
  const source = copied.ok
  const entry = source.entry
  if (!object(entry)) return invalid
  const payload = entry.payload
  if (!claimsConclusion(entry, payload)) return unrelated
  if (!identity(source.session) || !conclusionPayload(payload)) return invalid
  const owned = inspectShell(entry, source.session, source.tenant)
  if (owned === undefined) return invalid
  const parsed = inspectPayload(payload, owned)
  if (parsed === undefined) return invalid
  if (!matchesConclusionKeys(owned, parsed)) return invalid
  return Object.freeze(parsed)
}

function inspectPayload(
  payload: Record<string, unknown>,
  owned: LogEntryInput,
): InspectedRunnerConclusion | undefined {
  const value = conclusion(payload.value)
  const kind = occurrence(payload.occurrence)
  if (
    value === undefined ||
    kind === undefined ||
    !identity(payload.anchor) ||
    (value.output?.kind === 'ask') !== (kind.kind === 'ask')
  )
    return undefined
  const reminders = messageCopies(payload.reminders, value)
  if (reminders === undefined) return undefined
  const exec = execution(
    owned.run === undefined
      ? { kind: 'noRun' }
      : { kind: 'withRun', run: owned.run, attempt: owned.attempt },
    value.position,
  )
  if (exec === undefined) return undefined
  return { conclusion: value, anchor: payload.anchor, occurrence: kind, reminders, execution: exec }
}

function matchesConclusionKeys(owned: LogEntryInput, parsed: InspectedRunnerConclusion): boolean {
  const { conclusion: value, anchor, occurrence: kind } = parsed
  const keys = conclusionKeys(value, anchor, kind)
  if ('invalidInput' in keys) return false
  const dedupeKey = kind.kind === 'ask' ? keys.ask : keys.final
  const expected = [
    dedupeKey,
    keys.pass,
    keys.all,
    ...(keys.modelCall === undefined ? [] : [keys.modelCall]),
  ]
  if (
    dedupeKey === undefined ||
    owned.dedupeKey !== dedupeKey ||
    owned.readKeys.length !== expected.length ||
    expected.some((key, index) => owned.readKeys[index] !== key)
  )
    return false
  return true
}

/** Project the captured execution into the fence used by both runner log adapters. */
export function executionFence(execution: RunnerExecution): AppendFence {
  return execution.kind === 'withRun'
    ? { kind: 'fenced', run: execution.run, attempt: execution.attempt }
    : { kind: 'unfenced' }
}
