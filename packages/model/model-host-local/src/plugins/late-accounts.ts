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
import type { RuntimeEvent } from './runtime.ts'

type Access = Readonly<{ principal: unknown; tenant: TenantId }>

export type LateAccountsInput = Readonly<{
  commands: Pick<ModelCommands<unknown>, 'dispatches' | 'confirmAccount'>
  report(event: RuntimeEvent): void
  operation(): ModelOperationId
}>

export type UndeliveredAccount = Readonly<{ dispatch: DispatchId; revision: string }>

export function createLateAccounts(input: LateAccountsInput) {
  return {
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
  }
}
