import { randomUUID } from 'node:crypto'
import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { checkSourceToken } from '@omne-harness-lite/session-log'
import { checkOperationRef } from '@omne-harness-lite/session-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { CreateSessionInput, OperationRef } from '@omne-harness-lite/session-runtime'
import type { SessionRef } from '@omne-harness-lite/messages'
import { receiptKey } from './receipt-values.ts'
import { creationInput, runtimeSemantic, RuntimeRejection } from './runtime-values.ts'
import type { RuntimeDb, RuntimeOptions, CreationRow } from './runtime-types.ts'

export function sessionRef(value: unknown, options: RuntimeOptions): SessionRef {
  const checked = checkSourceToken({
    tenant: options.tenant,
    session: value,
    journalGeneration: 'validation',
    tail: 0,
  })
  if ('failure' in checked) throw new RuntimeRejection('invalidInput')
  return checked.ok.session
}
export function decodeCreation(row: CreationRow, options: RuntimeOptions): CreateSessionInput {
  try {
    const read = readJsonStrict(row.input)
    if ('failed' in read || ![0, 1].includes(row.published)) throw new Error('bad record')
    const input = creationInput(read.ok, options.policy.maxRecordBytes)
    if (runtimeSemantic(input, options.policy.maxRecordBytes) !== row.semantic)
      throw new Error('bad semantic')
    creationOperation(row, input, options)
    sessionRef(row.session, options)
    return input
  } catch {
    throw new StorageDefect('corrupt Session initialization')
  }
}
function creationOperation(
  row: CreationRow,
  input: CreateSessionInput,
  options: RuntimeOptions,
): void {
  const parts: unknown = JSON.parse(row.operation)
  if (!Array.isArray(parts) || parts.length !== 6) throw new Error('invalid original operation')
  const checked = checkOperationRef({
    tenant: { organization: parts[0], account: parts[1] },
    principal: parts[2],
    operation: parts[3],
    operationKey: parts[4],
    session: parts[5],
  })
  if ('failure' in checked) throw new Error('invalid original operation')
  const operation = checked.operation
  if (
    operation.operation !== 'createSession' ||
    !tenantIdEquals(operation.tenant, options.tenant) ||
    operation.operationKey !== input.operationKey ||
    receiptKey(operation) !== row.operation
  )
    throw new Error('invalid original operation binding')
}
export function creationByOperation(unit: StorageUnit, operation: OperationRef) {
  return unit.query(tx =>
    narrow<RuntimeDb>(tx)
      .selectFrom('sr_session_creation')
      .selectAll()
      .where('operation', '=', receiptKey(operation))
      .executeTakeFirst(),
  )
}
export function creationBySession(unit: StorageUnit, session: SessionRef) {
  return unit.query(tx =>
    narrow<RuntimeDb>(tx)
      .selectFrom('sr_session_creation')
      .selectAll()
      .where('session', '=', session)
      .executeTakeFirst(),
  )
}
export async function reserveCreation(
  unit: StorageUnit,
  operation: OperationRef,
  input: CreateSessionInput,
  semantic: string,
  options: RuntimeOptions,
): Promise<{ session: SessionRef; fresh: boolean }> {
  await unit.mutate(tx => tx.lockSentinel('session-creation'))
  const old = await creationByOperation(unit, operation)
  if (old) {
    decodeCreation(old, options)
    if (old.semantic !== semantic) throw new RuntimeRejection('conflict')
    return { session: sessionRef(old.session, options), fresh: false }
  }
  const total = await unit.query(tx =>
    narrow<RuntimeDb>(tx)
      .selectFrom('sr_session_creation')
      .select(eb => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow(),
  )
  if (!Number.isSafeInteger(total.count) || total.count < 0)
    throw new StorageDefect('bad Session count')
  if (total.count >= options.policy.maxSessions) throw new RuntimeRejection('unavailable')
  const session = sessionRef(randomUUID(), options)
  await unit.mutate(tx =>
    narrow<RuntimeDb>(tx)
      .insertInto('sr_session_creation')
      .values({
        operation: receiptKey(operation),
        session,
        input: writeJsonLossless(input as unknown as Parameters<typeof writeJsonLossless>[0]),
        semantic,
        published: 0,
      })
      .execute(),
  )
  return { session, fresh: true }
}
export function publishCreation(unit: StorageUnit, operation: OperationRef) {
  return unit.mutate(tx =>
    narrow<RuntimeDb>(tx)
      .updateTable('sr_session_creation')
      .set({ published: 1 })
      .where('operation', '=', receiptKey(operation))
      .execute(),
  )
}
