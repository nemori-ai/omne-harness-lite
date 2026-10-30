// The AgentJournalEntries conformance suite (SPEC "日志条目", J01, J02, J40) and a non-durable double
// that passes it. The double keeps one record per (tenant, execution), so the same execution text
// in two tenants is two executions, and an execution of another tenant answers as one that does
// not exist.
import assert from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import type { RequiredReceivedCommits } from './testing-received-fixture.ts'
import { receivedCommitConformance } from './testing-received-conformance.ts'
import type { TenantId } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Failure } from './evaluation.ts'
import type { AgentEvent, CommandReceipt } from './execution.ts'
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeExecutionAttachmentId,
  decodeExecutionRevision,
  judgeAdoption,
  type Access,
  type AgentExecutionId,
  type AgentOperationId,
  type Authority,
  type DurableEvidence,
} from './identity.ts'
import type {
  AgentJournalEntries,
  AgentJournalEntry,
  JournalEntryRecord,
  ReceivedEntry,
  StartFenceEntry,
} from './receiving.ts'
import {
  canonicalText,
  doubleEvidence,
  projectEntryEvent,
  tenantText,
  uncoveredCase,
  type ConformanceCase,
} from './testing-case.ts'

import {
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
  sampleStartFence,
} from './testing-journal-samples.ts'
export {
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
  sampleStartFence,
} from './testing-journal-samples.ts'

const OWNER = 'agentJournalEntries'

type Execution = {
  authority: Authority
  /** Whether the current attachment has been detached; it stays the latest established one. */
  detached: boolean
  ended: boolean
  revision: number
  readonly entries: AgentJournalEntry[]
  readonly events: AgentEvent[]
  readonly operations: Map<string, Readonly<{ text: string; receipt: CommandReceipt }>>
  readonly deliveries: Map<string, Readonly<{ text: string; receipt: CommandReceipt }>>
  /** The scripted faults of this execution, used in order by the record calls that write. */
  readonly recordFaults: RecordFault[]
}

/** A non-durable double of the receiving entries port. It must not be assembled into production. */
export interface MemoryAgentJournalEntries<P> extends AgentJournalEntries<P> {
  readonly durability: 'none'
  /** Opens one execution of `tenant` under its current attachment. */
  open(input: Readonly<{ tenant: TenantId; authority: Authority }>): void
  /** Gives the execution a new current attachment. The previous Authority is superseded. */
  supersede(input: Readonly<{ tenant: TenantId; authority: Authority }>): void
  /** Detaches the current attachment. It stays the latest established one; advancing stops. */
  detach(input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>): void
  /** Ends the execution. */
  end(input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>): void
  /**
   * Scripts the fault of the next `record` call on this execution that reaches its write step.
   * A refused call and a call that recalls an original receipt do not reach that step and leave
   * the fault in place. Faults are used in order.
   */
  failNextRecord(
    input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
    fault: RecordFault,
  ): void
  /** The committed entries in commit order, as `ExecutionSnapshot.entries` gives them. */
  entries(
    input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  ): readonly AgentJournalEntry[] | undefined
  /** The events of the execution in sequence order, as `AgentJournal.read` gives them. */
  events(
    input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  ): readonly AgentEvent[] | undefined
}

const keyOf = (tenant: TenantId, execution: AgentExecutionId) =>
  `${tenantText(tenant)}\u0000${execution}`

const sameAttachment = (left: Authority, right: Authority) =>
  left.executionAttachment === right.executionAttachment && left.generation === right.generation

/** Whether the call reference of a received delivery belongs to `tenant`. */
function deliveryTenantFits(entry: ReceivedEntry, tenant: TenantId): boolean {
  const { delivery } = entry
  if (delivery.producer === 'model') {
    return 'ok' in resolveModelInvocationRef(delivery.key.reference, tenant)
  }
  return 'ok' in resolveToolInvocationRef(delivery.key.reference, tenant)
}

function denied(): Outcome<never, Failure> {
  return fail({ kind: 'denied', action: 'record' })
}

/** Creates the double. Every execution starts with `open`. */
export function createMemoryAgentJournalEntries<P>(): MemoryAgentJournalEntries<P> {
  const executions = new Map<string, Execution>()

  /**
   * The write step of a record call. The scripted fault of the execution is used here and nowhere
   * else: `unavailable` fails before anything is written, `commit-unknown` writes as usual and
   * loses only the reply.
   */
  const write = (
    execution: Execution,
    input: JournalEntryRecord<P>,
    text: string,
  ): Outcome<CommandReceipt, Failure> => {
    const fault = execution.recordFaults.shift()
    if (fault?.kind === 'unavailable') {
      return fail({ kind: 'unavailable', owner: OWNER, diagnostic: 'scripted before the write' })
    }
    execution.revision += 1
    const revision = String(execution.revision)
    const decoded = decodeExecutionRevision(revision)
    if (!('ok' in decoded)) throw new TypeError('the double minted an invalid revision')
    const record = `${keyOf(input.tenant, input.execution)}\u0000${revision}`
    const receipt: CommandReceipt = Object.freeze({
      operation: input.operation,
      execution: input.execution,
      revision: decoded.ok,
      evidence: doubleEvidence(OWNER, record, revision),
      state: 'applied',
    })
    execution.entries.push(structuredClone(input.entry))
    // The entry event belongs to the same write (SPEC "日志条目" 6).
    projectEntryEvent(execution, input.entry, receipt)
    execution.operations.set(input.operation, { text, receipt })
    if (input.entry.kind === 'received') {
      const key = canonicalText({
        producer: input.entry.delivery.producer,
        key: input.entry.delivery.key,
      })
      execution.deliveries.set(key, { text: canonicalText(input.entry), receipt })
    }
    return fault === undefined
      ? succeed(receipt)
      : fail({ kind: 'commit-unknown', operation: input.operation })
  }

  const record = async (input: JournalEntryRecord<P>) => {
    const execution = executions.get(keyOf(input.tenant, input.execution))
    // An execution of another tenant and one that does not exist answer the same.
    if (execution === undefined) return denied()
    const { entry } = input
    if (entry.kind === 'received' && !deliveryTenantFits(entry, input.tenant)) return denied()
    const text = canonicalText({ authority: input.authority, entry })
    const earlier = execution.operations.get(input.operation)
    if (earlier !== undefined) {
      return earlier.text === text
        ? succeed(earlier.receipt)
        : fail<Failure>({ kind: 'conflict', operation: input.operation })
    }
    const advancing = entry.kind !== 'received'
    if (advancing !== (input.authority !== null)) {
      return fail<Failure>({ kind: 'invalid', field: 'authority', reason: 'mismatch' })
    }
    if (entry.kind === 'received') {
      const key = canonicalText({ producer: entry.delivery.producer, key: entry.delivery.key })
      const seen = execution.deliveries.get(key)
      if (seen !== undefined) {
        return seen.text === canonicalText(entry)
          ? succeed(seen.receipt)
          : fail<Failure>({ kind: 'conflict', operation: input.operation })
      }
      return write(execution, input, text)
    }
    if (execution.ended) return fail<Failure>({ kind: 'terminal' })
    if (
      input.authority === null ||
      execution.detached ||
      !sameAttachment(input.authority, execution.authority)
    ) {
      return fail<Failure>({ kind: 'stale-advance' })
    }
    return write(execution, input, text)
  }

  return {
    durability: 'none',
    record,
    open({ tenant, authority }) {
      const key = keyOf(tenant, authority.execution)
      if (executions.has(key)) throw new TypeError('the execution is already open')
      executions.set(key, {
        authority,
        detached: false,
        ended: false,
        revision: 0,
        entries: [],
        events: [],
        operations: new Map(),
        deliveries: new Map(),
        recordFaults: [],
      })
    },
    supersede({ tenant, authority }) {
      const execution = executions.get(keyOf(tenant, authority.execution))
      if (execution === undefined) throw new TypeError('the execution is not open')
      execution.authority = authority
      execution.detached = false
    },
    detach({ tenant, execution }) {
      const record = executions.get(keyOf(tenant, execution))
      if (record === undefined) throw new TypeError('the execution is not open')
      record.detached = true
    },
    end({ tenant, execution }) {
      const record = executions.get(keyOf(tenant, execution))
      if (record === undefined) throw new TypeError('the execution is not open')
      record.ended = true
    },
    failNextRecord({ tenant, execution }, fault) {
      const record = executions.get(keyOf(tenant, execution))
      if (record === undefined) throw new TypeError('the execution is not open')
      record.recordFaults.push(fault)
    },
    entries({ tenant, execution }) {
      const record = executions.get(keyOf(tenant, execution))
      return record === undefined ? undefined : structuredClone(record.entries)
    },
    events({ tenant, execution }) {
      const record = executions.get(keyOf(tenant, execution))
      return record === undefined ? undefined : structuredClone(record.events)
    },
  }
}

/**
 * The scripted fault of one `record` call that reaches its write step. `commit-unknown` with
 * outcome `applied`: the write takes effect, only the reply is lost. `unavailable`: the call
 * fails before publication and leaves neither the entry nor its event.
 */
export type RecordFault =
  | Readonly<{ kind: 'commit-unknown'; outcome: 'applied' }>
  | Readonly<{ kind: 'unavailable' }>

/**
 * What the suite needs from a provider. `access` and `otherAccess` belong to two different
 * tenants. `open` opens a new execution of the tenant of the access under the given execution
 * text and returns its current Authority. `supersede` gives it a new current attachment, `end`
 * ends it, and `read` returns `ExecutionSnapshot.entries` as load gives it. `events` returns
 * every event of the execution in sequence order, as `AgentJournal.read` gives them, and
 * `undefined` for an execution that does not exist, as `read` does; the projection cases
 * (SPEC "日志条目" 6) read it, so a provider without it does not pass the suite.
 *
 * Two controls are optional. `detach` detaches the current attachment without ending the
 * execution, as `AgentJournalAttachment.detach` does. `failNextRecord` scripts the next `record`
 * call on that execution that reaches its write step, see `RecordFault`; a refused call and a
 * call that recalls an original receipt do not use the fault. The suite awaits it before the
 * record it scripts. A fixture without one of them gets the case that needs it marked
 * `uncovered`; that case rejects, it does not pass.
 */
export interface AgentJournalEntriesFixture<P> {
  readonly entries: AgentJournalEntries<P>
  readonly access: Access<P>
  readonly otherAccess: Access<P>
  open(access: Access<P>, execution: AgentExecutionId): Promise<Authority>
  supersede(access: Access<P>, execution: AgentExecutionId): Promise<Authority>
  end(access: Access<P>, execution: AgentExecutionId): Promise<void>
  read(
    access: Access<P>,
    execution: AgentExecutionId,
  ): Promise<readonly AgentJournalEntry[] | undefined>
  events(access: Access<P>, execution: AgentExecutionId): Promise<readonly AgentEvent[] | undefined>
  detach?(access: Access<P>, execution: AgentExecutionId): Promise<void>
  failNextRecord?(access: Access<P>, execution: AgentExecutionId, fault: RecordFault): Promise<void>
}

function identity<T>(decoded: Outcome<T, unknown>, what: string): T {
  if (!('ok' in decoded)) throw new TypeError(`the suite value ${what} is invalid`)
  return decoded.ok
}

const executionId = (name: string) => identity(decodeAgentExecutionId(`exec-${name}`), name)
const operationId = (name: string): AgentOperationId =>
  identity(decodeAgentOperationId(`op-${name}`), name)
const evidence = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: 'd',
})

async function recorded(
  answer: Promise<Outcome<CommandReceipt, Failure>>,
  what: string,
): Promise<CommandReceipt> {
  const outcome = await answer
  assert.ok('ok' in outcome, `${what} should succeed, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

async function refused(
  answer: Promise<Outcome<CommandReceipt, Failure>>,
  kind: Failure['kind'],
  what: string,
): Promise<Failure> {
  const outcome = await answer
  assert.ok('failure' in outcome, `${what} should fail with ${kind}`)
  assert.equal(outcome.failure.kind, kind, `${what} should fail with ${kind}`)
  return outcome.failure
}

/** The cases that a provider of `AgentJournalEntries` passes. */
export function agentJournalEntriesConformance<P, B extends ContentBlock = ContentBlock>(
  fixture: AgentJournalEntriesFixture<P>,
  profile?: RequiredReceivedCommits<P, B>,
): readonly ConformanceCase[] {
  const jointCases = profile === undefined ? [] : receivedCommitConformance(fixture, profile)
  const { entries, access, otherAccess } = fixture
  const record = (input: JournalEntryRecord<P>) => entries.record(input)
  const advancing = (
    who: Access<P>,
    execution: AgentExecutionId,
    authority: Authority,
    operation: AgentOperationId,
    entry: StartFenceEntry,
  ) => record({ ...who, execution, operation, authority, entry })
  const receiving = (
    who: Access<P>,
    execution: AgentExecutionId,
    operation: AgentOperationId,
    entry: ReceivedEntry,
  ) => record({ ...who, execution, operation, authority: null, entry })
  /** The events of an execution the suite opened; an absent list is a defect of the fixture. */
  const eventsOf = async (execution: AgentExecutionId): Promise<readonly AgentEvent[]> => {
    const events = await fixture.events(access, execution)
    assert.ok(events !== undefined, 'the fixture should list the events of an open execution')
    return events
  }
  const unchangedEvents = async (
    execution: AgentExecutionId,
    before: readonly AgentEvent[],
    what: string,
  ) => assert.deepEqual(await eventsOf(execution), before, `${what} should allocate no event`)

  return [
    ...jointCases,
    {
      name: 'records an advancing entry under the current Authority and lists it',
      async run() {
        const execution = executionId('current')
        const authority = await fixture.open(access, execution)
        const entry = sampleStartFence('current')
        const receipt = await recorded(
          advancing(access, execution, authority, operationId('current'), entry),
          'record',
        )
        assert.equal(receipt.operation, operationId('current'))
        assert.equal(receipt.execution, execution)
        assert.deepEqual(await fixture.read(access, execution), [entry])
      },
    },
    {
      name: 'recalls the same operation with the same entry and refuses another entry',
      async run() {
        const execution = executionId('recall')
        const authority = await fixture.open(access, execution)
        const operation = operationId('recall')
        const first = await recorded(
          advancing(access, execution, authority, operation, sampleStartFence('a')),
          'first record',
        )
        const again = await recorded(
          advancing(access, execution, authority, operation, sampleStartFence('a')),
          'same record',
        )
        assert.deepEqual(again, first)
        await refused(
          advancing(access, execution, authority, operation, sampleStartFence('b')),
          'conflict',
          'same operation with another entry',
        )
        assert.equal((await fixture.read(access, execution))?.length, 1)
      },
    },
    {
      name: 'returns stale-advance to a superseded attachment and writes nothing',
      async run() {
        const execution = executionId('stale')
        const old = await fixture.open(access, execution)
        await fixture.supersede(access, execution)
        const before = await eventsOf(execution)
        await refused(
          advancing(access, execution, old, operationId('stale'), sampleStartFence('stale')),
          'stale-advance',
          'record under a superseded Authority',
        )
        assert.deepEqual(await fixture.read(access, execution), [])
        await unchangedEvents(execution, before, 'a stale-advance record')
      },
    },
    {
      name: 'refuses an advancing entry without an Authority',
      async run() {
        const execution = executionId('no-authority')
        await fixture.open(access, execution)
        const before = await eventsOf(execution)
        const failure = await refused(
          record({
            ...access,
            execution,
            operation: operationId('no-authority'),
            authority: null,
            entry: sampleStartFence('x'),
          } as unknown as JournalEntryRecord<P>),
          'invalid',
          'start-fence without an Authority',
        )
        assert.equal(failure.kind === 'invalid' && failure.field, 'authority')
        await unchangedEvents(execution, before, 'an invalid record')
      },
    },
    {
      name: 'denies another tenant as it denies an execution that does not exist',
      async run() {
        const execution = executionId('foreign')
        const authority = await fixture.open(access, execution)
        const before = await eventsOf(execution)
        const foreign = await refused(
          advancing(otherAccess, execution, authority, operationId('f'), sampleStartFence('f')),
          'denied',
          'record from another tenant',
        )
        const missing = await refused(
          advancing(
            access,
            executionId('missing'),
            authority,
            operationId('m'),
            sampleStartFence('m'),
          ),
          'denied',
          'record on an execution that does not exist',
        )
        assert.deepEqual(foreign, missing)
        assert.deepEqual(await fixture.read(access, execution), [])
        await unchangedEvents(execution, before, 'a denied record')
      },
    },
    {
      name: 'keeps the same execution text in two tenants as two executions',
      async run() {
        const execution = executionId('twin')
        const mine = await fixture.open(access, execution)
        const theirs = await fixture.open(otherAccess, execution)
        await recorded(
          advancing(access, execution, mine, operationId('twin'), sampleStartFence('mine')),
          'record in the first tenant',
        )
        await recorded(
          advancing(
            otherAccess,
            execution,
            theirs,
            operationId('twin'),
            sampleStartFence('theirs'),
          ),
          'record in the second tenant',
        )
        assert.deepEqual(await fixture.read(access, execution), [sampleStartFence('mine')])
        assert.deepEqual(await fixture.read(otherAccess, execution), [sampleStartFence('theirs')])
      },
    },
    {
      name: 'writes received without an attachment, also after takeover and after the end',
      async run() {
        const execution = executionId('custody')
        const authority = await fixture.open(access, execution)
        await fixture.supersede(access, execution)
        await recorded(
          receiving(
            access,
            execution,
            operationId('r1'),
            sampleReceivedModelResult(access.tenant, 'r1'),
          ),
          'received after takeover',
        )
        await fixture.end(access, execution)
        await recorded(
          receiving(
            access,
            execution,
            operationId('r2'),
            sampleReceivedModelResult(access.tenant, 'r2'),
          ),
          'received after the end',
        )
        const before = await eventsOf(execution)
        await refused(
          advancing(access, execution, authority, operationId('late'), sampleStartFence('late')),
          'terminal',
          'start-fence after the end',
        )
        await unchangedEvents(execution, before, 'a terminal record')
      },
    },
    {
      name: 'recognizes a delivery by its key and refuses the same key with other content',
      async run() {
        const execution = executionId('key')
        await fixture.open(access, execution)
        const entry = sampleReceivedModelResult(access.tenant, 'key')
        const first = await recorded(
          receiving(access, execution, operationId('k1'), entry),
          'first push',
        )
        const again = await recorded(
          receiving(access, execution, operationId('k2'), entry),
          'repeated push',
        )
        assert.deepEqual(again, first, 'a repeated push should recall the original receipt')
        await refused(
          receiving(
            access,
            execution,
            operationId('k3'),
            sampleReceivedModelResult(access.tenant, 'key', '7'),
          ),
          'conflict',
          'same key with another account',
        )
        assert.equal((await fixture.read(access, execution))?.length, 1)
      },
    },
    {
      name: 'denies a received delivery whose call reference names another tenant',
      async run() {
        const execution = executionId('wrong-call')
        await fixture.open(access, execution)
        const before = await eventsOf(execution)
        await refused(
          receiving(
            access,
            execution,
            operationId('wrong-call'),
            sampleReceivedModelResult(otherAccess.tenant, 'wrong-call'),
          ),
          'denied',
          'received with a call of another tenant',
        )
        assert.deepEqual(await fixture.read(access, execution), [])
        await unchangedEvents(execution, before, 'a denied received record')
      },
    },
    {
      name: 'advances the revision on each new entry',
      async run() {
        const execution = executionId('revision')
        const authority = await fixture.open(access, execution)
        const first = await recorded(
          advancing(access, execution, authority, operationId('v1'), sampleStartFence('v1')),
          'first',
        )
        const second = await recorded(
          advancing(access, execution, authority, operationId('v2'), sampleStartFence('v2')),
          'second',
        )
        const recalled = await recorded(
          advancing(access, execution, authority, operationId('v1'), sampleStartFence('v1')),
          'recall of the first',
        )
        const third = await recorded(
          receiving(
            access,
            execution,
            operationId('v3'),
            sampleReceivedModelAccount(access.tenant, 'v3'),
          ),
          'third',
        )
        assert.equal(new Set([first.revision, second.revision, third.revision]).size, 3)
        assert.equal(
          recalled.revision,
          first.revision,
          'a recall should keep the original revision',
        )
      },
    },
    {
      name: 'records Model and Tool account deliveries and recognizes them by their keys',
      async run() {
        const execution = executionId('accounts')
        await fixture.open(access, execution)
        const model = sampleReceivedModelAccount(access.tenant, 'acc-model')
        const tool = sampleReceivedToolAccount(access.tenant, 'acc-tool')
        const first = await recorded(
          receiving(access, execution, operationId('am'), model),
          'Model account delivery',
        )
        const second = await recorded(
          receiving(access, execution, operationId('at'), tool),
          'Tool account delivery',
        )
        assert.notEqual(second.revision, first.revision)
        assert.deepEqual(
          await recorded(receiving(access, execution, operationId('at2'), tool), 'repeat'),
          second,
          'a repeated Tool account push should recall the original receipt',
        )
        await refused(
          receiving(
            access,
            execution,
            operationId('at3'),
            sampleReceivedToolAccount(access.tenant, 'acc-tool', '99'),
          ),
          'conflict',
          'the same Tool account key with another account',
        )
        await refused(
          receiving(
            access,
            execution,
            operationId('at4'),
            sampleReceivedToolAccount(otherAccess.tenant, 'acc-foreign'),
          ),
          'denied',
          'a Tool account with a call of another tenant',
        )
        assert.deepEqual(await fixture.read(access, execution), [model, tool])
      },
    },
    {
      // Red when a provider writes an entry without its `entry` event, allocates the event under
      // another attachment or another cause, or allocates one for a refused write.
      name: 'projects each written entry as one entry event of the same commit',
      async run() {
        const execution = executionId('projection')
        await fixture.open(access, execution)
        const authority = await fixture.supersede(access, execution)
        const before = await eventsOf(execution)
        const fence = sampleStartFence('projection')
        const fenced = await recorded(
          advancing(access, execution, authority, operationId('p1'), fence),
          'start-fence',
        )
        const delivery = sampleReceivedModelResult(access.tenant, 'projection')
        const kept = await recorded(
          receiving(access, execution, operationId('p2'), delivery),
          'received',
        )
        const after = await eventsOf(execution)
        assert.equal(after.length, before.length + 2, 'each written entry should add one event')
        const [first, second] = after.slice(before.length)
        assert.deepEqual(first?.body, { kind: 'entry', entry: fence })
        assert.deepEqual(second?.body, { kind: 'entry', entry: delivery })
        assert.deepEqual(first?.cause, fenced.evidence, 'the cause should be the commit evidence')
        assert.deepEqual(second?.cause, kept.evidence, 'the cause should be the commit evidence')
        // Sequences start at 1 and grow by 1 (SPEC "事件身份与序号"); on a fresh execution the
        // first event is '1'.
        assert.equal(
          first?.sequence,
          String(before.length + 1),
          'the sequence should continue the count of earlier events, starting at 1',
        )
        assert.equal(Number(second?.sequence), Number(first?.sequence) + 1)
        for (const event of [first, second]) {
          assert.equal(
            event?.execution,
            execution,
            'the event should belong to the execution it was written to',
          )
          assert.equal(
            event?.executionAttachment,
            authority.executionAttachment,
            'the event should carry the latest attachment, also for received without one',
          )
          // The schema is a complete Adoption, the one every event of the execution carries.
          assert.ok(
            'ok' in judgeAdoption(event?.schema),
            'the schema of an entry event should be a complete Adoption',
          )
          assert.deepEqual(
            event?.schema,
            after[0]?.schema,
            'every event of one execution should carry the same schema',
          )
        }
        await refused(
          advancing(access, execution, authority, operationId('p1'), sampleStartFence('other')),
          'conflict',
          'same operation with another entry',
        )
        assert.equal(
          (await eventsOf(execution)).length,
          after.length,
          'a refused record should allocate no event',
        )
      },
    },
    {
      // Red when a provider appends an entry event after the end; ended is the last event.
      name: 'writes a received entry after the end without an event',
      async run() {
        const execution = executionId('after-end')
        await fixture.open(access, execution)
        await fixture.end(access, execution)
        const before = await eventsOf(execution)
        const delivery = sampleReceivedModelResult(access.tenant, 'after-end')
        await recorded(
          receiving(access, execution, operationId('after-end'), delivery),
          'received after the end',
        )
        assert.deepEqual((await fixture.read(access, execution))?.at(-1), delivery)
        assert.deepEqual(await eventsOf(execution), before, 'no event should follow the end')
      },
    },
    {
      // Red when a provider allocates a second event on the replay of the same operation or on a
      // repeated push of the same delivery; both recall the original receipt.
      name: 'allocates no second event when an operation or a delivery is replayed',
      async run() {
        const execution = executionId('replay')
        const authority = await fixture.open(access, execution)
        const fence = sampleStartFence('replay')
        const first = await recorded(
          advancing(access, execution, authority, operationId('rp1'), fence),
          'first record',
        )
        const delivery = sampleReceivedModelResult(access.tenant, 'replay')
        const pushed = await recorded(
          receiving(access, execution, operationId('rp2'), delivery),
          'first push',
        )
        const count = (await eventsOf(execution)).length
        assert.deepEqual(
          await recorded(
            advancing(access, execution, authority, operationId('rp1'), fence),
            'replay of the operation',
          ),
          first,
        )
        assert.deepEqual(
          await recorded(receiving(access, execution, operationId('rp3'), delivery), 'repeat'),
          pushed,
        )
        assert.equal((await eventsOf(execution)).length, count, 'a replay should allocate no event')
      },
    },
    // Red when a provider writes the entry and allocates its event in two steps, so that a lost
    // reply can leave one without the other, or when the replay after the lost reply allocates
    // a second event. The fixture scripts the lost reply; without that control the case is
    // uncovered.
    fixture.failNextRecord === undefined
      ? uncoveredCase(
          'keeps the entry and its event together when the record reply is lost',
          'failNextRecord control',
        )
      : {
          name: 'keeps the entry and its event together when the record reply is lost',
          async run() {
            const execution = executionId('lost-reply')
            await fixture.open(access, execution)
            const before = await eventsOf(execution)
            const delivery = sampleReceivedModelResult(access.tenant, 'lost-reply')
            await fixture.failNextRecord?.(access, execution, {
              kind: 'commit-unknown',
              outcome: 'applied',
            })
            await refused(
              receiving(access, execution, operationId('lost'), delivery),
              'commit-unknown',
              'the scripted record',
            )
            assert.deepEqual(
              (await fixture.read(access, execution))?.at(-1),
              delivery,
              'the applied write should hold the entry',
            )
            const after = await eventsOf(execution)
            assert.equal(after.length, before.length + 1, 'the applied write should hold the event')
            assert.deepEqual(after.at(-1)?.body, { kind: 'entry', entry: delivery })
            const recalled = await recorded(
              receiving(access, execution, operationId('lost'), delivery),
              'replay of the operation',
            )
            assert.deepEqual(
              after.at(-1)?.cause,
              recalled.evidence,
              'the cause should be the evidence of the recalled receipt',
            )
            await unchangedEvents(execution, after, 'the replay')
          },
        },
    // Red when a provider that fails before publication leaves the entry, its event, or both, or
    // when the retry of the same operation does not write afterwards. The fixture scripts the
    // failure; without that control the case is uncovered.
    fixture.failNextRecord === undefined
      ? uncoveredCase(
          'leaves neither the entry nor its event when the record fails before publication',
          'failNextRecord control',
        )
      : {
          name: 'leaves neither the entry nor its event when the record fails before publication',
          async run() {
            const execution = executionId('failed-write')
            await fixture.open(access, execution)
            const before = await eventsOf(execution)
            const entries = await fixture.read(access, execution)
            const delivery = sampleReceivedModelResult(access.tenant, 'failed-write')
            await fixture.failNextRecord?.(access, execution, { kind: 'unavailable' })
            await refused(
              receiving(access, execution, operationId('failed'), delivery),
              'unavailable',
              'the scripted record',
            )
            assert.deepEqual(
              await fixture.read(access, execution),
              entries,
              'a failure before publication should leave no entry',
            )
            await unchangedEvents(execution, before, 'a failure before publication')
            const written = await recorded(
              receiving(access, execution, operationId('failed'), delivery),
              'retry of the same operation',
            )
            const after = await eventsOf(execution)
            assert.equal(after.length, before.length + 1, 'the retry should write once')
            assert.deepEqual(after.at(-1)?.cause, written.evidence)
          },
        },
    // Red when a provider refuses the event after a detach, or allocates it under an attachment
    // other than the latest established one. Without a detach control the case is uncovered.
    fixture.detach === undefined
      ? uncoveredCase(
          'projects a received entry under the latest attachment after a detach',
          'detach control',
        )
      : {
          name: 'projects a received entry under the latest attachment after a detach',
          async run() {
            const execution = executionId('detached')
            await fixture.open(access, execution)
            const latest = await fixture.supersede(access, execution)
            await fixture.detach?.(access, execution)
            const before = await eventsOf(execution)
            await refused(
              advancing(access, execution, latest, operationId('d0'), sampleStartFence('d0')),
              'stale-advance',
              'start-fence under a detached Authority',
            )
            await unchangedEvents(execution, before, 'a stale-advance record after a detach')
            const delivery = sampleReceivedModelResult(access.tenant, 'detached')
            const kept = await recorded(
              receiving(access, execution, operationId('d1'), delivery),
              'received after a detach',
            )
            const after = await eventsOf(execution)
            assert.equal(after.length, before.length + 1, 'received should add one event')
            const event = after.at(-1)
            assert.deepEqual(event?.body, { kind: 'entry', entry: delivery })
            assert.deepEqual(event?.cause, kept.evidence)
            assert.equal(
              event?.executionAttachment,
              latest.executionAttachment,
              'the event should carry the latest established attachment, also when detached',
            )
          },
        },
  ]
}

/** A fixture of the double, for its own conformance run and for consumer tests. */
export function memoryAgentJournalEntriesFixture<P>(
  access: Access<P>,
  otherAccess: Access<P>,
): AgentJournalEntriesFixture<P> & Readonly<{ double: MemoryAgentJournalEntries<P> }> {
  const double = createMemoryAgentJournalEntries<P>()
  let generation = 0
  const authorityOf = (execution: AgentExecutionId): Authority => {
    generation += 1
    return {
      execution,
      executionAttachment: identity(
        decodeExecutionAttachmentId(`attachment-${generation}`),
        'attachment',
      ),
      instance: identity(decodeAgentInstanceId('instance'), 'instance'),
      generation: String(generation),
      source: evidence(`grant-${generation}`),
    }
  }
  return {
    double,
    entries: double,
    access,
    otherAccess,
    open: async (who, execution) => {
      const authority = authorityOf(execution)
      double.open({ tenant: who.tenant, authority })
      return authority
    },
    supersede: async (who, execution) => {
      const authority = authorityOf(execution)
      double.supersede({ tenant: who.tenant, authority })
      return authority
    },
    end: async (who, execution) => double.end({ tenant: who.tenant, execution }),
    read: async (who, execution) => double.entries({ tenant: who.tenant, execution }),
    events: async (who, execution) => double.events({ tenant: who.tenant, execution }),
    detach: async (who, execution) => double.detach({ tenant: who.tenant, execution }),
    failNextRecord: async (who, execution, fault) =>
      double.failNextRecord({ tenant: who.tenant, execution }, fault),
  }
}
