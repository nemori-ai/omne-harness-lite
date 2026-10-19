// The live-only ToolExecutorBinding conformance suite (P04, P05, P07, story 23) and a non-durable
// double that conforms to it. The double keeps its executions in memory and declares
// `durability: 'none'`: it proves nothing about a durable executor and must not be assembled into
// production.
import assert from 'node:assert/strict'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { FixedToolRequest } from './definitions.ts'
import type { Access, DurableEvidence, ToolCallId } from './identity.ts'
import type {
  ToolExecutionFact,
  ToolExecutorBinding,
  ToolLiveExecution,
  ToolStartLookup,
  ToolStartRecord,
} from './ports.ts'
import type {
  ControlDispatch,
  ControlProgress,
  FactBatch,
  FactReceipt,
  StartPermit,
} from './records.ts'
import type { ToolFailure } from './results.ts'
import {
  completionOf,
  conformanceCase,
  crossTenantAnswers,
  expectKind,
  expectOneOf,
  finalAnswer,
  handle,
  isProgress,
  otherAccessOf,
  refused,
  resendRecalls,
  succeeded,
  within,
  type AnswerModel,
  type AnswerRow,
  type ConformanceCase,
} from './testing-case.ts'
import {
  adoption,
  callId,
  digestOf,
  evidence,
  fixedRequest,
  identifyingValues,
  memoryAccess,
  memoryOtherAccess,
  mintEvidence,
  operationId,
  startRecord,
  syntheticPermit,
  tenantKey,
  textResult,
} from './testing-values.ts'

type Start = Extract<ToolStartRecord, { kind: 'start' }>
type Fact = ToolExecutionFact<ContentBlock>
type FinalFact = Extract<Fact, { kind: 'final' }>
type LiveOnly<P, E> = Extract<ToolExecutorBinding<P, ContentBlock, E>, { kind: 'live-only' }>

// ---------------------------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------------------------

/**
 * What the binding suite needs. A fresh fixture serves one case. `permit` yields the permit that
 * the binding consumes for a start; without it the suite builds a permit of its own that names the
 * start. A binding refuses a permit that names another call, another start or another tenant
 * (P04). `otherAccess` is the access of a second tenant, with a principal of its own: the cases
 * that check that another tenant neither reads nor joins an execution of the first are reported
 * not applicable without it. The optional handles are the controls of the executor, and a
 * case that needs one that is missing is reported not applicable: `launches` counts the
 * executions the executor performed; `emit` makes the executor of a started call produce one
 * fact; `finish` ends it with a final fact; `loseContinuity` loses it for good; `blindInspection`
 * makes `inspectStart` of the start unable to tell; `pendingAcknowledgements` counts the fact
 * batches whose custody receipt the executor still waits for; `holdStop` makes the executor of
 * the start answer the next stop as accepted only, and `completeStop` ends the stop: it resolves
 * only after the executor ended and every read of the control (`stop`, `inspectControl`) answers
 * its final progress. `settle` lands the deferred answer of `inspectStart` for a provider that
 * answers `unknown` to a start it knows: it resolves only after `inspectStart` tells what the
 * start is. The suite asks once more after a handle and never polls; a case that needs a handle
 * that is missing is reported not applicable when the first answer is progress. `readDeadlineMs`
 * (default 1000) is how long the suite waits for a fact batch that the executor owes, and
 * `quietMs` (default 25) is how long it waits for a fact that must not come; a slower provider
 * raises them.
 */
export interface ToolExecutorBindingFixture<P, E> {
  readonly binding: LiveOnly<P, E>
  readonly access: Access<P>
  readonly otherAccess?: Access<P>
  readonly environment: E
  readonly request?: FixedToolRequest
  readonly readDeadlineMs?: number
  readonly quietMs?: number
  /** Yields the permit that the binding consumes for this start. */
  permit?(start: Start): Promise<StartPermit>
  /** Resolves after `inspectStart` tells what the start is, and every read of it tells the same. */
  settle?(): Promise<void>
  /** Counts the executions the executor performed (a read). */
  launches?(): number
  /** Resolves after the executor produced the fact and the facts stream can read it. */
  emit?(start: Start, fact: Fact): Promise<void>
  /** Resolves after the executor ended with the final fact and every read shows the end. */
  finish?(start: Start, final: FinalFact): Promise<void>
  /** Resolves after the continuity of the start is lost for good and every read shows it. */
  loseContinuity?(start: Start): Promise<void>
  /** Makes `inspectStart` of the start unable to tell (it takes effect at once). */
  blindInspection?(start: Start): void
  /** Counts the fact batches whose custody receipt the executor still waits for (a read). */
  pendingAcknowledgements?(start: Start): number
  /** Makes the executor answer the next stop as accepted only (it takes effect at once). */
  holdStop?(start: Start): void
  /** Resolves after the executor ended the stop and every read of the control answers its final progress. */
  completeStop?(start: Start): Promise<void>
}

const PROCESS_FACT: Fact = { kind: 'process', blocks: [] }
const DEFAULT_READ_DEADLINE_MS = 1_000
const DEFAULT_QUIET_MS = 25

/**
 * The answer model of the executor binding for the methods that the suite asks about an operation.
 * `start` and `acknowledge` have no progress kind: they answer with the execution or the evidence
 * once, and a failure is final. `inspectStart` may answer `unknown` for a start it knows (P05:
 * unknown is asked again on the original start). A stop is `pending` or `unknown` until the
 * executor accepted it, `accepted` until the executor has ended, and then one of the final kinds;
 * P07 keeps these apart, so a read never goes back from `accepted` to `pending` and an accepted
 * stop keeps its evidence.
 */
const STOP_PROGRESS: AnswerRow<'pending' | 'unknown' | 'accepted'> = {
  clause: 'P07',
  progress: ['pending', 'unknown', 'accepted'],
  ranks: { accepted: 1 },
  recalled: ['accepted'],
}

export const executorBindingAnswers = {
  start: { clause: 'P05', progress: [] },
  inspectStart: { clause: 'P05', progress: ['unknown'] },
  acknowledge: { clause: 'P05', progress: [] },
  stop: STOP_PROGRESS,
  inspectControl: STOP_PROGRESS,
} as const satisfies AnswerModel<
  'start' | 'inspectStart' | 'acknowledge' | 'stop' | 'inspectControl'
>

/** A final fact that settles a start as completed. */
export function completedFinal(): FinalFact {
  return {
    kind: 'final',
    raw: {
      codec: adoption('output-codec'),
      content: {
        storage: 'conformance',
        key: 'raw-1',
        mediaType: 'application/octet-stream',
        bytes: '3',
        digest: 'sha256:raw',
      },
      custody: evidence('raw-custody'),
    },
    result: textResult('done'),
    terminal: { kind: 'completed' },
    effect: { kind: 'occurred', evidence: evidence('effect') },
  }
}

function scene<P, E>(
  fixture: ToolExecutorBindingFixture<P, E>,
  access: Access<P> = fixture.access,
) {
  const { binding } = fixture
  const call: ToolCallId = callId('call-1')
  const callAccess = { ...access, call }
  const start: Start = startRecord(access, call)
  const request = fixture.request ?? fixedRequest()
  /** The permit of `of`: the provider's own when it supplies one, or one that names the start. */
  const permitFor = async (of: Start, forCall: ToolCallId): Promise<StartPermit> =>
    fixture.permit !== undefined
      ? fixture.permit(of)
      : syntheticPermit(access, forCall, of, request)
  const startWith = (permit: StartPermit, record: Start = start) =>
    binding.start({ ...callAccess, start: record, permit, request }, fixture.environment)
  const begin = async (): Promise<ToolLiveExecution<ContentBlock>> =>
    succeeded(await startWith(await permitFor(start, call)), 'start')
  const lookup = async (): Promise<ToolStartLookup<ContentBlock>> =>
    succeeded(await binding.inspectStart({ ...callAccess, start }), 'inspectStart')
  const completion = completionOf(fixture, 'settle')
  /** What `inspectStart` finally tells; a provider that is not sure at first lands it by `settle`. */
  const lookupFinal = (): Promise<ToolStartLookup<ContentBlock>> =>
    finalAnswer({
      ask: lookup,
      row: executorBindingAnswers.inspectStart,
      completion,
      what: 'inspectStart',
    })
  const dispatch = (operation: string, inputDigest = 'sha256:control'): ControlDispatch => ({
    tenant: access.tenant,
    call,
    operation: operationId(operation),
    adoption: adoption('control'),
    inputDigest,
    start,
    intent: { kind: 'stop' },
    source: evidence('controller'),
  })
  /**
   * The final progress of a stop whose first answer was `first`: a progress answer is driven to its
   * end with `completeStop` and read with `inspectControl`, which every executor answers.
   */
  const stopLanded = async (
    execution: ToolLiveExecution<ContentBlock>,
    control: ControlDispatch,
    first: ControlProgress,
  ): Promise<ControlProgress> => {
    let given = false
    return finalAnswer({
      ask: async () => {
        if (!given) {
          given = true
          return first
        }
        return succeeded(await execution.inspectControl(control), 'inspectControl')
      },
      row: executorBindingAnswers.stop,
      completion: completionOf(fixture, 'completeStop', start),
      what: 'stop',
    })
  }
  return {
    start,
    call,
    completion,
    /** What every call of the scene sends: its access and its call. */
    sends: [access, call] as const,
    stopLanded,
    begin,
    startWith,
    permitFor,
    lookup,
    lookupFinal,
    tryLookup: () => binding.inspectStart({ ...callAccess, start }),
    lookupOf: (other: ToolCallId) =>
      binding.inspectStart({ ...access, call: other, start: startRecord(access, other) }),
    dispatch,
    emit: (fact: Fact = PROCESS_FACT): Promise<void> =>
      handle(fixture.emit, 'emit').call(fixture, start, fact),
  }
}

const deadline = (fixture: { readonly readDeadlineMs?: number }): number =>
  fixture.readDeadlineMs ?? DEFAULT_READ_DEADLINE_MS

/**
 * The batches of `execution` after `after`, read until `events` facts arrived (a batch may carry
 * several facts, so the suite counts facts and not batches); the stream is then closed.
 */
async function readBatches(
  execution: ToolLiveExecution<ContentBlock>,
  after: string | null,
  events: number,
  deadlineMs: number,
): Promise<FactBatch<ContentBlock>[]> {
  const controller = new AbortController()
  const iterator = execution.facts({ after, signal: controller.signal })[Symbol.asyncIterator]()
  const batches: FactBatch<ContentBlock>[] = []
  let seen = 0
  try {
    while (seen < events) {
      const next = await within(iterator.next(), deadlineMs, 'facts')
      if (next.done === true) break
      batches.push(next.value)
      seen += next.value.events.length
    }
  } finally {
    controller.abort()
    await iterator.return?.()
  }
  return batches
}

/** The facts that the batches carry, in order. */
const factsOf = (batches: readonly FactBatch<ContentBlock>[]) =>
  batches.flatMap(batch => batch.events)

/** The batches that arrive from the start of the stream within the quiet period of the fixture. */
async function drain(
  execution: ToolLiveExecution<ContentBlock>,
  quietMs: number,
): Promise<FactBatch<ContentBlock>[]> {
  const controller = new AbortController()
  const iterator = execution
    .facts({ after: null, signal: controller.signal })
    [Symbol.asyncIterator]()
  const batches: FactBatch<ContentBlock>[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const quiet = new Promise<'quiet'>(resolve => {
    timer = setTimeout(() => resolve('quiet'), quietMs)
  })
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), quiet])
      if (next === 'quiet' || next.done === true) break
      batches.push(next.value)
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
    await iterator.return?.()
  }
  return batches
}

export function toolExecutorBindingConformance<P, E>(): readonly ConformanceCase<
  ToolExecutorBindingFixture<P, E>
>[] {
  const answers = executorBindingAnswers
  return [
    conformanceCase('P05', 'a start resent with the same record launches once', async fixture => {
      const launches = handle(fixture.launches, 'launches')
      const s = scene(fixture)
      await s.begin()
      await s.begin()
      assert.equal(launches.call(fixture), 1)
    }),

    conformanceCase(
      'P05',
      'starts of the same record that meet in flight launch once',
      async fixture => {
        const launches = handle(fixture.launches, 'launches')
        const s = scene(fixture)
        await Promise.all([s.begin(), s.begin()])
        assert.equal(launches.call(fixture), 1)
      },
    ),

    conformanceCase(
      'P05',
      'a start resent with the same record joins the same fact stream',
      async fixture => {
        const s = scene(fixture)
        const first = await s.begin()
        const second = await s.begin()
        await s.emit()
        const [one, two] = await Promise.all([
          readBatches(first, null, 1, deadline(fixture)),
          readBatches(second, null, 1, deadline(fixture)),
        ])
        assert.ok(factsOf(one).length >= 1, 'the fact reached the reader')
        assert.deepEqual(two, one)
      },
    ),

    conformanceCase('P04', 'a start with the permit of another call is refused', async fixture => {
      const s = scene(fixture)
      const other = callId('call-2')
      // The permit that names the start, moved to another call: nothing else of it changes.
      const permit = await s.permitFor(s.start, s.call)
      const moved: StartPermit = {
        ...permit,
        call: other,
        start: { ...permit.start, execution: { ...permit.start.execution, call: other } },
      }
      refused(await s.startWith(moved), 'start with the permit of another call')
      expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart after the refusal')
    }),

    conformanceCase('P04', 'a start with the permit of another start is refused', async fixture => {
      const s = scene(fixture)
      const operation = operationId(`${s.call}/start-other`)
      const permit = await s.permitFor(s.start, s.call)
      const moved: StartPermit = {
        ...permit,
        operation,
        start: { ...permit.start, operation },
      }
      refused(await s.startWith(moved), 'start with the permit of another start')
      expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart after the refusal')
    }),

    conformanceCase(
      'P04',
      'a start with the permit of another tenant is refused',
      async fixture => {
        const s = scene(fixture)
        const { tenant } = otherAccessOf(fixture)
        const permit = await s.permitFor(s.start, s.call)
        const moved: StartPermit = {
          ...permit,
          tenant,
          start: { ...permit.start, execution: { ...permit.start.execution, tenant } },
        }
        refused(await s.startWith(moved), 'start with the permit of another tenant')
        expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart after the refusal')
      },
    ),

    conformanceCase(
      'P05',
      'inspectStart reports a running start as live on the same stream',
      async fixture => {
        const s = scene(fixture)
        const started = await s.begin()
        await s.emit()
        const live = expectKind(await s.lookupFinal(), 'live', 'inspectStart of a running start')
        assert.deepEqual(
          await readBatches(live.execution, null, 1, deadline(fixture)),
          await readBatches(started, null, 1, deadline(fixture)),
        )
      },
    ),

    conformanceCase(
      'P05',
      'inspectStart claims no execution for a start never made',
      async fixture => {
        const s = scene(fixture)
        expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart before any start')
      },
    ),

    conformanceCase(
      'P05',
      'inspectStart reports a settled start with the original final',
      async fixture => {
        const finish = handle(fixture.finish, 'finish')
        const s = scene(fixture)
        await s.begin()
        const final = completedFinal()
        await finish.call(fixture, s.start, final)
        const settled = expectKind(await s.lookupFinal(), 'settled', 'inspectStart after the final')
        assert.deepEqual(settled.fact, final)
        assert.ok(settled.event.length > 0, 'the event of the final is named')
        assert.ok(settled.source.owner.length > 0, 'the source of the final is named')
      },
    ),

    conformanceCase(
      'P05',
      'inspectStart reports a lost start with continuity evidence',
      async fixture => {
        const lose = handle(fixture.loseContinuity, 'loseContinuity')
        const s = scene(fixture)
        await s.begin()
        await lose.call(fixture, s.start)
        const lost = expectKind(await s.lookupFinal(), 'lost', 'inspectStart after the loss')
        assert.ok(lost.continuity.owner.length > 0, 'the owner of the continuity is named')
        assert.ok(lost.continuity.digest.length > 0, 'the digest of the continuity is named')
      },
    ),

    conformanceCase(
      'P05',
      'an unreadable inspection is unknown and never starts again',
      async fixture => {
        const blind = handle(fixture.blindInspection, 'blindInspection')
        const launches = handle(fixture.launches, 'launches')
        const s = scene(fixture)
        await s.begin()
        const before = launches.call(fixture)
        blind.call(fixture, s.start)
        const unknown = expectKind(await s.lookup(), 'unknown', 'inspectStart while blind')
        assert.ok(unknown.diagnostic.length > 0)
        assert.equal(launches.call(fixture), before)
      },
    ),

    conformanceCase(
      'P05',
      'facts keep the start, the source and a continuous cursor',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.begin()
        for (let index = 0; index < 3; index += 1) await s.emit()
        const batches = await readBatches(execution, null, 3, deadline(fixture))
        const facts = factsOf(batches)
        assert.equal(facts.length, 3)
        assert.equal(new Set(facts.map(fact => fact.event)).size, 3, 'the events are distinct')
        assert.equal(new Set(batches.map(batch => batch.batch)).size, batches.length)
        assert.equal(new Set(batches.map(batch => batch.cursor)).size, batches.length)
        assert.equal(batches[0]?.after, null)
        batches.forEach((batch, index) => {
          assert.deepEqual(batch.start, s.start)
          assert.deepEqual(batch.source, batches[0]?.source)
          if (index > 0) assert.equal(batch.after, batches[index - 1]?.cursor)
        })
      },
    ),

    conformanceCase(
      'P05',
      'facts reconnect from a saved cursor without a skip or a repeat',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.begin()
        for (let index = 0; index < 3; index += 1) await s.emit()
        const all = await readBatches(execution, null, 3, deadline(fixture))
        const saved = all[0]?.cursor
        assert.ok(saved !== undefined, 'the stream gave a first batch')
        // The facts after the saved cursor: those of the later batches, and no others.
        const later = factsOf(all.slice(1))
        assert.deepEqual(
          factsOf(await readBatches(execution, saved, later.length, deadline(fixture))),
          later,
        )
      },
    ),

    conformanceCase(
      'P05',
      'an acknowledgement resent for a batch returns the original evidence',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.begin()
        await s.emit()
        const [batch] = await readBatches(execution, null, 1, deadline(fixture))
        assert.ok(batch !== undefined)
        const receipt: FactReceipt = {
          start: s.start.operation,
          batch: batch.batch,
          cursor: batch.cursor,
          custody: evidence('fact-custody'),
        }
        const first = succeeded(await execution.acknowledge(receipt), 'acknowledge')
        assert.deepEqual(
          succeeded(await execution.acknowledge(receipt), 'acknowledge again'),
          first,
        )
      },
    ),

    conformanceCase(
      'P05',
      'an acknowledgement releases the source from its duty once',
      async fixture => {
        const pending = handle(fixture.pendingAcknowledgements, 'pendingAcknowledgements')
        const s = scene(fixture)
        const execution = await s.begin()
        // Two facts: a source that counts its duty, not its batches, shows a second release.
        await s.emit()
        await s.emit()
        const [batch] = await readBatches(execution, null, 2, deadline(fixture))
        assert.ok(batch !== undefined)
        const before = pending.call(fixture, s.start)
        assert.ok(before >= 1, 'the source waits for the receipt of the batch')
        const receipt: FactReceipt = {
          start: s.start.operation,
          batch: batch.batch,
          cursor: batch.cursor,
          custody: evidence('fact-custody'),
        }
        succeeded(await execution.acknowledge(receipt), 'acknowledge')
        assert.equal(pending.call(fixture, s.start), before - 1)
        succeeded(await execution.acknowledge(receipt), 'acknowledge again')
        assert.equal(pending.call(fixture, s.start), before - 1)
      },
    ),

    conformanceCase('P05', 'a closed channel is not a final', async fixture => {
      const s = scene(fixture)
      const execution = await s.begin()
      await s.emit()
      await readBatches(execution, null, 1, deadline(fixture))
      expectKind(await s.lookupFinal(), 'live', 'inspectStart after the stream was closed')
    }),

    conformanceCase(
      'P07',
      'a stop resent by its operation returns the original receipt',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.begin()
        const control = s.dispatch('stop-1')
        const first = succeeded(await execution.stop(control), 'stop')
        const resent = succeeded(await execution.stop(control), 'stop again')
        resendRecalls(answers.stop, { earlier: first, later: resent }, 'stop again')
        const inspected = succeeded(await execution.inspectControl(control), 'inspectControl')
        resendRecalls(
          answers.inspectControl,
          { earlier: resent, later: inspected },
          'inspectControl',
        )
        // The stop that lands answers the final that a resend gave, if it gave one.
        await s.stopLanded(execution, control, inspected)
      },
    ),

    conformanceCase('P07', 'an accepted stop is not a stopped execution', async fixture => {
      const holdStop = handle(fixture.holdStop, 'holdStop')
      const completeStop = handle(fixture.completeStop, 'completeStop')
      const s = scene(fixture)
      const execution = await s.begin()
      const control = s.dispatch('stop-1')
      holdStop.call(fixture, s.start)
      const first = succeeded(await execution.stop(control), 'stop')
      expectKind(await s.lookupFinal(), 'live', 'inspectStart while the stop is only accepted')
      const during = succeeded(await execution.inspectControl(control), 'inspectControl')
      resendRecalls(
        answers.inspectControl,
        { earlier: first, later: during },
        'inspectControl while accepted',
      )
      assert.ok(isProgress(during, answers.inspectControl), 'the executor has not ended')
      await completeStop.call(fixture, s.start)
      const stopped = succeeded(
        await execution.inspectControl(control),
        'inspectControl after the executor ended',
      )
      assert.equal(stopped.kind, 'stopped')
      assert.ok('evidence' in stopped && stopped.evidence.digest.length > 0)
      assert.notEqual((await s.lookupFinal()).kind, 'live')
    }),

    conformanceCase(
      'P07',
      'stopping an execution that ended reports already-ended',
      async fixture => {
        const finish = handle(fixture.finish, 'finish')
        const s = scene(fixture)
        const execution = await s.begin()
        await finish.call(fixture, s.start, completedFinal())
        const control = s.dispatch('stop-1')
        // A provider may answer that the stop is on its way: it is driven to its end, and read.
        const first = succeeded(await execution.stop(control), 'stop')
        const progress = await s.stopLanded(execution, control, first)
        assert.equal(progress.kind, 'already-ended')
      },
    ),

    conformanceCase(
      'P01',
      'a stop operation reused with another input is a conflict that changes nothing',
      async fixture => {
        const s = scene(fixture)
        const execution = await s.begin()
        const first = await s.stopLanded(
          execution,
          s.dispatch('stop-1'),
          succeeded(await execution.stop(s.dispatch('stop-1')), 'stop'),
        )
        const other = s.dispatch('stop-1', 'sha256:another-control')
        assert.equal(
          refused(await execution.stop(other), 'stop with another input').kind,
          'conflict',
        )
        resendRecalls(
          answers.inspectControl,
          {
            earlier: first,
            later: succeeded(
              await execution.inspectControl(s.dispatch('stop-1')),
              'inspectControl',
            ),
          },
          'inspectControl after the conflict',
        )
      },
    ),

    conformanceCase(
      'P01',
      'a start operation reused with another input is a conflict that changes nothing',
      async fixture => {
        const launches = handle(fixture.launches, 'launches')
        const s = scene(fixture)
        await s.begin()
        const request = fixture.request ?? fixedRequest()
        const other: FixedToolRequest = {
          ...request,
          scope: { ...request.scope, key: 'scope-another-input' },
        }
        const permit =
          fixture.permit !== undefined
            ? await fixture.permit(s.start)
            : syntheticPermit(fixture.access, s.call, s.start, other)
        const answer = await fixture.binding.start(
          { ...fixture.access, call: s.call, start: s.start, permit, request: other },
          fixture.environment,
        )
        const failure = refused(answer, 'start with another input')
        // A provider that judges the permit first may call the permit invalid.
        assert.ok(
          failure.kind === 'conflict' ||
            (fixture.permit !== undefined && failure.kind === 'invalid'),
          `start with another input: ${failure.kind}`,
        )
        assert.equal(launches.call(fixture), 1, 'the conflict launched')
      },
    ),

    conformanceCase(
      'P05',
      'another tenant learns nothing of a start by inspectStart',
      async fixture => {
        const own = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        await own.begin()
        // The other tenant names the same call and start: only the tenant identifies the record.
        await crossTenantAnswers({
          ask: { real: other.tryLookup, ghost: () => other.lookupOf(callId('call-ghost')) },
          row: executorBindingAnswers.inspectStart,
          completion: other.completion,
          identifying: identifyingValues(fixture.access.tenant),
          submitted: [...other.sends, other.start],
          what: 'inspectStart by another tenant',
        })
        expectKind(await own.lookupFinal(), 'live', 'inspectStart by the own tenant')
      },
    ),

    conformanceCase(
      'P05',
      'the same start of another tenant is an execution of its own',
      async fixture => {
        handle(fixture.emit, 'emit')
        const own = scene(fixture)
        const other = scene(fixture, otherAccessOf(fixture))
        await own.begin()
        const foreign = succeeded(
          await other.startWith(await other.permitFor(other.start, other.call)),
          'start by another tenant',
        )
        await own.emit()
        assert.deepEqual(
          await drain(foreign, fixture.quietMs ?? DEFAULT_QUIET_MS),
          [],
          'the execution of another tenant carries a fact',
        )
      },
    ),
  ]
}

// ---------------------------------------------------------------------------------------------
// The non-durable double
// ---------------------------------------------------------------------------------------------

type Tenant = Access<unknown>['tenant']
type Status = 'live' | 'settled' | 'lost'
type Waiter = () => void

type Execution = {
  readonly start: Start
  readonly source: DurableEvidence
  readonly batches: FactBatch<ContentBlock>[]
  readonly acknowledged: Map<string, DurableEvidence>
  readonly pending: Set<string>
  readonly controls: Map<string, ControlProgress>
  /** What each stop operation asked: the same identity with another input is a conflict. */
  readonly controlInputs: Map<string, string>
  readonly requestDigest: string
  readonly waiters: Set<Waiter>
  status: Status
  settled: { event: string; fact: FinalFact } | null
  continuity: DurableEvidence | null
  stopHeld: ControlDispatch | null
  blind: boolean
  handle: ToolLiveExecution<ContentBlock> | null
}

export interface MemoryToolExecutorBinding<P, E> {
  readonly durability: 'none'
  readonly binding: LiveOnly<P, E>
  readonly controls: Readonly<{
    launches(): number
    emit(start: Start, fact: Fact): Promise<void>
    finish(start: Start, final: FinalFact): Promise<void>
    loseContinuity(start: Start): Promise<void>
    blindInspection(start: Start): void
    pendingAcknowledgements(start: Start): number
    holdStop(start: Start): void
    completeStop(start: Start): Promise<void>
    settle(): Promise<void>
  }>
}

const reply = <T>(outcome: Outcome<T, ToolFailure>): Promise<Outcome<T, ToolFailure>> =>
  Promise.resolve(outcome)

/**
 * A live-only executor in memory. A start is keyed by tenant, call and start operation: a resend
 * joins the execution that exists. The executor keeps the facts it produced, so a stream read
 * from a cursor continues there, and it ends only when the channel is closed by the reader.
 */
export function createMemoryToolExecutorBinding<P, E>(): MemoryToolExecutorBinding<P, E> {
  const executions = new Map<string, Execution>()
  const exclusions = new Map<string, DurableEvidence>()
  /** The executions whose next stop is answered as accepted only. */
  const heldStops = new Set<Execution>()
  let launched = 0
  let minted = 0

  const mint = (kind: string, content: unknown): DurableEvidence => {
    minted += 1
    return mintEvidence(`executor/${kind}/${minted}`, content)
  }
  const keyOf = (tenant: Tenant, call: ToolCallId, operation: string): string =>
    JSON.stringify([tenantKey(tenant), call, operation])
  const stateOf = (start: Start): Execution => {
    const state = executions.get(
      keyOf(start.execution.tenant, start.execution.call, start.operation),
    )
    if (state === undefined) throw new Error('the double has no execution of this start')
    return state
  }
  const wake = (state: Execution): void => {
    for (const waiter of state.waiters) waiter()
  }
  const append = (state: Execution, fact: Fact): void => {
    const index = state.batches.length + 1
    const last = state.batches.at(-1)
    state.batches.push({
      start: state.start,
      source: state.source,
      batch: `batch-${index}`,
      after: last?.cursor ?? null,
      cursor: `cursor-${index}`,
      events: [{ event: `event-${index}`, fact }],
    })
    state.pending.add(`batch-${index}`)
    wake(state)
  }
  const stopFor = (state: Execution, control: ControlDispatch): void => {
    // The executor ends and the final records why: a control interrupted it.
    state.status = 'settled'
    const final: FinalFact = {
      ...completedFinal(),
      terminal: {
        kind: 'interrupted',
        cause: { kind: 'control', operation: control.operation, withdrawn: false },
      },
      effect: { kind: 'unknown', diagnostic: 'the executor was stopped' },
    }
    append(state, final)
    state.settled = { event: `event-${state.batches.length}`, fact: final }
  }

  const handleOf = (state: Execution): ToolLiveExecution<ContentBlock> => {
    state.handle ??= {
      facts: input => factsOf(state, input.after, input.signal),
      acknowledge: receipt => {
        let ack = state.acknowledged.get(receipt.batch)
        if (ack === undefined) {
          ack = mint('ack', { batch: receipt.batch, custody: receipt.custody })
          state.acknowledged.set(receipt.batch, ack)
          state.pending.delete(receipt.batch)
        }
        return reply(succeed(ack))
      },
      stop: control => {
        const asked = digestOf({
          kind: 'stop',
          inputDigest: control.inputDigest,
          intent: control.intent,
        })
        const before = state.controlInputs.get(control.operation)
        if (before !== undefined && before !== asked)
          return reply(fail({ kind: 'conflict', operation: control.operation }))
        state.controlInputs.set(control.operation, asked)
        const known = state.controls.get(control.operation)
        if (known !== undefined) return reply(succeed(known))
        if (state.status !== 'live') {
          const ended: ControlProgress = {
            kind: 'already-ended',
            evidence: mint('already-ended', { control: control.operation }),
          }
          state.controls.set(control.operation, ended)
          return reply(succeed(ended))
        }
        if (heldStops.has(state)) {
          heldStops.delete(state)
          state.stopHeld = control
          const accepted: ControlProgress = {
            kind: 'accepted',
            evidence: mint('accepted', { control: control.operation }),
          }
          state.controls.set(control.operation, accepted)
          return reply(succeed(accepted))
        }
        stopFor(state, control)
        const stopped: ControlProgress = {
          kind: 'stopped',
          evidence: mint('stopped', { control: control.operation }),
        }
        state.controls.set(control.operation, stopped)
        return reply(succeed(stopped))
      },
      inspectControl: control =>
        reply(
          succeed(
            state.controls.get(control.operation) ?? {
              kind: 'unknown',
              diagnostic: 'no control of this operation was seen',
            },
          ),
        ),
      answer: () => reply(fail(unsupported())),
      inspectAnswer: () => reply(fail(unsupported())),
    }
    return state.handle
  }

  async function* factsOf(
    state: Execution,
    after: string | null,
    signal: AbortSignal,
  ): AsyncGenerator<FactBatch<ContentBlock>> {
    let next = 0
    if (after !== null) {
      const at = state.batches.findIndex(batch => batch.cursor === after)
      if (at < 0) throw new Error('the cursor is not one of this stream')
      next = at + 1
    }
    while (!signal.aborted) {
      const batch = state.batches[next]
      if (batch !== undefined) {
        next += 1
        yield batch
        continue
      }
      await new Promise<void>(resolve => {
        const done = (): void => {
          state.waiters.delete(done)
          signal.removeEventListener('abort', done)
          resolve()
        }
        state.waiters.add(done)
        signal.addEventListener('abort', done)
      })
    }
  }

  const binding: LiveOnly<P, E> = {
    kind: 'live-only',
    start: input => {
      // The permit names this tenant, this call and this start, or the executor does not start.
      const { permit } = input
      if (
        tenantKey(permit.tenant) !== tenantKey(input.tenant) ||
        permit.call !== input.call ||
        permit.operation !== input.start.operation ||
        permit.start.operation !== input.start.operation ||
        permit.start.execution.call !== input.call ||
        tenantKey(permit.start.execution.tenant) !== tenantKey(input.tenant)
      )
        return reply(
          fail({
            kind: 'invalid',
            field: 'permit',
            reason: 'the permit names another tenant, call or start',
          }),
        )
      const at = keyOf(input.tenant, input.call, input.start.operation)
      let state = executions.get(at)
      if (state !== undefined && state.requestDigest !== digestOf(input.request))
        return reply(fail({ kind: 'conflict', operation: input.start.operation }))
      if (state === undefined) {
        launched += 1
        state = {
          start: input.start,
          source: mint('source', { start: input.start.operation, launch: launched }),
          batches: [],
          acknowledged: new Map(),
          pending: new Set(),
          controls: new Map(),
          controlInputs: new Map(),
          requestDigest: digestOf(input.request),
          waiters: new Set(),
          status: 'live',
          settled: null,
          continuity: null,
          stopHeld: null,
          blind: false,
          handle: null,
        }
        executions.set(at, state)
      }
      return reply(succeed(handleOf(state)))
    },
    inspectStart: input => {
      const state = executions.get(keyOf(input.tenant, input.call, input.start.operation))
      if (state?.blind === true)
        return reply(succeed({ kind: 'unknown', diagnostic: 'the executor cannot be asked now' }))
      if (state === undefined) {
        // The same start that was never made gets the same exclusion every time it is asked.
        const at = keyOf(input.tenant, input.call, input.start.operation)
        const exclusion = exclusions.get(at) ?? mint('exclusion', { start: input.start.operation })
        exclusions.set(at, exclusion)
        return reply(succeed({ kind: 'not-started', exclusion }))
      }
      if (state.status === 'lost' && state.continuity !== null)
        return reply(succeed({ kind: 'lost', continuity: state.continuity }))
      if (state.status === 'settled' && state.settled !== null)
        return reply(
          succeed({
            kind: 'settled',
            source: state.source,
            event: state.settled.event,
            fact: state.settled.fact,
          }),
        )
      return reply(succeed({ kind: 'live', execution: handleOf(state) }))
    },
  }

  const controls: MemoryToolExecutorBinding<P, E>['controls'] = {
    launches: () => launched,
    emit: (start, fact) => {
      append(stateOf(start), fact)
      return Promise.resolve()
    },
    finish: (start, final) => {
      const state = stateOf(start)
      state.status = 'settled'
      append(state, final)
      state.settled = { event: `event-${state.batches.length}`, fact: final }
      return Promise.resolve()
    },
    loseContinuity: start => {
      const state = stateOf(start)
      state.status = 'lost'
      state.continuity = mint('continuity', { start: start.operation })
      return Promise.resolve()
    },
    blindInspection: start => {
      stateOf(start).blind = true
    },
    pendingAcknowledgements: start => stateOf(start).pending.size,
    holdStop: start => {
      heldStops.add(stateOf(start))
    },
    // Every answer of the double is final when the call returns, so nothing is left to land.
    settle: () => Promise.resolve(),
    completeStop: start => {
      const state = stateOf(start)
      const control = state.stopHeld
      if (control === null) return Promise.resolve()
      state.stopHeld = null
      stopFor(state, control)
      state.controls.set(control.operation, {
        kind: 'stopped',
        evidence: mint('stopped', { control: control.operation }),
      })
      return Promise.resolve()
    },
  }
  return Object.freeze({ durability: 'none' as const, binding, controls })
}

function unsupported(): ToolFailure {
  return {
    kind: 'unsupported',
    adoption: adoption('memory-executor-binding'),
    reason: 'the in-memory executor does not wait for an answer',
  }
}

/** A fresh fixture over a fresh in-memory executor, with every control handle. */
export function memoryToolExecutorBindingFixture(): ToolExecutorBindingFixture<
  string,
  { readonly resource: string }
> {
  const { binding, controls } = createMemoryToolExecutorBinding<
    string,
    { readonly resource: string }
  >()
  return {
    binding,
    access: memoryAccess('tester'),
    otherAccess: memoryOtherAccess('tester-other'),
    environment: { resource: 'resource-1' },
    launches: controls.launches,
    emit: controls.emit,
    finish: controls.finish,
    loseContinuity: controls.loseContinuity,
    blindInspection: controls.blindInspection,
    pendingAcknowledgements: controls.pendingAcknowledgements,
    holdStop: controls.holdStop,
    completeStop: controls.completeStop,
    settle: controls.settle,
  }
}
