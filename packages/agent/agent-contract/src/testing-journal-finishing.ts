// The finishing cases of the Journal core conformance suite (SPEC "条件终结", "取消判断与路线",
// "终结责任清单" and "commitSettlement 的变体"): the candidate an F1 commit establishes and the
// FinishIntent projection the Journal maintains, the before-terminal proof F2 sets, the obligations
// prepareFinish issues and how tryFinish reads them, the fixed order of the five blocked
// categories, the cancellation route through establish, judge, prepareFinish and tryFinish, the
// migration of a legacy cancelled candidate, and the three custody variants. Every case reads
// only what the port returns. testing-journal-core.ts appends these cases to the suite.
import assert from 'node:assert/strict'
import type * as M from '@omne-harness/model-contract'
import {
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
} from '@omne-harness/model-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
} from '@omne-harness/tool-contract'
import type { Failure, PendingCall } from './evaluation.ts'
import type { ExecutionSnapshot, FinishResult } from './execution.ts'
import type {
  FinishCandidateContent,
  FinishObligation,
  LegacyF2Entry,
  ToolIntentKey,
} from './finishing.ts'
import {
  decodeActionId,
  decodeCardRoundId,
  decodeConsumptionId,
  decodePassageId,
  type DurableEvidence,
} from './identity.ts'
import type { CardRound, Passage } from './passages.ts'
import { uncoveredCase, type ConformanceCase } from './testing-case.ts'
import {
  advancement,
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
  failedContent,
  finishInput,
  identity,
  installationOf,
  intentOf,
  judge,
  load,
  newSubmit,
  ok,
  operation,
  pendingHandoff,
  prepareCommit,
  prepareInput,
  prepareOrdinaryEnd,
  prepared,
  PROVIDER,
  query,
  refused,
  requireInstallation,
  resolveCommit,
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

/** A pending Model call whose effect intent is saved, with the call id its reference resolves to. */
function modelIntent<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
): Readonly<{ pending: PendingCall; call: M.ModelCallId }> {
  const call = identity(decodeModelCallId(`mcall_core_${name}`), name)
  const pending: PendingCall = {
    kind: 'model',
    purpose: 'main',
    action: identity(decodeActionId(`core-${name}`), name),
    consumption: identity(decodeConsumptionId(`core-${name}`), name),
    position: { owner: 'agent', work: opened.execution, position: 'I3', purpose: 'main' },
    fixed: evidence(`request/${name}`),
    reference: identity(
      encodeModelInvocationRef({
        tenant: opened.access.tenant,
        call,
        admission: identity(decodeModelOperationId(`mop_core_${name}`), name),
      }),
      'reference',
    ),
  }
  return { pending, call }
}

/** The content of a candidate that fails because the producer gave no reply to `call`. */
function noReplyContent(name: string, call: M.ModelCallId): Partial<FinishCandidateContent> {
  return {
    conclusion: { kind: 'fail', cause: evidence(`cause/${name}`) },
    failure: {
      step: null,
      at: '2026-10-30T00:00:00Z',
      source: evidence(`failure/${name}`),
      kind: 'no-reply',
      call,
      result: {
        producer: { kind: 'model', call },
        version: 'v1',
        delivery: null,
        source: evidence(`result/${name}`),
      },
    },
  }
}

function itemsOf(snapshot: ExecutionSnapshot): readonly FinishObligation[] {
  assert.ok(snapshot.finishObligations !== null, 'the obligations should be issued')
  return snapshot.finishObligations.items
}

/** The field of an invalid failure; the empty text for any other failure. */
function fieldOf(failure: Failure): string {
  return failure.kind === 'invalid' ? failure.field : ''
}

/** The kind and the blocked category of a finish result, for one assertion. */
function blockedOf(result: FinishResult): Readonly<{ kind: string; reason: string | null }> {
  return { kind: result.kind, reason: result.kind === 'blocked' ? result.reason : null }
}

/** The one item of `kind` in the issued list; fails when there is none or more than one. */
function itemOf<K extends FinishObligation['kind']>(
  snapshot: ExecutionSnapshot,
  kind: K,
): Extract<FinishObligation, { kind: K }> {
  const found = itemsOf(snapshot).filter(
    (item): item is Extract<FinishObligation, { kind: K }> => item.kind === kind,
  )
  assert.equal(found.length, 1, `the list should carry one ${kind} item`)
  const [item] = found
  if (item === undefined) throw new Error('unreachable')
  return item
}

/** The passage ids of a legacy plan, in order; null for a not-started entry without a passage. */
function plannedPassages(plan: readonly LegacyF2Entry[]): readonly (string | null)[] {
  return plan.map(entry => (entry.kind === 'recorded' ? entry.passage.id : entry.passage))
}

/** The saved Tool intent `name`, its key and the reference the invoke of that intent returned. */
async function savedToolIntent<P>(opened: AgentJournalCoreOpened<P>, name: string) {
  const pending = toolIntent(opened, name)
  const effect = commitAt(opened, await load(opened), `effect-${name}`, opened.authority, {
    effects: [{ action: pending.action, pending, authority: opened.authority }],
  })
  await ok(opened.journal.commit(effect), 'the effect intent')
  const key: ToolIntentKey = {
    intent: effect.operation,
    action: pending.action,
    position: pending.position,
  }
  const reference = identity(
    encodeToolInvocationRef({
      tenant: opened.access.tenant,
      call: identity(decodeToolCallId(`core-call-${name}`), 'call'),
      admission: identity(decodeToolOperationId(`core-admission-${name}`), 'admission'),
    }),
    'reference',
  )
  return { pending, key, reference }
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
        // The plan lists the before-terminal declarations the fixture's checkpoint carries: none
        // here, so a Journal that cannot see declarations answers the same (gap 2 of rulings-S3A).
        assert.deepEqual(
          plannedPassages(route.plan),
          f1.checkpoint.passages
            .filter(passage => passage.position === 'before_terminal')
            .map(passage => passage.id),
        )
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
        const unknown = await refused(
          journal.prepareFinish({ ...prepare, candidate: operation('never') }),
          'invalid',
          'a candidate the Journal does not hold',
        )
        assert.equal(fieldOf(unknown), 'candidate')
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
        const forged = await refused(
          journal.tryFinish(
            finishInput(opened, unissued, 'forged', undefined, {
              ...intentOf(unissued),
              obligations: evidence('obligations/forged'),
            }),
          ),
          'invalid',
          'a forged list',
        )
        assert.equal(fieldOf(forged), 'intent.obligations')
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
        // Taking the inputs leaves settling; a new F1 at the new watermark fixes the next candidate.
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1-again')), 'F1 again')
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
      name: 'a pending write of another operation is an unknown operation item of the list; tryFinish is unavailable, not blocked, keeps the question and does not end',
      run: async () => {
        const opened = await fixture.open('unknown-operation')
        if (opened.faultNext === undefined) {
          await uncoveredCase('', 'faultNext control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
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
        const issued = await load(opened)
        const item = itemOf(issued, 'operation')
        assert.equal(item.operation, operation('held'))
        assert.equal(item.resolution, 'unknown')
        assert.equal(item.result, null)
        assert.equal(item.disposition.kind, 'unknown')
        await refused(
          journal.tryFinish(finishInput(opened, issued, 'end')),
          'unavailable',
          'tryFinish while a write of the execution is undecided',
        )
        assert.deepEqual(await load(opened), issued, 'unavailable wrote nothing')
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
        const issued = await load(opened)
        // A call whose result is recorded is settled; the custody is the result item's (SPEC
        // "终结责任清单" call and result rows).
        assert.ok(
          itemsOf(issued).some(
            item => item.kind === 'call' && item.pending.consumption === produced.consumption,
          ),
          'the list carries the call of the result',
        )
        for (const item of itemsOf(issued)) {
          if (item.kind === 'call' && item.pending.consumption === produced.consumption)
            assert.equal(item.disposition.kind, 'settled', 'the call of the result is settled')
        }
        const resultItem = itemsOf(issued).find(
          item =>
            item.kind === 'result' && item.responsibility.consumption === produced.consumption,
        )
        assert.ok(resultItem !== undefined, 'the list carries the result')
        assert.equal(resultItem.disposition.kind, 'pending')
        const custody = await ok(journal.tryFinish(finishInput(opened, issued, 'end-2')), 'end')
        assert.deepEqual(blockedOf(custody), { kind: 'blocked', reason: 'custody' })
        assert.deepEqual(
          custody.kind === 'blocked' ? custody.source : null,
          resultItem.source,
          'the blocked source is the source of the item',
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
        const forged = await refused(
          journal.commitSettlement({
            ...request,
            expected: effective.revision,
            authorization: { ...request.authorization, source: evidence('forged-control') },
          }),
          'invalid',
          'a source that does not match the saved control',
        )
        assert.equal(fieldOf(forged), 'authorization.source')
        await refused(journal.commitSettlement(request), 'changed', 'a stale expected')
        // An installation that is not the current one is not applicable any more (SPEC
        // "commitSettlement 的变体" step 4): changed, not invalid.
        await refused(
          journal.commitSettlement({
            ...request,
            expected: effective.revision,
            installation: evidence('installation/other'),
          }),
          'changed',
          'an installation that is not the current one',
        )
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
        assert.deepEqual(result.route.origin, {
          kind: 'native',
          operation: establishing.operation,
        })
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
        // The current candidate is cancelled: another operation cannot establish over it, the
        // predecessor it names is wrong (SPEC "commitSettlement 的变体", establish-cancellation).
        const over = await refused(
          journal.commitSettlement({
            ...establishing,
            operation: operation('establish-over-cancelled'),
            expected: after.revision,
            predecessor: establishing.operation,
          }),
          'invalid',
          'establish-cancellation over a cancelled candidate',
        )
        assert.equal(fieldOf(over), 'predecessor')
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
        const otherRoute = await refused(
          journal.commitSettlement({ ...judging, route: evidence('route/other') }),
          'invalid',
          'a route the Journal does not hold',
        )
        assert.equal(fieldOf(otherRoute), 'route')
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(judging)),
          [1, 0],
          'judge',
        )
        await refused(
          journal.commitSettlement({ ...judging, expected: unjudged.revision }),
          'conflict',
          'the same judge operation with another expected',
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
      name: 'judge-cancellation: a result without custody is a blocked judgment and tryFinish is blocked with custody pointing at the item; once the custody holds, the premise of that judgment is gone and tryFinish is changed; a new judgment supersedes the first and the end follows; a revocation left unresolved after an allowed judgment makes tryFinish changed again',
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
        assert.deepEqual(blockedOf(blocked), { kind: 'blocked', reason: 'custody' })
        // On the cancellation route the source of the block is the judgment record; the source
        // of the responsibility is reachable through the CancellationBlock of that record.
        assert.deepEqual(
          blocked.kind === 'blocked' ? blocked.source : null,
          first.judgment.evidence,
          'the blocked source is the judgment record',
        )
        await ok(record('result-custody', produced.transfer), 'the custody')
        // The custody changed the disposition the judgment read (SPEC "取消路线上的 tryFinish"):
        // the list is still usable, the judgment is not.
        const moved = await load(opened)
        assert.deepEqual(intentOf(moved).obligations, intentOf(issued).obligations)
        const premiseGone = await ok(
          journal.tryFinish(
            finishInput(opened, moved, 'end-premise-gone', cancelAuthorization(moved, control)),
          ),
          'tryFinish after the premise of the judgment changed',
        )
        assert.equal(premiseGone.kind, 'changed')
        const second = await judge(opened, control, 'judge-2')
        assert.equal(second.judgment.decision.kind, 'allowed')
        assert.equal(second.judgment.supersedes, first.judgment.operation)
        const after = await load(opened)
        assert.equal(after.settlement.currentJudgment, second.judgment.operation)
        assert.equal(after.settlement.judgments.length, 2)
        // A revocation left unresolved after the allowed judgment is a new pending the judgment
        // did not read: changed, not ended.
        await ok(
          journal.recordControl(
            stage(opened, 'revoked-unresolved', control, 'qualification-revoked', 'unresolved'),
          ),
          'an unresolved revocation',
        )
        // The control event extended the output interval: the list is issued again, so the
        // changed below comes from the judgment whose criteria no longer hold, not from the list.
        const revokedAt = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(
              opened,
              revokedAt,
              'prepare-revoked',
              cancelAuthorization(revokedAt, control),
            ),
          ),
          'prepareFinish after the revocation',
        )
        const revoked = await load(opened)
        const newPending = await ok(
          journal.tryFinish(
            finishInput(opened, revoked, 'end-new-pending', cancelAuthorization(revoked, control)),
          ),
          'tryFinish after a new pending',
        )
        assert.equal(newPending.kind, 'changed')
        assert.notEqual((await load(opened)).state.kind, 'ended')
      },
    },
    {
      name: 'judge-cancellation: an operation whose write is still pending is an unknown judgment that names it; tryFinish is then unavailable, keeps the question and does not end',
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
        if (judged.judgment.decision.kind !== 'unknown') return
        assert.equal(judged.judgment.decision.questions[0].key, operation('held'))
        assert.equal(judged.judgment.decision.questions[0].reason, 'original-operation-unknown')
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
        assert.deepEqual(await load(opened), issued, 'unavailable wrote nothing')
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
        await refused(
          journal.commitSettlement(
            settlement<P, 'migrate-cancellation'>(opened, 'migrate', {
              kind: 'migrate-cancellation',
              authorization: cancelAuthorization(snapshot, control),
              expected: snapshot.revision,
              candidate: operation('candidate'),
              originalRoute: evidence('route'),
              installation: missing,
              priorExcluded: null,
            }),
          ),
          'unavailable',
          'migrate-cancellation without an installation',
        )
        assert.deepEqual(await load(opened), snapshot, 'nothing was written')
      },
    },
    {
      name: 'migrate-cancellation: a legacy cancelled candidate on an author route migrates with one new revision: the record under this operation, the route switched to a cancellation route of migration origin, the proof cleared; the retry recognizes, other input under the same operation conflicts; a second migration under another operation is changed; establish-cancellation on it is invalid at predecessor; the judgment on the migrated route then ends the legacy candidate',
      run: async () => {
        const opened = await fixture.open('migrate-cancellation')
        if (!(await requireInstallation(opened))) return
        if (opened.seedLegacyCandidate === undefined) {
          await uncoveredCase('', 'seedLegacyCandidate control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        const legacy = await opened.seedLegacyCandidate('legacy')
        const before = await load(opened)
        assert.equal(before.settlement.candidate?.candidate, legacy.candidate)
        assert.equal(before.settlement.candidate?.conclusion.kind, 'cancelled')
        const authorRoute = before.settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        if (authorRoute.kind !== 'author') return
        assert.ok(authorRoute.beforeTerminal !== null, 'the legacy proof is set')
        const over = await refused(
          journal.commitSettlement(
            settlement<P, 'establish-cancellation'>(opened, 'establish-legacy', {
              kind: 'establish-cancellation',
              authorization: cancelAuthorization(before, control),
              expected: before.revision,
              installation: installationOf(opened).record,
              predecessor: legacy.candidate,
            }),
          ),
          'invalid',
          'establish-cancellation on a cancelled candidate with an author route',
        )
        assert.equal(fieldOf(over), 'predecessor')
        const migrating = settlement<P, 'migrate-cancellation'>(opened, 'migrate', {
          kind: 'migrate-cancellation',
          authorization: cancelAuthorization(before, control),
          expected: before.revision,
          candidate: legacy.candidate,
          originalRoute: authorRoute.record,
          installation: installationOf(opened).record,
          priorExcluded: null,
        })
        assert.deepEqual(
          await advances(opened, () => journal.commitSettlement(migrating)),
          [1, 0],
          'migrate',
        )
        await refused(
          journal.commitSettlement({
            ...migrating,
            priorExcluded: {
              operation: operation('excluded-earlier'),
              request: evidence('request/excluded-earlier'),
              exclusion: evidence('exclusion/excluded-earlier'),
              chain: [],
            },
          }),
          'conflict',
          'the same migrate operation with another input',
        )
        const result = await ok(journal.commitSettlement(migrating), 'the migration')
        assert.equal(result.kind, 'migrate-cancellation')
        if (result.kind !== 'migrate-cancellation') return
        const migration = result.migration
        assert.equal(migration.operation, migrating.operation)
        assert.equal(migration.candidate, legacy.candidate)
        assert.equal(migration.control, control)
        assert.deepEqual(migration.from.route, authorRoute)
        assert.deepEqual(migration.from.beforeTerminal, authorRoute.beforeTerminal)
        assert.deepEqual(migration.progress, [])
        assert.deepEqual(migration.to.installation, installationOf(opened).record)
        assert.equal(migration.priorExcluded, null)
        assert.deepEqual(migration.supersession.from, authorRoute.record)
        assert.deepEqual(migration.supersession.to, result.route.record)
        assert.equal(migration.supersession.candidate, null)
        assert.deepEqual(result.route.origin, {
          kind: 'migration',
          operation: migrating.operation,
        })
        assert.equal(result.route.candidate, legacy.candidate)
        const after = await load(opened)
        assert.deepEqual(after.settlement.route, result.route)
        assert.deepEqual(after.settlement.migrations, [migration])
        assert.equal(after.settlement.candidate?.candidate, legacy.candidate, 'the candidate stays')
        assert.equal(intentOf(after).candidate, legacy.candidate)
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
        // The migrated route is judged, listed and ended as it is: no establish after a migration.
        const receipt = await endCancelled(opened, control, 'end-migrated', { establish: false })
        assert.equal(receipt.execution, opened.execution)
        const ended = await load(opened)
        assert.equal(ended.state.kind, 'ended')
        assert.equal(ended.settlement.candidate?.candidate, legacy.candidate)
        assert.equal(ended.finishObligations?.candidate, legacy.candidate)
        assert.equal(ended.settlement.route?.record.record, result.route.record.record)
        const judgment = ended.settlement.judgments.find(
          item => item.operation === ended.settlement.currentJudgment,
        )
        assert.ok(judgment !== undefined, 'the current judgment is saved')
        assert.deepEqual(
          judgment.route,
          result.route.record,
          'the judgment is of the migrated route',
        )
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
        const complete = await refused(
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
        assert.equal(fieldOf(complete), 'candidate')
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
        // The target is checked before the source: a passage the Journal does not hold is invalid
        // even when the source is unreadable.
        const missing = await refused(
          journal.commitSettlement({
            ...recording,
            passage: identity(decodePassageId('core-never'), 'never'),
            source: evidence('nowhere'),
          }),
          'invalid',
          'a passage the Journal does not hold',
        )
        assert.equal(fieldOf(missing), 'passage')
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
        await endCancelled(opened, control, 'end', { establish: false })
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
        const ended = await load(opened)
        assert.equal(ended.settlement.legacyReturns.length, 2)
        // The original recording is recognized after ended, with nothing new written.
        assert.deepEqual(
          await ok(journal.commitSettlement(recording), 'the retry after ended'),
          result,
        )
        assert.deepEqual(await load(opened), ended, 'the retry wrote nothing')
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
        const unknownIntent = await refused(
          journal.commitSettlement({
            ...recording,
            intent: { ...key, intent: operation('never') },
            source: evidence('nowhere'),
          }),
          'invalid',
          'an intent key the Journal does not hold, checked before the source',
        )
        assert.equal(fieldOf(unknownIntent), 'intent')
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
        assert.equal(result.association.obligation.disposition.kind, 'held')
        assert.deepEqual(result.association.obligation.interruptions, [])
        const after = await load(opened)
        assert.deepEqual(after.settlement.toolAssociations, [result.association])
        // An accepted return is known: a source that gives another call or admission for the same
        // intent conflicts and the association stays (SPEC "commitSettlement 的变体" table).
        const otherReference = identity(
          encodeToolInvocationRef({
            tenant: opened.access.tenant,
            call: identity(decodeToolCallId('core-call-other'), 'call'),
            admission: identity(decodeToolOperationId('core-admission-other'), 'admission'),
          }),
          'reference',
        )
        const contradicting = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: {
            kind: 'accepted',
            reference: otherReference,
            receipt: evidence('tool-receipt-other'),
          },
          received: evidence('received/call-other'),
          custody: evidence('custody/call-other'),
        })
        await refused(
          journal.commitSettlement({
            ...recording,
            operation: operation('associate-other'),
            source: contradicting,
          }),
          'conflict',
          'a source that gives another call for the known reference',
        )
        assert.deepEqual(await load(opened), after, 'the conflict wrote nothing')
        // The recording is recognized after ended, with nothing new written.
        await endCancelled(opened, control, 'end', { establish: false })
        const ended = await load(opened)
        assert.deepEqual(
          await ok(journal.commitSettlement(recording), 'the retry after ended'),
          result,
        )
        assert.deepEqual(await load(opened), ended, 'the retry wrote nothing')
      },
    },
    {
      name: 'record-tool-association: a commit-unknown return keeps the call obligation unknown, so the judgment is unknown and the cancel tryFinish is unavailable; a call with neither a result, an association nor a final failure is unknown too and an ordinary tryFinish is unavailable',
      run: async () => {
        const opened = await fixture.open('tool-association-unknown')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const pending = toolIntent(opened, 'call-u')
        const snapshot = await load(opened)
        const effect = commitAt(opened, snapshot, 'effect', opened.authority, {
          effects: [{ action: pending.action, pending, authority: opened.authority }],
        })
        await ok(journal.commit(effect), 'the effect intent')
        // Before any association: the ordinary end cannot tell whether the invoke was admitted.
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-ordinary')),
          'prepareFinish',
        )
        const ordinary = await load(opened)
        const unknownCall = itemOf(ordinary, 'call')
        assert.equal(unknownCall.disposition.kind, 'unknown')
        assert.equal(unknownCall.intent, effect.operation)
        await refused(
          journal.tryFinish(finishInput(opened, ordinary, 'end-ordinary')),
          'unavailable',
          'an ordinary tryFinish with an unknown call',
        )
        assert.deepEqual(await load(opened), ordinary, 'unavailable wrote nothing')
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
            call: identity(decodeToolCallId('core-call-u'), 'call'),
            admission: identity(decodeToolOperationId('core-admission-u'), 'admission'),
          }),
          'reference',
        )
        const source = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'commit-unknown', reference },
          received: evidence('received/call-u'),
          custody: evidence('custody/call-u'),
        })
        const result = await ok(
          journal.commitSettlement(
            settlement<P, 'record-tool-association'>(opened, 'associate-unknown', {
              kind: 'record-tool-association',
              intent: key,
              request: pending.fixed,
              source,
              priorExcluded: null,
            }),
          ),
          'the association of a commit-unknown return',
        )
        assert.equal(result.kind, 'record-tool-association')
        if (result.kind !== 'record-tool-association') return
        assert.deepEqual(result.association.association, { kind: 'commit-unknown', reference })
        assert.equal(result.association.obligation.disposition.kind, 'unknown')
        const judged = await judge(opened, control)
        assert.equal(judged.judgment.decision.kind, 'unknown')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        assert.equal(itemOf(issued, 'call').disposition.kind, 'unknown')
        await refused(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'unavailable',
          'the cancel tryFinish while the admission is undecided',
        )
        assert.deepEqual(await load(opened), issued, 'unavailable wrote nothing')
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
          result: {
            kind: 'known',
            present: evidence(`present/${round.round}`),
            lookups: [lookup],
            invalidate: { operation: operation('invalidate'), reason: evidence('reason/stale') },
          },
        })
        const recording = settlement<P, 'record-card-reconciliation'>(opened, 'reconcile-card', {
          kind: 'record-card-reconciliation',
          passage: passage.id,
          round: round.round,
          candidate: f1.operation,
          route: authorRoute.record,
          original: source,
        })
        const missing = await refused(
          journal.commitSettlement({
            ...recording,
            round: identity(decodeCardRoundId('core-never'), 'never'),
            original: evidence('nowhere'),
          }),
          'invalid',
          'a round the Journal does not hold, checked before the source',
        )
        assert.equal(fieldOf(missing), 'round')
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
        assert.deepEqual(result.reconciliation.obligation.invalidate, {
          operation: operation('invalidate'),
          reason: evidence('reason/stale'),
        })
        assert.equal(result.reconciliation.obligation.disposition.kind, 'held')
        const after = await load(opened)
        assert.deepEqual(after.settlement.cardReconciliations, [result.reconciliation])
        // The recording is recognized after ended, with nothing new written.
        await endCancelled(opened, control, 'end', { establish: false })
        const ended = await load(opened)
        assert.deepEqual(
          await ok(journal.commitSettlement(recording), 'the retry after ended'),
          result,
        )
        assert.deepEqual(await load(opened), ended, 'the retry wrote nothing')
      },
    },
    {
      name: 'record-card-reconciliation: a result the card owner could not determine is merged as an unknown card-round obligation, the judgment is unknown and the cancel tryFinish is unavailable',
      run: async () => {
        const opened = await fixture.open('card-reconciliation-unknown')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const asking = beforeTerminalPassage('asker-u', {
          kind: 'requested',
          mode: { kind: 'fresh' },
        })
        const round = presentedRound(asking, 'round-u')
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
        const source = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: passage.id,
          round: round.round,
          result: { kind: 'unknown', reason: 'source-unavailable' },
        })
        const result = await ok(
          journal.commitSettlement(
            settlement<P, 'record-card-reconciliation'>(opened, 'reconcile-card-unknown', {
              kind: 'record-card-reconciliation',
              passage: passage.id,
              round: round.round,
              candidate: f1.operation,
              route: authorRoute.record,
              original: source,
            }),
          ),
          'the reconciliation of an unknown result',
        )
        assert.equal(result.kind, 'record-card-reconciliation')
        if (result.kind !== 'record-card-reconciliation') return
        assert.equal(result.reconciliation.obligation.disposition.kind, 'unknown')
        assert.equal(result.reconciliation.obligation.invalidate, null)
        const judged = await judge(opened, control)
        assert.equal(judged.judgment.decision.kind, 'unknown')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        await refused(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'unavailable',
          'the cancel tryFinish while the card result is unknown',
        )
        assert.deepEqual(await load(opened), issued, 'unavailable wrote nothing')
      },
    },
    {
      name: 'blocked order with a pending H: a prepared H no Ja published is a pending handoff item of a complete candidate and blocks with operations, after inputs and controls and before passages; the blocked source is the source of the item; the end follows once the Ja published it',
      run: async () => {
        const opened = await fixture.open('blocked-handoff')
        const { journal } = opened
        const request = pendingHandoff(opened, await load(opened), 'h1')
        await ok(journal.commit(prepareCommit(opened, await load(opened), 'p1', request)), 'P')
        await ok(
          journal.submit(newSubmit(opened, 'submit-8', await opened.acceptInput('8'))),
          'an input no batch took',
        )
        const suspend = {
          ...cancelControl(opened, 'suspend'),
          command: { kind: 'suspend' as const, reason: evidence('reason/suspend') },
        }
        await ok(journal.control(suspend), 'a suspend control')
        await ok(
          journal.recordControl(
            stage(
              opened,
              'suspend-unresolved',
              suspend.operation,
              'intent-established',
              'unresolved',
            ),
          ),
          'the unresolved intent',
        )
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-1')),
          'prepare',
        )
        const inputs = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-1')),
          'end',
        )
        assert.deepEqual(blockedOf(inputs), { kind: 'blocked', reason: 'inputs' })
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1-again')), 'F1 again')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-2')),
          'prepare',
        )
        const controls = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-2')),
          'end',
        )
        assert.deepEqual(blockedOf(controls), { kind: 'blocked', reason: 'controls' })
        await ok(
          journal.recordControl(
            stage(opened, 'suspend-reached', suspend.operation, 'intent-established', 'reached'),
          ),
          'the intent resolved',
        )
        // The control event extended the output interval: the list is stale and issued again.
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-2b')),
          'prepare',
        )
        const resolvedIntent = await load(opened)
        const handoffItem = itemOf(resolvedIntent, 'handoff')
        assert.deepEqual(handoffItem.handoff, request.reference)
        assert.equal(handoffItem.disposition.kind, 'pending')
        assert.equal(
          handoffItem.disposition.kind === 'pending' ? handoffItem.disposition.reason : '',
          'handoff-history',
        )
        const operations = await ok(
          journal.tryFinish(finishInput(opened, resolvedIntent, 'end-3')),
          'end',
        )
        assert.deepEqual(blockedOf(operations), { kind: 'blocked', reason: 'operations' })
        assert.deepEqual(
          operations.kind === 'blocked' ? operations.source : null,
          handoffItem.source,
          'the blocked source is the source of the item',
        )
        assert.notEqual((await load(opened)).state.kind, 'ended')
        // The Ja publishes the H and leaves settling; the next candidate ends once F2 holds.
        await ok(
          journal.commit(resolveCommit(opened, await load(opened), 'ja1', prepared(request))),
          'Ja',
        )
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1-final')), 'F1 final')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-3')),
          'prepare',
        )
        const passages = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-4')),
          'end',
        )
        assert.deepEqual(blockedOf(passages), { kind: 'blocked', reason: 'passages' })
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare-4')),
          'prepare',
        )
        const finished = await ok(
          journal.tryFinish(finishInput(opened, await load(opened), 'end-5')),
          'end',
        )
        assert.equal(finished.kind, 'ended')
      },
    },
    {
      name: 'under an effective cancel a commit that carries a complete or failed candidate is changed, before and after the cancelled candidate is established, and writes nothing',
      run: async () => {
        const opened = await fixture.open('commit-under-cancel')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        const before = await load(opened)
        await refused(
          journal.commit(f1Commit(opened, before, 'f1-complete')),
          'changed',
          'a complete F1 under an effective cancel',
        )
        await refused(
          journal.commit(
            f1Commit(
              opened,
              before,
              'f1-failed',
              opened.authority,
              candidateContent(before, 'f1-failed', failedContent('f1-failed')),
            ),
          ),
          'changed',
          'a failed F1 under an effective cancel',
        )
        assert.deepEqual(await load(opened), before, 'the refusals wrote nothing')
        await establish(opened, control)
        const established = await load(opened)
        await refused(
          journal.commit(f1Commit(opened, established, 'f1-after-establish')),
          'changed',
          'a complete F1 over the cancelled candidate',
        )
        assert.deepEqual(await load(opened), established, 'the refusal wrote nothing')
      },
    },
    {
      name: 'after ended the candidate, migration and judgment variants return terminal and write nothing, also for a candidate or route the Journal does not hold',
      run: async () => {
        const opened = await fixture.open('settlement-after-ended')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        await endCancelled(opened, control)
        const ended = await load(opened)
        const authorization = cancelAuthorization(ended, control)
        await refused(
          journal.commitSettlement(
            settlement<P, 'establish-cancellation'>(opened, 'establish-after-end', {
              kind: 'establish-cancellation',
              authorization,
              expected: ended.revision,
              installation: installationOf(opened).record,
              predecessor: candidateOf(ended),
            }),
          ),
          'terminal',
          'establish-cancellation after ended',
        )
        await refused(
          journal.commitSettlement(
            settlement<P, 'migrate-cancellation'>(opened, 'migrate-after-end', {
              kind: 'migrate-cancellation',
              authorization,
              expected: ended.revision,
              candidate: operation('never'),
              originalRoute: evidence('route/never'),
              installation: installationOf(opened).record,
              priorExcluded: null,
            }),
          ),
          'terminal',
          'migrate-cancellation after ended',
        )
        await refused(
          journal.commitSettlement(
            settlement<P, 'judge-cancellation'>(opened, 'judge-after-end', {
              kind: 'judge-cancellation',
              authorization,
              expected: ended.revision,
              candidate: operation('never'),
              route: evidence('route/never'),
              installation: installationOf(opened).record,
            }),
          ),
          'terminal',
          'judge-cancellation after ended',
        )
        assert.deepEqual(await load(opened), ended, 'the refusals wrote nothing')
      },
    },
    {
      name: 'a candidate that changed under the request: establish-cancellation whose predecessor is not the current candidate, and judge-cancellation of a candidate that is no longer current, are changed and write nothing',
      run: async () => {
        const opened = await fixture.open('settlement-candidate-changed')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(journal.commit(f1), 'F1')
        const control = await effectiveCancel(opened)
        const complete = await load(opened)
        await refused(
          journal.commitSettlement(
            settlement<P, 'establish-cancellation'>(opened, 'establish-no-predecessor', {
              kind: 'establish-cancellation',
              authorization: cancelAuthorization(complete, control),
              expected: complete.revision,
              installation: installationOf(opened).record,
              predecessor: null,
            }),
          ),
          'changed',
          'an establish that names no predecessor while a candidate is current',
        )
        assert.deepEqual(await load(opened), complete, 'the refusal wrote nothing')
        const established = await establish(opened, control)
        const after = await load(opened)
        await refused(
          journal.commitSettlement(
            settlement<P, 'judge-cancellation'>(opened, 'judge-old', {
              kind: 'judge-cancellation',
              authorization: cancelAuthorization(after, control),
              expected: after.revision,
              candidate: f1.operation,
              route: established.route.record,
              installation: installationOf(opened).record,
            }),
          ),
          'changed',
          'a judgment of the superseded candidate',
        )
        assert.deepEqual(await load(opened), after, 'the refusal wrote nothing')
      },
    },
    {
      name: 'an execution that left settling: prepareFinish and tryFinish of the old candidate are changed, and a cancel authorization on the complete candidate is denied before that',
      run: async () => {
        const opened = await fixture.open('not-settling')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const ready = await prepareOrdinaryEnd(opened, 'end')
        const intent = intentOf(ready)
        await ok(
          journal.commit(
            commitAt(opened, ready, 'leave-settling', opened.authority, {
              checkpoint: { ...ready.checkpoint, position: 'I8' },
              state: { kind: 'advancing' },
            }),
          ),
          'a commit that leaves settling',
        )
        const left = await load(opened)
        assert.equal(left.state.kind, 'advancing')
        await refused(
          journal.prepareFinish(
            prepareInput(opened, left, 'prepare-left', undefined, intent.candidate),
          ),
          'changed',
          'prepareFinish while the execution is not settling',
        )
        const finished = await ok(
          journal.tryFinish(finishInput(opened, left, 'end-left', undefined, intent)),
          'tryFinish while the execution is not settling',
        )
        assert.equal(finished.kind, 'changed')
        const control = await effectiveCancel(opened)
        const cancelled = await load(opened)
        await refused(
          journal.prepareFinish(
            prepareInput(
              opened,
              cancelled,
              'prepare-cancel-complete',
              cancelAuthorization(cancelled, control),
              intent.candidate,
            ),
          ),
          'denied',
          'a cancel authorization on a complete candidate',
        )
        await refused(
          journal.tryFinish(
            finishInput(
              opened,
              cancelled,
              'end-cancel-complete',
              cancelAuthorization(cancelled, control),
              intent,
            ),
          ),
          'denied',
          'a cancel tryFinish on a complete candidate',
        )
        assert.deepEqual(await load(opened), cancelled, 'the refusals wrote nothing')
      },
    },
    {
      name: 'the control of the route must be the control of the authorization: judge-cancellation and tryFinish under another effective cancel are invalid at authorization.control and write nothing',
      run: async () => {
        const opened = await fixture.open('route-control')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const first = await effectiveCancel(opened, 'cancel-1')
        const second = await effectiveCancel(opened, 'cancel-2')
        await establish(opened, first)
        const established = await load(opened)
        const route = established.settlement.route
        assert.ok(route !== null && route.kind === 'cancellation')
        const otherJudge = await refused(
          journal.commitSettlement(
            settlement<P, 'judge-cancellation'>(opened, 'judge-other', {
              kind: 'judge-cancellation',
              authorization: cancelAuthorization(established, second),
              expected: established.revision,
              candidate: candidateOf(established),
              route: route.record,
              installation: installationOf(opened).record,
            }),
          ),
          'invalid',
          'a judgment authorized by another control than the route',
        )
        assert.equal(fieldOf(otherJudge), 'authorization.control')
        assert.deepEqual(await load(opened), established, 'the refusal wrote nothing')
        await judge(opened, first)
        const judged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, judged, 'prepare', cancelAuthorization(judged, first)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        const otherEnd = await refused(
          journal.tryFinish(
            finishInput(opened, issued, 'end-other', cancelAuthorization(issued, second)),
          ),
          'invalid',
          'a tryFinish authorized by another control than the route',
        )
        assert.equal(fieldOf(otherEnd), 'authorization.control')
        assert.deepEqual(await load(opened), issued, 'the refusal wrote nothing')
        const finished = await ok(
          journal.tryFinish(finishInput(opened, issued, 'end', cancelAuthorization(issued, first))),
          'the end under the control of the route',
        )
        assert.equal(finished.kind, 'ended')
      },
    },
    {
      name: 'the settlement qualifications: without settle the candidate variants and the cancel prepareFinish and tryFinish are denied; with settle but without migrate-cancellation the migration is denied; without reconcile the custody variants are denied; nothing is written',
      run: async () => {
        const opened = await fixture.open('qualifications')
        if (!(await requireInstallation(opened))) return
        if (opened.qualify === undefined) {
          await uncoveredCase('', 'qualify control').run()
          return
        }
        if (opened.seedLegacyCandidate === undefined || opened.hostRecord === undefined) {
          await uncoveredCase('', 'seedLegacyCandidate and hostRecord controls').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        const legacy = await opened.seedLegacyCandidate('legacy')
        const before = await load(opened)
        const authorRoute = before.settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        if (authorRoute.kind !== 'author') return
        const migrating = settlement<P, 'migrate-cancellation'>(opened, 'migrate', {
          kind: 'migrate-cancellation',
          authorization: cancelAuthorization(before, control),
          expected: before.revision,
          candidate: legacy.candidate,
          originalRoute: authorRoute.record,
          installation: installationOf(opened).record,
          priorExcluded: null,
        })
        opened.qualify(['settle', 'reconcile'])
        await refused(
          journal.commitSettlement(migrating),
          'denied',
          'a migration without the migrate-cancellation qualification',
        )
        opened.qualify(['migrate-cancellation', 'reconcile'])
        await refused(
          journal.commitSettlement(migrating),
          'denied',
          'a migration without the settle qualification',
        )
        await refused(
          journal.prepareFinish(
            prepareInput(opened, before, 'prepare-no-settle', cancelAuthorization(before, control)),
          ),
          'denied',
          'a cancel prepareFinish without settle',
        )
        assert.deepEqual(await load(opened), before, 'the refusals wrote nothing')
        opened.qualify(['settle', 'migrate-cancellation', 'reconcile'])
        await ok(journal.commitSettlement(migrating), 'the migration with both qualifications')
        await judge(opened, control)
        const judged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, judged, 'prepare', cancelAuthorization(judged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        opened.qualify(['migrate-cancellation', 'reconcile'])
        await refused(
          journal.tryFinish(
            finishInput(opened, issued, 'end-no-settle', cancelAuthorization(issued, control)),
          ),
          'denied',
          'a cancel tryFinish without settle',
        )
        await refused(
          journal.commitSettlement(
            settlement<P, 'judge-cancellation'>(opened, 'judge-no-settle', {
              kind: 'judge-cancellation',
              authorization: cancelAuthorization(issued, control),
              expected: issued.revision,
              candidate: legacy.candidate,
              route: issued.settlement.route?.record ?? evidence('none'),
              installation: installationOf(opened).record,
            }),
          ),
          'denied',
          'a judgment without settle',
        )
        const source = await opened.hostRecord({
          kind: 'legacy-return',
          passage: identity(decodePassageId('core-never'), 'never'),
          input: evidence('invoke/never'),
          mode: { kind: 'fresh' },
          implementation: PROVIDER,
          started: evidence('started/never'),
          result: { kind: 'output', value: { kind: 'observed' } },
          received: evidence('received/never'),
          custody: evidence('custody/never'),
        })
        opened.qualify(['settle', 'migrate-cancellation'])
        await refused(
          journal.commitSettlement(
            settlement<P, 'record-legacy-return'>(opened, 'legacy-no-reconcile', {
              kind: 'record-legacy-return',
              passage: identity(decodePassageId('core-never'), 'never'),
              candidate: legacy.candidate,
              route: authorRoute.record,
              request: evidence('invoke/never'),
              source,
            }),
          ),
          'denied',
          'a custody variant without reconcile',
        )
        assert.deepEqual(await load(opened), issued, 'the refusals wrote nothing')
        opened.qualify(['settle', 'migrate-cancellation', 'reconcile'])
        const finished = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'the end with settle',
        )
        assert.equal(finished.kind, 'ended')
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
    {
      name: 'F1 again with the same five fields and another checkpoint establishes a new candidate: the checkpoint is part of the content, so the first candidate is not recognized',
      run: async () => {
        const opened = await fixture.open('f1-checkpoint')
        const { journal } = opened
        await takeInputs(opened)
        const first = f1Commit(opened, await load(opened), 'f1-a')
        await ok(journal.commit(first), 'the first F1')
        const at = await load(opened)
        const same = f1Commit(opened, at, 'f1-b', opened.authority, first.finish ?? undefined)
        const moved = { ...same, checkpoint: { ...same.checkpoint, position: 'F1b' } }
        await ok(journal.commit(moved), 'the same five fields at another checkpoint')
        const after = await load(opened)
        assert.equal(after.settlement.candidate?.candidate, moved.operation, 'a new candidate')
        assert.deepEqual(after.settlement.candidate?.checkpoint, moved.checkpoint)
        assert.deepEqual(
          after.settlement.candidates.map(candidate => candidate.candidate),
          [first.operation, moved.operation],
        )
        assert.deepEqual(
          after.settlement.supersessions.map(link => [link.from, link.to]),
          [[first.operation, moved.operation]],
        )
      },
    },
    {
      name: 'the unknown operation item of a pending write carries the original-operation query of that operation: the execution and the operation as parameters, for query',
      run: async () => {
        const opened = await fixture.open('unknown-operation-continuation')
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
        const item = itemOf(await load(opened), 'operation')
        assert.equal(item.disposition.kind, 'unknown')
        if (item.disposition.kind !== 'unknown') return
        const required = item.disposition.required
        assert.equal(required.kind, 'original-operation-query')
        assert.deepEqual(required.request, {
          kind: 'parameters',
          value: { execution: opened.execution, operation: operation('held') },
        })
        assert.equal(required.purpose, 'query')
      },
    },
    {
      name: 'record-tool-association: a commit-unknown return and then the accepted return of the same reference leave the call held: the undecided record does not take the known one back, the judgment is not unknown and the cancel tryFinish ends',
      run: async () => {
        const opened = await fixture.open('tool-association-known-after-unknown')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const pending = toolIntent(opened, 'call-k')
        const effect = commitAt(opened, await load(opened), 'effect', opened.authority, {
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
            call: identity(decodeToolCallId('core-call-k'), 'call'),
            admission: identity(decodeToolOperationId('core-admission-k'), 'admission'),
          }),
          'reference',
        )
        const record = (name: string, source: DurableEvidence) =>
          journal.commitSettlement(
            settlement<P, 'record-tool-association'>(opened, name, {
              kind: 'record-tool-association',
              intent: key,
              request: pending.fixed,
              source,
              priorExcluded: null,
            }),
          )
        const undecided = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'commit-unknown', reference },
          received: evidence('received/call-k'),
          custody: evidence('custody/call-k'),
        })
        await ok(record('associate-unknown', undecided), 'the commit-unknown return')
        const accepted = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'accepted', reference, receipt: evidence('tool-receipt-k') },
          received: evidence('received/call-k-2'),
          custody: evidence('custody/call-k-2'),
        })
        await ok(
          record('associate-accepted', accepted),
          'the accepted return of the same reference',
        )
        const judged = await judge(opened, control)
        assert.notEqual(judged.judgment.decision.kind, 'unknown', 'the call is not unknown')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        assert.equal(itemOf(issued, 'call').disposition.kind, 'held')
        const finished = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'the cancel tryFinish',
        )
        assert.equal(finished.kind, 'ended')
      },
    },
    {
      name: 'record-card-reconciliation: a result the card owner could not determine and then a known result of the same round leave the card-round obligation known, not unknown',
      run: async () => {
        const opened = await fixture.open('card-reconciliation-known-after-unknown')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const asking = beforeTerminalPassage('asker-k', {
          kind: 'requested',
          mode: { kind: 'fresh' },
        })
        const round = presentedRound(asking, 'round-k')
        const passage: Passage = { ...asking, progress: { kind: 'asked', rounds: [round] } }
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(
          journal.commit({ ...f1, checkpoint: { ...f1.checkpoint, passages: [passage] } }),
          'F1 with the asked passage',
        )
        const authorRoute = (await load(opened)).settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const record = (name: string, original: DurableEvidence) =>
          journal.commitSettlement(
            settlement<P, 'record-card-reconciliation'>(opened, name, {
              kind: 'record-card-reconciliation',
              passage: passage.id,
              round: round.round,
              candidate: f1.operation,
              route: authorRoute.record,
              original,
            }),
          )
        const undetermined = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: passage.id,
          round: round.round,
          result: { kind: 'unknown', reason: 'source-unavailable' },
        })
        await ok(record('reconcile-unknown', undetermined), 'the unknown result')
        const known = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: passage.id,
          round: round.round,
          result: {
            kind: 'known',
            present: evidence(`present/${round.round}`),
            lookups: [operation('lookup-k')],
            invalidate: null,
          },
        })
        await ok(record('reconcile-known', known), 'the known result of the same round')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const item = itemOf(await load(opened), 'card-round')
        assert.equal(item.disposition.kind, 'held', 'the known result holds the round')
      },
    },
    {
      name: 'a call whose producer gave a final failure is settled on that basis: the no-reply failure of the current failed candidate names the call',
      run: async () => {
        const opened = await fixture.open('final-failure-current')
        const { journal } = opened
        await takeInputs(opened)
        const { pending, call } = modelIntent(opened, 'call-f')
        await ok(
          journal.commit(
            commitAt(opened, await load(opened), 'effect', opened.authority, {
              effects: [{ action: pending.action, pending, authority: opened.authority }],
            }),
          ),
          'the effect intent',
        )
        const at = await load(opened)
        await ok(
          journal.commit(
            f1Commit(
              opened,
              at,
              'f1',
              opened.authority,
              candidateContent(at, 'f1', noReplyContent('f1', call)),
            ),
          ),
          'F1 of the no-reply failure',
        )
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare')),
          'prepareFinish',
        )
        assert.equal(itemOf(await load(opened), 'call').disposition.kind, 'settled')
      },
    },
    {
      name: 'the final failure of a superseded candidate still settles its call: after the cancelled candidate replaces the no-reply failure, the call is settled, the judgment is not unknown and the cancel tryFinish ends',
      run: async () => {
        const opened = await fixture.open('final-failure-superseded')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const { pending, call } = modelIntent(opened, 'call-g')
        await ok(
          journal.commit(
            commitAt(opened, await load(opened), 'effect', opened.authority, {
              effects: [{ action: pending.action, pending, authority: opened.authority }],
            }),
          ),
          'the effect intent',
        )
        const at = await load(opened)
        await ok(
          journal.commit(
            f1Commit(
              opened,
              at,
              'f1',
              opened.authority,
              candidateContent(at, 'f1', noReplyContent('f1', call)),
            ),
          ),
          'F1 of the no-reply failure',
        )
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const judged = await judge(opened, control)
        assert.notEqual(judged.judgment.decision.kind, 'unknown', 'the call is not unknown')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        assert.equal(itemOf(issued, 'call').disposition.kind, 'settled')
        const finished = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'the cancel tryFinish',
        )
        assert.equal(finished.kind, 'ended')
      },
    },
    {
      name: 'a legacy cancelled candidate that did not migrate does not end on its author route: the cancel tryFinish is blocked with passages at the route record and does not end; after the migration and the judgment it ends',
      run: async () => {
        const opened = await fixture.open('legacy-unmigrated')
        if (!(await requireInstallation(opened))) return
        if (opened.seedLegacyCandidate === undefined) {
          await uncoveredCase('', 'seedLegacyCandidate control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        const legacy = await opened.seedLegacyCandidate('legacy')
        const before = await load(opened)
        const authorRoute = before.settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        if (authorRoute.kind !== 'author') return
        await ok(
          journal.prepareFinish(
            prepareInput(opened, before, 'prepare-legacy', cancelAuthorization(before, control)),
          ),
          'prepareFinish of the legacy candidate',
        )
        const issued = await load(opened)
        const blocked = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end-legacy', cancelAuthorization(issued, control)),
          ),
          'tryFinish of the legacy candidate on its author route',
        )
        assert.deepEqual(blockedOf(blocked), { kind: 'blocked', reason: 'passages' })
        assert.deepEqual(
          blocked.kind === 'blocked' ? blocked.source : null,
          authorRoute.record,
          'the blocked source is the record of the current route',
        )
        assert.notEqual((await load(opened)).state.kind, 'ended')
        const migrated = await load(opened)
        await ok(
          journal.commitSettlement(
            settlement<P, 'migrate-cancellation'>(opened, 'migrate', {
              kind: 'migrate-cancellation',
              authorization: cancelAuthorization(migrated, control),
              expected: migrated.revision,
              candidate: legacy.candidate,
              originalRoute: authorRoute.record,
              installation: installationOf(opened).record,
              priorExcluded: null,
            }),
          ),
          'the migration',
        )
        await endCancelled(opened, control, 'end-migrated', { establish: false })
        assert.equal((await load(opened)).state.kind, 'ended')
      },
    },
    {
      name: 'establish-cancellation that names a predecessor which was never a candidate of this execution is invalid at predecessor; with a stale expected the same request is changed; nothing is written',
      run: async () => {
        const opened = await fixture.open('establish-forged-predecessor')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        const complete = await load(opened)
        const control = await effectiveCancel(opened)
        const at = await load(opened)
        const forging = settlement<P, 'establish-cancellation'>(opened, 'establish-forged', {
          kind: 'establish-cancellation',
          authorization: cancelAuthorization(at, control),
          expected: at.revision,
          installation: installationOf(opened).record,
          predecessor: operation('forged'),
        })
        const forged = await refused(
          journal.commitSettlement(forging),
          'invalid',
          'a predecessor that was never a candidate',
        )
        assert.equal(fieldOf(forged), 'predecessor')
        await refused(
          journal.commitSettlement({
            ...forging,
            operation: operation('establish-forged-stale'),
            expected: complete.revision,
          }),
          'changed',
          'a forged predecessor with a stale expected',
        )
        assert.deepEqual(await load(opened), at, 'the refusals wrote nothing')
      },
    },
    {
      name: 'under an effective cancel with the cancelled candidate established, prepareFinish and tryFinish under an advancement are denied, not changed, and write nothing',
      run: async () => {
        const opened = await fixture.open('advancement-on-cancelled')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const at = await load(opened)
        const prepared = await refused(
          journal.prepareFinish(prepareInput(opened, at, 'prepare-advance')),
          'denied',
          'prepareFinish of the cancelled candidate under an advancement',
        )
        assert.equal(prepared.kind === 'denied' ? prepared.action : '', 'prepareFinish')
        const finished = await refused(
          journal.tryFinish(finishInput(opened, at, 'end-advance')),
          'denied',
          'tryFinish of the cancelled candidate under an advancement',
        )
        assert.equal(finished.kind === 'denied' ? finished.action : '', 'tryFinish')
        assert.deepEqual(await load(opened), at, 'the refusals wrote nothing')
      },
    },
    {
      name: 'a cancel tryFinish whose authorization source is not the source of the saved control is invalid at authorization.source and writes nothing',
      run: async () => {
        const opened = await fixture.open('try-finish-forged-source')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        await judge(opened, control)
        const judged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, judged, 'prepare', cancelAuthorization(judged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        const forged = await refused(
          journal.tryFinish(
            finishInput(opened, issued, 'end-forged', {
              ...cancelAuthorization(issued, control),
              source: evidence('forged-control'),
            }),
          ),
          'invalid',
          'a cancel tryFinish with a source that does not match the saved control',
        )
        assert.equal(fieldOf(forged), 'authorization.source')
        assert.deepEqual(await load(opened), issued, 'the refusal wrote nothing')
      },
    },
    {
      name: 'migrate-cancellation that names a candidate of this execution which is no longer current is changed and writes nothing',
      run: async () => {
        const opened = await fixture.open('migrate-not-current')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const first = f1Commit(opened, await load(opened), 'f1-a')
        await ok(journal.commit(first), 'the first F1')
        const kept = await load(opened)
        await ok(
          journal.commit(
            f1Commit(
              opened,
              kept,
              'f1-b',
              opened.authority,
              candidateContent(kept, 'f1-b', { conditions: evidence('conditions/changed') }),
            ),
          ),
          'a candidate of other content',
        )
        const control = await effectiveCancel(opened)
        const at = await load(opened)
        await refused(
          journal.commitSettlement(
            settlement<P, 'migrate-cancellation'>(opened, 'migrate-old', {
              kind: 'migrate-cancellation',
              authorization: cancelAuthorization(at, control),
              expected: at.revision,
              candidate: first.operation,
              originalRoute: at.settlement.route?.record ?? evidence('none'),
              installation: installationOf(opened).record,
              priorExcluded: null,
            }),
          ),
          'changed',
          'a migration of a candidate that is no longer current',
        )
        assert.deepEqual(await load(opened), at, 'the refusal wrote nothing')
      },
    },
    {
      name: 'after ended a commit of a wrong shape (a candidate on a commit that is not settling) is invalid, not terminal, and writes nothing',
      run: async () => {
        const opened = await fixture.open('shape-after-ended')
        const { journal } = opened
        await end(opened)
        const after = await load(opened)
        const shape = await refused(
          journal.commit(
            commitAt(opened, after, 'shape-after-end', opened.authority, {
              finish: candidateContent(after, 'shape-after-end'),
            }),
          ),
          'invalid',
          'a non-settling commit with a candidate after ended',
        )
        assert.equal(fieldOf(shape), 'finish')
        assert.deepEqual(await load(opened), after, 'the refusal wrote nothing')
      },
    },
    {
      name: 'prepareFinish under a cancel whose source does not match the saved control is invalid at authorization.source, before the kind of the named complete candidate is checked, and writes nothing',
      run: async () => {
        const opened = await fixture.open('prepare-forged-source')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(journal.commit(f1), 'F1')
        const control = await effectiveCancel(opened)
        const at = await load(opened)
        const forged = await refused(
          journal.prepareFinish(
            prepareInput(
              opened,
              at,
              'prepare-forged',
              { ...cancelAuthorization(at, control), source: evidence('forged-control') },
              f1.operation,
            ),
          ),
          'invalid',
          'a forged source on a complete candidate',
        )
        assert.equal(fieldOf(forged), 'authorization.source')
        assert.deepEqual(await load(opened), at, 'the refusal wrote nothing')
      },
    },
    {
      name: 'prepareFinish under a cancel with the right source that names a candidate the Journal does not hold is invalid at candidate, not denied by the kind of the current candidate, and writes nothing',
      run: async () => {
        const opened = await fixture.open('prepare-unknown-candidate')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        const control = await effectiveCancel(opened)
        const at = await load(opened)
        const unknown = await refused(
          journal.prepareFinish(
            prepareInput(
              opened,
              at,
              'prepare-unknown',
              cancelAuthorization(at, control),
              operation('never'),
            ),
          ),
          'invalid',
          'a named candidate the Journal does not hold',
        )
        assert.equal(fieldOf(unknown), 'candidate')
        assert.deepEqual(await load(opened), at, 'the refusal wrote nothing')
      },
    },
    {
      name: 'without the settle qualification a cancel prepareFinish and a cancel tryFinish are denied with the action settle and write nothing',
      run: async () => {
        const opened = await fixture.open('prepare-no-settle')
        if (!(await requireInstallation(opened))) return
        if (opened.qualify === undefined) {
          await uncoveredCase('', 'qualify control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const at = await load(opened)
        opened.qualify(['migrate-cancellation', 'reconcile'])
        const prepared = await refused(
          journal.prepareFinish(
            prepareInput(opened, at, 'prepare-no-settle', cancelAuthorization(at, control)),
          ),
          'denied',
          'a cancel prepareFinish without settle',
        )
        assert.equal(prepared.kind === 'denied' ? prepared.action : '', 'settle')
        const finished = await refused(
          journal.tryFinish(
            finishInput(opened, at, 'end-no-settle', cancelAuthorization(at, control)),
          ),
          'denied',
          'a cancel tryFinish without settle',
        )
        assert.equal(finished.kind === 'denied' ? finished.action : '', 'settle')
        assert.deepEqual(await load(opened), at, 'the refusals wrote nothing')
      },
    },
    {
      name: 'MT-1: the accepted return of a reference and then a commit-unknown registration of the same reference leave the call held with its custodian: the undecided record does not take the known one back, in the order opposite to the one above',
      run: async () => {
        const opened = await fixture.open('tool-association-unknown-after-known')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const { pending, key, reference } = await savedToolIntent(opened, 'mt1')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const record = (name: string, source: DurableEvidence) =>
          journal.commitSettlement(
            settlement<P, 'record-tool-association'>(opened, name, {
              kind: 'record-tool-association',
              intent: key,
              request: pending.fixed,
              source,
              priorExcluded: null,
            }),
          )
        const accepted = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'accepted', reference, receipt: evidence('tool-receipt-mt1') },
          received: evidence('received/mt1'),
          custody: evidence('custody/mt1'),
        })
        await ok(record('associate-accepted', accepted), 'the accepted return')
        const undecided = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'commit-unknown', reference },
          received: evidence('received/mt1-2'),
          custody: evidence('custody/mt1-2'),
        })
        await ok(
          record('associate-unknown', undecided),
          'the commit-unknown return of the same reference',
        )
        const judged = await judge(opened, control)
        assert.notEqual(judged.judgment.decision.kind, 'unknown', 'the call is not unknown')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const issued = await load(opened)
        const item = itemOf(issued, 'call')
        assert.equal(item.disposition.kind, 'held')
        if (item.disposition.kind !== 'held') return
        assert.notEqual(item.custodian, null, 'the accepted return names the custodian')
        assert.deepEqual(item.disposition.custodian, item.custodian)
        const finished = await ok(
          journal.tryFinish(
            finishInput(opened, issued, 'end', cancelAuthorization(issued, control)),
          ),
          'the cancel tryFinish',
        )
        assert.equal(finished.kind, 'ended')
      },
    },
    {
      name: 'MT-2: the commit-unknown return of a Tool invoke is an unknown call obligation that continues with tool-association-retain: the trusted return source and the original registration request, for reconcile',
      run: async () => {
        const opened = await fixture.open('tool-association-retain')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const { pending, key, reference } = await savedToolIntent(opened, 'mt2')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const source = await opened.hostRecord({
          kind: 'tool-return',
          intent: key,
          request: pending.fixed,
          returned: { kind: 'commit-unknown', reference },
          received: evidence('received/mt2'),
          custody: evidence('custody/mt2'),
        })
        await ok(
          journal.commitSettlement(
            settlement<P, 'record-tool-association'>(opened, 'associate-unknown', {
              kind: 'record-tool-association',
              intent: key,
              request: pending.fixed,
              source,
              priorExcluded: null,
            }),
          ),
          'the association of a commit-unknown return',
        )
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const item = itemOf(await load(opened), 'call')
        assert.equal(item.disposition.kind, 'unknown')
        if (item.disposition.kind !== 'unknown') return
        const required = item.disposition.required
        assert.equal(required.kind, 'tool-association-retain')
        if (required.kind !== 'tool-association-retain') return
        assert.equal(required.request.kind, 'parameters')
        if (required.request.kind !== 'parameters') return
        assert.deepEqual(required.request.value.source, source)
        assert.deepEqual(required.request.value.request, pending.fixed)
        assert.deepEqual(required.request.value.intent, key)
        assert.equal(required.purpose, 'reconcile')
      },
    },
    {
      name: 'MT-3: a Model effect intent with no result, no association and no final failure is an unknown call that continues with producer-query of that pending call, and the ordinary tryFinish is unavailable and writes nothing',
      run: async () => {
        const opened = await fixture.open('model-intent-unknown')
        const { journal } = opened
        await takeInputs(opened)
        const { pending } = modelIntent(opened, 'call-mt3')
        await ok(
          journal.commit(
            commitAt(opened, await load(opened), 'effect', opened.authority, {
              effects: [{ action: pending.action, pending, authority: opened.authority }],
            }),
          ),
          'the effect intent',
        )
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare')),
          'prepareFinish',
        )
        const issued = await load(opened)
        const item = itemOf(issued, 'call')
        assert.equal(item.disposition.kind, 'unknown')
        if (item.disposition.kind !== 'unknown') return
        assert.deepEqual(item.disposition.required, {
          ...item.disposition.required,
          kind: 'producer-query',
          request: { kind: 'parameters', value: { pending } },
          purpose: 'query',
        })
        await refused(
          journal.tryFinish(finishInput(opened, issued, 'end')),
          'unavailable',
          'the ordinary tryFinish with an unknown call',
        )
        assert.deepEqual(await load(opened), issued, 'unavailable wrote nothing')
      },
    },
    {
      name: 'MT-4: of two Model effect intents only the call named by the no-reply failure of the candidate is settled on it; the other stays an unknown call and the ordinary tryFinish is unavailable',
      run: async () => {
        const opened = await fixture.open('final-failure-names-one-call')
        const { journal } = opened
        await takeInputs(opened)
        const first = modelIntent(opened, 'call-x')
        const second = modelIntent(opened, 'call-y')
        for (const [name, { pending }] of [
          ['effect-x', first],
          ['effect-y', second],
        ] as const) {
          await ok(
            journal.commit(
              commitAt(opened, await load(opened), name, opened.authority, {
                effects: [{ action: pending.action, pending, authority: opened.authority }],
              }),
            ),
            name,
          )
        }
        const at = await load(opened)
        await ok(
          journal.commit(
            f1Commit(
              opened,
              at,
              'f1',
              opened.authority,
              candidateContent(at, 'f1', noReplyContent('f1', second.call)),
            ),
          ),
          'F1 of the no-reply failure of the second call',
        )
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await ok(
          journal.prepareFinish(prepareInput(opened, await load(opened), 'prepare')),
          'prepareFinish',
        )
        const issued = await load(opened)
        const calls = itemsOf(issued).filter(
          (item): item is Extract<FinishObligation, { kind: 'call' }> => item.kind === 'call',
        )
        assert.equal(calls.length, 2, 'both calls are listed')
        const named = calls.find(item => item.action === second.pending.action)
        const other = calls.find(item => item.action === first.pending.action)
        assert.ok(named !== undefined && other !== undefined)
        assert.deepEqual(named.disposition, {
          kind: 'settled',
          completion: evidence('failure/f1'),
        })
        assert.equal(other.disposition.kind, 'unknown')
        if (other.disposition.kind !== 'unknown') return
        assert.equal(other.disposition.required.kind, 'producer-query')
        assert.deepEqual(other.disposition.required.request, {
          kind: 'parameters',
          value: { pending: first.pending },
        })
        await refused(
          journal.tryFinish(finishInput(opened, issued, 'end')),
          'unavailable',
          'the ordinary tryFinish with an unknown call',
        )
        assert.deepEqual(await load(opened), issued, 'unavailable wrote nothing')
      },
    },
    {
      name: 'MT-5: prepareFinish that names a candidate of this execution that another F1 has superseded is changed, not invalid, and writes nothing',
      run: async () => {
        const opened = await fixture.open('prepare-superseded-candidate')
        const { journal } = opened
        await takeInputs(opened)
        const first = f1Commit(opened, await load(opened), 'f1-a')
        await ok(journal.commit(first), 'the first F1')
        const kept = await load(opened)
        await ok(
          journal.commit(
            f1Commit(
              opened,
              kept,
              'f1-b',
              opened.authority,
              candidateContent(kept, 'f1-b', { conditions: evidence('conditions/changed') }),
            ),
          ),
          'the F1 of other content',
        )
        const at = await load(opened)
        assert.notEqual(candidateOf(at), first.operation, 'the first candidate is superseded')
        await refused(
          journal.prepareFinish(
            prepareInput(opened, at, 'prepare-old', advancement(opened.authority), first.operation),
          ),
          'changed',
          'prepareFinish of a superseded candidate',
        )
        assert.deepEqual(await load(opened), at, 'the refusal wrote nothing')
      },
    },
    {
      name: 'MT-6: establish-cancellation whose predecessor is the current candidate of two succeeds and links the supersession from that candidate',
      run: async () => {
        const opened = await fixture.open('establish-over-second-candidate')
        if (!(await requireInstallation(opened))) return
        const { journal } = opened
        await takeInputs(opened)
        const first = f1Commit(opened, await load(opened), 'f1-a')
        await ok(journal.commit(first), 'the first F1')
        const kept = await load(opened)
        const second = f1Commit(
          opened,
          kept,
          'f1-b',
          opened.authority,
          candidateContent(kept, 'f1-b', { conditions: evidence('conditions/changed') }),
        )
        await ok(journal.commit(second), 'the F1 of other content')
        const control = await effectiveCancel(opened)
        const result = await establish(opened, control)
        assert.equal(result.candidate.conclusion.kind, 'cancelled')
        assert.equal(result.supersession?.from, second.operation)
        assert.equal(result.supersession?.to, result.candidate.candidate)
        const after = await load(opened)
        assert.deepEqual(
          after.settlement.candidates.map(candidate => candidate.candidate),
          [first.operation, second.operation, result.candidate.candidate],
        )
        assert.equal(candidateOf(after), result.candidate.candidate)
      },
    },
    {
      name: 'MT-7: under an effective cancel an advancement tryFinish of a complete candidate whose list was never issued is changed, not invalid at intent.obligations, and writes nothing',
      run: async () => {
        const opened = await fixture.open('try-finish-advancement-under-cancel')
        const { journal } = opened
        await takeInputs(opened)
        await ok(journal.commit(f1Commit(opened, await load(opened), 'f1')), 'F1')
        await ok(journal.commit(f2Commit(opened, await load(opened), 'f2')), 'F2')
        await effectiveCancel(opened)
        const at = await load(opened)
        assert.equal(intentOf(at).obligations, null, 'no list is issued')
        const finished = await ok(
          journal.tryFinish(finishInput(opened, at, 'end')),
          'an advancement tryFinish under an effective cancel',
        )
        assert.equal(finished.kind, 'changed')
        assert.deepEqual(await load(opened), at, 'the refusal wrote nothing')
      },
    },
    {
      name: 'MT-8: a known result and then an undetermined result of the same card round leave the card-round obligation known: the known result counts, not the last one',
      run: async () => {
        const opened = await fixture.open('card-reconciliation-unknown-after-known')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const asking = beforeTerminalPassage('asker-m8', {
          kind: 'requested',
          mode: { kind: 'fresh' },
        })
        const round = presentedRound(asking, 'round-m8')
        const passage: Passage = { ...asking, progress: { kind: 'asked', rounds: [round] } }
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(
          journal.commit({ ...f1, checkpoint: { ...f1.checkpoint, passages: [passage] } }),
          'F1 with the asked passage',
        )
        const authorRoute = (await load(opened)).settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const record = (name: string, original: DurableEvidence) =>
          journal.commitSettlement(
            settlement<P, 'record-card-reconciliation'>(opened, name, {
              kind: 'record-card-reconciliation',
              passage: passage.id,
              round: round.round,
              candidate: f1.operation,
              route: authorRoute.record,
              original,
            }),
          )
        const known = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: passage.id,
          round: round.round,
          result: {
            kind: 'known',
            present: evidence(`present/${round.round}`),
            lookups: [operation('lookup-m8')],
            invalidate: null,
          },
        })
        await ok(record('reconcile-known', known), 'the known result')
        const undetermined = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: passage.id,
          round: round.round,
          result: { kind: 'unknown', reason: 'source-unavailable' },
        })
        await ok(record('reconcile-unknown', undetermined), 'the undetermined result of the round')
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const item = itemOf(await load(opened), 'card-round')
        assert.equal(item.disposition.kind, 'held', 'the known result holds the round')
        assert.deepEqual(item.lookups, [operation('lookup-m8')])
      },
    },
    {
      name: 'MT-9: a round id shared by two passages names two card-round obligations by passage and round: only the registered round takes the registered result, the others stay default items',
      run: async () => {
        const opened = await fixture.open('card-round-identity')
        if (!(await requireInstallation(opened))) return
        if (opened.hostRecord === undefined) {
          await uncoveredCase('', 'hostRecord control').run()
          return
        }
        const { journal } = opened
        await takeInputs(opened)
        const requested: Passage['progress'] = { kind: 'requested', mode: { kind: 'fresh' } }
        const firstBase = beforeTerminalPassage('asker-m9a', requested)
        const secondBase = beforeTerminalPassage('asker-m9b', requested)
        const firstRound = presentedRound(firstBase, 'round-m9-1')
        const otherRound = presentedRound(firstBase, 'round-m9-2')
        // The one round of the second passage has the CardRoundId of the first round of the first.
        const sharedRound = presentedRound(secondBase, 'round-m9-1')
        assert.equal(sharedRound.round, firstRound.round)
        const first: Passage = {
          ...firstBase,
          progress: { kind: 'asked', rounds: [firstRound, otherRound] },
        }
        const second: Passage = {
          ...secondBase,
          ordinal: 2,
          progress: { kind: 'asked', rounds: [sharedRound] },
        }
        const f1 = f1Commit(opened, await load(opened), 'f1')
        await ok(
          journal.commit({ ...f1, checkpoint: { ...f1.checkpoint, passages: [first, second] } }),
          'F1 with two asked passages',
        )
        const authorRoute = (await load(opened)).settlement.route
        assert.ok(authorRoute !== null && authorRoute.kind === 'author')
        const control = await effectiveCancel(opened)
        await establish(opened, control)
        const original = await opened.hostRecord({
          kind: 'card-reconciliation',
          passage: first.id,
          round: firstRound.round,
          result: {
            kind: 'known',
            present: evidence('present/m9'),
            lookups: [operation('lookup-m9')],
            invalidate: null,
          },
        })
        await ok(
          journal.commitSettlement(
            settlement<P, 'record-card-reconciliation'>(opened, 'reconcile-first', {
              kind: 'record-card-reconciliation',
              passage: first.id,
              round: firstRound.round,
              candidate: f1.operation,
              route: authorRoute.record,
              original,
            }),
          ),
          'the known result of the first round of the first passage',
        )
        const unjudged = await load(opened)
        await ok(
          journal.prepareFinish(
            prepareInput(opened, unjudged, 'prepare', cancelAuthorization(unjudged, control)),
          ),
          'prepareFinish',
        )
        const rounds = itemsOf(await load(opened)).flatMap(item =>
          item.kind === 'card-round'
            ? [{ passage: item.passage, round: item.round.round, lookups: item.lookups }]
            : [],
        )
        const byKey = (left: { passage: string; round: string }, right: typeof left) =>
          `${left.passage}/${left.round}`.localeCompare(`${right.passage}/${right.round}`)
        assert.deepEqual(
          [...rounds].sort(byKey),
          [
            { passage: first.id, round: firstRound.round, lookups: [operation('lookup-m9')] },
            { passage: first.id, round: otherRound.round, lookups: [] },
            { passage: second.id, round: sharedRound.round, lookups: [] },
          ].sort(byKey),
        )
      },
    },
  ]
}
