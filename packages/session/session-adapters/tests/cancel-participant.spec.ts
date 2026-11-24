import { describe, expect, it } from 'vitest'
import type { SettlementRequest } from '@omne-harness/agent-contract'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import { operationId } from '@omne-harness/session-contract/testing'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

type By = 'cancel-run' | 'archive'

// The cancellation judgment of an execution whose Run a Session control ended, as the Agent holding `held` asks for it.
async function judgedUnder(name: string, by: By, held: 'that-control' | 'another') {
  const s = await sqlScene(name, { cancellation: 'installed' })
  try {
    const journal = s.view.journal
    ok(await journal.open(s.openInput))
    const work = ok(await s.port.readWork(s.sessionAccess))
    if (work.run.kind !== 'active') throw new Error(`the Run is ${work.run.kind}`)
    const ended = operationId(`${name}-ended`)
    ok(
      await s.port.commit({
        access: s.sessionAccess,
        command: {
          kind: 'control',
          input: {
            tenant: s.access.tenant,
            session: s.access.session,
            operation: ended,
            intent:
              by === 'archive'
                ? { kind: 'archive' }
                : { kind: 'cancel-run', run: work.run.run, urgency: 'force' },
          },
        },
        guards: [],
      }),
    )
    const control = operation(
      held === 'another'
        ? 'another-control'
        : deriveDriveOperation({ kind: 'control', execution: s.execution, control: ended }),
    )
    const target = { ...s.access, execution: s.execution }
    ok(
      await journal.control({
        ...target,
        operation: control,
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    ok(
      await journal.recordControl({
        ...target,
        operation: operation('cancel-intent'),
        target: control,
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    const request = async (step: string) => {
      const snapshot = ok(await journal.load(target))
      const record = snapshot.controls.find(item => item.operation === control)
      if (record === undefined) throw new Error('the control should be saved')
      return {
        snapshot,
        common: {
          ...target,
          operation: operation(step),
          authorization: {
            kind: 'cancel' as const,
            control,
            source: record.stages.accepted.source,
          },
          expected: snapshot.revision,
          installation: testCancellationPolicyInstallation.record,
        },
      }
    }
    const establish: SettlementRequest<string> = {
      ...(await request('cancel-establish')).common,
      kind: 'establish-cancellation',
      predecessor: null,
    }
    ok(await journal.commitSettlement(establish))
    const second = await request('cancel-judge')
    const route = second.snapshot.settlement.route
    if (route === null) throw new Error('a route is expected')
    ok(
      await journal.commitSettlement({
        ...second.common,
        kind: 'judge-cancellation',
        candidate: route.candidate,
        route: route.record,
      }),
    )
    const judgment = ok(await journal.load(target)).settlement.judgments.at(-1)
    const participants = judgment?.input.participants
    return participants?.kind === 'coordinated'
      ? participants.participants.map(item => [item.owner, item.condition.kind])
      : participants
  } finally {
    await s.close()
  }
}

describe('the Session participant of a cancellation judgment', () => {
  it.each(['cancel-run', 'archive'] as const)(
    'is ready under the control that ended the Run by %s, and changed under any other',
    async by => {
      expect(await judgedUnder(`own-${by}`, by, 'that-control')).toEqual([['session', 'ready']])
      expect(await judgedUnder(`other-${by}`, by, 'another')).toEqual([['session', 'changed']])
    },
  )
})
