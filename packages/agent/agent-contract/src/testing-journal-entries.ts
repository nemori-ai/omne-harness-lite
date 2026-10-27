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
import type { CommandReceipt } from './execution.ts'
import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeExecutionAttachmentId,
  decodeExecutionRevision,
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
  StreamReferenceEntry,
} from './receiving.ts'
import { canonicalText, doubleEvidence, tenantText, type ConformanceCase } from './testing-case.ts'

import {
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
  sampleStartFence,
  sampleStreamReference,
} from './testing-journal-samples.ts'
export {
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
  sampleStartFence,
  sampleStreamReference,
} from './testing-journal-samples.ts'

const OWNER = 'agentJournalEntries'

type Execution = {
  authority: Authority
  ended: boolean
  revision: number
  readonly entries: AgentJournalEntry[]
  readonly operations: Map<string, Readonly<{ text: string; receipt: CommandReceipt }>>
  readonly deliveries: Map<string, Readonly<{ text: string; receipt: CommandReceipt }>>
}

/** A non-durable double of the receiving entries port. It must not be assembled into production. */
export interface MemoryAgentJournalEntries<P> extends AgentJournalEntries<P> {
  readonly durability: 'none'
  /** Opens one execution of `tenant` under its current attachment. */
  open(input: Readonly<{ tenant: TenantId; authority: Authority }>): void
  /** Gives the execution a new current attachment. The previous Authority is superseded. */
  supersede(input: Readonly<{ tenant: TenantId; authority: Authority }>): void
  /** Ends the execution. */
  end(input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>): void
  /** The committed entries in commit order, as `ExecutionSnapshot.entries` gives them. */
  entries(
    input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  ): readonly AgentJournalEntry[] | undefined
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

  const write = (
    execution: Execution,
    input: JournalEntryRecord<P>,
    text: string,
  ): CommandReceipt => {
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
    execution.operations.set(input.operation, { text, receipt })
    return receipt
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
      const receipt = write(execution, input, text)
      execution.deliveries.set(key, { text: canonicalText(entry), receipt })
      return succeed(receipt)
    }
    if (execution.ended) return fail<Failure>({ kind: 'terminal' })
    if (input.authority === null || !sameAttachment(input.authority, execution.authority)) {
      return fail<Failure>({ kind: 'stale-advance' })
    }
    return succeed(write(execution, input, text))
  }

  return {
    durability: 'none',
    record,
    open({ tenant, authority }) {
      const key = keyOf(tenant, authority.execution)
      if (executions.has(key)) throw new TypeError('the execution is already open')
      executions.set(key, {
        authority,
        ended: false,
        revision: 0,
        entries: [],
        operations: new Map(),
        deliveries: new Map(),
      })
    },
    supersede({ tenant, authority }) {
      const execution = executions.get(keyOf(tenant, authority.execution))
      if (execution === undefined) throw new TypeError('the execution is not open')
      execution.authority = authority
    },
    end({ tenant, execution }) {
      const record = executions.get(keyOf(tenant, execution))
      if (record === undefined) throw new TypeError('the execution is not open')
      record.ended = true
    },
    entries({ tenant, execution }) {
      const record = executions.get(keyOf(tenant, execution))
      return record === undefined ? undefined : structuredClone(record.entries)
    },
  }
}

/**
 * What the suite needs from a provider. `access` and `otherAccess` belong to two different
 * tenants. `open` opens a new execution of the tenant of the access under the given execution
 * text and returns its current Authority. `supersede` gives it a new current attachment, `end`
 * ends it, and `read` returns `ExecutionSnapshot.entries` as load gives it.
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
    entry: StartFenceEntry | StreamReferenceEntry,
  ) => record({ ...who, execution, operation, authority, entry })
  const receiving = (
    who: Access<P>,
    execution: AgentExecutionId,
    operation: AgentOperationId,
    entry: ReceivedEntry,
  ) => record({ ...who, execution, operation, authority: null, entry })

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
        await refused(
          advancing(access, execution, old, operationId('stale'), sampleStartFence('stale')),
          'stale-advance',
          'record under a superseded Authority',
        )
        assert.deepEqual(await fixture.read(access, execution), [])
      },
    },
    {
      name: 'refuses an advancing entry without an Authority',
      async run() {
        const execution = executionId('no-authority')
        await fixture.open(access, execution)
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
      },
    },
    {
      name: 'denies another tenant as it denies an execution that does not exist',
      async run() {
        const execution = executionId('foreign')
        const authority = await fixture.open(access, execution)
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
        await refused(
          advancing(access, execution, authority, operationId('late'), sampleStartFence('late')),
          'terminal',
          'start-fence after the end',
        )
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
      name: 'records a stream-reference entry only under the current Authority',
      async run() {
        const execution = executionId('stream')
        const old = await fixture.open(access, execution)
        const entry = sampleStreamReference(access.tenant, 'stream')
        await recorded(advancing(access, execution, old, operationId('s1'), entry), 'stream')
        await fixture.supersede(access, execution)
        await refused(
          advancing(
            access,
            execution,
            old,
            operationId('s2'),
            sampleStreamReference(access.tenant, 'late'),
          ),
          'stale-advance',
          'stream-reference under a superseded Authority',
        )
        assert.deepEqual(await fixture.read(access, execution), [entry])
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
  }
}
