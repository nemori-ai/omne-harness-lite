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
  ToolStartRecord,
  ToolResult,
} from '@omne-harness/tool-contract'
import type { ToolRecovery } from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { pageToolResult } from './result-page.ts'
import { factProgress } from './ledger-facts.ts'
import { digestOf, mintEvidence } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import type { CallAccount, ResultRecord } from './ledger-store.ts'

export function lookupCall(snapshot: Snapshot, admission: ToolOperationId): ToolLookup {
  const call = snapshot.call
  if (call !== null && call.admission === admission) return { kind: 'found', state: call.state }
  return { kind: 'not-accepted', operation: admission }
}

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

export function readRecovery(snapshot: Snapshot): Outcome<ToolRecovery, ToolFailure> {
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  const original =
    call.state.phase === 'settled' ? snapshot.results.get(call.state.result) : undefined
  return succeed({
    state: call.state,
    request: call.request,
    admission: call.admission,
    initiator: call.initiator,
    execution: call.execution,
    checkpoint: call.state.phase === 'suspended' ? call.state.checkpoint : null,
    start: call.start,
    startRejection: call.startRejection,
    invocations: invocationChain(snapshot),
    controls: call.state.controls,
    result: original === undefined ? null : { version: original.result, source: original.source },
    unresolved: [],
    preparations: call.preparations,
    waits: [...snapshot.waits.values()].map(wait => wait.record),
    waitRequest: snapshot.waitRequest,
    suspensions: [...snapshot.suspensions.values()].map(entry => entry.suspension),
    checkpointState: snapshot.checkpointState,
    tasks: snapshot.tasks,
    program: null,
    scheduling: null,
    streams: factProgress(snapshot),
  })
}

function invocationChain(snapshot: Snapshot): ToolStartRecord[] {
  const chain: ToolStartRecord[] = []
  let current = snapshot.call?.start ?? null
  while (current !== null && chain.length <= snapshot.suspensions.size) {
    chain.unshift(current)
    if (current.kind !== 'resume') break
    const { checkpoint } = current
    const before = [...snapshot.suspensions.values()].find(
      entry =>
        entry.checkpoint !== null && digestOf(entry.checkpoint.payload) === digestOf(checkpoint),
    )
    current = before?.suspension.start ?? null
  }
  return chain
}

export function readAccount(snapshot: Snapshot): Outcome<CallAccount, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const latest = snapshot.accounts.at(-1)
  if (latest === undefined) return invalid('call', 'no-account')
  return succeed(latest.value)
}
