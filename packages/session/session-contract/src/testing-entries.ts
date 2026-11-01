// The conformance cases of `SessionTransactionPort.commitEntries` (docs/same-log-pure.md「entries
// 通道的解释提交」). Every provider runs the same cases on a fixture that it builds through the
// public commit: an active Run with its execution and a bound external Tool call. The cases read
// the result only through the public port: the receipt, `readWork` with its `entriesProgress`,
// `history` and the two query methods. A caller that lost its memory takes its start from
// `readWork` alone, as the interpreter does after a restart.
import assert from 'node:assert/strict'
import type { SessionHistory } from './faces.ts'
import type { TenantId } from '@omne-harness/legal-identity'
import type { RunId, SessionAccess, SessionId, SessionOperationId } from './identity.ts'
import type {
  SessionEntriesInterpretation,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesStart,
} from './interpretation-values.ts'
import type { WorkSnapshot } from './values.ts'
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

/**
 * The start of the Tool channel of `o`, taken from a snapshot only: the saved item of the channel,
 * or `initial` when the snapshot holds none.
 */
function startOf(o: Opened, snapshot: WorkSnapshot): SessionEntriesStart {
  const progress = (snapshot.entriesProgress ?? []).find(
    item =>
      item.run === o.run && item.execution === o.execution && item.channel === 'tool-received',
  )
  return progress === undefined ? { kind: 'initial' } : { kind: 'saved', progress }
}

/** The range (2, 3] that continues from `start`. */
function next(o: Opened, operation: SessionOperationId, start: SessionEntriesStart) {
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

/**
 * What a refused commit must leave unchanged: the revision, the saved progress, the log and the
 * operation identity.
 */
async function state<P>(fixture: SessionTransactionsFixture<P>, operation: SessionOperationId) {
  const snapshot = succeeded(await fixture.port.readWork(fixture.access), 'readWork')
  return {
    revision: snapshot.revision,
    entriesProgress: snapshot.entriesProgress,
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
      'the consequence and the progress row are one new revision, and readWork reads the saved progress back',
      async fixture => {
        const o = await opened(fixture)
        const before = await o.s.readWork()
        assert.equal(before.entriesProgress, undefined, 'no progress before the first commit')
        const receipt = succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, fixture.operation('entries-1')),
            start: initial,
          }),
          'commitEntries',
        )
        const after = await o.s.readWork()
        assert.equal(BigInt(after.revision), BigInt(before.revision) + 1n, 'one revision')
        assert.deepEqual(after.entriesProgress, [
          {
            run: o.run,
            execution: o.execution,
            channel: 'tool-received',
            through: receipt.through,
            interpreted: receipt.interpreted,
          },
        ])
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
      'the next range continues from the start that readWork gives, and a start behind the saved progress is changed',
      async fixture => {
        const o = await opened(fixture)
        succeeded(
          await fixture.port.commitEntries({
            observation: observation(o, fixture.operation('entries-1')),
            start: initial,
          }),
          'first range',
        )
        // The caller keeps nothing of the first commit: the start comes from readWork alone.
        const start = startOf(o, await o.s.readWork())
        const second = succeeded(
          await fixture.port.commitEntries(next(o, fixture.operation('entries-2'), start)),
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
        const continued = next(o, operation, {
          kind: 'saved',
          progress: {
            run: o.run,
            execution: o.execution,
            channel: 'tool-received',
            through: committed.through,
            interpreted: committed.interpreted,
          },
        })
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
          const { query: _before, ...before } = await state(fixture, operation)
          const failure = refused(
            await fixture.port.commitEntries({ observation: refusedObservation, start }),
            kind,
          )
          assert.equal(failure.kind, kind)
          const { query, ...after } = await state(fixture, operation)
          assert.deepEqual(after, before, `${kind} changed nothing`)
          // The refused identity stays unknown. A provider that keeps its rolled back attempts
          // answers attempt-rejected, which leaves the original unknown as well (SL09).
          assert.ok(
            query.kind === 'unknown' || query.kind === 'attempt-rejected',
            `${kind} left the identity unknown, not ${query.kind}`,
          )
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

    conformanceCase(
      'CF-09',
      'commitEntries asks no access check, for a commit, a recall and a refusal',
      async fixture => {
        const asked = fixture.askedAccessChecks
        assert.ok(asked !== undefined, 'CF-09 needs the fixture to count the access checks')
        const o = await opened(fixture)
        const input = {
          observation: observation(o, fixture.operation('entries-1')),
          start: initial,
        }
        const before = asked()
        succeeded(await fixture.port.commitEntries(input), 'commitEntries')
        // The answers of the recall and of the stale start belong to CF-04 and CF-03; this case
        // counts only the access checks.
        await fixture.port.commitEntries(input)
        await fixture.port.commitEntries({
          ...input,
          observation: { ...input.observation, operation: fixture.operation('entries-2') },
        })
        assert.equal(asked(), before, 'no access check was asked')
      },
    ),
  ]
}
