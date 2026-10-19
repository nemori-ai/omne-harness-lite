// A caller that has no Session, Run or Agent: it fixes a request, admits it under its own call and
// operation, then looks it up, observes it, cancels it, reads its result and acknowledges it. It
// imports only the public contract and the scripted provider that stands for whatever serves it.
import type { DispatchRecord, Observation } from '@omne-harness/model-contract'
import {
  access,
  admission,
  alice,
  bob,
  call,
  callRef,
  dispatch,
  evidence,
  expect,
  failureOf,
  must,
  newWorld,
  operation,
  startedDispatch,
  tenantA,
  textBlock,
  textsOf,
  version,
  type World,
} from './values.ts'

type Path = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  decision?: string
  run: () => Promise<void>
}>

const completed = { kind: 'completed', reason: 'stop' } as const

/** The cancel that `principal` sends for the call `name` under the operation `label`. */
const cancelOf = (name: string, label: string, principal = alice) => ({
  ...access(name, principal),
  operation: operation(label),
})

/** The cost that the supplier reported after the call had already been cancelled. */
const lateAccount: NonNullable<DispatchRecord['account']> = {
  subject: { kind: 'model_call', id: 'mcall_late' },
  usage: [{ name: 'input-tokens', state: 'known', lexeme: '12', unit: 'tokens' }],
  cost: [{ state: 'known', lexeme: '0.01', unit: 'USD', source: 'supplier' }],
  trimmed: { state: 'known', lexeme: '0', unit: 'tokens' },
  place: 'late',
  duration: { state: 'unknown' },
  receipt: 'late',
  revision: '1',
}

function settleWithThreeBlocks(world: World, name: string): void {
  world.controller.settle({
    ...callRef(name),
    version: version(name),
    termination: completed,
    parts: [textBlock('b1', 'one'), textBlock('b2', 'two'), textBlock('b3', 'three')].map(
      block => ({ kind: 'sealed' as const, block, trims: [] }),
    ),
    source: evidence(`settlement-${name}`),
    pageSize: 2,
    pageTargetBytes: 1024,
  })
}

async function nextObservation(iterator: AsyncIterator<Observation>): Promise<Observation> {
  const step = await iterator.next()
  expect(step.done !== true, 'the observation ended without an ending')
  return step.value
}

async function admitsAndRecognisesTheRepeat(): Promise<void> {
  const world = newWorld()
  const first = await world.admit('a')
  expect(first.call === call('a'), 'the admission names another call')
  expect(!first.recovered, 'a first admission was reported as recovered')
  const again = await world.admit('a')
  expect(again.recovered && again.call === first.call, 'the repeat was not recognised')
  const state = await world.state('a')
  expect(state.phase === 'accepted', `the admitted call is ${state.phase}`)
  expect(state.custody.kind === 'producer', 'the result is already in the hands of a consumer')
  expect(state.control.kind === 'none', 'a fresh call already has a control')
}

async function observesUntilSettlement(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  const route = must(await world.instances.connect(access('a')))
  expect(route.kind === 'live', 'an admitted call has no live route')
  const abort = new AbortController()
  const iterator = route.handle
    .observe({ principal: alice, tenant: tenantA, signal: abort.signal })
    [Symbol.asyncIterator]()
  try {
    const first = await nextObservation(iterator)
    expect(first.kind === 'snapshot', `the observation opened with ${first.kind}`)
    world.controller.start({
      ...callRef('a'),
      dispatch: dispatch('first'),
      firstContent: 'none-proven',
    })
    const running = await nextObservation(iterator)
    expect(
      running.kind === 'changed' && running.value.state.phase === 'running',
      'no running change',
    )
    settleWithThreeBlocks(world, 'a')
    const settled = await nextObservation(iterator)
    expect(
      settled.kind === 'changed' && settled.value.state.phase === 'settled',
      'no settled change',
    )
    abort.abort()
    const ending = await nextObservation(iterator)
    expect(ending.kind === 'ended' && ending.reason === 'observer-closed', 'the stop was not ended')
  } finally {
    await iterator.return?.()
  }
  expect((await world.state('a')).phase === 'settled', 'stopping the observation stopped the call')
}

async function readsAndAcknowledges(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  settleWithThreeBlocks(world, 'a')
  const settled = await world.state('a')
  expect(settled.phase === 'settled', 'the call did not settle')
  const started = must(
    await world.consumption.beginRead({
      ...access('a'),
      operation: operation('read-a'),
      result: settled.settlement.version,
    }),
  )
  expect(started.kind === 'started' && started.value.kind === 'reading', 'the read did not start')
  const first = started.value.page
  expect(textsOf(first.parts).join() === 'one,two' && first.next === '2', 'the first page differs')
  const second = must(
    await world.consumption.readNext({ ...access('a'), read: started.read, after: '2' }),
  )
  expect(second.kind === 'reading' && textsOf(second.page.parts).join() === 'three', 'second page')
  const closed = must(await world.consumption.closeRead({ ...access('a'), read: started.read }))
  expect(closed.kind === 'ended' && closed.reason === 'complete', 'the read did not complete')
  const receipt = must(
    await world.consumption.acknowledge({
      ...access('a'),
      operation: operation('ack-a'),
      result: settled.settlement.version,
      evidence: { kind: 'processed', completion: evidence('processed') },
    }),
  )
  expect(receipt.custody.kind === 'acknowledged', 'the acknowledgement left the custody unchanged')
  expect(
    (await world.state('a')).custody.kind === 'acknowledged',
    'the call does not show the receipt',
  )
}

async function cancelIsARequestAndStopComesLater(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  const control = must(await world.calls.cancel(cancelOf('a', 'cancel-1')))
  expect(control.kind === 'requested', 'the cancel was not accepted as a request')
  expect(control.operation === operation('cancel-1'), 'the control names another operation')
  expect(
    control.upstream === 'unknown',
    `the reply already says the upstream is ${control.upstream}`,
  )
  const requested = await world.state('a')
  expect(requested.phase === 'accepted', 'asking for the stop has already ended the call')
  expect(requested.custody.kind === 'producer', 'a cancel acknowledged the result')
  world.controller.advanceControl({ ...callRef('a'), propagation: 'sent', upstream: 'stopped' })
  const stopped = (await world.state('a')).control
  expect(stopped.kind === 'requested' && stopped.upstream === 'stopped', 'the stop never showed')
  expect(stopped.operation === operation('cancel-1'), 'the stop belongs to another control')
}

async function repeatedCancelReturnsTheFirstControl(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  const first = must(await world.calls.cancel(cancelOf('a', 'cancel-1')))
  const second = must(await world.calls.cancel(cancelOf('a', 'cancel-2')))
  expect(second.kind === 'requested', 'the second cancel left no control')
  expect(second.operation === operation('cancel-1'), 'the second cancel replaced the first control')
  expect(JSON.stringify(second) === JSON.stringify(first), 'the second cancel changed the control')
}

async function unavailablePropagationStaysARequest(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  must(await world.calls.cancel(cancelOf('a', 'cancel-1')))
  world.controller.advanceControl({
    ...callRef('a'),
    propagation: 'unavailable',
    upstream: 'unknown',
  })
  const state = await world.state('a')
  expect(state.control.kind === 'requested', 'the control disappeared')
  expect(state.control.propagation === 'unavailable', 'the propagation was not shown')
  expect(state.control.upstream === 'unknown', 'a cancel that did not travel claims a stop')
  expect(state.phase === 'accepted', `an unreachable upstream made the call ${state.phase}`)
}

async function lateResultAndCostStayWithTheCall(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  must(await world.calls.cancel(cancelOf('a', 'cancel-1')))
  world.controller.advanceControl({ ...callRef('a'), propagation: 'sent', upstream: 'unknown' })
  world.controller.recordDispatch({ ...callRef('a'), record: startedDispatch })
  settleWithThreeBlocks(world, 'a')
  world.controller.recordDispatch({
    ...callRef('a'),
    record: { ...startedDispatch, terminal: completed, account: lateAccount },
  })
  const state = await world.state('a')
  expect(state.phase === 'settled', 'the late result was dropped')
  expect(state.settlement.termination.kind === 'completed', 'the late result became another ending')
  expect(state.control.kind === 'requested', 'the late result erased the control')
  expect(state.custody.kind === 'producer', 'the late result was acknowledged by the cancel')
  const records = must(await world.calls.dispatches(access('a')))
  expect(records.length === 1 && records[0]?.terminal?.kind === 'completed', 'dispatch not kept')
  expect(records[0]?.account?.receipt === 'late', 'the late cost was not kept')
  expect(records[0]?.account?.cost[0]?.state === 'known', 'the cost lost its amount')
}

async function cancelLeavesAnotherCallAlone(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  await world.admit('b')
  must(await world.calls.cancel(cancelOf('a', 'cancel-a')))
  const other = await world.state('b')
  expect(other.control.kind === 'none', 'the cancel reached the other call')
  expect(other.phase === 'accepted', `the other call is ${other.phase}`)
  expect(other.custody.kind === 'producer', 'the other call changed hands')
}

// docs/public-api.md `unauthorised-cancel-denied` and SPEC.md ("控制、取消与晚到事实": Model checks the
// control right of the principal): a principal without the right gets `denied` and the call shows no
// control. The page leaves the `action` text open, so only the kind is checked.
async function deniedCancelWidensNothing(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  world.controller.revokeAccess({ ...callRef('a'), principal: bob, actions: ['cancel'] })
  const refusal = failureOf(await world.calls.cancel(cancelOf('a', 'cancel-bob', bob)))
  expect(refusal.kind === 'denied', `the cancel was refused as ${refusal.kind}`)
  expect((await world.state('a')).control.kind === 'none', 'the refused cancel left a control')
  const owner = must(await world.calls.cancel(cancelOf('a', 'cancel-alice')))
  expect(owner.kind === 'requested' && owner.operation === operation('cancel-alice'), 'not its own')
}

// docs/context.md ("admit commit-unknown: 查询原 operation") and SPEC.md admit row ("未知只查询原
// operation"): the caller looks the original admission up and repeats the same call and operation;
// no second call appears. The world records every admission the caller sends, and a call enters
// the tenant no other way, so the record shows whether another call or admission appeared.
async function unknownAdmissionIsLookedUpNotResent(): Promise<void> {
  const world = newWorld()
  world.controller.commitUnknown({
    tenant: tenantA,
    action: 'admit',
    operation: operation('admit-a'),
    effect: 'applied',
    query: 'answers',
  })
  const unknown = failureOf(await world.calls.admit(admission('a')))
  expect(unknown.kind === 'commit-unknown', 'the admission did not end unknown')
  expect(unknown.operation === operation('admit-a'), 'the unknown answer names another operation')
  const found = must(await world.calls.inspect({ ...access('a'), admission: operation('admit-a') }))
  expect(found.kind === 'found', 'the original admission cannot be found')
  expect(found.state.call === call('a'), 'the lookup found another call')
  const again = await world.admit('a')
  expect(again.recovered && again.call === call('a'), 'the same operation was taken for a new call')
  expect((await world.state('a')).revision === found.state.revision, 'the repeat changed the call')
  const sent = world.admissions()
  const others = sent.filter(
    item => item.call !== call('a') || item.operation !== operation('admit-a'),
  )
  expect(others.length === 0, `the caller admitted ${others.length} other calls or operations`)
  const accepted = sent.filter(item => item.accepted).length
  expect(accepted === 1, `${accepted} admissions were accepted instead of the one repeat`)
}

export const fixture = {
  role: 'independent-caller',
  paths: [
    {
      name: 'admits a fixed request under its own call and operation and recognises the repeat',
      kind: 'normal',
      run: admitsAndRecognisesTheRepeat,
    },
    {
      name: 'observes the call from the live route until it settles',
      kind: 'normal',
      run: observesUntilSettlement,
    },
    {
      name: 'reads the settled result page by page and acknowledges it with processed evidence',
      kind: 'normal',
      run: readsAndAcknowledges,
    },
    {
      name: 'a cancel is accepted as a request and the upstream stop is a later fact',
      kind: 'normal',
      run: cancelIsARequestAndStopComesLater,
    },
    {
      name: 'a repeated cancel under another operation returns the first control',
      kind: 'normal',
      run: repeatedCancelReturnsTheFirstControl,
    },
    {
      name: 'a cancel that cannot travel stays a request and does not fail the call',
      kind: 'normal',
      run: unavailablePropagationStaysARequest,
    },
    {
      name: 'a result and its cost that arrive after the cancel stay with the call',
      kind: 'normal',
      run: lateResultAndCostStayWithTheCall,
    },
    {
      name: 'a cancel of one call leaves another call alone',
      kind: 'normal',
      run: cancelLeavesAnotherCallAlone,
    },
    {
      name: 'a cancel from a principal without the right is refused and widens nothing',
      kind: 'failure',
      decision:
        'the caller does not treat the call as cancelled: the refused cancel leaves no control, and the owner can still cancel',
      run: deniedCancelWidensNothing,
    },
    {
      name: 'an admission whose answer is unknown is looked up under its own operation',
      kind: 'failure',
      decision: 'the caller inspects the original admission and does not admit a second call',
      run: unknownAdmissionIsLookedUpNotResent,
    },
  ],
} satisfies { role: string; paths: readonly Path[] }
