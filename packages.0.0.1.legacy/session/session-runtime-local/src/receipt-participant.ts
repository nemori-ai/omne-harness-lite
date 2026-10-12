import {
  operationRefEquals,
  type CoordinationAuthority,
  type OperationRef,
  type Receipt,
} from '@omne-harness-lite/session-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { sourceTokenEquals } from '@omne-harness-lite/session-log'
import type { LocalOperationReceipts, ReceiptOptions } from './receipt-types.ts'
import {
  receiptPolicy,
  receiptOperation,
  receiptKey,
  receiptDigest,
  receiptValue,
} from './receipt-values.ts'
import { InvalidStateInput } from './state-values.ts'

interface ReceiptRow {
  operation: string
  semantic: string
  receipt: string
}
interface ReceiptDb {
  sr_operation_receipt: ReceiptRow
}

/** The caller owns commit, rollback and recognition after an unknown public commit. */
export function createLocalOperationReceipts(options: ReceiptOptions): LocalOperationReceipts {
  return new ReceiptParticipant(
    Object.freeze({
      ...options,
      tenant: Object.freeze({ ...options.tenant }),
      policy: receiptPolicy(options.policy),
    }),
  )
}
class ReceiptParticipant implements LocalOperationReceipts {
  constructor(readonly options: ReceiptOptions) {}
  readIn: LocalOperationReceipts['readIn'] = async (unit, authority, requested) => {
    unit.assertStorage(this.options.storage)
    try {
      const operation = receiptOperation(requested)
      const denied = await this.#authorize(unit, authority, operation, 'read')
      if (denied) return denied
      const stored = await this.#read(unit, operation)
      return stored ? { kind: 'present', ...stored } : { kind: 'absent' }
    } catch (error) {
      if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
      throw error
    }
  }
  stageIn: LocalOperationReceipts['stageIn'] = async (
    unit,
    authority,
    semanticDigest,
    requested,
  ) => {
    unit.assertStorage(this.options.storage)
    try {
      const receipt = receiptValue(requested, this.options.policy),
        semantic = receiptDigest(semanticDigest)
      const text = this.#recordText(semantic, receipt)
      const denied = await this.#authorize(unit, authority, receipt.operation, 'write')
      if (denied) return denied
      const previous = await this.#read(unit, receipt.operation)
      if (previous)
        return previous.semanticDigest === semantic
          ? { kind: 'staged', receipt: previous.receipt }
          : { failure: 'identityConflict' }
      return await this.#insert(unit, semantic, receipt, text)
    } catch (error) {
      if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
      throw error
    }
  }
  async #authorize(
    unit: StorageUnit,
    authority: CoordinationAuthority,
    operation: OperationRef,
    mode: 'read' | 'write',
  ) {
    if (!this.options.isOpen()) return { failure: 'unavailable' as const }
    if (!tenantIdEquals(operation.tenant, this.options.tenant))
      return { failure: 'denied' as const }
    await unit.mutate(tx =>
      tx.lockSentinel(
        `session-operation:${JSON.stringify([operation.tenant.organization, operation.tenant.account])}`,
      ),
    )
    const decision = await this.options.authority.authorize(unit, authority, operation, mode)
    if ('failure' in decision) return decision
    if (decision.kind !== 'authorized') throw new TypeError('invalid receipt authority decision')
    return undefined
  }
  async #read(unit: StorageUnit, operation: OperationRef) {
    const row = await unit.query(tx =>
      narrow<ReceiptDb>(tx)
        .selectFrom('sr_operation_receipt')
        .selectAll()
        .where('operation', '=', receiptKey(operation))
        .executeTakeFirst(),
    )
    if (!row) return undefined
    try {
      const data = readJsonStrict(row.receipt)
      if ('failed' in data) throw new InvalidStateInput()
      const receipt = receiptValue(data.ok, this.options.policy),
        semanticDigest = receiptDigest(row.semantic)
      if (!operationRefEquals(receipt.operation, operation)) throw new InvalidStateInput()
      this.#recordText(semanticDigest, receipt)
      return { semanticDigest, receipt }
    } catch (error) {
      if (error instanceof InvalidStateInput)
        throw new StorageDefect('corrupt local operation receipt')
      throw error
    }
  }
  #recordText(semantic: string, receipt: Receipt): string {
    const copied = writeJsonLossless(receipt as unknown as Parameters<typeof writeJsonLossless>[0])
    if (
      Buffer.byteLength(copied) + Buffer.byteLength(semantic) >
      this.options.policy.maxRecordBytes
    )
      throw new InvalidStateInput()
    return copied
  }
  async #insert(unit: StorageUnit, semantic: string, receipt: Receipt, text: string) {
    const scope = { tenant: receipt.source.tenant, session: receipt.source.session }
    const source = await this.options.log.sourceIn(unit, this.options.logAuthority, scope)
    if ('failure' in source) return source
    if (!sourceTokenEquals(source.source, receipt.source))
      return { failure: 'invalidInput' as const }
    const total = await unit.query(tx =>
      narrow<ReceiptDb>(tx)
        .selectFrom('sr_operation_receipt')
        .select(eb => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
    )
    if (!Number.isSafeInteger(total.count) || total.count < 0)
      throw new StorageDefect('invalid local operation receipt count')
    if (total.count >= this.options.policy.maxRecords) return { failure: 'unavailable' as const }
    await unit.mutate(tx =>
      narrow<ReceiptDb>(tx)
        .insertInto('sr_operation_receipt')
        .values({ operation: receiptKey(receipt.operation), semantic, receipt: text })
        .execute(),
    )
    return { kind: 'staged' as const, receipt }
  }
}
