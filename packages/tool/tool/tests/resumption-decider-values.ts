import { succeed } from '@omne-harness/operation-result'
import type {
  DecisionValue,
  DurableEvidence,
  ToolCallId,
  ToolRevision,
  ToolWaitId,
} from '@omne-harness/tool-contract'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { snapshotOf, type Decision, type Snapshot } from '../src/ledger-decider.ts'
import type { LedgerWrite } from '../src/ledger-store.ts'
import { nextRevision } from '../src/evidence.ts'
import {
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type ResumeInput,
  type Segment,
} from './checkpoint-values.ts'
import { callId, evidence, ok, operationId, principalA, tenantA } from './runtime-values.ts'
import { admitCall, startHarness, testAuthority, type StartHarness } from './start-values.ts'

export const FIRST = 'op-c1/start/wait' as ToolWaitId
export const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
export const CALL = ACCESS.call as ToolCallId

export type CallSnapshot = Snapshot

export function text(value: string) {
  return { kind: 'string', value } as const
}

export const DECISION: DurableEvidence = evidence(`decision/${FIRST}`, 'test-decisions')

export async function snapshotOfCall(harness: StartHarness): Promise<CallSnapshot> {
  const domain = { kind: 'call', tenant: tenantA, call: CALL } as const
  const read = await harness.memory.read(domain)
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  return snapshotOf(domain, read)
}

export function mintOf(snapshot: CallSnapshot) {
  return { revision: nextRevision(snapshot.revision) }
}

export function revisionOf(snapshot: CallSnapshot): ToolRevision {
  if (snapshot.call === null) throw new Error('the snapshot has no call')
  return snapshot.call.state.revision
}

type Commands = StartHarness['commands']
export type Captured = Readonly<{
  planSuspension: { snapshot: CallSnapshot; input: Parameters<Commands['planSuspension']>[0] }[]
  suspend: { snapshot: CallSnapshot; input: Parameters<Commands['suspend']>[0] }[]
  attachRegistration: {
    snapshot: CallSnapshot
    input: Parameters<Commands['attachRegistration']>[0]
  }[]
  closeWait: { snapshot: CallSnapshot; input: Parameters<Commands['closeWait']>[0] }[]
}>

export async function suspendedCall(
  options: Readonly<{ resume?: (input: ResumeInput, count: number) => Promise<Segment> }> = {},
) {
  const memory = createMemoryToolLedgerStore()
  const authority = testAuthority()
  const author = askingAuthor(
    undefined,
    options.resume ?? (() => Promise.resolve(succeed({ kind: 'completed', value: 'done' }))),
  )
  const binding = checkpointBinding(authority, author)
  const bridge = scriptedBridge('registers')
  const before: Captured = {
    planSuspension: [],
    suspend: [],
    attachRegistration: [],
    closeWait: [],
  }
  const harness = startHarness({
    memory,
    authority,
    bindingsPort: () => binding.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    environmentsPort: base =>
      Object.assign(base, {
        release: () =>
          Promise.resolve(
            succeed({ kind: 'released', evidence: evidence('environment-released') }),
          ),
        inspectRelease: () =>
          Promise.resolve(
            succeed({ kind: 'released', evidence: evidence('environment-released') }),
          ),
      }) as never,
    commands: base => ({
      ...base,
      planSuspension: async input => {
        before.planSuspension.push({ snapshot: await snapshotOfCall(harness), input })
        return base.planSuspension(input)
      },
      suspend: async input => {
        before.suspend.push({ snapshot: await snapshotOfCall(harness), input })
        return base.suspend(input)
      },
      attachRegistration: async input => {
        before.attachRegistration.push({ snapshot: await snapshotOfCall(harness), input })
        return base.attachRegistration(input)
      },
      closeWait: async input => {
        before.closeWait.push({ snapshot: await snapshotOfCall(harness), input })
        return base.closeWait(input)
      },
    }),
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  await settle(harness)
  return { harness, bridge, before, author, binding }
}

export type Suspended = Awaited<ReturnType<typeof suspendedCall>>

export async function settle(harness: StartHarness): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

export async function accepted(built: Suspended, value: DecisionValue = { kind: 'declined' }) {
  built.bridge.decide(FIRST, value)
  ok(
    await built.harness.commands.acceptDecision({
      ...ACCESS,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: DECISION,
    }),
  )
  return snapshotOfCall(built.harness)
}

export async function resumePrepared(
  built: Suspended,
  value: DecisionValue = { kind: 'declined' },
) {
  const snapshot = await accepted(built, value)
  const record = snapshot.call
  if (record === null || record.execution === null) throw new Error('the call has no execution')
  const preparation = record.preparations.at(-1)
  if (preparation?.purpose !== 'resume')
    throw new Error('the acceptance planned no resume preparation')
  const write = { ...record.execution, principal: ACCESS.principal }
  ok(
    await built.harness.commands.prepared({
      ...write,
      operation: operationId(`${preparation.operation}/prepared`),
      expected: revisionOf(snapshot),
      preparation,
      resources: evidence('resume-environment'),
    }),
  )
  return snapshotOfCall(built.harness)
}

export async function continued(built: Suspended, value: DecisionValue = { kind: 'declined' }) {
  built.bridge.decide(FIRST, value)
  await built.harness.drive('c1')
  await settle(built.harness)
  const closing = built.before.closeWait[0]
  if (closing === undefined) throw new Error('closeWait was never asked')
  return closing
}

export type Record_ = Readonly<Record<string, unknown>>

export function withCall(snapshot: CallSnapshot, edit: (record: Record_) => Record_): CallSnapshot {
  if (snapshot.call === null) throw new Error('no call')
  return { ...snapshot, call: edit(snapshot.call) as never }
}

export function withState(snapshot: CallSnapshot, changes: Record_): CallSnapshot {
  return withCall(snapshot, record => ({
    ...record,
    state: { ...(record.state as Record_), ...changes },
  }))
}

export function withWait(snapshot: CallSnapshot, wait: string, edit: (record: Record_) => Record_) {
  const waits = new Map(snapshot.waits)
  const found = waits.get(wait)
  if (found === undefined) throw new Error('no such wait')
  waits.set(wait, edit(found) as never)
  return { ...snapshot, waits }
}

export function withWaitRecord(snapshot: CallSnapshot, wait: string, changes: Record_) {
  return withWait(snapshot, wait, found => ({
    ...found,
    record: { ...(found.record as Record_), ...changes },
  }))
}

export function withSuspensions(
  snapshot: CallSnapshot,
  edit: (entries: [string, Record_][]) => [string, Record_][],
): CallSnapshot {
  const entries = [...snapshot.suspensions].map(([key, value]) => [key, value] as [string, Record_])
  return { ...snapshot, suspensions: new Map(edit(entries) as never) }
}

export function withFacts(
  snapshot: CallSnapshot,
  edit: (fact: Record_) => Record_ | null,
): CallSnapshot {
  const facts = new Map<string, never>()
  for (const [key, fact] of snapshot.facts) {
    const edited = edit(fact)
    if (edited !== null) facts.set(key, edited as never)
  }
  return { ...snapshot, facts }
}

export function afterCommit(snapshot: CallSnapshot, writes: readonly LedgerWrite[]): CallSnapshot {
  const operations = new Map(snapshot.operations)
  for (const write of writes)
    if (write.kind === 'put' && write.record.kind === 'operation')
      operations.set(write.record.operation.operation, write.record.operation)
  return { ...snapshot, operations }
}

export function putsOf(writes: readonly LedgerWrite[], kind: string): Record_[] {
  return writes.flatMap(write =>
    write.kind === 'put' && write.record.kind === kind ? [write.record as Record_] : [],
  )
}

export function committed<V>(decision: Decision<V>) {
  if (decision.kind !== 'commit') throw new Error(`not a commit: ${JSON.stringify(decision)}`)
  return decision
}

export function invalidOf(field: string, reason: string) {
  return { failure: { kind: 'invalid', field, reason } }
}

export function replied<V>(decision: Decision<V>) {
  if (decision.kind !== 'reply') throw new Error(`not a reply: ${JSON.stringify(decision)}`)
  return decision.outcome
}
