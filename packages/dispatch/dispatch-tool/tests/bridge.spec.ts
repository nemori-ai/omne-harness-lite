import { describe, expect, it } from 'vitest'
import type { PortRead } from '@omne-harness/dispatch'
import type { Dispatch, DispatchId } from '@omne-harness/dispatch-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolWaitId } from '@omne-harness/tool-contract'
import { acceptedDispatch } from '@omne-harness/dispatch/testing'
import { createReportBridge, reportWaitAnswer } from '../src/index.ts'
import {
  ACCESS,
  WAIT,
  accepted,
  duty,
  evidence,
  facts,
  operation,
  reported,
  waitRecord,
  type Facts,
} from './values.ts'

type Read = PortRead<Dispatch | null>

const outcomeOf = (text: string) =>
  ({
    state: 'reported',
    report: { text, origin: 'report' },
    delivery: { kind: 'pending' },
  }) as const

function world(
  start: Readonly<{ facts?: Facts; dispatch?: Dispatch | null | 'unavailable' }> = {},
) {
  const state = {
    facts: start.facts ?? facts(),
    dispatch: start.dispatch === undefined ? accepted : start.dispatch,
  }
  const closed: DispatchId[] = []
  const asked: DispatchId[] = []
  const bridge = createReportBridge({
    recoveryOf: () => Promise.resolve(succeed(state.facts)),
    dispatchOf: async (_tenant, id): Promise<Read> => {
      asked.push(id)
      return state.dispatch === 'unavailable'
        ? { kind: 'unavailable' }
        : { kind: 'read', value: state.dispatch }
    },
    waitClosed: (_tenant, id) => void closed.push(id),
  })
  return { state, closed, asked, bridge }
}

const ensure = (bridge: ReturnType<typeof world>['bridge'], text = 'ensure-1') =>
  bridge.ensure({ ...ACCESS, operation: operation(text), wait: WAIT, request: evidence('request') })
const inspect = (bridge: ReturnType<typeof world>['bridge']) =>
  bridge.inspect({ ...ACCESS, wait: WAIT })

const stranger = { owner: 'someone-else', name: 'report-wait', revision: '1', digest: 'sha256:x' }
const OTHER = 'op-c1/start/other' as ToolWaitId
const OWNER = '@omne-harness/dispatch-tool'
const invalid = (field: string, reason: string) => ({ kind: 'invalid', field, reason })
const NOT_A_REPORT_WAIT = invalid('wait', 'the wait is not a report wait of a dispatch')
const kept = (wait: ToolWaitId, request: string) => facts({ waitRequest: { wait, request } })
const REFUSALS: readonly (readonly [string, Parameters<typeof world>[0], object])[] = [
  [
    'a wait of another contract',
    { facts: facts({ waits: [waitRecord('open', stranger)] }) },
    NOT_A_REPORT_WAIT,
  ],
  [
    'a wait the call does not have, beside a report wait it has',
    { facts: facts({ waits: [waitRecord('open', undefined, OTHER)] }) },
    NOT_A_REPORT_WAIT,
  ],
  [
    'no kept request',
    { facts: facts({ waitRequest: null }) },
    invalid('request', 'the wait request is not kept'),
  ],
  [
    'a kept request of another wait',
    { facts: kept(OTHER, JSON.stringify({ dispatch: accepted.id })) },
    invalid('request', 'the wait request is not kept'),
  ],
  [
    'a kept request that names no dispatch',
    { facts: kept(WAIT, '{"dispatch":"x"}') },
    invalid('request', 'the kept request names no dispatch'),
  ],
  [
    'a dispatch that does not exist',
    { dispatch: null },
    invalid('request', 'the dispatch of the wait does not exist'),
  ],
  [
    'a dispatch of another call',
    { dispatch: { ...accepted, call: 'call-2' } },
    invalid('request', 'the dispatch of the wait is not of this call'),
  ],
  [
    'a registry that cannot be read',
    { dispatch: 'unavailable' },
    {
      kind: 'unavailable',
      dependency: OWNER,
      diagnostic: 'the dispatch of the wait cannot be read',
    },
  ],
]

describe('the bridge of the report wait', () => {
  it('registers the wait of a call on the dispatch of that call, and recalls one registration', async () => {
    const { bridge, asked } = world()
    const first = await ensure(bridge)
    expect(first).toMatchObject({ ok: { owner: '@omne-harness/dispatch-tool' } })
    expect(await ensure(bridge, 'ensure-2')).toEqual(first)
    expect(await inspect(bridge)).toMatchObject({ ok: { registration: 'ok' in first && first.ok } })
    expect(asked).toEqual([accepted.id, accepted.id, accepted.id])
  })

  it.each(REFUSALS)(
    'refuses %s at every step that reads the wait',
    async (_name, start, failure) => {
      const { bridge } = world(start)
      expect(await ensure(bridge)).toEqual({ failure })
      expect(await inspect(bridge)).toEqual({ failure })
      expect(await bridge.resolve({ ...ACCESS, wait: WAIT, decision: evidence('any') })).toEqual({
        failure,
      })
    },
  )

  it('hands on the failure of the read of the call', async () => {
    const failure = { kind: 'unavailable', dependency: 'ledger', diagnostic: 'down' } as const
    const bridge = createReportBridge({
      recoveryOf: () => Promise.resolve(fail(failure)),
      dispatchOf: () => Promise.reject(new Error('not asked')),
      waitClosed: () => undefined,
    })
    expect(await inspect(bridge)).toEqual({ failure })
  })

  it('answers that the registry is unavailable when the read of the dispatch throws', async () => {
    const bridge = createReportBridge({
      recoveryOf: () => Promise.resolve(succeed(facts())),
      dispatchOf: () => Promise.reject(new Error('down')),
      waitClosed: () => undefined,
    })
    expect(await inspect(bridge)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('shows no decision while the dispatch has no outcome', async () => {
    expect(await inspect(world().bridge)).toMatchObject({ ok: { decision: null } })
    const started = { ...accepted, state: 'started' as const }
    expect(await inspect(world({ dispatch: started }).bridge)).toMatchObject({
      ok: { decision: null },
    })
  })

  it.each([
    ['a report', reported],
    [
      'a failure',
      {
        ...accepted,
        state: 'failed',
        failure: { cause: 'run-failed', detail: 'it broke' },
        delivery: { kind: 'pending' },
      },
    ],
    [
      'a withdrawal',
      { ...accepted, state: 'withdrawn', stop: 'requested', delivery: { kind: 'pending' } },
    ],
    [
      'a handed-off session',
      { ...accepted, mode: 'handoff', state: 'handed-off', delivery: { kind: 'pending' } },
    ],
  ] as const)(
    'shows %s as the decision and resolves it to the outcome of the dispatch',
    async (_name, dispatch) => {
      const { bridge } = world({ dispatch: dispatch as Dispatch })
      const seen = await inspect(bridge)
      if (!('ok' in seen) || seen.ok.decision === null) throw new Error('no decision is shown')
      expect(await bridge.resolve({ ...ACCESS, wait: WAIT, decision: seen.ok.decision })).toEqual({
        ok: { kind: 'answer', value: reportWaitAnswer(dispatch as Dispatch) },
      })
      expect(await inspect(bridge)).toEqual(seen)
    },
  )

  it('refuses a decision that is not the outcome of the dispatch, and any decision before there is an outcome', async () => {
    const refused = { failure: { kind: 'invalid', field: 'decision' } }
    const { bridge, state } = world()
    const early = { ...ACCESS, wait: WAIT, decision: evidence('early') }
    expect(await bridge.resolve(early)).toMatchObject(refused)
    state.dispatch = reported
    expect(await bridge.resolve(early)).toMatchObject(refused)
  })

  it('answers the closing of a wait with one evidence, and tells the dispatch that its wait is closed', async () => {
    const { bridge, closed } = world({ facts: facts({ waits: [waitRecord('cancelled')] }) })
    const close = (text: string, cause: 'cancelled' | 'terminal' = 'cancelled') =>
      bridge.invalidate({
        ...ACCESS,
        operation: operation(text),
        wait: WAIT,
        terminal: evidence('terminal'),
        cause,
      })
    const first = await close('close-1')
    expect(first).toMatchObject({ ok: { owner: '@omne-harness/dispatch-tool' } })
    expect(await close('close-2')).toEqual(first)
    expect(await close('close-3', 'terminal')).not.toEqual(first)
    expect(closed).toEqual([accepted.id, accepted.id, accepted.id])
  })

  it('still answers the closing when the dispatch of the wait cannot be found or told', async () => {
    const lost = world({ facts: facts({ waitRequest: null }) })
    const closing = {
      ...ACCESS,
      operation: operation('close-1'),
      wait: WAIT,
      terminal: evidence('terminal'),
      cause: 'cancelled' as const,
    }
    expect(await lost.bridge.invalidate(closing)).toMatchObject({
      ok: { owner: '@omne-harness/dispatch-tool' },
    })
    expect(lost.closed).toEqual([])
    const throwing = createReportBridge({
      recoveryOf: () => Promise.reject(new Error('down')),
      dispatchOf: () => Promise.reject(new Error('down')),
      waitClosed: () => {
        throw new Error('down')
      },
    })
    expect(await throwing.invalidate(closing)).toEqual(await lost.bridge.invalidate(closing))
  })

  it('recalls an operation by the wait duty of the call that carries it', async () => {
    const registered = world({ facts: facts({ tasks: [duty('ensure-1', 'ensure')] }) })
    const registration = await ensure(registered.bridge)
    expect(
      await registered.bridge.inspectOperation({ ...ACCESS, operation: operation('ensure-1') }),
    ).toEqual({
      ok: {
        kind: 'committed',
        operation: 'ensure-1',
        receipt: 'ok' in registration && registration.ok,
      },
    })
    const closedFacts = facts({
      waits: [waitRecord('cancelled')],
      tasks: [duty('close-1', 'invalidate')],
    })
    const closing = world({ facts: closedFacts })
    const receipt = await closing.bridge.invalidate({
      ...ACCESS,
      operation: operation('close-1'),
      wait: WAIT,
      terminal: evidence('terminal'),
      cause: 'cancelled',
    })
    expect(
      await closing.bridge.inspectOperation({ ...ACCESS, operation: operation('close-1') }),
    ).toEqual({
      ok: { kind: 'committed', operation: 'close-1', receipt: 'ok' in receipt && receipt.ok },
    })
  })

  it('finds the wait among the waits of the call by its identity', async () => {
    const both = facts({ waits: [waitRecord('open', stranger, OTHER), waitRecord('open')] })
    expect(await inspect(world({ facts: both }).bridge)).toMatchObject({ ok: { decision: null } })
  })

  it('derives the registration from the dispatch, the call and the wait', async () => {
    const first = await ensure(world().bridge)
    if (!('ok' in first)) throw new Error('not registered')
    expect(first.ok).toMatchObject({
      owner: OWNER,
      record: `report-wait/${accepted.id}`,
      revision: '1',
    })
    expect(first.ok.digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    const another = acceptedDispatch(2, { call: ACCESS.call })
    const forAnother = world({
      dispatch: another,
      facts: kept(WAIT, JSON.stringify({ dispatch: another.id })),
    })
    const second = await ensure(forAnother.bridge)
    expect('ok' in second && second.ok.digest).not.toBe(first.ok.digest)
    expect('ok' in second && second.ok.record).toBe(`report-wait/${another.id}`)
  })

  it('does not take the outcome of another dispatch as the decision of this wait', async () => {
    const other = { ...acceptedDispatch(2, { call: ACCESS.call }), ...outcomeOf('done elsewhere') }
    const elsewhere = world({
      dispatch: other,
      facts: kept(WAIT, JSON.stringify({ dispatch: other.id })),
    })
    const shown = await inspect(elsewhere.bridge)
    if (!('ok' in shown) || shown.ok.decision === null) throw new Error('no decision is shown')
    expect(shown.ok.decision).toMatchObject({
      owner: OWNER,
      record: `dispatch-outcome/${other.id}`,
    })
    const here = world({ dispatch: reported })
    expect(
      await here.bridge.resolve({ ...ACCESS, wait: WAIT, decision: shown.ok.decision }),
    ).toEqual({
      failure: invalid('decision', 'the decision is not the outcome of the dispatch of the wait'),
    })
  })

  it('gives the closing of each wait of each call its own evidence', async () => {
    const { bridge } = world({ facts: facts({ waits: [waitRecord('cancelled')] }) })
    const close = (call: string, wait: ToolWaitId, terminal: string) =>
      bridge.invalidate({
        ...ACCESS,
        call: call as typeof ACCESS.call,
        operation: operation('close'),
        wait,
        terminal: evidence(terminal),
        cause: 'cancelled',
      })
    const answers = await Promise.all([
      close('call-1', WAIT, 'terminal'),
      close('call-2', WAIT, 'terminal'),
      close('call-1', OTHER, 'terminal'),
      close('call-1', WAIT, 'another-terminal'),
    ])
    const records = answers.map(answer => ('ok' in answer ? answer.ok.record : ''))
    expect(new Set(records).size).toBe(3)
    expect(records[0]).toMatch(/^report-wait-closed\/sha256:[0-9a-f]{64}$/u)
    expect(new Set(answers.map(answer => 'ok' in answer && answer.ok.digest)).size).toBe(4)
  })

  it('recalls the right duty among several tasks and waits of the call', async () => {
    const other = { ...duty('ensure-9', 'ensure'), wait: OTHER } as never
    const delivery = { kind: 'deliver', operation: operation('close-1') } as never
    const several = facts({
      waits: [waitRecord('open', stranger, OTHER), waitRecord('cancelled')],
      tasks: [delivery, other, duty('close-1', 'invalidate')],
    })
    const { bridge } = world({ facts: several })
    const receipt = await bridge.invalidate({
      ...ACCESS,
      operation: operation('close-1'),
      wait: WAIT,
      terminal: evidence('terminal'),
      cause: 'cancelled',
    })
    expect(await bridge.inspectOperation({ ...ACCESS, operation: operation('close-1') })).toEqual({
      ok: { kind: 'committed', operation: 'close-1', receipt: 'ok' in receipt && receipt.ok },
    })
  })

  it.each([
    ['an operation no wait duty carries', facts(), 'no wait duty of the call has the operation'],
    [
      'a registration whose dispatch cannot be read',
      facts({ waitRequest: null, tasks: [duty('op', 'ensure')] }),
      'the registration cannot be rebuilt: invalid',
    ],
    [
      'a closing of a wait that is still open',
      facts({ tasks: [duty('op', 'invalidate')] }),
      'the wait of the closing is not closed by a control or a terminal',
    ],
    [
      'a closing of a wait that was continued',
      facts({ waits: [waitRecord('continued')], tasks: [duty('op', 'invalidate')] }),
      'the wait of the closing is not closed by a control or a terminal',
    ],
    [
      'a closing of a wait the call does not have',
      facts({ waits: [], tasks: [duty('op', 'invalidate')] }),
      'the wait of the closing is not closed by a control or a terminal',
    ],
  ])('leaves %s unknown, and says why', async (_name, keptFacts, diagnostic) => {
    const { bridge } = world({ facts: keptFacts })
    expect(await bridge.inspectOperation({ ...ACCESS, operation: operation('op') })).toEqual({
      ok: { kind: 'unknown', operation: 'op', diagnostic },
    })
  })

  it('leaves an operation unknown when the call cannot be read', async () => {
    const bridge = createReportBridge({
      recoveryOf: () => Promise.resolve(fail({ kind: 'denied', action: 'recover' })),
      dispatchOf: () => Promise.reject(new Error('not asked')),
      waitClosed: () => undefined,
    })
    expect(await bridge.inspectOperation({ ...ACCESS, operation: operation('op') })).toEqual({
      ok: { kind: 'unknown', operation: 'op', diagnostic: 'the call cannot be read: denied' },
    })
  })
})
