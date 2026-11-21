import assert from 'node:assert/strict'
import {
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
} from '@omne-harness/model-contract'
import type { PendingCall } from './evaluation.ts'
import { decodeActionId, decodeConsumptionId } from './identity.ts'
import type { ConformanceCase } from './testing-case.ts'
import {
  commitAt,
  evidence,
  handoffOf,
  identity,
  load,
  newSubmit,
  ok,
  operation,
  pendingHandoff,
  prepareCommit,
  refused,
  takeInputs,
  type AgentJournalCoreFixture,
  type AgentJournalCoreOpened,
} from './testing-journal-helpers.ts'

function modelCall<P>(opened: AgentJournalCoreOpened<P>, name: string) {
  const call = identity(decodeModelCallId(`mcall_open_${name}`), name)
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: identity(decodeActionId(`open-${name}`), name),
    consumption: identity(decodeConsumptionId(`open-${name}`), name),
    position: { owner: 'agent', work: opened.execution, position: 'I3', purpose: 'main' },
    fixed: evidence(`request/${name}`),
    reference: identity(
      encodeModelInvocationRef({
        tenant: opened.access.tenant,
        call,
        admission: identity(decodeModelOperationId(`mop_open_${name}`), name),
      }),
      'reference',
    ),
  }
  return { call, pending }
}

async function intended<P>(opened: AgentJournalCoreOpened<P>, name: string) {
  const { call, pending } = modelCall(opened, name)
  const snapshot = await load(opened)
  await ok(
    opened.journal.commit(
      commitAt(opened, snapshot, `intend-${name}`, opened.authority, {
        checkpoint: { ...snapshot.checkpoint, calls: [pending] },
        effects: [{ action: pending.action, pending, authority: opened.authority }],
      }),
    ),
    'the effect intent',
  )
  return { call, pending }
}

export function openSnapshotCases<P>(
  fixture: AgentJournalCoreFixture<P>,
): readonly ConformanceCase[] {
  return [
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
    {
      name: 'S-open: an input of an earlier batch leaves the snapshot; its acceptance answers by the input identity',
      run: async () => {
        const opened = await fixture.open('s-open-input')
        const { journal } = opened
        const first = await opened.acceptInput('2')
        const accepted = newSubmit(opened, 'submit-2', first)
        await ok(journal.submit(accepted), 'the first input')
        await takeInputs(opened, 'take-1')
        await ok(
          journal.submit(newSubmit(opened, 'submit-3', await opened.acceptInput('3'))),
          'the second input',
        )
        await takeInputs(opened, 'take-2')
        const snapshot = await load(opened)
        assert.ok(
          !snapshot.handoffs.some(
            item => item.handoff.kind === 'input' && item.handoff.input === first.id,
          ),
          'the input of the earlier batch left the snapshot',
        )
        const read = { ...opened.access, execution: opened.execution }
        assert.deepEqual(
          await ok(journal.inputAcceptance({ ...read, input: first.id }), 'inputAcceptance'),
          accepted.lineage.original,
          'the acceptance of the closed input answers by its identity',
        )
        const never = await opened.acceptInput('9')
        assert.equal(
          await ok(journal.inputAcceptance({ ...read, input: never.id }), 'never accepted'),
          null,
          'an input the execution never accepted answers null, not a guess',
        )
      },
    },
    {
      name: 'S-open: an effect intent leaves the snapshot once its call leaves the checkpoint',
      run: async () => {
        const opened = await fixture.open('s-open-effect')
        const { pending } = await intended(opened, 'effect')
        const held = await load(opened)
        assert.ok(
          held.effects.some(effect => effect.action === pending.action),
          'the intent of a waiting call is open',
        )
        await ok(
          opened.journal.commit(
            commitAt(opened, held, 'settled', opened.authority, {
              checkpoint: { ...held.checkpoint, calls: [] },
            }),
          ),
          'the commit that leaves the call',
        )
        const after = await load(opened)
        assert.ok(
          !after.effects.some(effect => effect.action === pending.action),
          'the intent of a call that left the checkpoint left the snapshot',
        )
      },
    },
    {
      name: 'S-open: a Model control records the invocation it targets at acceptance',
      run: async () => {
        const opened = await fixture.open('s-open-control')
        const { call, pending } = await intended(opened, 'control')
        const control = {
          ...opened.access,
          execution: opened.execution,
          operation: operation('interrupt'),
          command: { kind: 'interrupt-model' as const, call, reason: evidence('reason/interrupt') },
        }
        await ok(opened.journal.control(control), 'the Model control')
        const record = (await load(opened)).controls.find(
          item => item.operation === control.operation,
        )
        assert.ok(record !== undefined, 'the control is listed')
        assert.deepEqual(
          record.modelInvocation,
          pending.reference,
          'the record names the invocation of the call it stops',
        )
      },
    },
  ]
}
