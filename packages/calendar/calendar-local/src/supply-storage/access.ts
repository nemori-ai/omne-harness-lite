import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { CalendarJournalResult } from '@omne-harness/calendar'
import type {
  CombinationRegistrationV2,
  ReceiptV2,
  SqlStorage,
  SqlIdentity,
} from '@omne-harness/sql-contract'
import type { CalendarSupplyStorageAuthority } from './authority.ts'
import { binding, canonical, intent, writeIdentity } from './encoding.ts'
import {
  DOMAIN,
  HANDLER,
  PROTOCOL,
  PARTICIPANT,
  MAX_RECORD_BYTES,
  readSchema,
  writeSchema,
  type Write,
  type Read,
} from './schema.ts'

export type AccessOptions = Readonly<{
  storage: SqlStorage
  combination: CombinationRegistrationV2
  systemScopeRef: string
  authority: CalendarSupplyStorageAuthority
}>
const intentSchema = z.strictObject({
  action: z.string(),
  systemScopeRef: z.string(),
  intentDigest: z.string(),
})
function receipt<T>(
  result: ReceiptV2,
  expected: ReturnType<typeof intent>,
  schema: z.ZodType<T>,
): CalendarJournalResult<T> {
  const own = result.responses.find(entry => entry.participant === PARTICIPANT)
  if (own?.reply.kind === 'conflict') {
    const basis = z
      .strictObject({ reason: z.string(), intent: intentSchema })
      .safeParse(own.reply.basis)
    if (!basis.success) return { kind: 'unknown', reason: 'missingReceiptBinding' }
    if (canonical(basis.data.intent) !== canonical(expected))
      return { kind: 'conflict', reason: 'intentMismatch' }
    return {
      kind: basis.data.reason === 'authorityRejected' ? 'unavailable' : 'conflict',
      reason: basis.data.reason,
    }
  }
  if (own?.reply.kind !== 'participated')
    return { kind: 'unknown', reason: 'missingReceiptBinding' }
  const parsed = z
    .strictObject({ intent: intentSchema, value: schema })
    .safeParse(own.reply.response)
  if (!parsed.success) return { kind: 'unknown', reason: 'invalidReceipt' }
  if (canonical(parsed.data.intent) !== canonical(expected))
    return { kind: 'conflict', reason: 'intentMismatch' }
  return result.kind === 'committed'
    ? { kind: 'ok', value: parsed.data.value }
    : { kind: 'unavailable', reason: 'transactionRolledBack' }
}
export async function query<T>(
  options: AccessOptions,
  id: SqlIdentity,
  expected: ReturnType<typeof intent>,
  schema: z.ZodType<T>,
): Promise<CalendarJournalResult<T | null>> {
  try {
    const result = await options.storage.query(id)
    if (result.kind === 'not_committed') return { kind: 'ok', value: null }
    if (result.kind === 'unknown') return { kind: 'unknown', reason: 'operationUnknown' }
    return receipt(result, expected, schema)
  } catch {
    return { kind: 'unknown', reason: 'queryUnavailable' }
  }
}
export async function recover<T>(
  options: AccessOptions,
  id: SqlIdentity,
  schema: z.ZodType<T>,
  expected: (value: T) => ReturnType<typeof intent>,
): Promise<CalendarJournalResult<T | null>> {
  try {
    const result = await options.storage.query(id)
    if (result.kind === 'not_committed') return { kind: 'ok', value: null }
    if (result.kind === 'unknown') return { kind: 'unknown', reason: 'operationUnknown' }
    if (result.kind === 'rolled_back')
      return { kind: 'unavailable', reason: 'originalTransactionRolledBack' }
    const own = result.responses.find(entry => entry.participant === PARTICIPANT)
    if (own?.reply.kind !== 'participated')
      return { kind: 'unknown', reason: 'missingReceiptBinding' }
    const value = z
      .strictObject({ intent: intentSchema, value: schema })
      .safeParse(own.reply.response)
    if (!value.success) return { kind: 'unknown', reason: 'invalidReceipt' }
    return receipt(result, expected(value.data.value), schema)
  } catch {
    return { kind: 'unknown', reason: 'queryUnavailable' }
  }
}
function validateWrite(
  options: AccessOptions,
  input: Write,
): Exclude<CalendarJournalResult<never>, { kind: 'ok' }> | null {
  try {
    writeSchema.parse(input)
    if (input.systemScopeRef !== options.systemScopeRef)
      return { kind: 'conflict', reason: 'scopeMismatch' }
    if (
      input.action !== 'material.preserve' &&
      Buffer.byteLength(canonical(input)) > MAX_RECORD_BYTES
    )
      return { kind: 'unavailable', reason: 'recordCapacityExceeded' }
    canonical(input)
  } catch {
    return { kind: 'conflict', reason: 'invalidInput' }
  }
  return null
}
export async function write<T>(
  options: AccessOptions,
  input: Write,
  schema: z.ZodType<T>,
): Promise<CalendarJournalResult<T>> {
  const invalid = validateWrite(options, input)
  if (invalid !== null) return invalid
  try {
    const identity = writeIdentity(input),
      expected = intent(input)
    const original = await options.storage.query(identity)
    if (original.kind === 'unknown') return { kind: 'unknown', reason: 'operationUnknown' }
    if (original.kind !== 'not_committed') return receipt(original, expected, schema)
    const guard = options.authority.command(binding(input))
    if (guard.participant !== options.authority.participant)
      return { kind: 'unavailable', reason: 'authorityParticipantMismatch' }
    const result = await options.storage.commit({
      identity,
      combinationVersion: options.combination.combinationVersion,
      manifestDigest: options.combination.manifestDigest,
      commands: [
        guard,
        { participant: PARTICIPANT, facts: z.record(z.string(), z.json()).parse(input) },
      ],
    })
    switch (result.kind) {
      case 'committed':
      case 'rolled_back':
        return receipt(result, expected, schema)
      case 'identity_conflict':
        return receipt(result.existing, expected, schema)
      case 'unknown':
        return { kind: 'unknown', reason: 'operationUnknown' }
      case 'rejected_before_accept':
        return { kind: 'unavailable', reason: result.reason }
    }
  } catch {
    return { kind: 'unknown', reason: 'writeObservationLost' }
  }
}
export async function read<T>(
  options: AccessOptions,
  input: Read,
  schema: z.ZodType<T>,
): Promise<CalendarJournalResult<T>> {
  try {
    readSchema.parse(input)
    canonical(input)
    if (input.systemScopeRef !== options.systemScopeRef)
      return { kind: 'conflict', reason: 'scopeMismatch' }
  } catch {
    return { kind: 'conflict', reason: 'invalidInput' }
  }
  try {
    const result = await options.storage.read({
      domain: { scope: { kind: 'system' }, transactionDomain: DOMAIN },
      handler: HANDLER,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input,
    })
    if (result.kind !== 'read')
      return {
        kind: 'unavailable',
        reason: result.kind === 'unavailable' ? result.reason : 'readCancelled',
      }
    const capacity = z
      .strictObject({ kind: z.literal('capacity'), reason: z.string() })
      .safeParse(result.output)
    if (capacity.success) return { kind: 'unavailable', reason: capacity.data.reason }
    const parsed = schema.safeParse(result.output)
    return parsed.success
      ? { kind: 'ok', value: parsed.data }
      : { kind: 'unavailable', reason: 'invalidReadResult' }
  } catch {
    return { kind: 'unavailable', reason: 'readUnavailable' }
  }
}
