// The coordinated binding of the session-log Journal (Agent SPEC "提交参加者协议"; AD-01; PA-01
// of session-contract): the declaration, the co-checks of open, attach and submit in the same
// write, the attach rules of PA-01 item 3 (ordinary advance and cancel wind-down), and the
// participant answer of tryFinish as FinishResult.changed, with the cancel branch of PA-02.
import { describe, expect, it } from 'vitest'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  type AgentOperationId,
  type ExecutionSnapshot,
  type SettlementRequest,
} from '@omne-harness/agent-contract'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import { deriveDriveOperation } from '@omne-harness/session-contract'
import { creation, guard, operationId } from '@omne-harness/session-contract/testing'
import {
  scene,
  ok,
  operation,
  evidence,
  instance,
  openInput,
  submitInput,
} from './fixtures/common-journal.ts'
import { accept, cancel, end, handed, prepareEnd, start, take } from './fixtures/progression.ts'

type Scene = Awaited<ReturnType<typeof scene>>
type Snapshot = ExecutionSnapshot
type Request = SettlementRequest<string>
/** The members every candidate and judgment request shares. */
type Common = Pick<
  Extract<Request, { kind: 'judge-cancellation' }>,
  'principal' | 'tenant' | 'execution' | 'operation' | 'authorization' | 'expected' | 'installation'
>

/** The Agent cancel control the coordinator derives for the Session control `cancel` (PA-02). */
function sessionCancelControl(s: Scene, name = 'cancel') {
  return ok(
    decodeAgentOperationId(
      deriveDriveOperation({ kind: 'control', execution: s.execution, control: operationId(name) }),
    ),
  )
}

function cancelAuthorization(snapshot: Snapshot, control: AgentOperationId) {
  const record = snapshot.controls.find(item => item.operation === control)
  if (record === undefined) throw new Error('the control should be saved')
  return { kind: 'cancel' as const, control, source: record.stages.accepted.source }
}

/** The Agent cancel `control` accepted and its intent reached: an effective cancel. */
async function effective(s: Scene, control: AgentOperationId) {
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: control,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation(`intent-${control}`),
      target: control,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
}

/**
 * The cancellation path up to tryFinish under the Agent cancel `control` (Agent SPEC "取消判断与路
 * 线"): establish the cancelled candidate, judge it with the installed test policy, prepareFinish;
 * answers the snapshot whose projection the cancel end presents.
 */
async function windDown(s: Scene, control: AgentOperationId): Promise<Snapshot> {
  await effective(s, control)
  const load = async () => ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  /** One candidate or judgment request: `build` adds the members of its variant to the common ones. */
  const settle = async (name: string, build: (common: Common) => Request) => {
    const snapshot = await load()
    const common: Common = {
      ...s.access,
      execution: s.execution,
      operation: operation(name),
      authorization: cancelAuthorization(snapshot, control),
      expected: snapshot.revision,
      installation: testCancellationPolicyInstallation.record,
    }
    return ok(await s.view.journal.commitSettlement(build(common)))
  }
  await settle('establish', common => ({
    ...common,
    kind: 'establish-cancellation',
    predecessor: null,
  }))
  const established = await load()
  const route = established.settlement.route
  if (route === null) throw new Error('a route is expected')
  const judged = await settle('judge', common => ({
    ...common,
    kind: 'judge-cancellation',
    candidate: route.candidate,
    route: route.record,
  }))
  expect(judged).toMatchObject({ judgment: { decision: { kind: 'allowed' } } })
  const snapshot = await load()
  ok(
    await s.view.journal.prepareFinish({
      ...s.access,
      execution: s.execution,
      operation: operation('prepare'),
      authorization: cancelAuthorization(snapshot, control),
      expected: snapshot.revision,
      candidate: route.candidate,
    }),
  )
  return load()
}

/** The cancel tryFinish of the projection of `ready`. */
function cancelFinish(s: Scene, ready: Snapshot, name: string) {
  if (ready.state.kind !== 'settling') throw new Error('settling expected')
  const control =
    ready.settlement.route?.kind === 'cancellation'
      ? ready.settlement.route.control
      : ready.controls.find(item => item.command.kind === 'cancel')?.operation
  if (control === undefined) throw new Error('a cancel control is expected')
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authorization: cancelAuthorization(ready, control),
    expected: ready.revision,
    intent: ready.state.intent,
  }
}

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
    access: s.access,
    execution: ok(decodeAgentExecutionId(snapshot.run.execution.execution)),
    instance: instance('instance-next'),
    grant: started.receipt.source,
    initial: {
      id: ok(decodeInputId(admitted.input)),
      content: admitted.message,
      source: admitted.origin,
      priority: 'ordinary' as const,
    },
    checkpoint: s.checkpoint,
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
      await s.view.journal.open(
        openInput({ ...fresh, operation: operation('open-no-grant'), grant: null }),
      ),
    ).toMatchObject({ failure: { kind: 'denied', action: 'open' } })
    expect(
      await s.view.journal.open(
        openInput({
          ...fresh,
          operation: operation('open-no-source'),
          initial: { ...fresh.initial, source: null },
        }),
      ),
    ).toMatchObject({ failure: { kind: 'denied', action: 'open' } })
    expect(
      await s.view.journal.query({
        ...s.access,
        execution: fresh.execution,
        operation: operation('open-no-grant'),
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(
      ok(await s.view.journal.open(openInput({ ...fresh, operation: operation('open-fresh') })))
        .receipt.state,
    ).toBe('applied')
  })

  it('submit without the SE11 source is denied; with it the input is accepted', async () => {
    const s = await scene('submit-denied')
    const value = await accept(s, 'input-2')
    expect(
      await s.view.journal.submit(
        submitInput(s.access, s.execution, operation('submit-no-source'), {
          ...value,
          source: null,
        }),
      ),
    ).toMatchObject({ failure: { kind: 'denied', action: 'submit' } })
    expect(
      ok(
        await s.view.journal.submit(
          submitInput(s.access, s.execution, operation('submit-sourced'), value),
        ),
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

  it('cancel wind-down: after the Run is cancelled the last attempt granted before the cancel attaches with cancel authority only, and ends cancelled under the control SE26 names', async () => {
    const s = await scene('attach-cancel')
    ok(await handed(s))
    await take(s)
    ok(await cancel(s))
    const work = ok(await s.backend.transactions.readWork(s.access))
    expect(work.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'cancelled' } })
    const attached = ok(await attach(s, 'wind-down', s.input.runtime.grant))
    // The wind-down attachment carries no advance power (Agent SPEC "条件终结": two authorizations).
    expect(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation('advance-after-cancel'),
        authority: attached.authority,
        expected: attached.receipt.revision,
        checkpoint: s.checkpoint,
        state: { kind: 'advancing' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    ).toMatchObject({ failure: { kind: 'stale-advance' } })
    const ready = await windDown(s, sessionCancelControl(s))
    if (ready.state.kind !== 'settling') throw new Error('settling expected')
    const finished = ok(await s.view.journal.tryFinish(cancelFinish(s, ready, 'cancelled-end')))
    expect(finished.kind).toBe('ended')
    const ended = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'cancelled' } })
  })

  it('cancel wind-down: an attempt granted before the last one is denied, the last one attaches', async () => {
    const s = await scene('attach-cancel-earlier')
    ok(await handed(s))
    await take(s)
    const last = await claim(s, 'last')
    ok(await cancel(s))
    const root = s.view.controls.root()
    expect(await attach(s, 'earlier', s.input.runtime.grant)).toMatchObject({
      failure: { kind: 'denied', action: 'attach' },
    })
    expect(s.view.controls.root()).toBe(root)
    expect(ok(await attach(s, 'last', last.receipt.source)).authority.instance).toBe(
      instance('last'),
    )
  })
  it('cancel wind-down reads the Run of this execution: after the next Run started, the last grant of the cancelled execution still attaches', async () => {
    const s = await scene('attach-cancel-next-run')
    ok(await handed(s))
    await take(s)
    ok(await cancel(s))
    await accept(s, 'input-2')
    // The next Run is active for another execution; the cancelled Run of E1 stays its own Run.
    const next = await start(s)
    if ('failure' in next) throw new Error(JSON.stringify(next.failure))
    expect(next.ok.execution).not.toBe(s.execution)
    expect(ok(await attach(s, 'wind-down', s.input.runtime.grant)).authority.instance).toBe(
      instance('wind-down'),
    )
  })
  it('an ended execution answers terminal before the Session check', async () => {
    const s = await scene('attach-ended')
    ok(await handed(s))
    await take(s)
    expect(ok(await end(s)).kind).toBe('ended')
    const root = s.view.controls.root()
    expect(await attach(s, 'late', null)).toMatchObject({ failure: { kind: 'terminal' } })
    expect(await attach(s, 'late-granted', s.input.runtime.grant)).toMatchObject({
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
    const loaded = await prepareEnd(s)
    const root = s.view.controls.root()
    expect(await end(s, 'end', loaded)).toEqual({
      ok: { kind: 'changed', revision: loaded.revision },
    })
    expect(s.view.controls.root()).toBe(root)
    expect(
      ok(await s.view.journal.load({ ...s.access, execution: s.execution })).state.kind,
    ).not.toBe('ended')
  })

  it('PA-02: on the cancelled Run a cancel end under a control that SE26 does not name is FinishResult.changed and writes nothing', async () => {
    const s = await scene('finish-cancel-other-control')
    ok(await handed(s))
    await take(s)
    ok(await cancel(s))
    ok(await attach(s, 'wind-down', s.input.runtime.grant))
    const ready = await windDown(s, operation('agent-only-cancel'))
    const root = s.view.controls.root()
    expect(await s.view.journal.tryFinish(cancelFinish(s, ready, 'other-end'))).toEqual({
      ok: { kind: 'changed', revision: ready.revision },
    })
    expect(s.view.controls.root()).toBe(root)
  })

  it('PA-02: on the cancelled Run a cancel end that presents the complete candidate fixed before the cancel does not end and writes nothing', async () => {
    const s = await scene('finish-cancel-complete')
    ok(await handed(s))
    await take(s)
    // The complete candidate is fixed and its list issued while the Run is active.
    const complete = await prepareEnd(s)
    if (complete.state.kind !== 'settling') throw new Error('settling expected')
    ok(await cancel(s))
    ok(await attach(s, 'wind-down', s.input.runtime.grant))
    const control = sessionCancelControl(s)
    await effective(s, control)
    const current = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    const root = s.view.controls.root()
    const answered = await s.view.journal.tryFinish({
      ...s.access,
      execution: s.execution,
      operation: operation('complete-end'),
      authorization: cancelAuthorization(current, control),
      expected: current.revision,
      intent: complete.state.intent,
    })
    expect(answered).toEqual({ ok: { kind: 'changed', revision: current.revision } })
    expect(s.view.controls.root()).toBe(root)
    expect(
      ok(await s.view.journal.load({ ...s.access, execution: s.execution })).state.kind,
    ).not.toBe('ended')
  })
})
