import {
  SettingsSourceReplySchema,
  SettingsSourceReceiptSchema,
  type SettingsSourceRequest,
  type createSettingsSourceReservations,
} from '@omne-harness/settings-local/preparation'
import type { SettingsFailure } from '@omne-harness/settings'
import type { OperationObservation } from './operation-read.ts'
import { bindingSchema, type OperationBinding } from './operation-schema.ts'
import type { SourceCustody, SourceReceipt } from './source-custody.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import { equal } from './encoding.ts'
import { isTerminal } from './registrar-results.ts'

export type GovernanceSourceReservations<Context> = ReturnType<
  typeof createSettingsSourceReservations<Context>
>['service']
export type SourceProgress =
  | Exclude<SourceCustody, { kind: 'requested' }>
  | SettingsFailure
  | Exclude<OperationObservation, { kind: 'found' }>
  | { kind: 'unavailable'; owner: 'settings-source' | 'identity-standing' | 'sql-coordination' }
const unavailable = (owner: 'settings-source' | 'identity-standing' | 'sql-coordination') => ({
  kind: 'unavailable' as const,
  owner,
})

export class GovernanceSourceCoordinator<Context> {
  private readonly sql: SqlOperationCoordinator
  private readonly source: GovernanceSourceReservations<Context> | undefined
  constructor(sql: SqlOperationCoordinator, source?: GovernanceSourceReservations<Context>) {
    this.sql = sql
    this.source =
      source === undefined
        ? undefined
        : {
            reserve: source.reserve.bind(source),
            settle: source.settle.bind(source),
          }
  }
  private async store(
    operation: OperationBinding,
    receipt: SourceReceipt,
  ): Promise<SourceProgress> {
    const result = await this.sql.executeControl(
      operation,
      receipt.kind === 'held'
        ? { kind: 'source-held', binding: operation, receipt }
        : { kind: 'source-settled', binding: operation, receipt },
    )
    if (result.kind !== 'applied') return unavailable('sql-coordination')
    const stored = SettingsSourceReceiptSchema.safeParse(result.response)
    if (!stored.success || !equal(stored.data.request, receipt.request))
      return unavailable('sql-coordination')
    const current = await this.sql.observe(operation)
    if (current.kind !== 'found') return current
    return current.source.kind === 'held' || current.source.kind === 'settled'
      ? current.source
      : unavailable('sql-coordination')
  }
  private async receive(
    operation: OperationBinding,
    request: SettingsSourceRequest,
    call: () => Promise<unknown>,
  ): Promise<SourceProgress> {
    let reply: unknown
    try {
      reply = await call()
    } catch {
      return unavailable('settings-source')
    }
    const parsed = SettingsSourceReplySchema.safeParse(reply)
    if (!parsed.success) return unavailable('settings-source')
    if (parsed.data.kind === 'rejected') return parsed.data
    if (!equal(parsed.data.request, request)) return unavailable('settings-source')
    return this.store(operation, parsed.data)
  }
  async reserve(raw: OperationBinding, context: Context): Promise<SourceProgress> {
    const operation = bindingSchema.parse(raw)
    const current = await this.sql.observe(operation)
    if (current.kind !== 'found') return current
    const custody = current.source
    if (custody.kind === 'not-required' || custody.kind === 'settled') return custody
    if (isTerminal(current.record)) return this.settle(operation)
    if (custody.kind === 'held') return custody
    if (current.standing?.kind !== 'held') return unavailable('identity-standing')
    const source = this.source
    if (source === undefined) return unavailable('settings-source')
    return this.receive(operation, custody.request, () => source.reserve(context, custody.request))
  }
  async settle(raw: OperationBinding): Promise<SourceProgress> {
    const operation = bindingSchema.parse(raw)
    const current = await this.sql.observe(operation)
    if (current.kind !== 'found') return current
    const custody = current.source
    if (custody.kind === 'not-required' || custody.kind === 'settled') return custody
    const source = this.source
    if (source === undefined) return unavailable('settings-source')
    return this.receive(operation, custody.request, () => source.settle(custody.request))
  }
}
