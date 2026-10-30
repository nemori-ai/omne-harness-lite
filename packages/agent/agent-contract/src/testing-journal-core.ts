// The core conformance suite of `AgentJournal` (SPEC "并发与提交" and "托管协调与运行实例"): the
// facts that every Journal binding, standalone or coordinated, must give the same answers to.
// It reads only what the port returns. A fixture opens executions under its own binding; what the
// coordinator side needs so that an ordinary end can succeed is the fixture's business.
//
// The suite covers: the revision rule of "执行修订" (Q3), the receipts and index of a new
// operation that recognizes an existing fact ("原操作认回与恢复", Q13), the atomic control facts and
// the late stages after ended ("六个阶段", Q1 and Q1b), the persistent rejection of contradicting
// evidence and the four query conclusions ("查询的四种结论与持久拒绝", R2), and the order of
// "判定次序与失败映射" for ended and superseded attachments (Q11).
import assert from 'node:assert/strict'
import { judgeMessage, type Message } from '@omne-harness/message'
import { decodeModelCallId } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { AgentCheckpoint, Failure, ProducedResult, Reply } from './evaluation.ts'
import type {
  AcceptedInput,
  AgentEvent,
  CommandReceipt,
  ExecutionSnapshot,
  FinishResult,
} from './execution.ts'
import {
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeInputId,
  type Access,
  type AgentExecutionId,
  type AgentOperationId,
  type Authority,
  type DurableEvidence,
} from './identity.ts'
import type { AgentJournal, JournalCommit } from './journal.ts'
import { canonicalText, uncoveredCase, type ConformanceCase } from './testing-case.ts'

/** One execution the fixture opened, with the handles the suite drives it through. */
export interface AgentJournalCoreOpened<P> {
  readonly journal: AgentJournal<P>
  readonly access: Access<P>
  readonly execution: AgentExecutionId
  readonly receipt: CommandReceipt
  readonly authority: Authority
  /** The checkpoint the execution was opened with; the suite derives every commit from it. */
  readonly checkpoint: AgentCheckpoint
  /** Scripts the next write of `method` to answer commit-unknown with the given outcome. Optional. */
  readonly faultNext?: (
    method: 'recordControl' | 'submit',
    outcome: 'applied' | 'dropped' | 'pending',
  ) => void
  /** Attaches a new attachment that supersedes the current one, under the fixture's rules. Optional. */
  readonly takeover?: (name: string) => Promise<Authority>
}

/** What a provider gives the core suite. */
export interface AgentJournalCoreFixture<P> {
  /** Opens a fresh execution for the case `name`; every call is independent of the others. */
  open(name: string): Promise<AgentJournalCoreOpened<P>>
}

function identity<T>(decoded: Outcome<T, unknown>, what: string): T {
  if (!('ok' in decoded)) throw new TypeError(`the suite value ${what} is invalid`)
  return decoded.ok
}
const operation = (name: string): AgentOperationId =>
  identity(decodeAgentOperationId(`core-${name}`), name)
const evidence = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: `suite:${record}`,
})

function message(text: string, suffix: string): Message {
  const judged = judgeMessage({
    id: `msg_${'c'.repeat(22 - suffix.length)}${suffix}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: `blk_${suffix}`, visibility: { toHuman: true, toModel: true }, text },
    ],
  })
  if (!('ok' in judged)) throw new TypeError(`the suite message ${text} is invalid`)
  return judged.ok
}

function input(id: string, text = id): AcceptedInput {
  return {
    id: identity(decodeInputId(`core-${id}`), id),
    content: message(text, id.padStart(2, '0').slice(-2)),
    source: null,
    priority: 'ordinary',
  }
}

function result(call: string): ProducedResult {
  return {
    producer: { kind: 'model', call: identity(decodeModelCallId(`mcall_core-${call}`), call) },
    version: 'v1',
    delivery: null,
    source: evidence(`result/${call}`),
  }
}

async function ok<T>(reply: Reply<T>, what: string): Promise<T> {
  const outcome = await reply
  assert.ok('ok' in outcome, `${what} should succeed, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

async function refused<T>(reply: Reply<T>, kind: Failure['kind'], what: string): Promise<Failure> {
  const outcome = await reply
  assert.ok('failure' in outcome, `${what} should fail with ${kind}, got success`)
  assert.equal(outcome.failure.kind, kind, `${what} should fail with ${kind}`)
  return outcome.failure
}

async function load<P>(opened: AgentJournalCoreOpened<P>): Promise<ExecutionSnapshot> {
  return ok(opened.journal.load({ ...opened.access, execution: opened.execution }), 'load')
}

async function revision<P>(opened: AgentJournalCoreOpened<P>): Promise<number> {
  return Number((await load(opened)).revision)
}

async function events<P>(opened: AgentJournalCoreOpened<P>): Promise<readonly AgentEvent[]> {
  const page = await ok(
    opened.journal.output.read({
      ...opened.access,
      execution: opened.execution,
      after: null,
      limit: 100,
    }),
    'read',
  )
  assert.equal(page.kind, 'page', 'the suite reads within the retained window')
  return page.kind === 'page' ? page.events : []
}

function query<P>(opened: AgentJournalCoreOpened<P>, id: AgentOperationId) {
  return ok(
    opened.journal.query({ ...opened.access, execution: opened.execution, operation: id }),
    `query ${id}`,
  )
}

/** A conditional commit at the current snapshot, as one coordinator step would write it. */
function commitAt<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authority: Authority = opened.authority,
  overrides: Partial<JournalCommit<P>> = {},
): JournalCommit<P> {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    authority,
    expected: snapshot.revision,
    checkpoint: { ...opened.checkpoint, position: name },
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    ...overrides,
  }
}

/** Takes every accepted input into one batch, as I0 would, so an ordinary end is not blocked. */
async function takeInputs<P>(opened: AgentJournalCoreOpened<P>, name = 'take'): Promise<void> {
  const snapshot = await load(opened)
  const taken = await ok(
    opened.journal.inputs({
      ...opened.access,
      execution: opened.execution,
      watermark: snapshot.inputWatermark,
    }),
    'inputs',
  )
  await ok(
    opened.journal.commit(
      commitAt(opened, snapshot, name, opened.authority, {
        checkpoint: { ...snapshot.checkpoint, inputBatch: taken.batch.id },
        events: [{ kind: 'input-taken', batch: taken.batch }],
      }),
    ),
    'the I0 commit',
  )
}

function finishInput<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authority: Authority = opened.authority,
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    authorization: { kind: 'advancement' as const, authority },
    expected: snapshot.revision,
    intent: {
      conclusion: { kind: 'complete' as const },
      inputWatermark: snapshot.inputWatermark,
      obligations: evidence(`obligations/${name}`),
      beforeTerminal: evidence(`before-terminal/${name}`),
      failure: null,
    },
  }
}

/** Takes the inputs, then ends through `tryFinish` with an ordinary completion. */
async function end<P>(opened: AgentJournalCoreOpened<P>, name = 'end'): Promise<CommandReceipt> {
  await takeInputs(opened, `take-${name}`)
  const finished = await ok(
    opened.journal.tryFinish(finishInput(opened, await load(opened), name)),
    'tryFinish',
  )
  assert.equal(finished.kind, 'ended', `the ordinary end should succeed, got ${finished.kind}`)
  return (finished as Extract<FinishResult, { kind: 'ended' }>).receipt
}

function cancelControl<P>(opened: AgentJournalCoreOpened<P>, name = 'cancel') {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    command: { kind: 'cancel' as const, reason: evidence(`reason/${name}`) },
  }
}

function stage<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  target: AgentOperationId,
  which:
    | 'intent-established'
    | 'qualification-revoked'
    | 'producer-confirmed'
    | 'physically-stopped'
    | 'duty-released',
  state: 'reached' | 'unresolved' = 'reached',
  source = evidence(`stage/${which}`),
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    target,
    stage: which,
    state,
    source,
  }
}

function controlEvents(all: readonly AgentEvent[]) {
  return all.flatMap(event =>
    event.body.kind === 'control'
      ? [[event.body.operation, event.body.stage, event.body.state] as const]
      : [],
  )
}

/**
 * Runs `write` twice and returns how much the revision advanced after the first and after the
 * second call: a new fact advances it by one, and the same operation recognizes without a second.
 */
async function advances<P>(
  opened: AgentJournalCoreOpened<P>,
  write: () => Promise<unknown>,
): Promise<readonly [number, number]> {
  const before = await revision(opened)
  await write()
  const middle = await revision(opened)
  await write()
  return [middle - before, (await revision(opened)) - middle]
}

/** The cases that every `AgentJournal` binding passes. */
export function agentJournalCoreConformance<P>(
  fixture: AgentJournalCoreFixture<P>,
): readonly ConformanceCase[] {
  return [
    {
      name: 'Q3: each atomic mutation that establishes a new fact allocates exactly one revision; the same operation recognizes without another',
      run: async () => {
        const opened = await fixture.open('q3-one-revision')
        const { journal } = opened
        const snapshot = await load(opened)
        const commit = commitAt(opened, snapshot, 'commit')
        assert.deepEqual(await advances(opened, () => journal.commit(commit)), [1, 0], 'commit')
        const submit = {
          ...opened.access,
          execution: opened.execution,
          operation: operation('submit'),
          value: input('2'),
        }
        assert.deepEqual(await advances(opened, () => journal.submit(submit)), [1, 0], 'submit')
        const control = cancelControl(opened)
        assert.deepEqual(await advances(opened, () => journal.control(control)), [1, 0], 'control')
        const acknowledge = {
          ...opened.access,
          execution: opened.execution,
          operation: operation('ack'),
          through: '1',
          receipt: null,
        }
        assert.deepEqual(
          await advances(opened, () => journal.acknowledge(acknowledge)),
          [1, 0],
          'acknowledge',
        )
        const produced = result('r1')
        const record = {
          ...opened.access,
          execution: opened.execution,
          operation: operation('result'),
          result: produced,
          consumption: identity(decodeConsumptionId('core-k1'), 'k1'),
          transfer: {
            kind: 'processed' as const,
            result: produced,
            consumption: identity(decodeConsumptionId('core-k1'), 'k1'),
            completion: evidence('done'),
          },
          release: { kind: 'pending' as const },
        }
        assert.deepEqual(
          await advances(opened, () => journal.recordResult(record)),
          [1, 0],
          'recordResult',
        )
        const intent = stage(opened, 'intent', control.operation, 'intent-established')
        assert.deepEqual(
          await advances(opened, () => journal.recordControl(intent)),
          [1, 0],
          'recordControl',
        )
      },
    },
    {
      name: 'Q3: a commit that establishes no new fact does not advance the revision, answers the current revision, writes no event and is still queryable',
      run: async () => {
        const opened = await fixture.open('q3-unchanged-commit')
        const { journal } = opened
        const first = commitAt(opened, await load(opened), 'first')
        const receipt = await ok(journal.commit(first), 'the first commit')
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const unchanged = commitAt(opened, before, 'unchanged', opened.authority, {
          checkpoint: first.checkpoint,
        })
        const again = await ok(journal.commit(unchanged), 'the unchanged commit')
        assert.equal(again.revision, receipt.revision, 'the receipt names the current revision')
        assert.equal(again.operation, unchanged.operation)
        assert.deepEqual(await load(opened), before, 'nothing of the execution changed')
        assert.equal((await events(opened)).length, emitted, 'no event was written')
        assert.deepEqual(await query(opened, unchanged.operation), {
          kind: 'committed',
          receipt: again,
        })
        assert.deepEqual(await ok(journal.commit(unchanged), 'retry'), again)
      },
    },
    {
      name: 'Q13: a new submit of the same input with the same content recognizes the original acceptance: receipt of the new operation at the revision of the input, no new revision, query committed',
      run: async () => {
        const opened = await fixture.open('q13-submit')
        const { journal } = opened
        const value = input('7')
        const first = await ok(
          journal.submit({
            ...opened.access,
            execution: opened.execution,
            operation: operation('submit-a'),
            value,
          }),
          'the first submit',
        )
        const before = await load(opened)
        const second = await ok(
          journal.submit({
            ...opened.access,
            execution: opened.execution,
            operation: operation('submit-b'),
            value,
          }),
          'the recognizing submit',
        )
        assert.equal(second.operation, operation('submit-b'), 'the receipt names B')
        assert.equal(second.revision, first.revision, 'at the revision of the recognized fact')
        assert.deepEqual(await load(opened), before, 'the snapshot did not change')
        assert.deepEqual(await query(opened, operation('submit-b')), {
          kind: 'committed',
          receipt: second,
        })
        await refused(
          journal.submit({
            ...opened.access,
            execution: opened.execution,
            operation: operation('submit-c'),
            value: { ...value, content: input('7', 'other text').content },
          }),
          'conflict',
          'the same input with other content',
        )
        assert.deepEqual(await load(opened), before)
      },
    },
    {
      name: 'Q1 and Q13: control and recordControl establish each stage fact with its control event and the original result at once; the same fact under a new operation is recognized at its revision without a second event',
      run: async () => {
        const opened = await fixture.open('q1-stages')
        const { journal } = opened
        const control = cancelControl(opened)
        const accepted = await ok(journal.control(control), 'control')
        assert.deepEqual(await query(opened, control.operation), {
          kind: 'committed',
          receipt: accepted,
        })
        assert.deepEqual(controlEvents(await events(opened)), [
          [control.operation, 'accepted', 'reached'],
        ])
        const unresolved = stage(
          opened,
          'intent-unresolved',
          control.operation,
          'intent-established',
          'unresolved',
          evidence('intent/unknown'),
        )
        const first = await ok(journal.recordControl(unresolved), 'the unresolved stage')
        assert.equal(Number(first.revision), Number(accepted.revision) + 1)
        const reached = stage(
          opened,
          'intent-reached',
          control.operation,
          'intent-established',
          'reached',
          evidence('intent/reached'),
        )
        const second = await ok(
          journal.recordControl(reached),
          'unresolved to reached is a new fact',
        )
        assert.equal(Number(second.revision), Number(first.revision) + 1)
        assert.deepEqual(controlEvents(await events(opened)), [
          [control.operation, 'accepted', 'reached'],
          [control.operation, 'intent-established', 'unresolved'],
          [control.operation, 'intent-established', 'reached'],
        ])
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const recognized = await ok(
          journal.recordControl({ ...reached, operation: operation('intent-again') }),
          'the same fact under a new operation',
        )
        assert.equal(recognized.operation, operation('intent-again'))
        assert.equal(recognized.revision, second.revision, 'at the revision of the fact')
        assert.deepEqual(await load(opened), before, 'no new revision')
        assert.equal((await events(opened)).length, emitted, 'no second event')
        assert.deepEqual(await query(opened, operation('intent-again')), {
          kind: 'committed',
          receipt: recognized,
        })
        assert.deepEqual(
          await query(opened, reached.operation),
          { kind: 'committed', receipt: second },
          'the original result stays',
        )
      },
    },
    {
      name: 'R2: evidence that contradicts an established stage returns conflict, saves an audit that advances one revision without an event, and query answers rejected; the same retry recognizes the conflict without another revision',
      run: async () => {
        const opened = await fixture.open('r2-audit')
        const { journal } = opened
        const control = cancelControl(opened)
        await ok(journal.control(control), 'control')
        const reached = stage(opened, 'intent', control.operation, 'intent-established')
        await ok(journal.recordControl(reached), 'the established stage')
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const contradicting = {
          ...reached,
          operation: operation('contradict'),
          source: evidence('stage/other'),
        }
        const failure = await refused(
          journal.recordControl(contradicting),
          'conflict',
          'contradicting evidence',
        )
        assert.deepEqual(failure, { kind: 'conflict', operation: contradicting.operation })
        const after = await load(opened)
        assert.equal(
          Number(after.revision),
          Number(before.revision) + 1,
          'the audit advances one revision',
        )
        assert.deepEqual(after.controls, before.controls, 'the stage facts did not change')
        assert.equal((await events(opened)).length, emitted, 'no event')
        const conclusion = await query(opened, contradicting.operation)
        assert.equal(conclusion.kind, 'rejected')
        if (conclusion.kind !== 'rejected') return
        assert.deepEqual(conclusion.failure, failure)
        assert.equal(conclusion.revision, after.revision)
        assert.equal(typeof conclusion.audit.record, 'string')
        assert.deepEqual(
          await refused(journal.recordControl(contradicting), 'conflict', 'the same retry'),
          failure,
        )
        assert.deepEqual(await load(opened), after, 'the retry wrote nothing')
        await refused(
          journal.recordControl({ ...contradicting, source: evidence('stage/third') }),
          'conflict',
          'another input under the rejected operation',
        )
        assert.deepEqual(await load(opened), after, 'no second audit')
        assert.deepEqual(await query(opened, contradicting.operation), conclusion)
        assert.equal((await query(opened, reached.operation)).kind, 'committed')
      },
    },
    {
      name: 'R2: a rejection whose receipt is lost is found as rejected, not as committed, excluded or unknown',
      run: async () => {
        const opened = await fixture.open('r2-lost-receipt')
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
        }
        const { journal } = opened
        const control = cancelControl(opened)
        await ok(journal.control(control), 'control')
        const reached = stage(opened, 'intent', control.operation, 'intent-established')
        await ok(journal.recordControl(reached), 'the established stage')
        const contradicting = {
          ...reached,
          operation: operation('contradict'),
          source: evidence('stage/other'),
        }
        opened.faultNext?.('recordControl', 'applied')
        await refused(journal.recordControl(contradicting), 'commit-unknown', 'the lost receipt')
        const conclusion = await query(opened, contradicting.operation)
        assert.equal(conclusion.kind, 'rejected')
        assert.deepEqual(
          await refused(journal.recordControl(contradicting), 'conflict', 'the retry'),
          { kind: 'conflict', operation: contradicting.operation },
        )
      },
    },
    {
      name: 'query: committed carries the original receipt, an operation never seen is unknown, a dropped write is excluded with evidence',
      run: async () => {
        const opened = await fixture.open('query-conclusions')
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
        }
        assert.deepEqual(await query(opened, opened.receipt.operation), {
          kind: 'committed',
          receipt: opened.receipt,
        })
        assert.deepEqual(await query(opened, operation('never')), { kind: 'unknown' })
        opened.faultNext?.('submit', 'dropped')
        await refused(
          opened.journal.submit({
            ...opened.access,
            execution: opened.execution,
            operation: operation('dropped'),
            value: input('3'),
          }),
          'commit-unknown',
          'the dropped write',
        )
        const excluded = await query(opened, operation('dropped'))
        assert.equal(excluded.kind, 'excluded')
        if (excluded.kind === 'excluded') assert.equal(typeof excluded.evidence.record, 'string')
      },
    },
    {
      name: 'Q1b: after a lawful ended, the three late stages are saved with a new revision and no event; a new intent or revocation returns terminal',
      run: async () => {
        const opened = await fixture.open('q1b-late-stages')
        const { journal } = opened
        const control = cancelControl(opened)
        await ok(journal.control(control), 'control')
        const ended = await end(opened)
        const before = await load(opened)
        const emitted = await events(opened)
        assert.equal(emitted.at(-1)?.body.kind, 'ended')
        for (const which of [
          'producer-confirmed',
          'physically-stopped',
          'duty-released',
        ] as const) {
          const late = await ok(
            journal.recordControl(stage(opened, `late-${which}`, control.operation, which)),
            `the late stage ${which}`,
          )
          assert.ok(Number(late.revision) > Number(before.revision), 'a new revision')
          assert.deepEqual(await events(opened), emitted, 'no event after ended')
        }
        const after = await load(opened)
        assert.deepEqual(after.state, before.state, 'the ended conclusion did not change')
        assert.equal(after.controls[0]?.stages['duty-released']?.state, 'reached')
        for (const which of ['intent-established', 'qualification-revoked'] as const) {
          await refused(
            journal.recordControl(stage(opened, `new-${which}`, control.operation, which)),
            'terminal',
            `${which} after ended`,
          )
        }
        assert.deepEqual(await load(opened), after, 'terminal wrote nothing')
        assert.equal(ended.execution, opened.execution)
      },
    },
    {
      name: 'Q11: after ended, a new commit, detach, tryFinish, submit and attach return terminal; the original end is recognized',
      run: async () => {
        const opened = await fixture.open('q11-terminal')
        const { journal } = opened
        await takeInputs(opened)
        const finish = finishInput(opened, await load(opened), 'end')
        const first = await ok(journal.tryFinish(finish), 'the end')
        assert.equal(first.kind, 'ended')
        const before = await load(opened)
        assert.deepEqual(await ok(journal.tryFinish(finish), 'the same end again'), first)
        await refused(journal.commit(commitAt(opened, before, 'after-end')), 'terminal', 'commit')
        await refused(
          journal.detach({
            ...opened.access,
            execution: opened.execution,
            operation: operation('detach-after-end'),
            authority: opened.authority,
            reason: evidence('reason'),
          }),
          'terminal',
          'detach',
        )
        await refused(
          journal.tryFinish(finishInput(opened, before, 'second-end')),
          'terminal',
          'a new tryFinish',
        )
        await refused(
          journal.submit({
            ...opened.access,
            execution: opened.execution,
            operation: operation('submit-after-end'),
            value: input('9'),
          }),
          'terminal',
          'submit',
        )
        await refused(
          journal.attach({
            ...opened.access,
            execution: opened.execution,
            operation: operation('attach-after-end'),
            instance: opened.authority.instance,
            grant: null,
            recovery: evidence('recovery'),
            takeover: evidence('takeover'),
          }),
          'terminal',
          'attach',
        )
        assert.deepEqual(await load(opened), before, 'nothing was written after ended')
      },
    },
    {
      name: 'Q11: a superseded attachment gets stale-advance before terminal for commit, tryFinish and detach',
      run: async () => {
        const opened = await fixture.open('q11-stale-advance')
        if (opened.takeover === undefined) {
          await uncoveredCase('', 'takeover control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const successor = await opened.takeover('successor')
        const finish = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end', successor)),
          'the successor ends',
        )
        assert.equal(finish.kind, 'ended')
        const before = await load(opened)
        await refused(
          journal.commit(commitAt(opened, before, 'old-commit', opened.authority)),
          'stale-advance',
          'the old attachment commits',
        )
        await refused(
          journal.tryFinish(finishInput(opened, before, 'old-end', opened.authority)),
          'stale-advance',
          'the old attachment ends',
        )
        await refused(
          journal.detach({
            ...opened.access,
            execution: opened.execution,
            operation: operation('old-detach'),
            authority: opened.authority,
            reason: evidence('reason'),
          }),
          'stale-advance',
          'the old attachment detaches',
        )
        assert.deepEqual(await load(opened), before)
      },
    },
    {
      name: 'Q13: acknowledge of a through within the acknowledged prefix, and recordResult without a new responsibility, recognize without a new revision',
      run: async () => {
        const opened = await fixture.open('q13-ack-result')
        const { journal } = opened
        await takeInputs(opened)
        await ok(
          journal.commit(
            commitAt(opened, await load(opened), 'wait', opened.authority, {
              state: { kind: 'waiting', waits: [] },
              events: [{ kind: 'waiting', waits: [] }],
            }),
          ),
          'a second event',
        )
        const ack = (name: string, through: string) =>
          journal.acknowledge({
            ...opened.access,
            execution: opened.execution,
            operation: operation(name),
            through,
            receipt: null,
          })
        const second = await ok(ack('ack-2', '2'), 'acknowledge 2')
        const before = await load(opened)
        const lower = await ok(ack('ack-1', '1'), 'a lower through')
        assert.equal(lower.operation, operation('ack-1'))
        assert.equal(lower.revision, second.revision, 'at the revision of the covering prefix')
        assert.deepEqual(await load(opened), before, 'the prefix did not move back')
        const same = await ok(ack('ack-2-again', '2'), 'the same prefix again')
        assert.equal(same.revision, second.revision)
        assert.deepEqual(await load(opened), before)
        assert.deepEqual(await query(opened, operation('ack-1')), {
          kind: 'committed',
          receipt: lower,
        })

        const produced = result('r2')
        const consumption = identity(decodeConsumptionId('core-k2'), 'k2')
        const record = (name: string) =>
          journal.recordResult({
            ...opened.access,
            execution: opened.execution,
            operation: operation(name),
            result: produced,
            consumption,
            transfer: {
              kind: 'processed',
              result: produced,
              consumption,
              completion: evidence('done'),
            },
            release: { kind: 'pending' },
          })
        const recorded = await ok(record('result-a'), 'the responsibility')
        const after = await load(opened)
        const again = await ok(record('result-b'), 'the same responsibility under a new operation')
        assert.equal(again.operation, operation('result-b'))
        assert.equal(again.revision, recorded.revision)
        assert.deepEqual(await load(opened), after, 'no new revision')
        assert.deepEqual(await query(opened, operation('result-b')), {
          kind: 'committed',
          receipt: again,
        })
      },
    },
  ]
}

/** Two values with the same canonical text; exported for fixtures that compare snapshots. */
export function sameValue(left: unknown, right: unknown): boolean {
  return canonicalText(left) === canonicalText(right)
}
