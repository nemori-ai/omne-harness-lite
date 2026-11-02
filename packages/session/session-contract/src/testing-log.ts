// The conformance cases of `SessionTransactionPort.commitLog` (docs/same-log-pure.md「事件通道的
// 解释提交」). Every provider runs the same cases on a fixture that it builds through the public
// commit: an active Run with its execution. The Agent side of the fixture is `observe`: it states
// one original event of the execution to the provider's history, which the cases cannot write
// through the Session port. The cases read the result only through the public port: the receipt,
// `readWork`, `history` and `queryOperation`.
import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import { readAccessRequest } from './access.ts'
import type { SessionHistory } from './faces.ts'
import type {
  ConsumptionId,
  DurableEvidence,
  RunId,
  SessionAccess,
  SessionId,
  SessionOperationId,
} from './identity.ts'
import type { SessionLogCommitObservation } from './interpretation-values.ts'
import type { SessionTransactionPort } from './ports.ts'
import type { SessionLogObservation } from './projection.ts'
import type { SessionCallRegistration } from './call-values.ts'
import {
  assertIndistinguishable,
  conformanceCase,
  expectKind,
  handle,
  refused,
  succeeded,
  type ConformanceCase,
} from './testing-case.ts'
import {
  memoryFixtureParts,
  scene,
  type SessionTransactionsFixture,
} from './testing-transactions.ts'
import { evidence, sessionId } from './testing-values.ts'

/**
 * What the log suite needs. `port` offers `commitLog`: a provider that does not offer it has no
 * suite to run. `observe` states one original Agent event of the execution to the history of the
 * provider; the commit reads that event back and checks the observation against it. `delegatedView`,
 * when offered, gives a view of the same stores that the Session execution boundary bound to one
 * checked read of the fixture's session.
 */
export interface SessionLogFixture<P> extends SessionTransactionsFixture<P> {
  readonly port: SessionTransactionPort<P> &
    Readonly<{ commitLog: NonNullable<SessionTransactionPort<P>['commitLog']> }>
  observe(observation: SessionLogObservation): Promise<void>
  delegatedView?(): SessionTransactionPort<P>
}

type Opened = Readonly<{
  base: Readonly<{ tenant: TenantId; session: SessionId }>
  run: RunId
  execution: string
  attempt: string
}>

/** Opens the Run of the fixture and names its first attempt, which the registrations of the events bind. */
async function opened<P>(fixture: SessionLogFixture<P>) {
  const s = scene(fixture)
  const execution = await s.openRun()
  const run = expectKind((await s.readWork()).run, 'active', 'the Run of the log fixture')
  if (run.advance === null) assert.fail('the Run of the log fixture has no attempt')
  const o: Opened = { base: s.base, run: run.run, execution, attempt: run.advance.attempt }
  return { s, o }
}

/** The registration of the model call `n`, bound to the first attempt of the Run. */
const registration = (o: Opened, n: number): SessionCallRegistration => ({
  kind: 'associated',
  binding: {
    producer: { kind: 'model', call: `log-model-${n}` },
    action: `log-action-${n}`,
    consumer: { owner: 'agent', work: 'log-work', position: `log-position-${n}`, purpose: 'main' },
    request: evidence(`log/request/${n}`),
    initiatingAttempt: o.attempt as never,
  },
  purpose: 'main',
})

/** The original event `n` of the execution: its sequence and its head revision are both `n`. */
function observation(
  o: Opened,
  n: number,
  operation: SessionOperationId,
  change: Partial<SessionLogCommitObservation> = {},
): SessionLogCommitObservation {
  return {
    tenant: o.base.tenant,
    session: o.base.session,
    run: o.run,
    execution: o.execution,
    operation,
    sequence: String(n),
    revision: String(n),
    source: evidence(`log/event/${n}`),
    executionEvidence: evidence(`log/head/${n}`),
    consequences: [
      {
        kind: 'call-registration',
        consumption: `log-consumption-${n}` as ConsumptionId,
        registration: registration(o, n),
      },
    ],
    ...change,
  }
}

async function allEntries<P>(history: SessionHistory<P>, access: SessionAccess<P>) {
  const page = succeeded(
    await history.begin({
      ...access,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
    }),
    'history',
  )
  assert.ok(page.exhausted, 'the bounded scenario fits one history page')
  return page.entries
}

/**
 * What a refused or recalled commit must leave unchanged: the revision, the event progress of the
 * execution, the log and the operation identity.
 */
async function state<P>(fixture: SessionLogFixture<P>, operation: SessionOperationId) {
  const snapshot = succeeded(await fixture.port.readWork(fixture.access), 'readWork')
  return {
    revision: snapshot.revision,
    readThrough: snapshot.run.kind === 'active' ? snapshot.run.execution.readThrough : null,
    entries: (await allEntries(fixture.port.history, fixture.access)).map(entry => entry.id),
    // Raw: a committed log operation answers conflict here, which is also state.
    query: await fixture.port.queryOperation({ ...fixture.access, operation }),
  }
}

const complete = (value: DurableEvidence): boolean =>
  [value.owner, value.record, value.revision, value.digest].every(part => part.length > 0)

/** States event `n` to the provider, then commits it under `operation`. */
async function interpret<P>(
  fixture: SessionLogFixture<P>,
  o: Opened,
  n: number,
  operation: SessionOperationId,
) {
  const event = observation(o, n, operation)
  await fixture.observe(event)
  return { event, answer: await fixture.port.commitLog({ observation: event }) }
}

export function sessionLogConformance<P>(): readonly ConformanceCase<SessionLogFixture<P>>[] {
  return [
    conformanceCase(
      'LC-01',
      'commitLog commits the consequence with its progress and the receipt names the saved interpretation',
      async fixture => {
        const { o } = await opened(fixture)
        const before = await state(fixture, fixture.operation('log-1'))
        const operation = fixture.operation('log-1')
        const { event, answer } = await interpret(fixture, o, 1, operation)
        const receipt = succeeded(answer, 'commitLog')
        assert.equal(receipt.operation, operation)
        assert.equal(receipt.execution, o.execution)
        assert.equal(receipt.readThrough, '1')
        assert.equal(receipt.recovered, false)
        assert.ok(complete(receipt.interpreted), 'the interpreted evidence is complete')
        assert.notDeepEqual(receipt.interpreted, event.source, 'the saved fact is not the event')
        assert.notDeepEqual(receipt.interpreted, event.executionEvidence, 'nor the head receipt')
        const after = await state(fixture, operation)
        assert.equal(BigInt(after.revision), BigInt(before.revision) + 1n, 'one new revision')
        assert.equal(after.readThrough, '1', 'the progress is saved with the consequence')
        const kinds = (await allEntries(fixture.port.history, fixture.access)).map(row => row.kind)
        assert.ok(kinds.includes('call.bound'), 'the consequence row is committed')
        assert.ok(kinds.includes('history.annotated'), 'the progress row is committed')
        // The record of a log commit is neither a batch nor a control record: both queries answer
        // conflict. A caller of unknown outcome retries `commitLog` with the same operation.
        assert.deepEqual(refused(after.query, 'queryOperation'), { kind: 'conflict', operation })
        assert.deepEqual(
          refused(
            await fixture.port.queryControlOperation({ ...fixture.access, operation }),
            'queryControlOperation',
          ),
          { kind: 'conflict', operation },
        )
      },
    ),

    conformanceCase(
      'LC-02',
      'the same operation with the same observation recalls the original receipt and writes nothing',
      async fixture => {
        const { o } = await opened(fixture)
        const operation = fixture.operation('log-1')
        const { event, answer } = await interpret(fixture, o, 1, operation)
        const first = succeeded(answer, 'first commit')
        const before = await state(fixture, operation)
        const again = succeeded(
          await fixture.port.commitLog({ observation: event }),
          'the recalled commit',
        )
        assert.equal(again.recovered, true)
        assert.deepEqual({ ...again, recovered: false }, first)
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),

    conformanceCase(
      'LC-03',
      'the same operation with another observation is a conflict and writes nothing',
      async fixture => {
        const { o } = await opened(fixture)
        const operation = fixture.operation('log-1')
        const { event } = await interpret(fixture, o, 1, operation)
        const before = await state(fixture, operation)
        const failure = refused(
          await fixture.port.commitLog({
            observation: { ...event, source: evidence('log/event/other') },
          }),
          'the changed observation',
        )
        assert.deepEqual(failure, { kind: 'conflict', operation })
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),

    conformanceCase(
      'LC-04',
      'an event at or below the saved progress recalls the original interpretation and commits nothing',
      async fixture => {
        const { o } = await opened(fixture)
        const original = fixture.operation('log-1')
        const first = succeeded((await interpret(fixture, o, 1, original)).answer, 'first commit')
        const retry = fixture.operation('log-1-retry')
        const before = await state(fixture, retry)
        const again = succeeded(
          await fixture.port.commitLog({ observation: observation(o, 1, retry) }),
          'the commit of an interpreted event',
        )
        assert.equal(again.recovered, true)
        assert.deepEqual(
          { ...again, recovered: false },
          first,
          'the original receipt, not a new one',
        )
        assert.deepEqual(await state(fixture, retry), before, 'nothing was added')
        assert.deepEqual(
          before.query,
          { ok: { kind: 'unknown' } },
          'the retry identity saved no record',
        )
      },
    ),

    conformanceCase(
      'LC-05',
      'the progress continues from the saved one, and each commit saves its own interpretation',
      async fixture => {
        const { o } = await opened(fixture)
        const first = succeeded(
          (await interpret(fixture, o, 1, fixture.operation('log-1'))).answer,
          'first commit',
        )
        const second = succeeded(
          (await interpret(fixture, o, 2, fixture.operation('log-2'))).answer,
          'second commit',
        )
        assert.equal(first.readThrough, '1')
        assert.equal(second.readThrough, '2')
        assert.notDeepEqual(second.interpreted, first.interpreted)
        assert.equal((await state(fixture, fixture.operation('log-2'))).readThrough, '2')
      },
    ),

    conformanceCase(
      'LC-06',
      'another tenant reads denied, the same as for a session that never was, and nothing is written',
      async fixture => {
        const other = handle(fixture.otherAccess, 'otherAccess')
        const { o } = await opened(fixture)
        const operation = fixture.operation('log-1')
        const event = observation(o, 1, operation)
        await fixture.observe(event)
        const before = await state(fixture, operation)
        assertIndistinguishable(
          {
            real: await fixture.port.commitLog({
              observation: { ...event, tenant: other.tenant },
            }),
            ghost: await fixture.port.commitLog({
              observation: { ...event, tenant: other.tenant, session: sessionId('ghost-session') },
            }),
          },
          'commitLog',
        )
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),

    conformanceCase(
      'LC-07',
      'a head that is not the original execution head is invalid and writes nothing',
      async fixture => {
        const { o } = await opened(fixture)
        const operation = fixture.operation('log-1')
        const event = observation(o, 1, operation)
        await fixture.observe(event)
        const before = await state(fixture, operation)
        const failure = refused(
          await fixture.port.commitLog({ observation: { ...event, revision: '2' } }),
          'a head that was never observed',
        )
        assert.equal(failure.kind, 'invalid')
        assert.equal(failure.kind === 'invalid' ? failure.field : '', 'revision')
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),

    conformanceCase(
      'LC-08',
      'an observation without a Session consequence is invalid and writes nothing',
      async fixture => {
        const { o } = await opened(fixture)
        const operation = fixture.operation('log-1')
        const event = observation(o, 1, operation, { consequences: [{ kind: 'observed' }] })
        await fixture.observe(event)
        const before = await state(fixture, operation)
        const failure = refused(
          await fixture.port.commitLog({ observation: event }),
          'observed only',
        )
        assert.equal(failure.kind, 'invalid')
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),

    conformanceCase(
      'LC-09',
      'two commits of one interpretation that interleave publish it once, and the loser recalls or answers changed',
      async fixture => {
        const { o } = await opened(fixture)
        const first = fixture.operation('log-1-a')
        const second = fixture.operation('log-1-b')
        const event = observation(o, 1, first)
        await fixture.observe(event)
        const before = await state(fixture, first)
        const answers = await Promise.all([
          fixture.port.commitLog({ observation: event }),
          fixture.port.commitLog({ observation: { ...event, operation: second } }),
        ])
        const fresh = answers.filter(answer => 'ok' in answer && !answer.ok.recovered)
        assert.equal(fresh.length, 1, 'exactly one of the two commits wrote')
        for (const answer of answers)
          if ('failure' in answer)
            assert.equal(answer.failure.kind, 'changed', 'the loser lost the head, nothing else')
        // The loser retries from the new head and recalls the interpretation that won.
        const retry = succeeded(
          await fixture.port.commitLog({ observation: { ...event, operation: second } }),
          'the retry of the loser',
        )
        assert.equal(retry.recovered, true)
        const after = await state(fixture, first)
        assert.equal(BigInt(after.revision), BigInt(before.revision) + 1n, 'one new revision')
        const bound = (await allEntries(fixture.port.history, fixture.access)).filter(
          row => row.kind === 'call.bound',
        )
        assert.equal(bound.length, 1, 'the consequence is in the log once')
      },
    ),

    conformanceCase(
      'LC-10',
      'a delegated view that has commitLog answers denied and writes nothing',
      async fixture => {
        const view = handle(fixture.delegatedView, 'delegatedView')()
        const { o } = await opened(fixture)
        const operation = fixture.operation('log-1')
        const event = observation(o, 1, operation)
        await fixture.observe(event)
        if (view.commitLog === undefined) return
        const before = await state(fixture, operation)
        const failure = refused(await view.commitLog({ observation: event }), 'the delegated view')
        assert.equal(failure.kind, 'denied')
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),
  ]
}

/** A fresh fixture over a fresh in-memory port, with the second tenant and a delegated view. */
export function memorySessionLogFixture(): SessionLogFixture<string> {
  const { fixture, history, delegated } = memoryFixtureParts()
  return {
    ...fixture,
    observe: async observation => {
      history.observe(observation)
    },
    delegatedView: () =>
      delegated.bind({
        request: readAccessRequest(fixture.access, 'readWork'),
        evidence: evidence('access/face/readWork'),
      }),
  }
}
