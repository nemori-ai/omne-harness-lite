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
  type LogEntry,
  type LogEntryInput,
} from '@omne-harness-lite/session-log-jsonl'
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
function messageCopies(
  value: unknown,
  record: Conclusion,
): readonly SystemReminderMessage[] | undefined {
  if (!Array.isArray(value)) return undefined
  const output = 'output' in record ? record.output : undefined
  if (output?.kind === 'inject' && value.length !== 1) return undefined
  if (output?.kind !== 'inject' && value.length > 1) return undefined
  if (
    value.length > 0 &&
    output?.kind !== 'inject' &&
    !(
      record.position === 'before_persist_message' &&
      ((record.skipped === 'unavailable' && record.unavailability === 'veto') ||
        output?.kind === 'veto')
    )
  )
    return undefined
  const messages: SystemReminderMessage[] = []
  for (const raw of value) {
    const judged = judgeMessage(raw)
    if (!('ok' in judged) || judged.ok.type !== 'system_reminder') return undefined
    const item = judged.ok
    if (item.source.kind !== 'extension' || item.source.extension !== record.extension)
      return undefined
    if (output?.kind !== 'inject' && item.nature !== 'event') return undefined
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

export function prepareRunnerConclusion(
  input: PrepareRunnerConclusionInput,
): { readonly entry: LogEntryInput } | typeof invalidInput {
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
    return invalidInput
  const source = copied.ok
  if (!identity(source.session) || !identity(source.anchor)) return invalidInput
  const tenant = parseTenantId(source.tenant)
  const value = conclusion(source.value)
  if (!('ok' in tenant) || value === undefined) return invalidInput
  const kind = occurrence(source.occurrence)
  const exec = execution(source.execution, value.position)
  if (
    kind === undefined ||
    exec === undefined ||
    (value.output?.kind === 'ask') !== (kind.kind === 'ask')
  )
    return invalidInput
  const reminders = messageCopies(source.reminders, value)
  if (reminders === undefined) return invalidInput
  const keys = passKeys({
    position: value.position,
    ...(value.dimension === undefined ? {} : { dimension: value.dimension }),
    anchor: source.anchor,
    extension: value.extension,
    occurrence: kind,
    ...(value.modelCallId === undefined ? {} : { modelCallId: value.modelCallId }),
  })
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
    tenant: tenant.ok,
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
  const keyClaims =
    claimsRunnerKey(entry.dedupeKey) ||
    (Array.isArray(entry.readKeys) && entry.readKeys.some(claimsRunnerKey))
  const payloadClaims =
    object(payload) &&
    ((typeof payload.format === 'string' && payload.format.startsWith('runner/')) ||
      payload.category === 'conclusion')
  if (!keyClaims && !payloadClaims) return unrelated
  if (
    !identity(source.session) ||
    !object(payload) ||
    payload.format !== runnerFormat ||
    payload.category !== 'conclusion' ||
    !only(payload, ['format', 'category', 'anchor', 'occurrence', 'value', 'reminders']) ||
    Object.keys(payload).length !== 6
  )
    return invalid
  const tenant = parseTenantId(source.tenant)
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
    entry.session !== source.session
  )
    return invalid
  if (
    !isNonNegativeJsonInteger(entry.position) ||
    ExactDecimal.from(entry.position).compare(ExactDecimal.from(0)) <= 0
  )
    return invalid
  const { session: _session, position: _position, ...shell } = entry
  const checked = checkAppendInput(
    source.session,
    [shell],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  if (!('ok' in checked)) return invalid
  const owned = checked.ok.entries[0]
  if (owned === undefined || !tenantIdEquals(owned.tenant, tenant.ok)) return invalid
  const value = conclusion(payload.value)
  const kind = occurrence(payload.occurrence)
  if (
    value === undefined ||
    kind === undefined ||
    !identity(payload.anchor) ||
    (value.output?.kind === 'ask') !== (kind.kind === 'ask')
  )
    return invalid
  const reminders = messageCopies(payload.reminders, value)
  if (reminders === undefined) return invalid
  const exec = execution(
    owned.run === undefined
      ? { kind: 'noRun' }
      : { kind: 'withRun', run: owned.run, attempt: owned.attempt },
    value.position,
  )
  if (exec === undefined) return invalid
  const keys = passKeys({
    position: value.position,
    ...(value.dimension === undefined ? {} : { dimension: value.dimension }),
    anchor: payload.anchor,
    extension: value.extension,
    occurrence: kind,
    ...(value.modelCallId === undefined ? {} : { modelCallId: value.modelCallId }),
  })
  if ('invalidInput' in keys) return invalid
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
    return invalid
  return Object.freeze({
    conclusion: value,
    anchor: payload.anchor,
    occurrence: kind,
    reminders,
    execution: exec,
  })
}
