// The core conformance suite of `AgentJournal` (SPEC "并发与提交" and "托管协调与运行实例"): the
// facts that every Journal binding, standalone or coordinated, must give the same answers to.
// It reads only what the port returns. A fixture opens executions under its own binding; what the
// coordinator side needs so that an ordinary end can succeed is the fixture's business.
//
// The suite covers: the revision rule of "执行修订" (Q3), the receipts and index of a new
// operation that recognizes an existing fact ("原操作认回与恢复", Q13), the atomic control facts and
// the late stages after ended ("六个阶段", Q1 and Q1b), the persistent rejection of contradicting
// evidence and the four query conclusions ("查询的四种结论与持久拒绝", R2), the order of
// "判定次序与失败映射" for ended and superseded attachments (Q11), the admission records of
// "消息准入" (P, the Ja variants resolve and retire, the handoff projection of `load`), the custody
// of "准入结果保管" (Rh root, permanent exclusion, the one successor), the two submit lineages
// of "输入内容与水位线", and the finishing cases of testing-journal-finishing.ts: the candidate
// and its projection, the obligations, the blocked order, the cancellation route and the six
// settlement variants.
import assert from 'node:assert/strict'
import type {
  AgentCheckpoint,
  ReplyAdmissionFrom,
  ReplyAdmissionPage,
  ReplyAdmissionPrefix,
} from './evaluation.ts'
import {
  decodeReplyAdmissionPageCursor,
  decodeReplyAdmissionSequence,
  type Adoption,
  type AgentOperationId,
  type DurableEvidence,
  type ReplyAdmissionPageCursor,
} from './identity.ts'
import type { AgentJournal, HandoffCustody, OriginalInputAcceptance } from './journal.ts'
import type { PendingHandoff } from './passages.ts'
import { uncoveredCase, type ConformanceCase } from './testing-case.ts'
import { finishingCases } from './testing-journal-finishing.ts'
import {
  admitReply,
  advancement,
  advances,
  afterTerminalPassage,
  cancelControl,
  commitAt,
  controlEvents,
  end,
  endCancelled,
  events,
  evidence,
  excluded,
  failedContent,
  finishInput,
  handoffOf,
  identity,
  input,
  intentOf,
  load,
  newSubmit,
  notSuccessful,
  ok,
  operation,
  outcomeOf,
  pendingHandoff,
  prepareCommit,
  prepareOrdinaryEnd,
  prepared,
  PROVIDER,
  query,
  recognizingSubmit,
  refused,
  requireInstallation,
  replyRequest,
  resolveCommit,
  stage,
  submitAcceptance,
  takeInputs,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
  type AgentJournalReplyAdmissionControls,
} from './testing-journal-helpers.ts'

export type {
  AgentJournalCoreFixture,
  AgentJournalCoreOpenOptions,
  AgentJournalCoreOpened,
  AgentJournalReplyAdmissionControls,
  ReplyAdmissionDamage,
  ReplyAdmissionReadStatistics,
  SettlementQualification,
} from './testing-journal-helpers.ts'

/** The cases that every `AgentJournal` binding passes. */
export function agentJournalCoreConformance<P>(
  fixture: AgentJournalCoreFixture<P>,
): readonly ConformanceCase[] {
  return [
    {
      name: 'Q3: each atomic mutation that establishes a new fact allocates exactly one revision; the same operation recognizes without another and answers the same result',
      run: async () => {
        const opened = await fixture.open('q3-one-revision')
        const { journal } = opened
        const snapshot = await load(opened)
        const commit = commitAt(opened, snapshot, 'commit')
        assert.deepEqual(await advances(opened, () => journal.commit(commit)), [1, 0], 'commit')
        const submit = newSubmit(opened, 'submit', await opened.acceptInput('2'))
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
      name: 'Q13: a recognize-input submit of the same input with the same content recognizes the original acceptance: receipt of the new operation at the revision of the input, no new revision, query committed; other content conflicts',
      run: async () => {
        const opened = await fixture.open('q13-submit')
        const { journal } = opened
        const value = await opened.acceptInput('7')
        const original = newSubmit(opened, 'submit-a', value)
        const first = await ok(journal.submit(original), 'the first submit')
        const before = await load(opened)
        const second = await ok(
          journal.submit(recognizingSubmit(opened, 'submit-b', value, original.lineage.original)),
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
          journal.submit(
            recognizingSubmit(
              opened,
              'submit-c',
              { ...value, content: input('7', 'other text').content },
              original.lineage.original,
            ),
          ),
          'conflict',
          'the same input with other content',
        )
        assert.deepEqual(await load(opened), before)
      },
    },
    {
      name: 'new-input submit: the operation must be the original entry, the origin must be a submit, the H must be prepared; the acceptance publishes the external H as committed history',
      run: async () => {
        const opened = await fixture.open('submit-new-input')
        const { journal } = opened
        const value = await opened.acceptInput('4')
        const submit = newSubmit(opened, 'submit-4', value)
        const before = await load(opened)
        await refused(
          journal.submit({ ...submit, operation: operation('another') }),
          'invalid',
          'a new-input submit under another operation than the entry',
        )
        const invokeOrigin: OriginalInputAcceptance = {
          ...submit.lineage.original,
          outcome: {
            ...submit.lineage.original.outcome,
            origin: {
              kind: 'invoke',
              instance: opened.authority.instance,
              scope: evidence('scope'),
              definition: PROVIDER,
              grant: null,
            },
          },
        }
        await refused(
          journal.submit({ ...submit, lineage: { kind: 'new-input', original: invokeOrigin } }),
          'invalid',
          'a new-input submit whose origin is an invoke',
        )
        const rejected = submitAcceptance(opened, 'submit-4', value, {
          kind: 'rejected',
          reason: 'no',
          evidence: evidence('rejected'),
        })
        await refused(
          journal.submit({ ...submit, lineage: { kind: 'new-input', original: rejected } }),
          'invalid',
          'a new-input submit whose H is not prepared',
        )
        assert.deepEqual(await load(opened), before, 'the refusals wrote nothing')
        const receipt = await ok(journal.submit(submit), 'the new input')
        const after = await load(opened)
        assert.equal(Number(after.revision), Number(before.revision) + 1)
        const listed = handoffOf(after, submit.lineage.original.handoff)
        assert.deepEqual(listed.history, {
          kind: 'committed',
          operation: submit.operation,
          revision: receipt.revision,
        })
        assert.deepEqual(listed.resolution, {
          kind: 'recorded',
          outcome: submit.lineage.original.outcome,
        })
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
          return
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
        opened.faultNext('recordControl', 'applied')
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
      name: 'R2 and Q1b: after ended, evidence that contradicts a reached intent or a reached late stage is persistently rejected, not answered terminal',
      run: async () => {
        const opened = await fixture.open('r2-after-ended')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        const control = cancelControl(opened)
        await ok(journal.control(control), 'control')
        const intent = stage(
          opened,
          'intent',
          control.operation,
          'intent-established',
          'reached',
          evidence('intent/first'),
        )
        await ok(journal.recordControl(intent), 'the intent')
        const confirmed = stage(
          opened,
          'confirmed',
          control.operation,
          'producer-confirmed',
          'reached',
          evidence('confirmed/first'),
        )
        await ok(journal.recordControl(confirmed), 'the confirmation')
        await endCancelled(opened, control.operation)
        for (const [name, original] of [
          ['intent-other', intent],
          ['confirmed-other', confirmed],
        ] as const) {
          const before = await load(opened)
          const contradicting = {
            ...original,
            operation: operation(name),
            source: evidence(`${name}/source`),
          }
          const failure = await refused(
            journal.recordControl(contradicting),
            'conflict',
            `${name} after ended`,
          )
          const after = await load(opened)
          assert.equal(Number(after.revision), Number(before.revision) + 1, 'the audit revision')
          assert.deepEqual(after.controls, before.controls, 'the stage facts did not change')
          const conclusion = await query(opened, contradicting.operation)
          assert.equal(conclusion.kind, 'rejected', `query(${name}) is rejected`)
          if (conclusion.kind === 'rejected') assert.deepEqual(conclusion.failure, failure)
        }
      },
    },
    {
      name: 'query: committed carries the original receipt, an operation never seen is unknown, a dropped write is excluded with evidence',
      run: async () => {
        const opened = await fixture.open('query-conclusions')
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
          return
        }
        assert.deepEqual(await query(opened, opened.receipt.operation), {
          kind: 'committed',
          receipt: opened.receipt,
        })
        assert.deepEqual(await query(opened, operation('never')), { kind: 'unknown' })
        opened.faultNext('submit', 'dropped')
        await refused(
          opened.journal.submit(newSubmit(opened, 'dropped', await opened.acceptInput('3'))),
          'commit-unknown',
          'the dropped write',
        )
        const excludedWrite = await query(opened, operation('dropped'))
        assert.equal(excludedWrite.kind, 'excluded')
        if (excludedWrite.kind === 'excluded')
          assert.equal(typeof excludedWrite.evidence.record, 'string')
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
      name: 'Q11: after ended, a new commit, detach, tryFinish, submit, a recognizing submit of an accepted input and attach return terminal; the original end is recognized',
      run: async () => {
        const opened = await fixture.open('q11-terminal')
        const { journal } = opened
        const value = await opened.acceptInput('8')
        const accepted = newSubmit(opened, 'submit-8', value)
        await ok(journal.submit(accepted), 'an input accepted before the end')
        await takeInputs(opened)
        const ready = await prepareOrdinaryEnd(opened, 'end')
        const finish = finishInput(opened, ready, 'end')
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
          journal.tryFinish(finishInput(opened, before, 'second-end', undefined, finish.intent)),
          'terminal',
          'a new tryFinish',
        )
        await refused(
          journal.submit(newSubmit(opened, 'submit-after-end', await opened.acceptInput('9'))),
          'terminal',
          'submit',
        )
        // SPEC per-operation table, input.submit: a new operation B after ended is terminal; only
        // the original successful O is recognized before that check.
        await refused(
          journal.submit(
            recognizingSubmit(opened, 'recognize-after-end', value, accepted.lineage.original),
          ),
          'terminal',
          'a recognizing submit of an accepted input after ended',
        )
        assert.deepEqual(
          await ok(journal.submit(accepted), 'the original O after ended'),
          await ok(journal.submit(accepted), 'the original O again'),
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
      name: 'Q11: after ended, a commit with a stale expected revision returns terminal, not changed',
      run: async () => {
        const opened = await fixture.open('q11-terminal-before-changed')
        const { journal } = opened
        const stale = await load(opened)
        await end(opened)
        const before = await load(opened)
        assert.notEqual(stale.revision, before.revision)
        await refused(
          journal.commit(commitAt(opened, stale, 'stale-after-end')),
          'terminal',
          'a stale commit after ended',
        )
        assert.deepEqual(await load(opened), before)
      },
    },
    {
      name: 'Q11: a superseded attachment gets stale-advance before terminal for commit, tryFinish and detach, and before changed for a commit with a stale expected revision',
      run: async () => {
        const opened = await fixture.open('q11-stale-advance')
        if (opened.takeover === undefined) {
          await uncoveredCase('', 'takeover control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const stale = await load(opened)
        const successor = await opened.takeover('successor')
        const current = await load(opened)
        assert.notEqual(stale.revision, current.revision, 'the takeover advanced the revision')
        await refused(
          journal.commit(commitAt(opened, stale, 'stale-old-commit', opened.authority)),
          'stale-advance',
          'the old attachment commits with a stale expected revision',
        )
        const ready = await prepareOrdinaryEnd(opened, 'end', successor)
        const intent = intentOf(ready)
        await refused(
          journal.tryFinish(
            finishInput(opened, ready, 'old-end-before', advancement(opened.authority)),
          ),
          'stale-advance',
          'the old attachment ends before the successor',
        )
        const finish = await ok(
          journal.tryFinish(finishInput(opened, ready, 'end', advancement(successor))),
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
          journal.tryFinish(
            finishInput(opened, before, 'old-end', advancement(opened.authority), intent),
          ),
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
      name: 'Q13: a second detach of a detached attachment recognizes the original handoff at its revision; a new operation recognizes a registered terminal observation',
      run: async () => {
        const opened = await fixture.open('q13-detach-observation')
        const { journal } = opened
        const detach = (name: string) =>
          journal.detach({
            ...opened.access,
            execution: opened.execution,
            operation: operation(name),
            authority: opened.authority,
            reason: evidence('reason'),
          })
        const handoff = await ok(detach('detach-a'), 'detach')
        const detached = await load(opened)
        assert.equal(detached.state.kind, 'suspended')
        const again = await ok(detach('detach-b'), 'the second detach')
        assert.deepEqual(again, handoff, 'the original handoff evidence')
        assert.deepEqual(await load(opened), detached, 'no new revision')
        const recognized = await query(opened, operation('detach-b'))
        assert.equal(recognized.kind, 'committed')
        if (recognized.kind === 'committed')
          assert.equal(
            recognized.receipt.revision,
            detached.revision,
            'at the revision of the handoff',
          )
        // A terminal observation is pending after an end whose checkpoint carries an after_terminal passage.
        const reopened = await fixture.open('q13-observation')
        const passage = afterTerminalPassage('observer')
        const snapshot = await load(reopened)
        await ok(
          reopened.journal.commit(
            commitAt(reopened, snapshot, 'passage', reopened.authority, {
              checkpoint: { ...snapshot.checkpoint, position: 'F2', passages: [passage] },
            }),
          ),
          'the passage commit',
        )
        const ended = await end(reopened)
        const record = (name: string, observed: DurableEvidence) =>
          reopened.journal.recordTerminalObservation({
            ...reopened.access,
            execution: reopened.execution,
            operation: operation(name),
            terminal: ended.evidence,
            passage: passage.id,
            implementation: passage.implementation,
            observed,
          })
        const first = await ok(record('observe-a', evidence('observed')), 'the observation')
        const after = await load(reopened)
        const second = await ok(record('observe-b', evidence('observed')), 'the same value again')
        assert.equal(second.operation, operation('observe-b'))
        assert.equal(second.revision, first.revision, 'at the revision of the registration')
        assert.deepEqual(await load(reopened), after, 'no new revision')
        assert.deepEqual(await query(reopened, operation('observe-b')), {
          kind: 'committed',
          receipt: second,
        })
      },
    },
    {
      name: 'Q13: acknowledge of a through within the acknowledged prefix recognizes the prefix without a new revision',
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
      },
    },
    {
      name: 'Q3 and Q13: recordResult advances one revision for a new responsibility fact; the same operation, and a new operation without a new fact, recognize it without another',
      run: async () => {
        const opened = await fixture.open('q13-result')
        if (opened.produceResult === undefined) {
          await uncoveredCase('', 'produceResult control').run()
          return
        }
        const { journal } = opened
        const produced = await opened.produceResult('r1')
        const record = (name: string) =>
          journal.recordResult({
            ...opened.access,
            execution: opened.execution,
            operation: operation(name),
            result: produced.result,
            consumption: produced.consumption,
            transfer: produced.transfer,
            release: { kind: 'pending' },
          })
        assert.deepEqual(await advances(opened, () => record('result-a')), [1, 0], 'recordResult')
        const recorded = await ok(record('result-a'), 'the responsibility')
        const after = await load(opened)
        const again = await ok(record('result-b'), 'the same responsibility under a new operation')
        assert.equal(again.operation, operation('result-b'))
        assert.equal(again.revision, recorded.revision, 'at the revision of the responsibility')
        assert.deepEqual(await load(opened), after, 'no new revision')
        assert.deepEqual(await query(opened, operation('result-b')), {
          kind: 'committed',
          receipt: again,
        })
      },
    },
    {
      name: 'P: a commit with handoff.prepare saves the complete PendingHandoff, sets currentHandoff to H, lists the H as pending in load.handoffs at the same revision, and a second P at the same position while H is undetermined does not succeed',
      run: async () => {
        const opened = await fixture.open('p-prepare')
        const { journal } = opened
        const snapshot = await load(opened)
        const request = pendingHandoff(opened, snapshot, 'h1')
        await refused(
          journal.commit(
            commitAt(opened, snapshot, 'p-without-pointer', opened.authority, {
              handoff: { kind: 'prepare', request },
            }),
          ),
          'invalid',
          'a P whose checkpoint does not point at H',
        )
        const receipt = await ok(
          journal.commit(prepareCommit(opened, snapshot, 'p1', request)),
          'P',
        )
        const after = await load(opened)
        assert.equal(Number(after.revision), Number(snapshot.revision) + 1)
        assert.deepEqual(after.checkpoint.currentHandoff, request.reference)
        const listed = handoffOf(after, request.reference)
        assert.deepEqual(listed.request, request)
        assert.deepEqual(listed.history, { kind: 'pending' })
        assert.equal(listed.resolution, null)
        assert.ok(listed.prepared !== null, 'the P basis is kept')
        assert.deepEqual(await query(opened, operation('p1')), { kind: 'committed', receipt })
        // The same source position cannot take another H while h1 is undetermined.
        const other = pendingHandoff(opened, after, 'h2')
        await notSuccessful(
          journal.commit(prepareCommit(opened, after, 'p2', other)),
          'a second P at the same position',
        )
        // Only a Ja clears the pointer: a P at another position cannot move it from h1 to its own H
        // (SPEC "消息准入": currentHandoff moves only through a successful resolve or retire).
        const elsewhere: PendingHandoff = {
          ...pendingHandoff(opened, after, 'h3'),
          position: { step: after.checkpoint.step, node: 'I8', slot: null },
        }
        const overriding = await refused(
          journal.commit(prepareCommit(opened, after, 'p3', elsewhere)),
          'invalid',
          'a P at another position while h1 holds the pointer',
        )
        assert.equal(
          overriding.kind === 'invalid' ? overriding.field : '',
          'checkpoint.currentHandoff',
        )
        assert.deepEqual(await load(opened), after, 'the original H stays')
      },
    },
    {
      name: 'Ja resolve: a prepared outcome publishes exactly its message with one message event, fixes the history as committed by this Ja, clears currentHandoff and advances one revision; the retry recognizes the receipt; an outcome that does not match P, or a Ja without the message, is invalid',
      run: async () => {
        const opened = await fixture.open('ja-resolve')
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        await ok(journal.commit(prepareCommit(opened, await load(opened), 'p1', request)), 'P')
        const prepared1 = prepared(request)
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const mismatched = prepared(pendingHandoff(opened, before, 'h9'))
        await refused(
          journal.commit(resolveCommit(opened, before, 'ja-mismatch', mismatched)),
          'invalid',
          'a resolve whose outcome names another request',
        )
        await refused(
          journal.commit(resolveCommit(opened, before, 'ja-no-message', prepared1, { events: [] })),
          'invalid',
          'a prepared resolve without its message event',
        )
        await refused(
          journal.commit(
            resolveCommit(opened, before, 'ja-pointer', prepared1, {
              checkpoint: { ...before.checkpoint, position: 'Q4' },
            }),
          ),
          'invalid',
          'a resolve that keeps currentHandoff pointing at H',
        )
        // A Ja clears the pointer; it cannot set it to an H that no P prepared.
        const moved = await refused(
          journal.commit(
            resolveCommit(opened, before, 'ja-moves-pointer', prepared1, {
              checkpoint: {
                ...before.checkpoint,
                position: 'Q4',
                currentHandoff: pendingHandoff(opened, before, 'h9').reference,
              },
            }),
          ),
          'invalid',
          'a resolve that moves the pointer to an H that was never prepared',
        )
        assert.equal(moved.kind === 'invalid' ? moved.field : '', 'checkpoint.currentHandoff')
        assert.deepEqual(await load(opened), before, 'the refusals wrote nothing')
        const ja = resolveCommit(opened, before, 'ja1', prepared1)
        const receipt = await ok(journal.commit(ja), 'Ja')
        const after = await load(opened)
        assert.equal(Number(after.revision), Number(before.revision) + 1)
        assert.equal(after.checkpoint.currentHandoff, null)
        const all = await events(opened)
        assert.equal(all.length, emitted + 1, 'one message event')
        assert.deepEqual(all.at(-1)?.body, {
          kind: 'message',
          message: request.candidate,
          source: evidence(`admission/${request.reference.operation}`),
        })
        const listed = handoffOf(after, request.reference)
        assert.deepEqual(listed.history, {
          kind: 'committed',
          operation: ja.operation,
          revision: receipt.revision,
        })
        assert.deepEqual(listed.resolution, { kind: 'recorded', outcome: prepared1 })
        assert.deepEqual(await ok(journal.commit(ja), 'the retry'), receipt)
        assert.deepEqual(await load(opened), after, 'the retry wrote nothing')
        // One H has at most one history application: another Ja for the same H does not succeed.
        await notSuccessful(
          journal.commit(resolveCommit(opened, after, 'ja-again', prepared1)),
          'a second Ja of the same H',
        )
      },
    },
    {
      name: 'Ja resolve of a rejected outcome: no message enters the history and no event is written, the history is not-applicable, currentHandoff is cleared and one revision is allocated',
      run: async () => {
        const opened = await fixture.open('ja-rejected')
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        await ok(journal.commit(prepareCommit(opened, await load(opened), 'p1', request)), 'P')
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const rejected = outcomeOf(request, {
          kind: 'rejected',
          reason: 'malformed',
          evidence: evidence('rejected/h1'),
        })
        await refused(
          journal.commit(
            resolveCommit(opened, before, 'ja-published', rejected, {
              events: [
                { kind: 'message', message: request.candidate, source: evidence('rejected/h1') },
              ],
            }),
          ),
          'invalid',
          'a rejected resolve that publishes the candidate',
        )
        const receipt = await ok(
          journal.commit(resolveCommit(opened, before, 'ja1', rejected)),
          'the rejected Ja',
        )
        const after = await load(opened)
        assert.equal(Number(after.revision), Number(before.revision) + 1)
        assert.equal(receipt.revision, after.revision)
        assert.equal((await events(opened)).length, emitted, 'no event')
        assert.equal(after.checkpoint.currentHandoff, null)
        const listed = handoffOf(after, request.reference)
        assert.deepEqual(listed.history, { kind: 'not-applicable' })
        assert.deepEqual(listed.resolution, { kind: 'recorded', outcome: rejected })
      },
    },
    {
      name: 'Ja retire: a trusted excluded internal H retires with currentHandoff cleared and the position kept at the source node; the retirement names the retire Ja; the history is not-applicable; a retire of an H the Journal did not prepare, or one that moves the position, is invalid',
      run: async () => {
        const opened = await fixture.open('ja-retire')
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        await ok(journal.commit(prepareCommit(opened, await load(opened), 'p1', request)), 'P')
        const before = await load(opened)
        const retire = (name: string, excludedH: PendingHandoff, position = 'I3') =>
          commitAt(opened, before, name, opened.authority, {
            checkpoint: { ...before.checkpoint, position, currentHandoff: null },
            handoff: { kind: 'retire', excluded: excluded(excludedH), reason: evidence('retire') },
          })
        await refused(
          journal.commit(retire('retire-unknown', pendingHandoff(opened, before, 'h9'))),
          'invalid',
          'a retire of an H the Journal did not prepare',
        )
        await refused(
          journal.commit(retire('retire-moved', request, 'I8')),
          'invalid',
          'a retire that moves the position',
        )
        assert.deepEqual(await load(opened), before)
        const ja = retire('retire1', request)
        const receipt = await ok(journal.commit(ja), 'the retire Ja')
        const after = await load(opened)
        assert.equal(Number(after.revision), Number(before.revision) + 1)
        assert.equal(after.checkpoint.currentHandoff, null)
        assert.equal(after.checkpoint.position, 'I3')
        const listed = handoffOf(after, request.reference)
        assert.deepEqual(listed.history, { kind: 'not-applicable' })
        assert.deepEqual(listed.resolution, excluded(request))
        assert.deepEqual(listed.retirement, {
          operation: ja.operation,
          revision: receipt.revision,
          reason: evidence('retire'),
        })
        // After the retirement, a successor P at the same position may name h1 as its predecessor.
        const successor = pendingHandoff(opened, after, 'h2', request.reference)
        await ok(journal.commit(prepareCommit(opened, after, 'p2', successor)), 'the successor P')
        const pointed = await load(opened)
        assert.deepEqual(pointed.checkpoint.currentHandoff, successor.reference)
        // h1 already has its history disposition (not-applicable), so a second retire of it is
        // invalid and leaves that history as it is; a retire whose checkpoint keeps a pointer is
        // invalid at checkpoint.currentHandoff.
        const retiredAgain = await refused(
          journal.commit(
            commitAt(opened, pointed, 'retire-not-current', opened.authority, {
              checkpoint: { ...pointed.checkpoint, position: 'I3', currentHandoff: null },
              handoff: { kind: 'retire', excluded: excluded(request), reason: evidence('retire') },
            }),
          ),
          'invalid',
          'a retire of an H that already has its history disposition is invalid',
        )
        assert.equal(retiredAgain.kind, 'invalid')
        assert.deepEqual(
          handoffOf(await load(opened), request.reference).history,
          listed.history,
          'the history of the retired H did not change',
        )
        const kept = await refused(
          journal.commit(
            commitAt(opened, pointed, 'retire-keeps-pointer', opened.authority, {
              checkpoint: { ...pointed.checkpoint, position: 'I3' },
              handoff: {
                kind: 'retire',
                excluded: excluded(successor),
                reason: evidence('retire'),
              },
            }),
          ),
          'invalid',
          'a retire whose checkpoint keeps the pointer',
        )
        assert.equal(kept.kind === 'invalid' ? kept.field : '', 'checkpoint.currentHandoff')
        assert.deepEqual(await load(opened), pointed, 'the refusals wrote nothing')
      },
    },
    {
      name: 'Rh root: recordHandoff merges a recorded outcome as the custody root with one new revision, without touching currentHandoff, the checkpoint or the events; the same input again answers the same receipt with no new revision; after ended a prepared result is retained',
      run: async () => {
        const opened = await fixture.open('rh-root')
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        await ok(journal.commit(prepareCommit(opened, await load(opened), 'p1', request)), 'P')
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const record = {
          ...opened.access,
          execution: opened.execution,
          operation: operation('rh1'),
          original: { kind: 'recorded' as const, outcome: prepared(request) },
          custody: null,
        }
        assert.deepEqual(await advances(opened, () => journal.recordHandoff(record)), [1, 0], 'Rh')
        const receipt = await ok(journal.recordHandoff(record), 'the root')
        const after = await load(opened)
        assert.deepEqual(after.checkpoint, before.checkpoint, 'Rh does not change the checkpoint')
        assert.deepEqual(after.checkpoint.currentHandoff, request.reference)
        assert.equal((await events(opened)).length, emitted, 'no event')
        const listed = handoffOf(after, request.reference)
        assert.deepEqual(listed.resolution, { kind: 'recorded', outcome: prepared(request) })
        assert.deepEqual(listed.history, { kind: 'pending' }, 'Rh does not publish')
        assert.deepEqual(listed.custody, {
          root: record.operation,
          chain: [{ operation: record.operation, predecessor: null, state: 'committed' }],
          committed: record.operation,
        })
        assert.deepEqual(await query(opened, record.operation), { kind: 'committed', receipt })
        // The root cannot change its payload: the same operation with the exclusion conflicts.
        await refused(
          journal.recordHandoff({ ...record, original: excluded(request) }),
          'conflict',
          'the root with another payload',
        )
        // After the end, the history of a prepared H that never published is retained. Only a
        // failed or cancelled candidate may retain it: a complete one is blocked by the pending
        // history (SPEC "终结责任清单"), see the finishing case of the pending H.
        await end(opened, 'end', opened.authority, failedContent('end'))
        const retained = handoffOf(await load(opened), request.reference)
        assert.equal(retained.history.kind, 'retained', 'the terminal disposition retains it')
        const anotherOpened = await fixture.open('rh-after-ended')
        const unpublished = pendingHandoff(anotherOpened, await load(anotherOpened), 'h3')
        await ok(
          anotherOpened.journal.commit(
            prepareCommit(anotherOpened, await load(anotherOpened), 'p3', unpublished),
          ),
          'P',
        )
        await end(anotherOpened, 'end', anotherOpened.authority, failedContent('end'))
        const lateRecord = await ok(
          anotherOpened.journal.recordHandoff({
            ...anotherOpened.access,
            execution: anotherOpened.execution,
            operation: operation('rh3'),
            original: { kind: 'recorded', outcome: prepared(unpublished) },
            custody: null,
          }),
          'Rh after ended',
        )
        const lateListed = handoffOf(await load(anotherOpened), unpublished.reference)
        assert.equal(lateListed.history.kind, 'retained')
        assert.equal(lateListed.custody?.committed, lateRecord.operation)
      },
    },
    {
      name: 'Rh custody chain: a permanently excluded attempt answers invalid(operation, operation-permanently-excluded) forever, only its one direct successor with the exclusion chain can succeed, and a successor that skips the chain or names an attempt that is not excluded is invalid',
      run: async () => {
        const opened = await fixture.open('rh-successor')
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
          return
        }
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        await ok(journal.commit(prepareCommit(opened, await load(opened), 'p1', request)), 'P')
        const original = { kind: 'recorded' as const, outcome: prepared(request) }
        const root = {
          ...opened.access,
          execution: opened.execution,
          operation: operation('rh-root'),
          original,
          custody: null,
        }
        const custody = (
          predecessor: AgentOperationId,
          priorExcluded: HandoffCustody['priorExcluded'],
        ): HandoffCustody => ({
          protocol: 'hand-off-custody-successor/1',
          custodyRoot: root.operation,
          rootRequest: evidence(`request/${root.operation}`),
          factSource: {
            owner: PROVIDER.owner,
            adoption: PROVIDER,
            record: 'record/h1',
            version: '1',
          },
          predecessor: { operation: predecessor, request: evidence(`request/${predecessor}`) },
          priorExcluded,
        })
        const exclusionOf = (
          excludedOperation: AgentOperationId,
          predecessor: AgentOperationId | null,
        ) => ({
          operation: excludedOperation,
          method: 'recordHandoff' as const,
          request: evidence(`request/${excludedOperation}`),
          predecessor,
          authority: evidence(`exclusion/${excludedOperation}`),
          fence: evidence(`fence/${excludedOperation}`),
        })
        const successorOf = (
          name: string,
          predecessor: AgentOperationId,
          chain: HandoffCustody['priorExcluded'],
        ) => ({
          ...root,
          operation: operation(name),
          custody: custody(predecessor, chain),
        })
        // Before the root was attempted, no successor can start.
        await refused(
          journal.recordHandoff(successorOf('rh-early', root.operation, [])),
          'invalid',
          'a successor of an attempt that was never excluded',
        )
        opened.faultNext('recordHandoff', 'dropped')
        await refused(journal.recordHandoff(root), 'commit-unknown', 'the dropped root')
        assert.equal((await query(opened, root.operation)).kind, 'excluded')
        const before = await load(opened)
        const fence = await refused(
          journal.recordHandoff(root),
          'invalid',
          'the same attempt after its permanent exclusion',
        )
        assert.deepEqual(fence, {
          kind: 'invalid',
          field: 'operation',
          reason: 'operation-permanently-excluded',
        })
        assert.deepEqual(await load(opened), before, 'the fence writes nothing')
        assert.equal((await query(opened, root.operation)).kind, 'excluded', 'query keeps excluded')
        await refused(
          journal.recordHandoff(successorOf('rh-skip', root.operation, [])),
          'invalid',
          'a successor whose chain omits the excluded predecessor',
        )
        const successor = successorOf('rh-2', root.operation, [exclusionOf(root.operation, null)])
        const receipt = await ok(journal.recordHandoff(successor), 'the one successor')
        const after = await load(opened)
        assert.equal(Number(after.revision), Number(before.revision) + 1)
        assert.deepEqual(handoffOf(after, request.reference).custody, {
          root: root.operation,
          chain: [
            { operation: root.operation, predecessor: null, state: 'excluded' },
            { operation: successor.operation, predecessor: root.operation, state: 'committed' },
          ],
          committed: successor.operation,
        })
        assert.deepEqual(await ok(journal.recordHandoff(successor), 'the retry'), receipt)
        assert.deepEqual(await load(opened), after, 'the retry wrote nothing')
        // Once an attempt succeeded, another successor of the same predecessor cannot succeed.
        await refused(
          journal.recordHandoff(
            successorOf('rh-3', root.operation, [exclusionOf(root.operation, null)]),
          ),
          'invalid',
          'a second successor of the same excluded predecessor',
        )
        await refused(
          journal.recordHandoff(
            successorOf('rh-4', successor.operation, [exclusionOf(root.operation, null)]),
          ),
          'invalid',
          'a successor of a committed attempt',
        )
      },
    },
    {
      name: 'load: handoffs and checkpoint.currentHandoff are read at one revision, and a commit without a handoff change keeps currentHandoff',
      run: async () => {
        const opened = await fixture.open('load-same-revision')
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        const receipt = await ok(
          journal.commit(prepareCommit(opened, await load(opened), 'p1', request)),
          'P',
        )
        const after = await load(opened)
        assert.equal(after.revision, receipt.revision)
        assert.deepEqual(after.checkpoint.currentHandoff, request.reference)
        assert.equal(handoffOf(after, request.reference).history.kind, 'pending')
        await refused(
          journal.commit(
            commitAt(opened, after, 'drop-pointer', opened.authority, {
              checkpoint: { ...after.checkpoint, position: 'I8', currentHandoff: null },
            }),
          ),
          'invalid',
          'a commit without a handoff change that clears currentHandoff',
        )
        const kept = await ok(
          journal.commit(commitAt(opened, after, 'keep-pointer')),
          'a commit that keeps the pointer',
        )
        const later = await load(opened)
        assert.equal(later.revision, kept.revision)
        assert.deepEqual(later.checkpoint.currentHandoff, request.reference)
        assert.equal(handoffOf(later, request.reference).history.kind, 'pending')
      },
    },
    ...finishingCases(fixture),
    ...replyAdmissionCases(fixture, true),
  ]
}

// ---------------------------------------------------------------------------------------------
// Reply admission reads (SPEC "回复准入的已核实前缀"): the verified prefix, the fixed range
// `(from, through]`, the five conditions of a successful page, the page bounds, the gaps, the
// commit-time check of the checkpoint's read position, the rule change, the current read
// qualification and the read counters. A case that needs `replyAdmissions` controls the fixture
// lacks is uncovered.

type Opened<P> = AgentJournalCoreOpened<P>
type Page = Extract<ReplyAdmissionPage, { kind: 'page' }>
type ReadInput<P> = Parameters<AgentJournal<P>['readReplyAdmissions']>[0]
type Controls<P> = AgentJournalReplyAdmissionControls<P>

const ORIGIN: ReplyAdmissionFrom = { kind: 'origin' }

function fromPrefix(prefix: ReplyAdmissionPrefix): ReplyAdmissionFrom {
  return { kind: 'prefix', prefix }
}

function readInput<P>(
  opened: Opened<P>,
  from: ReplyAdmissionFrom,
  through: DurableEvidence,
  after: ReplyAdmissionPageCursor | null,
  limit: number,
): ReadInput<P> {
  return { ...opened.access, execution: opened.execution, from, through, after, limit }
}

async function readOne<P>(opened: Opened<P>, input: ReadInput<P>): Promise<ReplyAdmissionPage> {
  return ok(opened.journal.readReplyAdmissions(input), 'readReplyAdmissions')
}

function pageOf(read: ReplyAdmissionPage, what: string): Page {
  assert.equal(read.kind, 'page', `${what} should be a page, got ${JSON.stringify(read)}`)
  if (read.kind !== 'page') throw new Error('unreachable')
  return read
}

/** Every page of `(from, through]` with `limit`, following `tail.more` until complete. */
async function readAll<P>(
  opened: Opened<P>,
  from: ReplyAdmissionFrom,
  through: DurableEvidence,
  limit: number,
): Promise<Page[]> {
  const pages: Page[] = []
  let after: ReplyAdmissionPageCursor | null = null
  for (let guard = 0; guard < 100_000; guard += 1) {
    const page = pageOf(
      await readOne(opened, readInput(opened, from, through, after, limit)),
      'read',
    )
    pages.push(page)
    if (page.tail.kind === 'complete') return pages
    after = page.tail.next
  }
  throw new assert.AssertionError({ message: 'the range never completed' })
}

function sequences(pages: readonly Page[]): string[] {
  return pages.flatMap(page => page.items.map(item => item.sequence))
}

function range(first: number, last: number): string[] {
  return Array.from({ length: last - first + 1 }, (_, index) => String(first + index))
}

function caseName(name: string): string {
  return name.slice(0, 32).replace(/[^a-z0-9]+/giu, '-')
}

/** A case that runs on the public port alone. */
function plain<P>(
  name: string,
  fixture: AgentJournalCoreFixture<P>,
  run: (opened: Opened<P>) => Promise<void>,
): ConformanceCase {
  return { name, run: async () => run(await fixture.open(caseName(name))) }
}

/** A case that needs the `replyAdmissions` controls; uncovered when the fixture lacks them. */
function controlled<P>(
  name: string,
  fixture: AgentJournalCoreFixture<P>,
  covered: boolean,
  run: (opened: Opened<P>, controls: Controls<P>) => Promise<void>,
): ConformanceCase {
  if (!covered) return uncoveredCase(name, 'replyAdmissions controls')
  return {
    name,
    run: async () => {
      const opened = await fixture.open(caseName(name))
      const controls = opened.replyAdmissions
      if (controls === undefined)
        throw new assert.AssertionError({
          message: 'uncovered: the fixture has no replyAdmissions controls',
        })
      await run(opened, controls)
    },
  }
}

/** A commit at the current snapshot that only moves the read position, as an ordinary commit carries it. */
async function writeRead<P>(
  opened: Opened<P>,
  name: string,
  read: AgentCheckpoint['replyAdmissionRead'],
) {
  const snapshot = await load(opened)
  return opened.journal.commit(
    commitAt(opened, snapshot, name, opened.authority, {
      checkpoint: { ...snapshot.checkpoint, position: name, replyAdmissionRead: read },
    }),
  )
}

/**
 * The reply admission cases. `covered` is false when the fixture gives no `replyAdmissions`
 * controls; the cases that need them are then uncovered.
 */
export function replyAdmissionCases<P>(
  fixture: AgentJournalCoreFixture<P>,
  covered: boolean,
): readonly ConformanceCase[] {
  return [
    plain(
      'D5 page 1: from origin the sequences are dense from 1, each fact is its predecessor plus one, and end = start + items',
      fixture,
      async opened => {
        for (let index = 1; index <= 5; index += 1) await admitReply(opened, index)
        const projection = (await load(opened)).replyAdmissions
        assert.equal(projection.prefix.sequence, '5')
        const pages = await readAll(opened, ORIGIN, projection.through, 2)
        assert.deepEqual(sequences(pages), range(1, 5))
        assert.equal(pages[0]?.start.sequence, '0', 'the first page of origin starts at zero')
        for (const page of pages) {
          assert.equal(
            BigInt(page.end.sequence),
            BigInt(page.start.sequence) + BigInt(page.items.length),
            'end = start + items.length',
          )
          page.items.forEach((item, offset) =>
            assert.equal(BigInt(item.sequence), BigInt(page.start.sequence) + BigInt(offset + 1)),
          )
        }
      },
    ),
    plain(
      'D5 page 2: each item is the original fact of this execution with the evidence of its own original Ja',
      fixture,
      async opened => {
        await admitReply(opened, 1)
        await admitReply(opened, 2, 'rejected')
        const snapshot = await load(opened)
        const [page] = await readAll(opened, ORIGIN, snapshot.replyAdmissions.through, 10)
        assert.deepEqual(
          page?.items.map(item => [item.fact.decision, item.fact.call, item.fact.resultVersion]),
          [
            ['admitted', 'mcall_reply000000000001', 'v1'],
            ['rejected', 'mcall_reply000000000002', 'v1'],
          ],
        )
        assert.ok(
          page?.items[1]?.fact.source.record.startsWith('no/core-reply-2-'),
          'the own source',
        )
        for (const item of page?.items ?? [])
          assert.ok(item.publication.record.length > 0, 'an item names its original publication')
        assert.notDeepEqual(page?.items[0]?.publication, page?.items[1]?.publication)
      },
    ),
    plain(
      'D5 page 3: the end of a page is the start of the next and the end of the range is the projection prefix; an empty range is one complete page with start = end',
      fixture,
      async opened => {
        for (let index = 1; index <= 3; index += 1) await admitReply(opened, index)
        const projection = (await load(opened)).replyAdmissions
        const pages = await readAll(opened, ORIGIN, projection.through, 1)
        for (let at = 1; at < pages.length; at += 1)
          assert.deepEqual(pages[at]?.start, pages[at - 1]?.end, 'pages continue')
        assert.deepEqual(pages.at(-1)?.end, projection.prefix)
        const empty = await readAll(opened, fromPrefix(projection.prefix), projection.through, 5)
        assert.deepEqual(empty, [
          {
            kind: 'page',
            through: projection.through,
            start: projection.prefix,
            end: projection.prefix,
            items: [],
            tail: { kind: 'complete' },
          },
        ])
      },
    ),
    plain(
      'D5 page 4: tail is complete exactly at the target prefix; a more tail carries at least one fact, stays below the target and its cursor moves on',
      fixture,
      async opened => {
        for (let index = 1; index <= 4; index += 1) await admitReply(opened, index)
        const projection = (await load(opened)).replyAdmissions
        const pages = await readAll(opened, ORIGIN, projection.through, 3)
        const cursors = new Set<string>()
        for (const page of pages) {
          if (page.tail.kind === 'more') {
            assert.ok(page.items.length >= 1, 'a more page carries a fact')
            assert.ok(BigInt(page.end.sequence) < BigInt(projection.prefix.sequence))
            assert.ok(!cursors.has(page.tail.next), 'the cursor moves on')
            cursors.add(page.tail.next)
          } else assert.deepEqual(page.end, projection.prefix)
        }
        assert.equal(pages.length, 2)
      },
    ),
    controlled(
      'D5 page 5 and page bounds: a provider bound of 20 under limit 100 answers 20 facts and more; fewer than limit is not completion; an oversized fact gets a page of its own',
      fixture,
      covered,
      async (opened, controls) => {
        await controls.seed(25)
        const projection = (await load(opened)).replyAdmissions
        controls.limitPages({ items: 20, bytes: null })
        const first = pageOf(
          await readOne(opened, readInput(opened, ORIGIN, projection.through, null, 100)),
          'first',
        )
        assert.equal(first.items.length, 20)
        assert.equal(first.tail.kind, 'more', 'fewer than limit is not completion')
        controls.limitPages({ items: null, bytes: 1 })
        const single = await readAll(opened, ORIGIN, projection.through, 100)
        assert.equal(single.length, 25, 'every oversized fact has a page of its own')
        assert.ok(single.every(page => page.items.length === 1))
        controls.limitPages({ items: null, bytes: null })
      },
    ),
    plain(
      'D5 fixed range: a fact admitted while the range is read stays out of it; the next load extends the target and a read from the old end reads only the new fact',
      fixture,
      async opened => {
        for (let index = 1; index <= 3; index += 1) await admitReply(opened, index)
        const fixed = (await load(opened)).replyAdmissions
        const first = pageOf(
          await readOne(opened, readInput(opened, ORIGIN, fixed.through, null, 2)),
          'first',
        )
        await admitReply(opened, 4)
        assert.equal(first.tail.kind, 'more')
        if (first.tail.kind !== 'more') return
        const rest = pageOf(
          await readOne(opened, readInput(opened, ORIGIN, fixed.through, first.tail.next, 10)),
          'rest',
        )
        assert.deepEqual(
          rest.items.map(item => item.sequence),
          ['3'],
        )
        assert.deepEqual(rest.end, fixed.prefix, 'the target stays the fixed one')
        assert.equal(rest.tail.kind, 'complete')
        const next = (await load(opened)).replyAdmissions
        assert.equal(next.prefix.sequence, '4')
        assert.deepEqual(sequences(await readAll(opened, fromPrefix(rest.end), next.through, 10)), [
          '4',
        ])
      },
    ),
    plain('D5 repeat: the same request answers the same facts and range', fixture, async opened => {
      for (let index = 1; index <= 3; index += 1) await admitReply(opened, index)
      const projection = (await load(opened)).replyAdmissions
      const input = readInput(opened, ORIGIN, projection.through, null, 2)
      assert.deepEqual(await readOne(opened, input), await readOne(opened, input))
    }),
    controlled(
      'D5 cursor binding: a cursor of another range, another lower bound, another execution, another tenant or cut down to a sequence is refused',
      fixture,
      covered,
      async (opened, controls) => {
        for (let index = 1; index <= 4; index += 1) await admitReply(opened, index)
        const early = (await load(opened)).replyAdmissions
        await admitReply(opened, 5)
        const later = (await load(opened)).replyAdmissions
        const first = pageOf(
          await readOne(opened, readInput(opened, ORIGIN, early.through, null, 1)),
          'first',
        )
        assert.equal(first.tail.kind, 'more')
        if (first.tail.kind !== 'more') return
        const cursor = first.tail.next
        assert.ok(
          'ok' in
            (await opened.journal.readReplyAdmissions(
              readInput(opened, ORIGIN, early.through, cursor, 1),
            )),
          'the cursor of the range itself continues',
        )
        await refused(
          opened.journal.readReplyAdmissions(readInput(opened, ORIGIN, later.through, cursor, 1)),
          'invalid',
          'a cursor of another through',
        )
        await refused(
          opened.journal.readReplyAdmissions(
            readInput(opened, fromPrefix(first.end), early.through, cursor, 1),
          ),
          'invalid',
          'a cursor of another lower bound',
        )
        const sibling = await controls.sibling('cursor-sibling')
        for (let index = 1; index <= 4; index += 1) await admitReply(sibling, index)
        const siblingRange = (await load(sibling)).replyAdmissions
        await refused(
          sibling.journal.readReplyAdmissions(
            readInput(sibling, ORIGIN, siblingRange.through, cursor, 1),
          ),
          'invalid',
          'a cursor of another execution of the same tenant',
        )
        await refused(
          opened.journal.readReplyAdmissions(
            readInput(
              opened,
              ORIGIN,
              early.through,
              identity(decodeReplyAdmissionPageCursor(first.end.sequence), 'cursor'),
              1,
            ),
          ),
          'invalid',
          'a cursor cut down to a sequence',
        )
        const foreign = opened.otherAccess
        assert.ok(foreign !== undefined, 'the cursor case needs another tenant')
        await refused(
          opened.journal.readReplyAdmissions({
            ...readInput(opened, ORIGIN, early.through, cursor, 1),
            ...foreign,
          }),
          'denied',
          'a cursor under another tenant',
        )
      },
    ),
    plain(
      'D5 identity: a replay of the same call and result version recognizes the original fact without a new sequence or basis; another decision conflicts; another step or action keeps the current answer (R-598 not adopted)',
      fixture,
      async opened => {
        await admitReply(opened, 1)
        const before = (await load(opened)).replyAdmissions
        // The same call and result version under another H, action and step: recognized.
        await admitReply(opened, 2, 'admitted', 'mcall_reply000000000001')
        const replayed = (await load(opened)).replyAdmissions
        assert.deepEqual(replayed.prefix, before.prefix, 'no new sequence and no new basis')
        const snapshot = await load(opened)
        const request = replyRequest(opened, snapshot, 3, 'mcall_reply000000000001')
        await ok(opened.journal.commit(prepareCommit(opened, snapshot, 'p-flip', request)), 'P')
        const flip = outcomeOf(request, {
          kind: 'rejected',
          reason: 'flip',
          evidence: evidence('flip'),
        })
        await refused(
          opened.journal.commit(resolveCommit(opened, await load(opened), 'ja-flip', flip)),
          'conflict',
          'the same key with another decision',
        )
        assert.equal((await load(opened)).replyAdmissions.prefix.sequence, '1')
      },
    ),
    controlled(
      'D5 identity across executions: the same call text in another execution of the tenant is its own fact',
      fixture,
      covered,
      async (opened, controls) => {
        await admitReply(opened, 1)
        const sibling = await controls.sibling('identity-sibling')
        await admitReply(sibling, 1)
        const theirs = (await load(sibling)).replyAdmissions.prefix
        assert.equal(theirs.sequence, '1')
        assert.notDeepEqual(theirs.basis, (await load(opened)).replyAdmissions.prefix.basis)
      },
    ),
    plain(
      'D5 atomic Ja: a dropped Ja leaves no fact, prefix or projection change; the applied one establishes all of them with the continuation',
      fixture,
      async opened => {
        const faultNext = opened.faultNext
        assert.ok(faultNext !== undefined, 'the atomic Ja case needs faultNext')
        const snapshot = await load(opened)
        const request = replyRequest(opened, snapshot, 1)
        await ok(opened.journal.commit(prepareCommit(opened, snapshot, 'p-drop', request)), 'P')
        const before = await load(opened)
        faultNext('commit', 'dropped')
        await refused(
          opened.journal.commit(resolveCommit(opened, before, 'ja-drop', prepared(request))),
          'commit-unknown',
          'the dropped Ja',
        )
        const after = await load(opened)
        assert.deepEqual(after.replyAdmissions, before.replyAdmissions, 'no fact, prefix or count')
        assert.deepEqual(after.checkpoint.currentHandoff, request.reference, 'no continuation')
        await ok(
          opened.journal.commit(resolveCommit(opened, after, 'ja-again', prepared(request))),
          'Ja',
        )
        const applied = await load(opened)
        assert.equal(applied.replyAdmissions.prefix.sequence, '1')
        assert.equal(applied.checkpoint.currentHandoff, null)
        assert.deepEqual(
          sequences(await readAll(opened, ORIGIN, applied.replyAdmissions.through, 10)),
          ['1'],
        )
      },
    ),
    controlled(
      'D5 gap missing-fact: a missing fact inside the range is a gap; the verified pages stop before it and the range never completes',
      fixture,
      covered,
      async (opened, controls) => {
        await controls.seed(3)
        const projection = (await load(opened)).replyAdmissions
        await controls.damage({ kind: 'missing-fact', sequence: 2 })
        const verified: string[] = []
        let read = await readOne(opened, readInput(opened, ORIGIN, projection.through, null, 10))
        for (let guard = 0; guard < 10 && read.kind === 'page'; guard += 1) {
          verified.push(...read.items.map(item => item.sequence))
          assert.equal(read.tail.kind, 'more', 'a range with a missing fact never completes')
          if (read.tail.kind !== 'more') break
          read = await readOne(
            opened,
            readInput(opened, ORIGIN, projection.through, read.tail.next, 10),
          )
        }
        assert.equal(read.kind === 'gap' && read.reason, 'missing-fact')
        assert.deepEqual(verified, ['1'], 'only the fact before the gap is verified')
      },
    ),
    controlled(
      'D5 gap retention: a lower bound before the retained facts is a gap, never a read from the retained start',
      fixture,
      covered,
      async (opened, controls) => {
        await controls.seed(6)
        const projection = (await load(opened)).replyAdmissions
        const [first] = await readAll(opened, ORIGIN, projection.through, 2)
        assert.ok(first !== undefined)
        await controls.damage({ kind: 'retention', from: 4 })
        const read = await readOne(
          opened,
          readInput(opened, fromPrefix(first.end), projection.through, null, 10),
        )
        assert.equal(read.kind === 'gap' && read.reason, 'retention')
      },
    ),
    controlled(
      'D5 gap missing-basis: a lawful prefix whose basis the Journal lost is a gap, neither invalid nor an empty history',
      fixture,
      covered,
      async (opened, controls) => {
        await controls.seed(4)
        const projection = (await load(opened)).replyAdmissions
        const [first] = await readAll(opened, ORIGIN, projection.through, 2)
        assert.ok(first !== undefined)
        await controls.damage({ kind: 'missing-basis', sequence: Number(first.end.sequence) })
        const read = await readOne(
          opened,
          readInput(opened, fromPrefix(first.end), projection.through, null, 10),
        )
        assert.equal(read.kind === 'gap' && read.reason, 'missing-basis')
      },
    ),
    controlled(
      'D5 gap range-unavailable: a through that no longer resolves is a gap; a new load gives a new range from the same prefix',
      fixture,
      covered,
      async (opened, controls) => {
        await controls.seed(2)
        const old = (await load(opened)).replyAdmissions
        await controls.seed(2)
        await controls.damage({ kind: 'range-unavailable', below: 3 })
        const read = await readOne(
          opened,
          readInput(opened, fromPrefix(old.prefix), old.through, null, 10),
        )
        assert.equal(read.kind === 'gap' && read.reason, 'range-unavailable')
        const fresh = (await load(opened)).replyAdmissions
        assert.deepEqual(
          sequences(await readAll(opened, fromPrefix(old.prefix), fresh.through, 10)),
          ['3', '4'],
        )
      },
    ),
    controlled(
      'D5 lower bound classification: a prefix of another tenant is denied, a prefix of another execution of the tenant is invalid',
      fixture,
      covered,
      async (opened, controls) => {
        await admitReply(opened, 1)
        const projection = (await load(opened)).replyAdmissions
        const sibling = await controls.sibling('bound-sibling')
        await admitReply(sibling, 1)
        const theirs = (await load(sibling)).replyAdmissions.prefix
        await refused(
          opened.journal.readReplyAdmissions(
            readInput(opened, fromPrefix(theirs), projection.through, null, 10),
          ),
          'invalid',
          'a prefix of another execution',
        )
        await refused(
          opened.journal.readReplyAdmissions(
            readInput(
              opened,
              fromPrefix(await controls.foreignPrefix()),
              projection.through,
              null,
              10,
            ),
          ),
          'denied',
          'a prefix of another tenant',
        )
      },
    ),
    controlled(
      'D5 commit-time check 1: a read position whose basis belongs to another execution of the tenant is invalid at checkpoint.replyAdmissionRead, to another tenant denied',
      fixture,
      covered,
      async (opened, controls) => {
        await admitReply(opened, 1)
        const sibling = await controls.sibling('check-sibling')
        await admitReply(sibling, 1)
        const theirs = (await load(sibling)).replyAdmissions.prefix
        const before = await load(opened)
        const other = await refused(
          writeRead(opened, 'other-execution', { kind: 'verified', prefix: theirs }),
          'invalid',
          'another execution',
        )
        assert.equal(other.kind === 'invalid' && other.field, 'checkpoint.replyAdmissionRead')
        await refused(
          writeRead(opened, 'other-tenant', {
            kind: 'verified',
            prefix: await controls.foreignPrefix(),
          }),
          'denied',
          'another tenant',
        )
        assert.equal((await load(opened)).revision, before.revision, 'nothing was written')
      },
    ),
    plain(
      'D5 commit-time check 3: a verified position of this execution is saved; one that goes back or back to unverified is invalid, and one whose sequence its basis does not name is invalid',
      fixture,
      async opened => {
        for (let index = 1; index <= 3; index += 1) await admitReply(opened, index)
        const projection = (await load(opened)).replyAdmissions
        const pages = await readAll(opened, ORIGIN, projection.through, 1)
        const second = pages[1]?.end
        assert.ok(second !== undefined)
        await ok(
          writeRead(opened, 'save-3', { kind: 'verified', prefix: projection.prefix }),
          'save 3',
        )
        assert.deepEqual((await load(opened)).checkpoint.replyAdmissionRead, {
          kind: 'verified',
          prefix: projection.prefix,
        })
        const back = await refused(
          writeRead(opened, 'back-2', { kind: 'verified', prefix: second }),
          'invalid',
          'a position that goes back',
        )
        assert.equal(back.kind === 'invalid' && back.field, 'checkpoint.replyAdmissionRead')
        await refused(
          writeRead(opened, 'unverified', { kind: 'unverified' }),
          'invalid',
          'back to unverified',
        )
        await refused(
          writeRead(opened, 'forged', {
            kind: 'verified',
            prefix: {
              sequence: identity(decodeReplyAdmissionSequence('9'), '9'),
              basis: projection.prefix.basis,
            },
          }),
          'invalid',
          'a sequence its basis does not name',
        )
      },
    ),
    controlled(
      'D5 commit-time check: a lawful basis whose material the Journal lost answers unavailable with missing-basis and writes nothing',
      fixture,
      covered,
      async (opened, controls) => {
        await controls.seed(3)
        const snapshot = await load(opened)
        await controls.damage({ kind: 'missing-basis', sequence: 3 })
        const lost = await refused(
          writeRead(opened, 'lost', { kind: 'verified', prefix: snapshot.replyAdmissions.prefix }),
          'unavailable',
          'a lost basis',
        )
        assert.ok(lost.kind === 'unavailable' && lost.diagnostic.includes('missing-basis'))
        assert.equal((await load(opened)).revision, snapshot.revision, 'nothing was written')
      },
    ),
    controlled(
      'D5 rule change: a converted rule rebuilds the projection with the same counts; without a conversion load is unavailable; the read from the verified prefix does not change',
      fixture,
      covered,
      async (opened, controls) => {
        await admitReply(opened, 1, 'rejected')
        await admitReply(opened, 2, 'rejected')
        const before = (await load(opened)).replyAdmissions
        const rule: Adoption = {
          owner: 'suite',
          name: 'rule',
          revision: '2',
          digest: 'suite:rule/2',
        }
        await controls.changeRule(rule, 'rebuild')
        const rebuilt = (await load(opened)).replyAdmissions
        assert.deepEqual(rebuilt.rule, rule)
        assert.equal(rebuilt.consecutiveDenials, '2')
        assert.equal(rebuilt.totalDenials, '2')
        assert.deepEqual(rebuilt.prefix, before.prefix, 'the prefix does not depend on the rule')
        await controls.changeRule({ ...rule, revision: '3', digest: 'suite:rule/3' }, 'none')
        await refused(
          opened.journal.load({ ...opened.access, execution: opened.execution }),
          'unavailable',
          'a rule change without a conversion',
        )
        assert.deepEqual(
          sequences(await readAll(opened, fromPrefix(before.prefix), rebuilt.through, 10)),
          [],
          'the verified prefix still bounds the read',
        )
      },
    ),
    controlled(
      'D5 read qualification: each page, a read from a verified prefix and the query of an old Ja check the current qualification; after it is given back the read goes on from the same prefix and nothing was undone',
      fixture,
      covered,
      async (opened, controls) => {
        const receipt = await admitReply(opened, 1)
        await admitReply(opened, 2)
        const projection = (await load(opened)).replyAdmissions
        const first = pageOf(
          await readOne(opened, readInput(opened, ORIGIN, projection.through, null, 1)),
          'first',
        )
        assert.equal(first.tail.kind, 'more')
        if (first.tail.kind !== 'more') return
        controls.readable(false)
        await refused(
          opened.journal.readReplyAdmissions(
            readInput(opened, ORIGIN, projection.through, first.tail.next, 1),
          ),
          'denied',
          'the second page without qualification',
        )
        await refused(
          opened.journal.readReplyAdmissions(
            readInput(opened, fromPrefix(first.end), projection.through, null, 1),
          ),
          'denied',
          'a read from a verified prefix without qualification',
        )
        await refused(
          opened.journal.query({
            ...opened.access,
            execution: opened.execution,
            operation: receipt.operation,
          }),
          'denied',
          'the query of an old Ja without qualification',
        )
        controls.readable(true)
        const rest = await readAll(opened, fromPrefix(first.end), projection.through, 10)
        assert.deepEqual(sequences(rest), ['2'])
        assert.equal((await load(opened)).replyAdmissions.prefix.sequence, '2')
      },
    ),
    controlled(
      'D5 complexity: at 100 and 10000 facts a read of 0, 1 and L+1 new facts scans, decodes and folds the same, its pages depend only on the new facts, and checkpoint writes equal the ordinary commits',
      fixture,
      covered,
      async (_opened, controls) => {
        const limit = 10
        const measure = async (scale: number) => {
          const subject = await controls.sibling(`scale-${scale}`)
          const own = subject.replyAdmissions
          assert.ok(own !== undefined, 'a sibling has its controls')
          await own.seed(scale)
          const rows: Record<string, number>[] = []
          for (const delta of [0, 1, limit + 1]) {
            const verified = (await load(subject)).replyAdmissions.prefix
            if (delta > 0) await own.seed(delta)
            const before = own.statistics()
            const snapshot = await load(subject)
            const pages = await readAll(
              subject,
              fromPrefix(verified),
              snapshot.replyAdmissions.through,
              limit,
            )
            await ok(
              subject.journal.commit(
                commitAt(subject, snapshot, `ordinary-${scale}-${delta}`, subject.authority, {
                  checkpoint: {
                    ...snapshot.checkpoint,
                    position: `I0-${delta}`,
                    replyAdmissionRead: { kind: 'verified', prefix: pages.at(-1)?.end ?? verified },
                  },
                }),
              ),
              'ordinary commit',
            )
            const after = own.statistics()
            rows.push({
              delta,
              scanned: after.scanned - before.scanned,
              decoded: after.decoded - before.decoded,
              pages: after.pages - before.pages,
              folds: after.folds - before.folds,
              loads: after.loads - before.loads,
              checkpointWrites: after.checkpointWrites - before.checkpointWrites,
            })
          }
          return rows
        }
        const small = await measure(100)
        const large = await measure(10_000)
        assert.deepEqual(large, small, 'the work of a read does not grow with the history')
        for (const row of small) {
          const delta = row['delta'] ?? 0
          assert.equal(row['decoded'], delta, 'only the new facts are decoded')
          assert.equal(row['scanned'], delta, 'only the new facts are scanned')
          assert.equal(row['folds'], 0, 'a load folds nothing')
          assert.equal(row['loads'], 1)
          assert.equal(row['checkpointWrites'], 1, 'one ordinary commit, one checkpoint write')
          assert.equal(row['pages'], Math.max(1, Math.ceil(delta / limit)))
        }
      },
    ),
  ]
}
