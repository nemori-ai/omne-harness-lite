// The after-the-fact cost lookup of the dispatches of one settled call, one question per pending
// dispatch per wake. A found cost goes in as the next revision of the dispatch's account, marked
// late, through the late-fact entry that delivers it; a miss is counted and the last one gives up;
// an unavailable answer only owes another wake.
import { createHash } from 'node:crypto'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  costLookupOf,
  type DispatchRecord,
  type DurableEvidence,
  type ModelCallId,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type {
  CostLookupAnswer,
  LateDispatchFact,
  ModelCommands,
  ModelSendBoundary,
} from '@omne-harness/model-contract/provider'
import type { RuntimeEvent } from './runtime.ts'

type Access = Readonly<{ principal: unknown; tenant: TenantId }>
type Lookup = NonNullable<ModelSendBoundary<unknown>['lookupCost']>

export const COST_LOOKUP_OWNER = 'model-cost-lookup'

export type CostLookupsInput = Readonly<{
  commands: Pick<ModelCommands<unknown>, 'dispatches'>
  lookup?: Lookup | undefined
  limits: Readonly<{ maxCostMisses: number }>
  report(event: RuntimeEvent): void
  operation(): ModelOperationId
}>

/** The source a looked-up fact brings: the upstream's id of the request, which the evidence checks. */
export function lookupSource(request: string): DurableEvidence {
  const digest = createHash('sha256').update(request).digest('hex')
  return { owner: COST_LOOKUP_OWNER, record: request, revision: '1', digest }
}

function factOf(
  record: DispatchRecord,
  answer: CostLookupAnswer,
  maxMisses: number,
): LateDispatchFact | null {
  if (answer.kind === 'unavailable') return null
  if (answer.kind === 'found') {
    const revision = record.account === null ? '1' : String(BigInt(record.account.revision) + 1n)
    return {
      kind: 'account',
      event: 'cost-lookup',
      value: {
        usage: [],
        cost: answer.cost,
        trimmed: { state: 'unknown', unit: 'token' },
        place: answer.place,
        duration: { state: 'unknown' },
        revision,
      },
    }
  }
  const misses = (record.lookup?.misses ?? 0) + 1
  const final = answer.kind === 'unsupported' || misses >= maxMisses
  return { kind: 'cost-miss', event: `miss-${misses}`, final }
}

export function createCostLookups(input: CostLookupsInput) {
  /** Asks once for each dispatch of the call whose cost is still looked up; true while any is. */
  async function step(
    call: ModelCallId,
    access: Access,
    recordLateFact: ModelCommands<unknown>['recordLateFact'],
    stopping: AbortSignal,
  ): Promise<boolean> {
    if (input.lookup === undefined) return false
    const records = await input.commands.dispatches({ ...access, call })
    if ('failure' in records) return true
    let owed = false
    for (const record of records.ok) {
      if (costLookupOf(record) !== 'pending' || record.request === undefined) continue
      if (stopping.aborted) return true
      const answer = await input.lookup({ ...access, call, dispatch: record.dispatch }, stopping)
      const fact = factOf(record, answer, input.limits.maxCostMisses)
      if (fact === null) {
        input.report({
          kind: 'cost-lookup-pending',
          reason: `unavailable ${answer.kind === 'unavailable' ? answer.diagnostic : ''}`,
        })
        owed = true
        continue
      }
      const recorded = await recordLateFact({
        ...access,
        call,
        dispatch: record.dispatch,
        operation: input.operation(),
        source: lookupSource(record.request),
        fact,
      })
      if ('failure' in recorded) {
        input.report({ kind: 'cost-lookup-pending', reason: `unrecorded ${recorded.failure.kind}` })
        owed = true
      } else if (fact.kind === 'cost-miss' && !fact.final) owed = true
    }
    return owed
  }
  return { step }
}
