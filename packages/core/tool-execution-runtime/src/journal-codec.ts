import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import {
  checkAppendInput,
  compareInteger,
  positiveInteger,
  type LogEntry,
  type OwnedLogEntry,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ExecutionOrigin } from './tool-execution.ts'
import type { ToolJournalPayload } from './tool-journal.ts'
import {
  captureToolJournalValue,
  invalidJournal,
  journalIdentity,
  journalObject,
  journalShape,
} from './journal-values.ts'

export const toolJournalFormat = 'tool-runtime/1'
export const toolJournalAll = `${toolJournalFormat}/all`
export interface ToolJournalEnvelope {
  readonly format: typeof toolJournalFormat
  readonly category: 'execution'
  readonly value: ToolJournalPayload
}
function keyOf(value: ToolJournalPayload): string {
  const suffix =
    value.kind === 'resource_planned'
      ? [value.resource.key]
      : value.kind === 'resource_permitted'
        ? [value.key]
        : value.kind === 'physical_stop_observed'
          ? [value.key, value.status, value.at]
          : value.kind === 'execution_waiting' || value.kind === 'execution_answered'
            ? [String(value.waitIndex)]
            : value.kind === 'execution_context_read'
              ? [String(value.readIndex)]
              : []
  return `${toolJournalFormat}/${JSON.stringify([value.kind, value.ref.callId, ...suffix])}`
}
function callKey(callId: string): string {
  return `${toolJournalFormat}/call/${JSON.stringify(callId)}`
}
export function toolJournalKey(input: unknown): string | typeof invalidJournal {
  const value = captureToolJournalValue(input)
  return 'invalid' in value ? value : keyOf(value)
}
function scopeOf(input: unknown): SessionScope | undefined {
  const copy = copyJsonValue(input)
  if (
    'failed' in copy ||
    !journalObject(copy.ok) ||
    Object.keys(copy.ok).length !== 2 ||
    !journalIdentity(copy.ok.session)
  )
    return undefined
  const tenant = parseTenantId(copy.ok.tenant),
    session = parseOpaqueIdentifier(copy.ok.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session ? { tenant: tenant.ok, session: session.ok } : undefined
}
/** The execution origin remains the shell origin even when its attempt has ended. */
export function prepareToolJournalEntry(input: {
  readonly origin: ExecutionOrigin
  readonly value: ToolJournalPayload
}): { readonly entry: OwnedLogEntry } | typeof invalidJournal {
  const copy = copyJsonValue(input)
  if (
    'failed' in copy ||
    !journalObject(copy.ok) ||
    Object.keys(copy.ok).length !== 2 ||
    !journalObject(copy.ok.origin)
  )
    return invalidJournal
  const origin = copy.ok.origin
  if (
    Object.keys(origin).length !== 3 ||
    !journalIdentity(origin.run) ||
    !journalIdentity(origin.assistantMessage) ||
    !positiveInteger(origin.attempt)
  )
    return invalidJournal
  const value = captureToolJournalValue(copy.ok.value)
  if ('invalid' in value) return value
  if (
    value.kind === 'execution_intended' &&
    (value.origin.run !== origin.run ||
      compareInteger(value.origin.attempt, origin.attempt) !== 0 ||
      value.origin.assistantMessage !== origin.assistantMessage)
  )
    return invalidJournal
  const key = keyOf(value)
  const result = checkAppendInput(
    value.ref.session,
    [
      {
        tenant: value.ref.tenant,
        run: origin.run,
        attempt: origin.attempt,
        dedupeKey: key,
        readKeys: [key, callKey(value.ref.callId), toolJournalAll],
        payload: {
          format: toolJournalFormat,
          category: 'execution',
          value,
        } satisfies ToolJournalEnvelope,
      },
    ],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  const entry = 'ok' in result ? result.ok.entries[0] : undefined
  return entry === undefined ? invalidJournal : { entry }
}
function claims(value: unknown): boolean {
  return (
    typeof value === 'string' && (value === 'tool-runtime' || value.startsWith('tool-runtime/'))
  )
}
export interface InspectedToolJournalEntry {
  readonly value: ToolJournalPayload
  readonly key: string
  readonly entry: LogEntry
}
/** Unknown claimed versions fail closed; unrelated domains retain their own decoders. */
export function inspectToolJournalEntry(
  suppliedScope: SessionScope,
  input: LogEntry,
): InspectedToolJournalEntry | typeof invalidJournal | { readonly unrelated: true } {
  const scope = scopeOf(suppliedScope),
    copy = copyJsonValue(input)
  if (scope === undefined || 'failed' in copy || !journalObject(copy.ok)) return invalidJournal
  const row = copy.ok
  if (!(
    claims(row.dedupeKey) ||
    (Array.isArray(row.readKeys) && row.readKeys.some(claims)) ||
    (journalObject(row.payload) && claims(row.payload.format))
  ))
    return { unrelated: true }
  if (
    row.session !== scope.session ||
    !positiveInteger(row.position) ||
    !journalShape('Payload', row.payload!) ||
    !journalObject(row.payload) ||
    !journalIdentity(row.run) ||
    !positiveInteger(row.attempt) ||
    Object.keys(row).some(
      key =>
        ![
          'tenant',
          'session',
          'run',
          'attempt',
          'position',
          'dedupeKey',
          'readKeys',
          'payload',
        ].includes(key),
    )
  )
    return invalidJournal
  const tenant = parseTenantId(row.tenant),
    value = captureToolJournalValue(row.payload.value)
  if (
    !('ok' in tenant) ||
    !tenantIdEquals(tenant.ok, scope.tenant) ||
    'invalid' in value ||
    !tenantIdEquals(value.ref.tenant, scope.tenant) ||
    value.ref.session !== scope.session
  )
    return invalidJournal
  const key = keyOf(value),
    expected = [key, callKey(value.ref.callId), toolJournalAll]
  if (
    row.dedupeKey !== key ||
    !Array.isArray(row.readKeys) ||
    row.readKeys.length !== expected.length ||
    !expected.every(item => (row.readKeys as readonly unknown[]).includes(item)) ||
    (value.kind === 'execution_intended' &&
      (row.run !== value.origin.run ||
        ExactDecimal.from(row.attempt).compare(ExactDecimal.from(value.origin.attempt)) !== 0))
  )
    return invalidJournal
  return { value, key, entry: row as unknown as LogEntry }
}
