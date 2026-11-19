// The late accounts of a call the consumer has not confirmed it saved: which they are, by the
// durable record of each dispatch, and the confirmation once the consumer gave its receipt.
import type { TenantId } from '@omne-harness/legal-identity'
import {
  accountUndelivered,
  type DispatchId,
  type DurableEvidence,
  type ModelCallId,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { tenantCodec } from '@omne-harness/legal-identity'
import { savedResultOf } from './push-custody.ts'
import type { ResultPushRecord, RuntimeEvent } from './runtime.ts'

type Access = Readonly<{ principal: unknown; tenant: TenantId }>

export type LateAccountsInput = Readonly<{
  commands: Pick<ModelCommands<unknown>, 'dispatches' | 'confirmAccount'>
  report(event: RuntimeEvent): void
  operation(): ModelOperationId
  /** The places of the late accounts the push holds, by key; a held account takes one. */
  reservations: Map<string, string>
  maxPending: number
  hold(
    target: Target,
    dispatch: DispatchId,
    revision: string,
    reservation: string,
  ): Promise<boolean>
}>

export type UndeliveredAccount = Readonly<{ dispatch: DispatchId; revision: string }>
type Target = Readonly<{ tenant: TenantId; call: ModelCallId }>

export function createLateAccounts(input: LateAccountsInput) {
  const late = {
    async undelivered(call: ModelCallId, access: Access): Promise<readonly UndeliveredAccount[]> {
      const records = await input.commands.dispatches({ ...access, call })
      if ('failure' in records) return []
      return records.ok.flatMap(record =>
        accountUndelivered(record) && record.account !== null
          ? [{ dispatch: record.dispatch, revision: record.account.revision }]
          : [],
      )
    },
    async confirm(
      access: Access,
      call: ModelCallId,
      account: UndeliveredAccount,
      receipt: DurableEvidence,
    ): Promise<void> {
      const reply = await input.commands.confirmAccount({
        ...access,
        call,
        operation: input.operation(),
        ...account,
        receipt,
      })
      if ('failure' in reply)
        input.report({ kind: 'late-account-unconfirmed', failure: reply.failure.kind })
    },
    /** One the acknowledged result carried is confirmed by its receipt; any other is held again. */
    async redeliver(target: Target, access: Access, record: ResultPushRecord | undefined) {
      const tenant = tenantCodec.encode(target.tenant)
      if (!tenant.ok) return
      const saved = record?.acknowledgement === 'acknowledged' ? savedResultOf(record) : null
      for (const item of await late.undelivered(target.call, access)) {
        const carried = record?.result?.delivery.accounts.some(
          held => held.dispatch === item.dispatch && held.account?.revision === item.revision,
        )
        if (carried === true && saved !== null) {
          await late.confirm(access, target.call, item, saved.evidence)
          continue
        }
        const reservation = JSON.stringify([tenant.value, 'again', item.dispatch])
        const { reservations } = input
        if (reservations.has(reservation) || reservations.size >= input.maxPending) continue
        reservations.set(reservation, tenant.value)
        if (!(await input.hold(target, item.dispatch, item.revision, reservation)))
          reservations.delete(reservation)
      }
    },
  }
  return late
}
