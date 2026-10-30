// The coordinated binding of the session-log Journal (Agent SPEC "提交参加者协议"; AD-01; PA-01
// of session-contract): the declaration, the co-checks of open, attach and submit in the same
// write, the attach rules of PA-01 item 3 (ordinary advance and cancel wind-down), and the
// participant answer of tryFinish as FinishResult.changed.
import { describe, expect, it } from 'vitest'
import { decodeAgentExecutionId, decodeInputId } from '@omne-harness/agent-contract'
import { creation, guard, operationId } from '@omne-harness/session-contract/testing'
import { scene, ok, operation, evidence, instance } from './fixtures/common-journal.ts'
import { accept, cancel, end, handed, take } from './fixtures/progression.ts'

type Scene = Awaited<ReturnType<typeof scene>>

async function claim(s: Scene, label: string) {
  const before = ok(await s.backend.transactions.readWork(s.access))
  if (before.run.kind !== 'active') throw new Error('active Run expected')
  return ok(
    await s.backend.transactions.commit({
      access: s.access,
      command: {
        kind: 'claim',
        input: {
          tenant: s.access.tenant,
          session: s.access.session,
          operation: operationId(`claim-${label}`),
          run: before.run.run,
          instance: { owner: 'agent', id: label },
          continuity: evidence(`continuity-${label}`),
        },
      },
      guards: [],
    }),
  )
}

/** Starts the next Run on the Session side and returns the open input of its execution, without opening. */
async function startWithoutOpen(s: Scene) {
  const command = {
    kind: 'startRun' as const,
    input: {
      tenant: s.access.tenant,
      session: s.access.session,
      operation: operationId('start-next'),
      entry: 'interactive' as const,
      candidate: creation().definition.candidate,
      instance: { owner: 'agent' as const, id: 'instance-next' },
    },
  }
  const started = ok(
    await s.backend.transactions.commit({
      access: s.access,
      command,
      guards: [
        guard('evidence-bridge', 'login-entry', {
          session: s.access.session,
          operation: command.input.operation,
        }),
      ],
    }),
  )
  const snapshot = ok(await s.backend.transactions.readWork(s.access))
  if (snapshot.run.kind !== 'active') throw new Error('active Run expected')
  const admitted = ok(
    await s.backend.transactions.readInput({ ...s.access, input: snapshot.run.first }),
  )
  return {
    ...s.access,
    execution: ok(decodeAgentExecutionId(snapshot.run.execution.execution)),
    instance: instance('instance-next'),
    grant: started.receipt.source,
    initial: {
      id: ok(decodeInputId(admitted.input)),
      content: admitted.message,
      source: admitted.origin,
      priority: 'ordinary' as const,
    },
    checkpoint: s.input.checkpoint,
  }
}

function attach(
  s: Scene,
  label: string,
  grant: Parameters<typeof s.view.journal.attach>[0]['grant'],
) {
  return s.view.journal.attach({
    ...s.access,
    execution: s.execution,
    operation: operation(`attach-${label}`),
    instance: instance(label),
    grant,
    recovery: evidence(`recovery-${label}`),
    takeover: evidence(`takeover-${label}`),
  })
}

describe('the binding declares coordinated and co-checks open and submit', () => {
  it('declares coordinated with the four participant kinds', async () => {
    const s = await scene('declaration')
    expect(s.view.journal.capabilities.coordination).toBe('coordinated')
    expect([...s.view.journal.capabilities.participants].sort()).toEqual([
      'context-transition',
      'custody',
      'message',
      'processed',
    ])
    expect(s.backend.sessionView(s.access.session).journal.capabilities.coordination).toBe(
      'coordinated',
    )
  })

  it('open without a grant or without the Session source is denied and writes nothing', async () => {
    const s = await scene('open-denied')
    ok(await handed(s))
    await take(s)
    expect(ok(await end(s)).kind).toBe('ended')
    for (const sequence of ['1', '2']) {
      ok(
        await s.backend.controls.interpret({
          ...s.access,
          execution: s.execution,
          operation: operationId(`interpret-${sequence}`),
          sequence,
        }),
      )
    }
    await accept(s, 'input-next')
    // PA-03: the next Run gives a fresh execution, not yet opened on the Agent side.
    const fresh = await startWithoutOpen(s)
    expect(
      await s.view.journal.open({ ...fresh, operation: operation('open-no-grant'), grant: null }),
    ).toMatchObject({ failure: { kind: 'denied', action: 'open' } })
    expect(
      await s.view.journal.open({
        ...fresh,
        operation: operation('open-no-source'),
        initial: { ...fresh.initial, source: null },
      }),
    ).toMatchObject({ failure: { kind: 'denied', action: 'open' } })
    expect(
      await s.view.journal.query({
        ...s.access,
        execution: fresh.execution,
        operation: operation('open-no-grant'),
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(
      ok(await s.view.journal.open({ ...fresh, operation: operation('open-fresh') })).receipt.state,
    ).toBe('applied')
  })

  it('submit without the SE11 source is denied; with it the input is accepted', async () => {
    const s = await scene('submit-denied')
    const value = await accept(s, 'input-2')
    expect(
      await s.view.journal.submit({
        ...s.access,
        execution: s.execution,
        operation: operation('submit-no-source'),
        value: { ...value, source: null },
      }),
    ).toMatchObject({ failure: { kind: 'denied', action: 'submit' } })
    expect(
      ok(
        await s.view.journal.submit({
          ...s.access,
          execution: s.execution,
          operation: operation('submit-sourced'),
          value,
        }),
      ).state,
    ).toBe('accepted')
  })
})

describe('attach follows PA-01 item 3', () => {
  it('ordinary advance: the grant of the current attempt attaches; a superseded attempt is denied, not changed or stale-advance', async () => {
    const s = await scene('attach-advance')
    const first = await claim(s, 'first')
    const second = await claim(s, 'second')
    const root = s.view.controls.root()
    expect(await attach(s, 'stale', first.receipt.source)).toMatchObject({
      failure: { kind: 'denied', action: 'attach' },
    })
    expect(s.view.controls.root()).toBe(root)
    const attached = ok(await attach(s, 'current', second.receipt.source))
    expect(attached.authority.instance).toBe(instance('current'))
  })

  it('cancel wind-down: after the Run is cancelled the last attempt attaches with cancel authority only', async () => {
    const s = await scene('attach-cancel')
    ok(await handed(s))
    await take(s)
    ok(await cancel(s))
    const work = ok(await s.backend.transactions.readWork(s.access))
    expect(work.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'cancelled' } })
    const attached = ok(await attach(s, 'wind-down', s.input.grant))
    // The wind-down attachment carries no advance power (Agent SPEC "条件终结": two authorizations).
    expect(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('advance-after-cancel'),
        authority: attached.authority,
        expected: attached.receipt.revision,
        checkpoint: s.input.checkpoint,
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
      }),
    ).toMatchObject({ failure: { kind: 'stale-advance' } })
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    ok(
      await s.view.journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: operation('intent'),
        target: operation('cancel'),
        stage: 'intent-established',
        state: 'reached',
        source: evidence('intent'),
      }),
    )
    const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    const finished = ok(
      await s.view.journal.tryFinish({
        ...s.access,
        execution: s.execution,
        operation: operation('cancelled-end'),
        authorization: { kind: 'cancel', control: operation('cancel'), source: evidence('cancel') },
        expected: loaded.revision,
        intent: {
          conclusion: { kind: 'cancelled', cause: evidence('cause') },
          inputWatermark: loaded.inputWatermark,
          obligations: evidence('obligations'),
          beforeTerminal: evidence('before-terminal'),
          failure: null,
        },
      }),
    )
    expect(finished.kind).toBe('ended')
  })

  it('an ended execution answers terminal before the Session check', async () => {
    const s = await scene('attach-ended')
    ok(await handed(s))
    await take(s)
    expect(ok(await end(s)).kind).toBe('ended')
    const root = s.view.controls.root()
    expect(await attach(s, 'late', null)).toMatchObject({ failure: { kind: 'terminal' } })
    expect(await attach(s, 'late-granted', s.input.grant)).toMatchObject({
      failure: { kind: 'terminal' },
    })
    expect(s.view.controls.root()).toBe(root)
  })
})

describe('tryFinish takes the Session participant into the same conditional commit', () => {
  it('an input the Session accepted but did not hand over is reported as FinishResult.changed, not as a failure', async () => {
    const s = await scene('finish-pending-input')
    ok(await handed(s))
    await take(s)
    await accept(s, 'input-2')
    const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    const root = s.view.controls.root()
    expect(await end(s)).toEqual({ ok: { kind: 'changed', revision: loaded.revision } })
    expect(s.view.controls.root()).toBe(root)
    expect(
      ok(await s.view.journal.load({ ...s.access, execution: s.execution })).state.kind,
    ).not.toBe('ended')
  })
})
