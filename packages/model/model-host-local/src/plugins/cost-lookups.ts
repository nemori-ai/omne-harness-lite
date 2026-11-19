// One cost question per pending dispatch of a settled call per wake: a found cost becomes the next
// late revision of its account; a miss is counted and the last one gives up.
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
  answer: Exclude<CostLookupAnswer, { kind: 'unavailable' }>,
  maxMisses: number,
): LateDispatchFact {
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

/** One wake over the dispatches of one call. */
type Round = Readonly<{
  call: ModelCallId
  access: Access
  lookup: Lookup
  recordLateFact: ModelCommands<unknown>['recordLateFact']
  stopping: AbortSignal
}>

export function createCostLookups(input: CostLookupsInput) {
  /** One question for one pending dispatch; true while its cost is still owed. */
  async function ask(round: Round, record: DispatchRecord, request: string): Promise<boolean> {
    const { call, access } = round
    const answer = await round.lookup(
      { ...access, call, dispatch: record.dispatch },
      round.stopping,
    )
    if (answer.kind === 'unavailable') {
      input.report({ kind: 'cost-lookup-pending', reason: `unavailable ${answer.diagnostic}` })
      return true
    }
    const fact = factOf(record, answer, input.limits.maxCostMisses)
    const recorded = await round.recordLateFact({
      ...access,
      call,
      dispatch: record.dispatch,
      operation: input.operation(),
      source: lookupSource(request),
      fact,
    })
    if ('failure' in recorded) {
      input.report({ kind: 'cost-lookup-pending', reason: `unrecorded ${recorded.failure.kind}` })
      return true
    }
    return fact.kind === 'cost-miss' && !fact.final
  }
  /** Asks once for each dispatch of the call whose cost is still looked up; true while any is. */
  async function step(
    call: ModelCallId,
    access: Access,
    recordLateFact: ModelCommands<unknown>['recordLateFact'],
    stopping: AbortSignal,
  ): Promise<boolean> {
    const lookup = input.lookup
    if (lookup === undefined) return false
    const records = await input.commands.dispatches({ ...access, call })
    if ('failure' in records) return true
    const round: Round = { call, access, lookup, recordLateFact, stopping }
    let owed = false
    for (const record of records.ok) {
      if (costLookupOf(record) !== 'pending' || record.request === undefined) continue
      if (stopping.aborted) return true
      owed = (await ask(round, record, record.request)) || owed
    }
    return owed
  }
  return { step }
}
