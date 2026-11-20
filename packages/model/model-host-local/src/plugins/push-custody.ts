// How the custody of a pushed result ends: acknowledged once its receiver saved it, or abandoned
// once its receiver refused it for good. Neither is tried on a result whose outcome is unknown.
import type { TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence, ModelFailure, ResultVersion } from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { custodyEnded } from './push-values.ts'
import type { ResultPushRecord, RuntimeEvent } from './runtime.ts'

type Access = Readonly<{ principal: unknown; tenant: TenantId }>
type SavedResult = Readonly<{ result: ResultVersion; evidence: DurableEvidence }>
type Refusal = Readonly<{ result: ResultVersion; refusal: 'denied' | 'invalid' | 'conflict' }>

export type CustodyEndInput = Readonly<{
  commands: ModelCommands<unknown>
  maxRedeliveries: number
  stopping: AbortSignal
  report(event: RuntimeEvent): void
  mark(record: ResultPushRecord, failure: ModelFailure): ResultPushRecord
}>

export function savedResultOf(record: ResultPushRecord): SavedResult | null {
  const held = record.result
  if (held === null || held.standing.status !== 'saved') return null
  return { result: held.delivery.key.result, evidence: held.standing.receipt.evidence }
}

function refusalOf(record: ResultPushRecord): Refusal | null {
  const standing = record.result?.standing
  if (record.result === null || standing?.status !== 'failed') return null
  const refusal = standing.failure.failure.kind
  if (refusal !== 'denied' && refusal !== 'invalid' && refusal !== 'conflict') return null
  return { result: record.result.delivery.key.result, refusal }
}

export function createCustodyEnd(input: CustodyEndInput) {
  const { commands, report } = input

  async function handoff(
    record: ResultPushRecord,
    access: Access,
    saved: SavedResult,
  ): Promise<ResultPushRecord['acknowledgement']> {
    const ack = {
      ...access,
      call: record.call,
      operation: record.operations.ack,
      result: saved.result,
      evidence: { kind: 'retained', custody: saved.evidence },
    } as const
    for (let resends = 0; ; resends += 1) {
      const reply = await commands.handoff(ack)
      if ('ok' in reply) return 'acknowledged'
      if (reply.failure.kind !== 'commit-unknown') {
        report({ kind: 'ack-failed', failure: reply.failure.kind })
        return record.acknowledgement
      }
      if (resends >= input.maxRedeliveries || input.stopping.aborted) {
        report({ kind: 'ack-failed', failure: 'commit-unknown' })
        return 'unknown'
      }
    }
  }

  async function abandon(
    record: ResultPushRecord,
    access: Access,
    { result, refusal }: Refusal,
  ): Promise<ResultPushRecord> {
    const reply = await commands.abandon({
      ...access,
      call: record.call,
      operation: record.operations.abandon,
      result,
      basis: { kind: 'refused', refusal },
    })
    if ('ok' in reply) return { ...record, acknowledgement: 'abandoned' }
    report({ kind: 'abandon-failed', failure: reply.failure.kind })
    return input.mark(record, reply.failure)
  }

  return {
    async end(record: ResultPushRecord, access: Access): Promise<ResultPushRecord> {
      if (custodyEnded(record.acknowledgement)) return record
      const refused = refusalOf(record)
      if (refused !== null) return abandon(record, access, refused)
      const saved = savedResultOf(record)
      if (saved === null) return record
      return { ...record, acknowledgement: await handoff(record, access, saved) }
    },
  }
}
