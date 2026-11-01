// The conformance cases of `SessionTransactionPort.commitEntries` (docs/same-log-pure.md「entries
// 通道的解释提交」). Every provider runs the same cases on a fixture that it builds through the
// public commit: an active Run with its execution and a bound external Tool call. The cases read
// the result only through the public port: the receipt, `readWork`, `history` and the two query
// methods. They do not read the saved progress itself, which `WorkSnapshot` does not hold yet.
import assert from 'node:assert/strict'
import type { SessionHistory } from './faces.ts'
import type { TenantId } from '@omne-harness/legal-identity'
import type { RunId, SessionAccess, SessionId, SessionOperationId } from './identity.ts'
import type {
  SessionEntriesInterpretation,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesReceipt,
  SessionEntriesStart,
} from './interpretation-values.ts'
import {
  assertIndistinguishable,
  conformanceCase,
  expectKind,
  handle,
  refused,
  succeeded,
  type ConformanceCase,
} from './testing-case.ts'
import { scene, type SessionTransactionsFixture } from './testing-transactions.ts'
import { evidence, sessionId } from './testing-values.ts'

const CALL = 'entries-call-1'

/** Opens the Run and binds the external Tool call `CALL`; returns the run and the execution. */
async function opened<P>(fixture: SessionTransactionsFixture<P>) {
  const s = scene(fixture)
  await s.openRun()
  const snapshot = await s.readWork()
  const run = expectKind(snapshot.run, 'active', 'the Run of the entries fixture')
  succeeded(
    await s.commit<'bindExternalCall'>({
      kind: 'bindExternalCall',
      input: {
        ...s.base,
        operation: fixture.operation('entries-bind'),
        expected: snapshot.revision,
        qualification: evidence('entries/qualified'),
        binding: {
          producer: { kind: 'tool', call: CALL },
          action: 'action',
          consumer: { owner: 'session', work: 'work', position: 'entries-at', purpose: 'action' },
          request: evidence('entries/request'),
          initiatingAttempt: null,
        },
      },
    }),
    'bind the external call',
  )
  return { s, base: s.base, run: run.run, execution: run.execution.execution }
}

const produced: SessionEntriesInterpretation = {
  kind: 'execution',
  producer: { kind: 'tool', call: CALL },
  source: evidence('tool/fact'),
}
const item = (
  ordinal: string,
  interpretation: readonly SessionEntriesInterpretation[],
): SessionEntriesItem => ({
  ordinal,
  key: `key-${ordinal}`,
  fact: evidence(`agent/entry/${ordinal}`),
  interpretation,
})

/** The channel of a fixture: the session, the run and the execution that the observations name. */
type Opened = Readonly<{
  base: Readonly<{ tenant: TenantId; session: SessionId }>
  run: RunId
  execution: string
}>

/** The base observation: the range (0, 2] of the Tool channel, one producer fact and one observed item. */
function observation(
  o: Opened,
  operation: SessionOperationId,
  change: Partial<SessionEntriesObservation> = {},
): SessionEntriesObservation {
  return {
    tenant: o.base.tenant,
    session: o.base.session,
    run: o.run,
    execution: o.execution,
    channel: 'tool-received',
    operation,
    after: '0',
    through: '2',
    boundary: {
      execution: o.execution,
      channel: 'tool-received',
      revision: '1',
      executionEvidence: evidence('agent/head'),
      count: '3',
    },
    items: [item('1', [produced]), item('2', [{ kind: 'observed' }])],
    ...change,
  }
}

/** The range (2, 3] that continues from `receipt`. */
function next(o: Opened, operation: SessionOperationId, receipt: SessionEntriesReceipt) {
  const start: SessionEntriesStart = {
    kind: 'saved',
    progress: {
      run: o.run,
      execution: o.execution,
      channel: 'tool-received',
      through: receipt.through,
      interpreted: receipt.interpreted,
    },
  }
  return {
    observation: observation(o, operation, {
      after: '2',
      through: '3',
      items: [item('3', [produced])],
    }),
    start,
  }
}

const initial: SessionEntriesStart = { kind: 'initial' }

async function allEntries<P>(
  history: SessionHistory<P>,
  access: SessionAccess<P>,
  kinds: readonly string[] = [],
) {
  const page = succeeded(
    await history.begin({
      ...access,
      kinds,
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
    }),
    'history',
  )
  assert.ok(page.exhausted, 'the bounded scenario fits one history page')
  return page.entries
}

/** What a refused commit must leave unchanged: the revision, the log and the operation identity. */
async function state<P>(fixture: SessionTransactionsFixture<P>, operation: SessionOperationId) {
  return {
    revision: succeeded(await fixture.port.readWork(fixture.access), 'readWork').revision,
    entries: (await allEntries(fixture.port.history, fixture.access)).map(entry => entry.id),
    query: succeeded(
      await fixture.port.queryOperation({ ...fixture.access, operation }),
      'queryOperation',
    ),
  }
}

export function sessionEntriesConformance<P>(): readonly ConformanceCase<
  SessionTransactionsFixture<P>
>[] {
  return [
    conformanceCase(
      'CF-01',
      'commitEntries commits the range and its receipt names the batch evidence of the commit',
      async fixture => {
        const o = await opened(fixture)
        const operation = fixture.operation('entries-1')
        const receipt = succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, operation),
            start: initial,
          }),
          'commitEntries',
        )
        assert.equal(receipt.operation, operation)
        assert.equal(receipt.through, '2')
        assert.deepEqual(receipt.interpreted, (await o.s.readWork()).source)
      },
    ),

    conformanceCase(
      'CF-02',
      'the consequence and the progress row are one new revision',
      async fixture => {
        const o = await opened(fixture)
        const before = await o.s.readWork()
        succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, fixture.operation('entries-1')),
            start: initial,
          }),
          'commitEntries',
        )
        const after = await o.s.readWork()
        assert.equal(BigInt(after.revision), BigInt(before.revision) + 1n, 'one revision')
        const progress = await allEntries(fixture.port.history, fixture.access, [
          'entries.interpreted',
        ])
        const facts = await allEntries(fixture.port.history, fixture.access, [
          'call.execution-fact',
        ])
        assert.equal(progress.length, 1, 'one progress row')
        assert.equal(facts.length, 1, 'one consequence row')
        assert.equal(progress[0]?.revision, after.revision)
        assert.equal(facts[0]?.revision, after.revision)
      },
    ),

    conformanceCase(
      'CF-03',
      'the next range continues from the receipt, and a start behind the saved progress is changed',
      async fixture => {
        const o = await opened(fixture)
        const first = succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, fixture.operation('entries-1')),
            start: initial,
          }),
          'first range',
        )
        const second = succeeded(
          await fixture.port.commitEntries(next(o, fixture.operation('entries-2'), first)),
          'continued range',
        )
        assert.equal(second.through, '3')
        const stale = refused(
          await fixture.port.commitEntries({
            observation: observation(o, fixture.operation('entries-3')),
            start: initial,
          }),
          'a stale start',
        )
        assert.deepEqual(stale, { kind: 'changed', revision: (await o.s.readWork()).revision })
      },
    ),

    conformanceCase(
      'CF-04',
      'the same operation with the same observation recalls the original receipt and writes nothing',
      async fixture => {
        const o = await opened(fixture)
        const input = {
          observation: observation(o, fixture.operation('entries-1')),
          start: initial,
        }
        const first = succeeded(await fixture.port.commitEntries(input), 'commitEntries')
        const before = await state(fixture, input.observation.operation)
        const again = succeeded(await fixture.port.commitEntries(input), 'the same commit again')
        assert.deepEqual(again, first)
        assert.deepEqual(await state(fixture, input.observation.operation), before)
      },
    ),

    conformanceCase(
      'CF-05',
      'an operation identity of another observation or of another commit form is a conflict',
      async fixture => {
        const o = await opened(fixture)
        const operation = fixture.operation('entries-1')
        succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, operation),
            start: initial,
          }),
          'commitEntries',
        )
        const before = await state(fixture, operation)
        const other = observation(o, operation, {
          items: [
            { ...item('1', [produced]), key: 'key-other' },
            item('2', [{ kind: 'observed' }]),
          ],
        })
        assert.deepEqual(
          refused(
            await fixture.port.commitEntries({ observation: other, start: initial }),
            'another input',
          ),
          { kind: 'conflict', operation },
        )
        const bind = fixture.operation('entries-bind')
        assert.deepEqual(
          refused(
            await fixture.port.commitEntries({ observation: observation(o, bind), start: initial }),
            'the identity of a batch commit',
          ),
          { kind: 'conflict', operation: bind },
        )
        assert.deepEqual(await state(fixture, operation), before)
      },
    ),

    conformanceCase(
      'CF-06',
      'a refused commitEntries leaves the revision, the log and the operation identity unchanged',
      async fixture => {
        const o = await opened(fixture)
        const committed = succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, fixture.operation('entries-1')),
            start: initial,
          }),
          'commitEntries',
        )
        const operation = fixture.operation('refused')
        const continued = next(o, operation, committed)
        const range = continued.observation
        const refusals: readonly [string, SessionEntriesObservation, SessionEntriesStart][] = [
          ['denied', { ...range, session: sessionId(`${o.base.session}-other`) }, continued.start],
          ['invalid', { ...range, boundary: { ...range.boundary, count: '2' } }, continued.start],
          ['changed', observation(o, operation), initial],
          [
            'unavailable',
            {
              ...range,
              execution: 'entries-ex-9',
              boundary: { ...range.boundary, execution: 'entries-ex-9' },
            },
            continued.start,
          ],
        ]
        for (const [kind, refusedObservation, start] of refusals) {
          const before = await state(fixture, operation)
          const failure = refused(
            await fixture.port.commitEntries({ observation: refusedObservation, start }),
            kind,
          )
          assert.equal(failure.kind, kind)
          assert.deepEqual(await state(fixture, operation), before, `${kind} changed nothing`)
          assert.deepEqual(before.query, { kind: 'unknown' })
        }
      },
    ),

    conformanceCase(
      'CF-07',
      'queryOperation answers committed for an entries operation, and queryControlOperation conflict',
      async fixture => {
        const o = await opened(fixture)
        const operation = fixture.operation('entries-1')
        succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, operation),
            start: initial,
          }),
          'commitEntries',
        )
        const resolution = succeeded(
          await fixture.port.queryOperation({ ...fixture.access, operation }),
          'queryOperation',
        )
        const committed = expectKind(resolution, 'committed', 'the entries operation')
        assert.equal(committed.receipt.operation, operation)
        assert.equal(committed.receipt.revision, (await o.s.readWork()).revision)
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
      'CF-08',
      'an observation of another tenant is denied, the same as for a session that never was',
      async fixture => {
        const other = handle(fixture.otherAccess, 'otherAccess')
        const o = await opened(fixture)
        const before = await state(fixture, fixture.operation('entries-1'))
        const real = observation(o, fixture.operation('entries-1'), { tenant: other.tenant })
        const ghost = { ...real, session: sessionId(`${o.base.session}-ghost`) }
        assertIndistinguishable(
          {
            real: await fixture.port.commitEntries({ observation: real, start: initial }),
            ghost: await fixture.port.commitEntries({ observation: ghost, start: initial }),
          },
          'commitEntries',
        )
        assert.equal(
          refused(await fixture.port.commitEntries({ observation: real, start: initial }), 'real')
            .kind,
          'denied',
        )
        assert.deepEqual(await state(fixture, fixture.operation('entries-1')), before)
      },
    ),
  ]
}
