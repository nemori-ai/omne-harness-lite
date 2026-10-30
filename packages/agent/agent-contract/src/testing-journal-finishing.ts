// The finishing cases of the Journal core conformance suite (SPEC "条件终结", "取消判断与路线",
// "终结责任清单" and "commitSettlement 的变体"): the candidate an F1 commit establishes and the
// FinishIntent projection the Journal maintains, the before-terminal proof F2 sets, the obligations
// prepareFinish issues and how tryFinish reads them, the fixed order of the five blocked
// categories, the cancellation route through establish, judge, prepareFinish and tryFinish, the
// migration of a legacy cancelled candidate, and the three custody variants. Every case reads
// only what the port returns. testing-journal-core.ts appends these cases to the suite.
import assert from 'node:assert/strict'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import type { PendingCall } from './evaluation.ts'
import type { ExecutionSnapshot } from './execution.ts'
import type { FinishObligation, ToolIntentKey } from './finishing.ts'
import {
  decodeActionId,
  decodeCardRoundId,
  decodeConsumptionId,
  decodePassageId,
} from './identity.ts'
import type { CardRound, Passage } from './passages.ts'
import { uncoveredCase, type ConformanceCase } from './testing-case.ts'
import {
  advances,
  cancelAuthorization,
  cancelControl,
  candidateContent,
  candidateOf,
  commitAt,
  effectiveCancel,
  end,
  endCancelled,
  establish,
  events,
  evidence,
  f1Commit,
  f2Commit,
  finishInput,
  identity,
  installationOf,
  intentOf,
  judge,
  load,
  newSubmit,
  ok,
  operation,
  prepareInput,
  prepareOrdinaryEnd,
  PROVIDER,
  query,
  refused,
  requireInstallation,
  settlement,
  stage,
  takeInputs,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
} from './testing-journal-helpers.ts'

/** A before-terminal passage of the author route, in the progress `progress`. */
function beforeTerminalPassage(name: string, progress: Passage['progress']): Passage {
  return {
    id: identity(decodePassageId(`core-${name}`), name),
    position: 'before_terminal',
    dimension: null,
    purpose: null,
    action: null,
    ordinal: 1,
    declaration: {
      name: 'closer',
      position: 'before_terminal',
      power: 'veto',
      implementation: { kind: 'builtin', builtinName: 'closer' },
    },
    implementation: PROVIDER,
    input: evidence(`passage/${name}/input`),
    effective: evidence(`passage/${name}/effective`),
    operations: [],
    progress,
  }
}

/** One presented card round of a before-terminal passage that asked. */
function presentedRound(passage: Passage, name: string): CardRound {
  return {
    round: identity(decodeCardRoundId(`core-${name}`), name),
    ask: {
      position: 'before_terminal',
      passage: passage.id,
      extension: passage.declaration.name,
      implementation: passage.implementation,
      power: 'veto',
      at: '2026-10-30T00:00:00Z',
      output: {
        kind: 'ask',
        card: {
          explanation: 'close?',
          options: [{ id: 'yes', label: 'Yes' }],
          about: { position: 'before_terminal' },
        },
      },
    },
    requests: [{ identity: `${name}/card`, schema: PROVIDER, value: { kind: 'null' } }],
    progress: {
      kind: 'presented',
      cards: [
        {
          identity: `${name}/card`,
          card: evidence(`card/${name}`),
          response: null,
          processed: null,
        },
      ],
    },
  }
}

/** A pending Tool call whose intent is saved and whose invoke has no proven reference yet. */
function toolIntent<P>(opened: AgentJournalCoreOpened<P>, name: string): PendingCall {
  return {
    kind: 'tool',
    purpose: 'action',
    association: 'intent',
    action: identity(decodeActionId(`core-${name}`), name),
    consumption: identity(decodeConsumptionId(`core-${name}`), name),
    position: { owner: 'agent', work: opened.execution, position: 'T0', purpose: 'action' },
    fixed: evidence(`request/${name}`),
  }
}

function itemsOf(snapshot: ExecutionSnapshot): readonly FinishObligation[] {
  assert.ok(snapshot.finishObligations !== null, 'the obligations should be issued')
  return snapshot.finishObligations.items
}

/** The cases of the finishing chapter; the core suite appends them. */
export function finishingCases<P>(fixture: AgentJournalCoreFixture<P>): readonly ConformanceCase[] {
  return [
    {
      name: 'F1: a settling commit with `finish` establishes the candidate under this operation, its author route and the FinishIntent projection with obligations and beforeTerminal null; the retry recognizes; other content under the same operation conflicts; a non-settling commit with finish, and a settling commit before any candidate, are invalid',
      run: async () => {
        const opened = await fixture.open('f1-candidate')
        const { journal } = opened
        await takeInputs(opened)
        const snapshot = await load(opened)
        assert.equal(snapshot.finishObligations, null)
        assert.equal(snapshot.settlement.candidate, null)
        await refused(
          journal.commit(f2Commit(opened, snapshot, 'settling-without-candidate')),
          'invalid',
          'a settling commit before any candidate',
        )
        await refused(
          journal.commit(
            commitAt(opened, snapshot, 'advancing-with-finish', opened.authority, {
              finish: candidateContent(snapshot, 'advancing-with-finish'),
            }),
          ),
          'invalid',
          'a non-settling commit that carries a candidate',
        )
        assert.deepEqual(await load(opened), snapshot, 'the refusals wrote nothing')
        const f1 = f1Commit(opened, snapshot, 'f1')
        assert.deepEqual(await advances(opened, () => journal.commit(f1)), [1, 0], 'F1')
        const after = await load(opened)
        assert.deepEqual(after.state, {
          kind: 'settling',
          intent: {
            candidate: f1.operation,
            conclusion: { kind: 'complete' },
            inputWatermark: snapshot.inputWatermark,
            obligations: null,
            beforeTerminal: null,
            failure: null,
          },
        })
        assert.deepEqual(after.settlement.candidate, {
          candidate: f1.operation,
          ...f1.finish,
          checkpoint: f1.checkpoint,
        })
        const route = after.settlement.route
        assert.ok(route !== null && route.kind === 'author', 'the author route is current')
        if (route.kind !== 'author') return
        assert.equal(route.candidate, f1.operation)
        assert.equal(route.beforeTerminal, null)
        assert.deepEqual(route.plan, [])
        assert.deepEqual(after.settlement.candidates, [after.settlement.candidate])
        assert.deepEqual(after.settlement.routes, [route])
        assert.equal(after.finishObligations, null)
        assert.equal(after.settlement.currentJudgment, null)
        await refused(
          journal.commit({
            ...f1,
            finish: candidateContent(snapshot, 'f1', { conditions: evidence('other') }),
          }),
          'conflict',
          'the same operation with other content',
        )
        assert.deepEqual(await load(opened), after)
      },
    },
    {
      name: 'F1 again: another operation with the same content keeps the first candidate; other content establishes a new candidate and a supersession link, and the old candidate and route stay readable',
      run: async () => {
        const opened = await fixture.open('f1-supersession')
        const { journal } = opened
        await takeInputs(opened)
        const first = f1Commit(opened, await load(opened), 'f1-a')
        await ok(journal.commit(first), 'the first F1')
        const same = f1Commit(
          opened,
          await load(opened),
          'f1-b',
          opened.authority,
          first.finish ?? undefined,
        )
        await ok(journal.commit(same), 'the same content again')
        const kept = await load(opened)
        assert.equal(
          kept.settlement.candidate?.candidate,
          first.operation,
          'the first candidate stays',
        )
        assert.equal(intentOf(kept).candidate, first.operation)
        assert.equal(kept.settlement.candidates.length, 1)
        const other = f1Commit(
          opened,
          kept,
          'f1-c',
          opened.authority,
          candidateContent(kept, 'f1-c', { conditions: evidence('conditions/changed') }),
        )
        const receipt = await ok(journal.commit(other), 'a candidate of other content')
        const after = await load(opened)
        assert.equal(after.settlement.candidate?.candidate, other.operation)
        assert.equal(intentOf(after).candidate, other.operation)
        assert.deepEqual(
          after.settlement.candidates.map(candidate => candidate.candidate),
          [first.operation, other.operation],
        )
        assert.deepEqual(after.settlement.supersessions, [
          {
            from: first.operation,
            to: other.operation,
            control: null,
            revision: receipt.revision,
            route: kept.settlement.route,
          },
        ])
        assert.equal(after.settlement.route?.candidate, other.operation)
      },
    },
    {
      name: 'F2: the first plain settling commit after the candidate sets beforeTerminal of the author route and the projection to the evidence of that commit; a later one does not move it',
      run: async () => {
        const opened = await fixture.open('f2-before-terminal')
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        const f2 = f2Commit(opened, await load(opened), 'f2')
        const receipt = await ok(journal.commit(f2), 'F2')
        const after = await load(opened)
        const route = after.settlement.route
        assert.ok(route !== null && route.kind === 'author')
        if (route.kind !== 'author') return
        assert.deepEqual(route.beforeTerminal, receipt.evidence)
        assert.deepEqual(intentOf(after).beforeTerminal, receipt.evidence)
        assert.equal(intentOf(after).obligations, null)
        await ok(
          journal.commit(
            commitAt(opened, after, 'f2-later', opened.authority, {
              checkpoint: { ...after.checkpoint, position: 'F2b' },
              state: { kind: 'settling' },
            }),
          ),
          'a later settling commit',
        )
        assert.deepEqual(intentOf(await load(opened)).beforeTerminal, receipt.evidence)
      },
    },
    {
      name: 'prepareFinish issues the obligations of the candidate with one new revision and no event, fills the projection, and the same operation recognizes the same list; another candidate under the same operation conflicts, a stale expected is changed, an unknown candidate is invalid',
      run: async () => {
        const opened = await fixture.open('prepare-finish')
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        const before = await load(opened)
        const emitted = (await events(opened)).length
        const prepare = prepareInput(opened, before, 'prepare')
        await refused(
          journal.prepareFinish({ ...prepare, candidate: operation('never') }),
          'invalid',
          'a candidate the Journal does not hold',
        )
        assert.deepEqual(
          await advances(opened, () => journal.prepareFinish(prepare)),
          [1, 0],
          'prepareFinish',
        )
        const issued = await ok(journal.prepareFinish(prepare), 'the issued list')
        const after = await load(opened)
        assert.equal(after.revision, issued.receipt.revision)
        assert.deepEqual(after.checkpoint, before.checkpoint, 'the checkpoint did not change')
        assert.equal((await events(opened)).length, emitted, 'no event')
        assert.deepEqual(intentOf(after).obligations, issued.obligations)
        assert.deepEqual(intentOf(after).beforeTerminal, intentOf(before).beforeTerminal)
        const list = after.finishObligations
        assert.ok(list !== null, 'load lists the issued obligations')
        assert.deepEqual(list.evidence, issued.obligations)
        assert.equal(list.operation, prepare.operation)
        assert.equal(list.revision, issued.receipt.revision)
        assert.equal(list.candidate, prepare.candidate)
        assert.deepEqual(list.conclusion, { kind: 'complete' })
        assert.deepEqual(list.inputWatermark, before.inputWatermark)
        assert.equal(list.coverage.readRevision, before.revision)
        assert.ok(Array.isArray(list.items))
        assert.deepEqual(await query(opened, prepare.operation), {
          kind: 'committed',
          receipt: issued.receipt,
        })
        await refused(
          journal.prepareFinish({ ...prepare, candidate: operation('f1-other') }),
          'conflict',
          'the same operation with another candidate',
        )
        await refused(
          journal.prepareFinish(prepareInput(opened, before, 'prepare-stale')),
          'changed',
          'a stale expected',
        )
        assert.deepEqual(await load(opened), after, 'the refusals wrote nothing')
      },
    },
    {
      name: 'tryFinish: without an issued list the intent is invalid at intent.obligations, a forged list is invalid; an intent that differs from the projection or a stale expected is changed; the loaded projection ends, and the ended snapshot keeps the list, the candidate and the route',
      run: async () => {
        const opened = await fixture.open('try-finish-projection')
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        const unissued = await load(opened)
        const early = await refused(
          journal.tryFinish(finishInput(opened, unissued, 'early')),
          'invalid',
          'tryFinish before prepareFinish',
        )
        assert.equal(early.kind === 'invalid' ? early.field : '', 'intent.obligations')
        await refused(
          journal.tryFinish(
            finishInput(opened, unissued, 'forged', undefined, {
              ...intentOf(unissued),
              obligations: evidence('obligations/forged'),
            }),
          ),
          'invalid',
          'a forged list',
        )
        await ok(journal.prepareFinish(prepareInput(opened, unissued, 'prepare')), 'prepareFinish')
        const ready = await load(opened)
        const intent = intentOf(ready)
        const differing = await ok(
          journal.tryFinish(
            finishInput(opened, ready, 'differing', undefined, {
              ...intent,
              conclusion: { kind: 'fail', cause: evidence('cause') },
            }),
          ),
          'an intent that differs from the projection',
        )
        assert.equal(differing.kind, 'changed')
        const noProof = await ok(
          journal.tryFinish(
            finishInput(opened, ready, 'no-proof', undefined, { ...intent, beforeTerminal: null }),
          ),
          'an intent without the proof',
        )
        assert.equal(noProof.kind, 'changed')
        const stale = await ok(
          journal.tryFinish(finishInput(opened, unissued, 'stale', undefined, intent)),
          'a stale expected',
        )
        assert.equal(stale.kind, 'changed')
        assert.deepEqual(await load(opened), ready, 'changed wrote nothing')
        const finished = await ok(journal.tryFinish(finishInput(opened, ready, 'end')), 'the end')
        assert.equal(finished.kind, 'ended')
        const after = await load(opened)
        assert.equal(after.state.kind, 'ended')
        assert.deepEqual(after.finishObligations?.evidence, intent.obligations)
        assert.equal(after.settlement.candidate?.candidate, intent.candidate)
        assert.equal(after.settlement.route?.candidate, intent.candidate)
        assert.equal((await events(opened)).at(-1)?.body.kind, 'ended')
      },
    },
    {
      name: 'the list stays usable across a revision that leaves the responsibility projection unchanged (acknowledge); a new responsibility (a control) makes it stale: tryFinish is changed and a new prepareFinish issues another list that carries the control',
      run: async () => {
        const opened = await fixture.open('list-projection')
        const { journal } = opened
        await takeInputs(opened)
        const ready = await prepareOrdinaryEnd(opened, 'end')
        const intent = intentOf(ready)
        await ok(
          journal.acknowledge({
            ...opened.access,
            execution: opened.execution,
            operation: operation('ack'),
            through: '1',
            receipt: null,
          }),
          'acknowledge',
        )
        const acknowledged = await load(opened)
        assert.notEqual(acknowledged.revision, ready.revision)
        assert.deepEqual(intentOf(acknowledged), intent, 'the projection did not change')
        const control = cancelControl(opened)
        await ok(journal.control(control), 'a control accepted after the list')
        const stale = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'stale-list')),
          'tryFinish with the stale list',
        )
        assert.equal(stale.kind, 'changed')
        const again = await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-again')),
          'prepareFinish again',
        )
        assert.notDeepEqual(again.obligations, intent.obligations, 'a new list')
        const items = itemsOf(await load(opened))
        assert.ok(
          items.some(item => item.kind === 'control' && item.control === control.operation),
          'the new list carries the control',
        )
      },
    },
    {
      name: 'blocked order: an accepted input no batch took blocks an ordinary end with inputs, before controls and passages; an unresolved cancel intent blocks with controls, before passages; a candidate without its before-terminal proof blocks with passages',
      run: async () => {
        const opened = await fixture.open('blocked-order')
        const { journal } = opened
        await ok(
          journal.submit(newSubmit(opened, 'submit-5', await opened.acceptInput('5'))),
          'an input',
        )
        const control = cancelControl(opened)
        await ok(journal.control(control), 'control')
        await ok(
          journal.recordControl(
            stage(
              opened,
              'intent-unresolved',
              control.operation,
              'intent-established',
              'unresolved',
            ),
          ),
          'the unresolved intent',
        )
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare')),
          'prepare',
        )
        const inputs = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-1')),
          'end',
        )
        assert.deepEqual(
          { kind: inputs.kind, reason: inputs.kind === 'blocked' ? inputs.reason : null },
          { kind: 'blocked', reason: 'inputs' },
        )
        await takeInputs(opened)
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-2')),
          'prepare',
        )
        const controls = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-2')),
          'end',
        )
        assert.deepEqual(
          { kind: controls.kind, reason: controls.kind === 'blocked' ? controls.reason : null },
          { kind: 'blocked', reason: 'controls' },
        )
        const reopened = await fixture.open('blocked-passages')
        await takeInputs(reopened)
        await ok(reopened.journal.commit(f1Commit(reopened, await load(reopened), 'f1')), 'F1')
        await ok(
          reopened.journal.prepareFinish(prepareInput(reopened, await load(reopened), 'prepare')),
          'prepare',
        )
        const passages = await ok(
          reopened.journal.tryFinish(finishInput(reopened, await load(reopened), 'end')),
          'end',
        )
        assert.deepEqual(
          { kind: passages.kind, reason: passages.kind === 'blocked' ? passages.reason : null },
          { kind: 'blocked', reason: 'passages' },
        )
        assert.notEqual((await load(reopened)).state.kind, 'ended')
      },
    },
    {
      name: 'blocked order: a pending write of another operation blocks with operations, before passages',
      run: async () => {
        const opened = await fixture.open('blocked-operations')
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        opened.faultNext('submit', 'pending')
        await refused(
          journal.submit(newSubmit(opened, 'held', await opened.acceptInput('6'))),
          'commit-unknown',
          'the held write',
        )
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare')),
          'prepare',
        )
        const result = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end')),
          'end',
        )
        assert.deepEqual(
          { kind: result.kind, reason: result.kind === 'blocked' ? result.reason : null },
          { kind: 'blocked', reason: 'operations' },
        )
      },
    },
    {
      name: 'blocked order: a result without custody or completion blocks with custody, after passages',
      run: async () => {
        const opened = await fixture.open('blocked-custody')
        if (opened.produceResult === undefined) {
          await uncoveredCase('', 'produceResult control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const produced = await opened.produceResult('r1')
        await ok(
          journal.recordResult({
            ...opened.access,
            execution: opened.execution,
            operation: operation('result-none'),
            result: produced.result,
            consumption: produced.consumption,
            transfer: { kind: 'none' },
            release: { kind: 'pending' },
          }),
          'a result without custody',
        )
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare')),
          'prepare',
        )
        const passages = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-1')),
          'end',
        )
        assert.deepEqual(
          { kind: passages.kind, reason: passages.kind === 'blocked' ? passages.reason : null },
          { kind: 'blocked', reason: 'passages' },
        )
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-2')),
          'prepare',
        )
        const custody = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-2')),
          'end',
        )
        assert.deepEqual(
          { kind: custody.kind, reason: custody.kind === 'blocked' ? custody.reason : null },
          { kind: 'blocked', reason: 'custody' },
        )
      },
    },
    {
      name: 'establish-cancellation: under an effective cancel it builds the cancelled candidate under this operation, its native cancellation route and the projection with obligations and beforeTerminal null, with one new revision; the retry recognizes; other input under the same operation conflicts; a stale expected is changed; a cancel that is not effective is denied; a source that does not match the saved control is invalid',
      run: async () => {
        const opened = await fixture.open('establish-cancellation')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const accepted = cancelControl(opened, 'cancel')
        await ok(journal.control(accepted), 'control')
        const notEffective = await load(opened)
        const request = settlement<P, 'establish-cancellation'>(opened, 'establish', {
          kind: 'establish-cancellation',
          authorization: cancelAuthorization(notEffective, accepted.operation),
          expected: notEffective.revision,
          installation: installationOf(opened).record,
          predecessor: null,
        })
        await refused(journal.commitSettlement(request), 'denied', 'a cancel that is not effective')
        await ok(
          journal.recordControl(stage(opened, 'intent', accepted.operation, 'intent-established')),
          'the intent',
        )
        const effective = await load(opened)
        await refused(
          journal.commitSettlement({
            ...request,
            expected: effective.revision,
            authorization: { ...request.authorization, source: evidence('forged-control') },
          }),
          'invalid',
          'a source that does not match the saved control',
        )
        await refused(journal.commitSettlement(request), 'changed', 'a stale expected')
        assert.deepEqual(await load(opened), effective, 'the refusals wrote nothing')
        const establishing = { ...request, expected: effective.revision }
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(establishing)),
          [1, 0],
          'establish-cancellation',
        )
        const result = await ok(journal.commitSettlement(establishing), 'the established candidate')
        assert.equal(result.kind, 'establish-cancellation')
        if (result.kind !== 'establish-cancellation') return
        assert.equal(result.candidate.candidate, establishing.operation)
        assert.equal(result.candidate.conclusion.kind, 'cancelled')
        assert.deepEqual(result.candidate.inputWatermark, effective.inputWatermark)
        assert.deepEqual(result.candidate.checkpoint, effective.checkpoint)
        assert.equal(result.route.kind, 'cancellation')
        assert.equal(result.route.candidate, establishing.operation)
        assert.equal(result.route.control, accepted.operation)
        assert.deepEqual(result.route.installation, installationOf(opened).record)
        assert.deepEqual(result.route.origin, { kind: 'native', operation: establishing.operation })
        assert.equal(result.supersession, null)
        const after = await load(opened)
        assert.equal(after.revision, result.receipt.revision)
        assert.deepEqual(after.state, {
          kind: 'settling',
          intent: {
            candidate: establishing.operation,
            conclusion: result.candidate.conclusion,
            inputWatermark: effective.inputWatermark,
            obligations: null,
            beforeTerminal: null,
            failure: null,
          },
        })
        assert.deepEqual(after.settlement.candidate, result.candidate)
        assert.deepEqual(after.settlement.route, result.route)
        assert.equal(after.settlement.currentJudgment, null)
        await refused(
          journal.commitSettlement({ ...establishing, predecessor: operation('other') }),
          'conflict',
          'the same operation with other input',
        )
        assert.deepEqual(await load(opened), after)
      },
    },
    {
      name: 'establish-cancellation after a complete candidate: the new cancelled candidate supersedes it with the control and the old author route in the link; an ordinary prepareFinish under the effective cancel is changed',
      run: async () => {
        const opened = await fixture.open('establish-supersedes')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(journal.commit(f1), 'F1')
        const complete = await load(opened)
        const control = await effectiveCancel(opened)
        await refused(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-ordinary')),
          'changed',
          'an ordinary prepareFinish under an effective cancel',
        )
        const result = await establish(opened, control)
        assert.deepEqual(result.supersession, {
          from: f1.operation,
          to: result.candidate.candidate,
          control,
          revision: result.receipt.revision,
          route: complete.settlement.route,
        })
        const after = await load(opened)
        assert.deepEqual(after.settlement.supersessions, [result.supersession])
        assert.deepEqual(
          after.settlement.candidates.map(candidate => candidate.candidate),
          [f1.operation, result.candidate.candidate],
        )
      },
    },
    {
      name: 'judge-cancellation: before a judgment the cancel tryFinish is blocked with passages; the allowed judgment is saved with one new revision as the current judgment and the proof of the projection, the retry recognizes it, the list issued before it stays usable, and tryFinish ends; a late stage left unresolved does not block',
      run: async () => {
        const opened = await fixture.open('judge-cancellation')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        await ok(
          journal.recordControl(
            stage(opened, 'confirmed-unresolved', control, 'producer-confirmed', 'unresolved'),
          ),
          'a late stage left unresolved',
        )
        await establish(opened, control)
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        const blocked = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end-unjudged', cancelAuthorization(issued, control)),
          ),
          'tryFinish without a judgment',
        )
        assert.deepEqual(
          { kind: blocked.kind, reason: blocked.kind === 'blocked' ? blocked.reason : null },
          { kind: 'blocked', reason: 'passages' },
        )
        const judging = settlement<P, 'judge-cancellation'>(opened, 'judge', {
          kind: 'judge-cancellation',
          authorization: cancelAuthorization(issued, control),
          expected: issued.revision,
          candidate: candidateOf(issued),
          route: issued.settlement.route?.record ?? evidence('none'),
          installation: installationOf(opened).record,
        })
        await refused(
          journal.commitSettlement({ ...judging, route: evidence('route/other') }),
          'invalid',
          'a route the Journal does not hold',
        )
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(judging)),
          [1, 0],
          'judge',
        )
        const result = await ok(journal.commitSettlement(judging), 'the judgment')
        assert.equal(result.kind, 'judge-cancellation')
        if (result.kind !== 'judge-cancellation') return
        assert.equal(result.receipt.state, 'applied')
        assert.equal(result.judgment.decision.kind, 'allowed')
        assert.equal(result.judgment.operation, judging.operation)
        assert.equal(result.judgment.candidate, judging.candidate)
        assert.equal(result.judgment.control, control)
        assert.deepEqual(result.judgment.policy, installationOf(opened).policy)
        assert.equal(result.judgment.supersedes, null)
        const judged = await load(opened)
        assert.equal(judged.settlement.currentJudgment, judging.operation)
        assert.deepEqual(judged.settlement.judgments, [result.judgment])
        assert.deepEqual(intentOf(judged).beforeTerminal, result.judgment.evidence)
        assert.deepEqual(intentOf(judged).obligations, intentOf(issued).obligations)
        const finished = await ok(
          journal.tryFinish(
            finishInput(opened, judged, 'end', cancelAuthorization(judged, control)),
          ),
          'the cancelled end',
        )
        assert.equal(finished.kind, 'ended')
        const after = await load(opened)
        assert.equal(after.state.kind, 'ended')
        assert.equal(after.state.kind === 'ended' ? after.state.conclusion.kind : '', 'cancelled')
      },
    },
    {
      name: 'judge-cancellation: a result without custody is a blocked judgment and tryFinish is blocked with custody pointing at it; a new judgment supersedes the first',
      run: async () => {
        const opened = await fixture.open('judge-blocked')
        if (!(await requireInstallation(opened))) return
        if (opened.produceResult === undefined) {
          await uncoveredCase('', 'produceResult control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const produced = await opened.produceResult('r1')
        const record = (name: string, transfer: typeof produced.transfer | { kind: 'none' }) =>
          journal.recordResult({
            ...opened.access,
            execution: opened.execution,
            operation: operation(name),
            result: produced.result,
            consumption: produced.consumption,
            transfer,
            release: { kind: 'pending' },
          })
        await ok(record('result-none', { kind: 'none' }), 'a result without custody')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const first = await judge(opened, control, 'judge-1')
        assert.equal(first.judgment.decision.kind, 'blocked')
        if (first.judgment.decision.kind !== 'blocked') return
        assert.equal(first.judgment.decision.reasons[0].category, 'custody')
        const blockedAt = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, blockedAt, 'prepare', cancelAuthorization(blockedAt, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        const blocked = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end-blocked', cancelAuthorization(issued, control)),
          ),
          'tryFinish on a blocked judgment',
        )
        assert.deepEqual(
          { kind: blocked.kind, reason: blocked.kind === 'blocked' ? blocked.reason : null },
          { kind: 'blocked', reason: 'custody' },
        )
        await ok(record('result-custody', produced.transfer), 'the custody')
        const second = await judge(opened, control, 'judge-2')
        assert.equal(second.judgment.decision.kind, 'allowed')
        assert.equal(second.judgment.supersedes, first.judgment.operation)
        const after = await load(opened)
        assert.equal(after.settlement.currentJudgment, second.judgment.operation)
        assert.equal(after.settlement.judgments.length, 2)
      },
    },
    {
      name: 'judge-cancellation: an operation whose write is still pending is an unknown judgment, and tryFinish is unavailable, not blocked or ended',
      run: async () => {
        const opened = await fixture.open('judge-unknown')
        if (!(await requireInstallation(opened))) return
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        opened.faultNext('submit', 'pending')
        await refused(
          journal.submit(newSubmit(opened, 'held', await opened.acceptInput('6'))),
          'commit-unknown',
          'the held write',
        )
        await establish(opened, control)
        const judged = await judge(opened, control)
        assert.equal(judged.judgment.decision.kind, 'unknown')
        const snapshot = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, snapshot, 'prepare', cancelAuthorization(snapshot, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        await refused(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'unavailable',
          'tryFinish on an unknown judgment',
        )
        assert.notEqual((await load(opened)).state.kind, 'ended')
      },
    },
    {
      name: 'without an installation the candidate, migration and judgment variants are unavailable and write nothing',
      run: async () => {
        const opened = await fixture.open('no-installation', { cancellationPolicy: 'absent' })
        if (!(await requireInstallation(opened))) return
        assert.equal(opened.installation, null, 'the fixture opened without an installation')
        const { journal } = opened
        const control = await effectiveCancel(opened)
        const snapshot = await load(opened)
        const missing = evidence('installation/missing')
        await refused(
          journal.commitSettlement(
            settlement<P, 'establish-cancellation'>(opened, 'establish', {
              kind: 'establish-cancellation',
              authorization: cancelAuthorization(snapshot, control),
              expected: snapshot.revision,
              installation: missing,
              predecessor: null,
            }),
          ),
          'unavailable',
          'establish-cancellation without an installation',
        )
        await refused(
          journal.commitSettlement(
            settlement<P, 'judge-cancellation'>(opened, 'judge', {
              kind: 'judge-cancellation',
              authorization: cancelAuthorization(snapshot, control),
              expected: snapshot.revision,
              candidate: operation('candidate'),
              route: evidence('route'),
              installation: missing,
            }),
          ),
          'unavailable',
          'judge-cancellation without an installation',
        )
        assert.deepEqual(await load(opened), snapshot, 'nothing was written')
      },
    },
    {
      name: 'migrate-cancellation: a legacy cancelled candidate on an author route migrates with one new revision: the record under this operation, the route switched to a cancellation route of migration origin, the proof cleared; the retry recognizes; a second migration under another operation is changed; establish-cancellation on it is invalid; the judgment then ends it',
      run: async () => {
        const opened = await fixture.open('migrate-cancellation')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        const legacy = f1Commit(
          opened,
          await load(opened),
          'legacy-f1',
          opened.authority,
          candidateContent(await load(opened), 'legacy-f1', {
            conclusion: { kind: 'cancelled', cause: evidence('cause/legacy') },
          }),
        )
        await ok(journal.commit(legacy), 'the legacy cancelled candidate')
        await ok(
          journal.commit(f2Commit(opened, await load(opened), 'legacy-f2')),
          'its author proof',
        )
        const before = await load(opened)
        const authorRoute = before.settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        if (authorRoute.kind !== 'author') return
        assert.ok(authorRoute.beforeTerminal !== null, 'the legacy proof is set')
        await refused(
          journal.commitSettlement(
            settlement<P, 'establish-cancellation'>(opened, 'establish-legacy', {
              kind: 'establish-cancellation',
              authorization: cancelAuthorization(before, control),
              expected: before.revision,
              installation: installationOf(opened).record,
              predecessor: legacy.operation,
            }),
          ),
          'invalid',
          'establish-cancellation on a cancelled candidate with an author route',
        )
        const migrating = settlement<P, 'migrate-cancellation'>(opened, 'migrate', {
          kind: 'migrate-cancellation',
          authorization: cancelAuthorization(before, control),
          expected: before.revision,
          candidate: legacy.operation,
          originalRoute: authorRoute.record,
          installation: installationOf(opened).record,
          priorExcluded: null,
        })
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(migrating)),
          [1, 0],
          'migrate',
        )
        const result = await ok(journal.commitSettlement(migrating), 'the migration')
        assert.equal(result.kind, 'migrate-cancellation')
        if (result.kind !== 'migrate-cancellation') return
        const migration = result.migration
        assert.equal(migration.operation, migrating.operation)
        assert.equal(migration.candidate, legacy.operation)
        assert.equal(migration.control, control)
        assert.deepEqual(migration.from.route, authorRoute)
        assert.deepEqual(migration.from.beforeTerminal, authorRoute.beforeTerminal)
        assert.deepEqual(migration.progress, [])
        assert.deepEqual(migration.to.installation, installationOf(opened).record)
        assert.equal(migration.priorExcluded, null)
        assert.deepEqual(migration.supersession.from, authorRoute.record)
        assert.deepEqual(migration.supersession.to, result.route.record)
        assert.equal(migration.supersession.candidate, null)
        assert.deepEqual(result.route.origin, { kind: 'migration', operation: migrating.operation })
        assert.equal(result.route.candidate, legacy.operation)
        const after = await load(opened)
        assert.deepEqual(after.settlement.route, result.route)
        assert.deepEqual(after.settlement.migrations, [migration])
        assert.equal(after.settlement.candidate?.candidate, legacy.operation, 'the candidate stays')
        assert.equal(intentOf(after).candidate, legacy.operation)
        assert.equal(intentOf(after).beforeTerminal, null, 'the proof is cleared')
        assert.equal(after.settlement.routes.length, 2)
        await refused(
          journal.commitSettlement({
            ...migrating,
            operation: operation('migrate-again'),
            expected: after.revision,
          }),
          'changed',
          'a second migration of a switched route',
        )
        assert.deepEqual(await load(opened), after)
        const receipt = await endCancelled(opened, control)
        assert.equal(receipt.execution, opened.execution)
        assert.equal((await load(opened)).state.kind, 'ended')
      },
    },
    {
      name: 'migrate-cancellation of a complete candidate is invalid: only a cancelled candidate on an author route migrates',
      run: async () => {
        const opened = await fixture.open('migrate-complete')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(journal.commit(f1), 'F1')
        const control = await effectiveCancel(opened)
        const before = await load(opened)
        await refused(
          journal.commitSettlement(
            settlement<P, 'migrate-cancellation'>(opened, 'migrate', {
              kind: 'migrate-cancellation',
              authorization: cancelAuthorization(before, control),
              expected: before.revision,
              candidate: f1.operation,
              originalRoute: before.settlement.route?.record ?? evidence('none'),
              installation: installationOf(opened).record,
              priorExcluded: null,
            }),
          ),
          'invalid',
          'a migration of a complete candidate',
        )
        assert.deepEqual(await load(opened), before)
      },
    },
    {
      name: 'record-legacy-return: the late return of a before-terminal call of the superseded candidate is saved from the host record with one new revision, listed in the settlement, and leaves the passage as it was; the retry recognizes; an unreadable source is unavailable; it is still accepted after ended',
      run: async () => {
        const opened = await fixture.open('legacy-return')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const passage = beforeTerminalPassage('closer', {
          kind: 'requested',
          mode: { kind: 'fresh' },
        })
        const snapshot = await load(opened)
        const f1 = f1Commit(opened, snapshot, 'f1')
        await ok(
          journal.commit({ ...f1, checkpoint: { ...f1.checkpoint, passages: [passage] } }),
          'F1 with the requested passage',
        )
        const authorRoute = (await load(opened)).settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const request = evidence('invoke/closer')
        const source = await opened.hostRecord({
          kind: 'legacy-return',
          passage: passage.id,
          input: request,
          mode: { kind: 'fresh' },
          implementation: passage.implementation,
          started: evidence('started/closer'),
          result: { kind: 'output', value: { kind: 'observed' } },
          received: evidence('received/closer'),
          custody: evidence('custody/closer'),
        })
        const recording = settlement<P, 'record-legacy-return'>(opened, 'legacy-return', {
          kind: 'record-legacy-return',
          passage: passage.id,
          candidate: f1.operation,
          route: authorRoute.record,
          request,
          source,
        })
        await refused(
          journal.commitSettlement({ ...recording, source: evidence('nowhere') }),
          'unavailable',
          'a source the host does not answer',
        )
        const before = await load(opened)
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(recording)),
          [1, 0],
          'record',
        )
        const result = await ok(journal.commitSettlement(recording), 'the late return')
        assert.equal(result.kind, 'record-legacy-return')
        if (result.kind !== 'record-legacy-return') return
        assert.equal(result.legacyReturn.operation, recording.operation)
        assert.equal(result.legacyReturn.passage, passage.id)
        assert.equal(result.legacyReturn.candidate, f1.operation)
        assert.deepEqual(result.legacyReturn.route, authorRoute.record)
        assert.deepEqual(result.legacyReturn.result, {
          kind: 'output',
          value: { kind: 'observed' },
        })
        assert.deepEqual(result.legacyReturn.source, source)
        const after = await load(opened)
        assert.deepEqual(after.settlement.legacyReturns, [result.legacyReturn])
        assert.deepEqual(
          after.checkpoint.passages,
          before.checkpoint.passages,
          'the passage is as it was',
        )
        assert.deepEqual(after.settlement.candidate, before.settlement.candidate)
        await endCancelled(opened, control)
        const late = await opened.hostRecord({
          kind: 'legacy-return',
          passage: passage.id,
          input: request,
          mode: { kind: 'fresh' },
          implementation: passage.implementation,
          started: evidence('started/closer'),
          result: { kind: 'errored', error: 'late' },
          received: evidence('received/closer-2'),
          custody: evidence('custody/closer-2'),
        })
        await ok(
          journal.commitSettlement({
            ...recording,
            operation: operation('legacy-return-2'),
            source: late,
          }),
          'a late return after ended',
        )
        assert.equal((await load(opened)).settlement.legacyReturns.length, 2)
      },
    },
    {
      name: 'record-tool-association: the accepted return of an original Tool invoke the host kept is saved against the intent key with one new revision, the call obligation carries the association; the retry recognizes; an unknown intent key is invalid; an unreadable source is unavailable',
      run: async () => {
        const opened = await fixture.open('tool-association')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const pending = toolIntent(opened, 'call')
        const snapshot = await load(opened)
        const effect = commitAt(opened, snapshot, 'effect', opened.authority, {
          effects: [{ action: pending.action, pending, authority: opened.authority }],
        })
        await ok(journal.commit(effect), 'the effect intent')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const key: ToolIntentKey = {
          intent: effect.operation,
          action: pending.action,
          position: pending.position,
        }
        const reference = identity(
          encodeToolInvocationRef({
            tenant: opened.access.tenant,
            call: identity(decodeToolCallId('core-call'), 'call'),
            admission: identity(decodeToolOperationId('core-admission'), 'admission'),
          }),
          'reference',
        )
        const source = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'accepted', reference, receipt: evidence('tool-receipt') },
          received: evidence('received/call'),
          custody: evidence('custody/call'),
        })
        const recording = settlement<P, 'record-tool-association'>(opened, 'associate', {
          kind: 'record-tool-association',
          intent: key,
          request: pending.fixed,
          source,
          priorExcluded: null,
        })
        await refused(
          journal.commitSettlement({
            ...recording,
            intent: { ...key, intent: operation('never') },
          }),
          'invalid',
          'an intent key the Journal does not hold',
        )
        await refused(
          journal.commitSettlement({ ...recording, source: evidence('nowhere') }),
          'unavailable',
          'a source the host does not answer',
        )
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(recording)),
          [1, 0],
          'record',
        )
        const result = await ok(journal.commitSettlement(recording), 'the association')
        assert.equal(result.kind, 'record-tool-association')
        if (result.kind !== 'record-tool-association') return
        assert.equal(result.association.operation, recording.operation)
        assert.deepEqual(result.association.intent, key)
        assert.deepEqual(result.association.association, {
          kind: 'accepted',
          reference,
          receipt: evidence('tool-receipt'),
        })
        assert.equal(result.association.obligation.kind, 'call')
        if (result.association.obligation.kind !== 'call') return
        assert.equal(result.association.obligation.intent, effect.operation)
        assert.equal(result.association.obligation.action, pending.action)
        assert.ok(result.association.obligation.custodian !== null, 'the host holds the call')
        const after = await load(opened)
        assert.deepEqual(after.settlement.toolAssociations, [result.association])
      },
    },
    {
      name: 'record-card-reconciliation: the lookup result of a card round the host kept is merged into the card-round obligation with one new revision; the retry recognizes; a round the Journal does not hold is invalid; an unreadable source is unavailable',
      run: async () => {
        const opened = await fixture.open('card-reconciliation')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const asking = beforeTerminalPassage('asker', {
          kind: 'requested',
          mode: { kind: 'fresh' },
        })
        const round = presentedRound(asking, 'round')
        const passage: Passage = { ...asking, progress: { kind: 'asked', rounds: [round] } }
        const snapshot = await load(opened)
        const f1 = f1Commit(opened, snapshot, 'f1')
        await ok(
          journal.commit({ ...f1, checkpoint: { ...f1.checkpoint, passages: [passage] } }),
          'F1 with the asked passage',
        )
        const authorRoute = (await load(opened)).settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const lookup = operation('lookup')
        const source = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: passage.id,
          round: round.round,
          present: evidence(`present/${round.round}`),
          lookups: [lookup],
          invalidate: null,
        })
        const recording = settlement<P, 'record-card-reconciliation'>(opened, 'reconcile-card', {
          kind: 'record-card-reconciliation',
          passage: passage.id,
          round: round.round,
          candidate: f1.operation,
          route: authorRoute.record,
          original: source,
        })
        await refused(
          journal.commitSettlement({
            ...recording,
            round: identity(decodeCardRoundId('core-never'), 'never'),
          }),
          'invalid',
          'a round the Journal does not hold',
        )
        await refused(
          journal.commitSettlement({ ...recording, original: evidence('nowhere') }),
          'unavailable',
          'a source the host does not answer',
        )
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(recording)),
          [1, 0],
          'record',
        )
        const result = await ok(journal.commitSettlement(recording), 'the reconciliation')
        assert.equal(result.kind, 'record-card-reconciliation')
        if (result.kind !== 'record-card-reconciliation') return
        assert.equal(result.reconciliation.operation, recording.operation)
        assert.equal(result.reconciliation.passage, passage.id)
        assert.equal(result.reconciliation.round, round.round)
        assert.equal(result.reconciliation.obligation.kind, 'card-round')
        assert.deepEqual(result.reconciliation.obligation.round, round)
        assert.deepEqual(result.reconciliation.obligation.lookups, [lookup])
        assert.deepEqual(
          result.reconciliation.obligation.present,
          evidence(`present/${round.round}`),
        )
        const after = await load(opened)
        assert.deepEqual(after.settlement.cardReconciliations, [result.reconciliation])
      },
    },
    {
      name: 'after ended a new prepareFinish of the ended candidate returns terminal and writes nothing',
      run: async () => {
        const opened = await fixture.open('after-end')
        const { journal } = opened
        await end(opened)
        const after = await load(opened)
        await refused(
          journal.prepareFinish(prepareInput(opened, after, 'prepare-after-end')),
          'terminal',
          'a new prepareFinish after ended',
        )
        assert.deepEqual(await load(opened), after)
      },
    },
  ]
}
