import { historicalExecutionUnavailable } from './history-request.ts'
// The read projections of one domain snapshot: lookup, operation resolution, result pages and the
// call account (P01, P08, P09). They project `not-accepted` or `not-committed` only from a
// complete snapshot; the ledger answers such a negative only after its exclusion fence commits,
// and answers `unavailable` when the read itself failed.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  OperationResolution,
  ResultPage,
  ToolFailure,
  ToolLookup,
  ToolOperationId,
  ToolResultVersion,
  ToolResult,
} from '@omne-harness/tool-contract'
import type { ToolRecovery } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { pageToolResult } from './result-page.ts'
import { factProgress } from './ledger-facts.ts'
import { mintEvidence } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import type { CallAccount, ResultRecord } from './ledger-store.ts'

/**
 * The current call state located by `admission`.
 * An absent admission in a complete snapshot is not accepted.
 */
export function lookupCall(snapshot: Snapshot, admission: ToolOperationId): ToolLookup {
  const call = snapshot.call
  if (call !== null && call.admission === admission) return { kind: 'found', state: call.state }
  return { kind: 'not-accepted', operation: admission }
}

/** The resolution of one operation. The receipt evidence points at the operation record. */
export function resolveOperation(
  snapshot: Snapshot,
  operation: ToolOperationId,
): OperationResolution {
  const record = snapshot.operations.get(operation)
  if (record === undefined) return { kind: 'not-committed' }
  const place = { tenant: record.tenant, call: record.call, operation: record.operation }
  return {
    kind: 'committed',
    revision: record.revision,
    receipt: mintEvidence('operation', place, record.revision, record.receipt),
  }
}

export type PageInput = Readonly<{
  result: ToolResultVersion
  after: string | null
  pageBytes: number
  adoption: Adoption
}>

/** The result record a read names, or why it cannot be read: not settled, or unknown version. */
export function resultRecord(
  snapshot: Snapshot,
  version: ToolResultVersion,
): Outcome<ResultRecord, ToolFailure> {
  if (snapshot.call === null)
    return fail({ kind: 'not-found', target: 'result', reason: 'missing' })
  const record = snapshot.results.get(version)
  if (record !== undefined) return succeed(record)
  if (snapshot.call.state.phase !== 'settled') return fail({ kind: 'not-settled' })
  return fail({ kind: 'not-found', target: 'result', reason: 'missing' })
}

/**
 * One page of a result version (P08). Pages cut between whole content blocks; every page carries
 * the same data, original and attachments of the version; `next` binds tenant, call, version,
 * projection and the next block position.
 */
export function readResultPage<B extends ContentBlock>(
  snapshot: Snapshot,
  input: PageInput,
  value: ToolResult<B>,
): Outcome<ResultPage<B>, ToolFailure> {
  const found = resultRecord(snapshot, input.result)
  if ('failure' in found) return found
  const record = found.ok
  return pageToolResult(
    { ...input, tenant: record.tenant, call: record.call },
    {
      result: record.result,
      terminal: record.terminal,
      effect: record.effect,
      actualTerminal: record.actual,
      relation: record.relation,
      delivery: record.delivery.delivery,
      source: record.source,
      value,
    },
  )
}

/**
 * The complete recovery read of a call (P01 loadRecovery): what the call domain holds of its
 * way to a start, its tasks and its first result. Waits, controls, suspensions, raw outputs,
 * program closure and scheduling are empty until their increments record them. Fact streams
 * project the saved cursor and the original receipts whose source confirmation is pending.
 */
export function readRecovery(snapshot: Snapshot): Outcome<ToolRecovery, ToolFailure> {
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  if (call.requestFormat === 'historical-result') return historicalExecutionUnavailable(call)
  const original =
    call.state.phase === 'settled' ? snapshot.results.get(call.state.result) : undefined
  return succeed({
    state: call.state,
    request: call.request,
    admission: call.admission,
    initiator: call.initiator,
    execution: call.execution,
    checkpoint: null,
    start: call.start,
    startRejection: call.startRejection,
    invocations: call.start === null ? [] : [call.start],
    controls: call.state.controls,
    result: original === undefined ? null : { version: original.result, source: original.source },
    unresolved: [],
    preparations: call.preparations,
    waits: [],
    suspensions: [],
    rawOutputs: [...snapshot.results.values()].flatMap(result =>
      result.custody.kind === 'execution' ? [result.custody.raw] : [],
    ),
    tasks: snapshot.tasks,
    program: null,
    scheduling: null,
    streams: factProgress(snapshot),
  })
}

/** The current account of the call: the latest revision of the one recorded source. */
export function readAccount(snapshot: Snapshot): Outcome<CallAccount, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const latest = snapshot.accounts.at(-1)
  if (latest === undefined) return invalid('call', 'no-account')
  return succeed(latest.value)
}
