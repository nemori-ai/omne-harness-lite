// A coordinator that owns none of the calls it controls: every request carries its own principal,
// tenant, call and operation. It cancels a call, finds that the instance of a call is gone, and
// carries on with the original call instead of replacing it. It imports only the public contract
// and the scripted provider that stands for whatever serves the calls.
import type { ModelHandle, Observation } from '@omne-harness/model-contract'
import {
  access,
  admission,
  call,
  callRef,
  coordinator,
  expect,
  failureOf,
  instance,
  must,
  newWorld,
  operation,
  tenantA,
  tenantB,
  type Principal,
} from './values.ts'

type Path = Readonly<{
  name: string
  kind: 'normal' | 'failure'
  decision?: string
  run: () => Promise<void>
}>

const cancelOf = (name: string, label: string) => ({
  ...access(name),
  operation: operation(label),
})

/** The first thing that an observer of the call is shown, and the end of the observation. */
async function firstObservation(handle: ModelHandle<Principal>): Promise<Observation> {
  const abort = new AbortController()
  const iterator = handle
    .observe({ principal: coordinator, tenant: tenantA, signal: abort.signal })
    [Symbol.asyncIterator]()
  try {
    const step = await iterator.next()
    expect(step.done !== true, 'the observation ended without an ending')
    return step.value
  } finally {
    abort.abort()
    await iterator.return?.()
  }
}

async function cancelsUnderTheExplicitIdentity(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  const control = must(await world.calls.cancel(cancelOf('a', 'cancel-1')))
  expect(control.kind === 'requested', 'the cancel was not accepted')
  expect(control.operation === operation('cancel-1'), 'the control names another operation')
  expect(control.upstream === 'unknown', 'the cancel was reported as an upstream stop')
  const state = await world.state('a')
  expect(state.control.kind === 'requested', 'the call shows no control')
  expect(state.phase === 'accepted', 'asking for a stop ended the call')
}

async function noLiveRouteLeavesTheCallAccepted(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  world.controller.withdrawInstance(callRef('a'))
  const route = must(await world.instances.connect(access('a')))
  expect(route.kind === 'no-live-route', `connect answered ${route.kind}`)
  const state = await world.state('a')
  expect(state.call === call('a'), 'the lookup found another call')
  expect(state.phase === 'accepted', `the call is ${state.phase} after its instance left`)
  expect(state.control.kind === 'none', 'withdrawing the instance cancelled the call')
  expect(state.custody.kind === 'producer', 'withdrawing the instance moved the result')
}

async function callContinuesOnTheInstanceThatTheHostBringsUp(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  world.controller.withdrawInstance(callRef('a'))
  world.controller.replaceInstance({ ...callRef('a'), instance: instance('two') })
  const route = must(await world.instances.connect(access('a')))
  expect(route.kind === 'live', 'the call has no live route on the new instance')
  expect(route.handle.instance === instance('two'), 'the route names another instance')
  const first = await firstObservation(route.handle)
  expect(first.kind === 'snapshot', `the new route opened with ${first.kind}`)
  expect(first.value.call === call('a'), 'the new route shows another call')
  expect(first.value.state.control.kind === 'none', 'the move cancelled the call')
}

async function cancelReachesACallWithoutALiveRoute(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  world.controller.withdrawInstance(callRef('a'))
  const control = must(await world.calls.cancel(cancelOf('a', 'cancel-1')))
  expect(control.kind === 'requested', 'a call without a route cannot be cancelled')
  expect((await world.state('a')).control.kind === 'requested', 'the control was not kept')
}

// SPEC.md cancel row and docs/object-model.md (ModelCalls.cancel, "未知"): an unknown reply is
// answered by sending the same operation again, which recovers the original control.
async function unknownCancelReplyIsSentAgainUnderTheSameOperation(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  await world.admit('b')
  for (const [name, effect] of [
    ['a', 'applied'],
    ['b', 'dropped'],
  ] as const) {
    world.controller.commitUnknown({
      tenant: tenantA,
      action: 'cancel',
      operation: operation(`cancel-${name}`),
      effect,
      query: 'answers',
    })
    const unknown = failureOf(await world.calls.cancel(cancelOf(name, `cancel-${name}`)))
    expect(unknown.kind === 'commit-unknown', `the cancel of ${name} did not end unknown`)
    const resent = must(await world.calls.cancel(cancelOf(name, `cancel-${name}`)))
    expect(resent.kind === 'requested', `the resent cancel of ${name} left no control`)
    expect(resent.operation === operation(`cancel-${name}`), `${name} got another control`)
    const another = must(await world.calls.cancel(cancelOf(name, `cancel-${name}-again`)))
    expect(
      another.kind === 'requested' && another.operation === operation(`cancel-${name}`),
      `a new operation made a second control for ${name}`,
    )
  }
}

// SPEC.md connect row ("失去目录依赖为 unavailable，不能变 not-accepted") and docs/object-model.md
// (ModelDirectory.connect, "no-live-route 不表示没有调用"): an unreachable directory is a failure to
// look, not an answer that no live route exists, and the call stays where it was.
async function unreachableDirectoryIsNotAMissingRoute(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  world.controller.failDirectory()
  const failure = failureOf(await world.instances.connect(access('a')))
  expect(failure.kind === 'unavailable', `the unreachable directory answered ${failure.kind}`)
  expect((await world.state('a')).phase === 'accepted', 'the lookup lost the call')
}

// docs/public-api.md `refusal-hides-existence` and SPEC.md (cross-tenant access is refused): the
// refusal for another tenant equals the refusal for a call that does not exist. No kind is pinned,
// so only the equality of the two refusals and the untouched call are checked.
async function otherTenantIsRefusedAsForAMissingCall(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  const other = failureOf(
    await world.calls.cancel({ ...access('a', tenantB), operation: operation('cancel-1') }),
  )
  const missing = failureOf(await world.calls.cancel(cancelOf('missing', 'cancel-2')))
  expect(JSON.stringify(other) === JSON.stringify(missing), 'the refusal tells the call exists')
  expect((await world.state('a')).control.kind === 'none', 'the refused cancel left a control')
}

// docs/object-model.md (ModelDirectory.connect: "改用 inspect 查原调用") and docs/context.md
// ("admit 成功、目录 no-live-route": 消费者不创建替代调用): after the route is lost the caller looks at
// the original call and repeats its original admission; no other admission exists. The world
// records every admission the coordinator sends, and a call enters the tenant no other way, so
// the record shows whether a replacement call or admission appeared.
async function lostRouteIsFollowedByInspectNotByAReplacement(): Promise<void> {
  const world = newWorld()
  await world.admit('a')
  world.controller.withdrawInstance(callRef('a'))
  const before = await world.state('a')
  const again = must(await world.calls.admit(admission('a')))
  expect(again.recovered && again.call === call('a'), 'the same admission made another call')
  const after = await world.state('a')
  expect(after.revision === before.revision, 'the repeated admission changed the call')
  const sent = world.admissions()
  const replacements = sent.filter(
    item => item.call !== call('a') || item.operation !== operation('admit-a'),
  )
  expect(replacements.length === 0, `${replacements.length} replacement admissions were sent`)
  expect(sent.length === 2 && sent.every(item => item.accepted), 'an admission of a was refused')
}

export const fixture = {
  role: 'session-coordinator',
  paths: [
    {
      name: 'cancels a call with the principal, tenant, call and operation spelled out',
      kind: 'normal',
      run: cancelsUnderTheExplicitIdentity,
    },
    {
      name: 'a call whose instance left has no live route and stays the same accepted call',
      kind: 'normal',
      run: noLiveRouteLeavesTheCallAccepted,
    },
    {
      name: 'the call continues on the instance that the host brings up',
      kind: 'normal',
      run: callContinuesOnTheInstanceThatTheHostBringsUp,
    },
    {
      name: 'a cancel reaches a call that has no live route',
      kind: 'normal',
      run: cancelReachesACallWithoutALiveRoute,
    },
    {
      name: 'a cancel whose reply is unknown is sent again under the same operation',
      kind: 'failure',
      decision:
        'the coordinator repeats the same cancel operation and never creates another control',
      run: unknownCancelReplyIsSentAgainUnderTheSameOperation,
    },
    {
      name: 'a directory that cannot be reached is not a missing route',
      kind: 'failure',
      decision:
        'the coordinator does not conclude that the call has no live route and keeps the call that it admitted',
      run: unreachableDirectoryIsNotAMissingRoute,
    },
    {
      name: 'a cancel under another tenant is refused exactly as for a call that does not exist',
      kind: 'failure',
      decision:
        'the coordinator leaves the call alone and does not infer from the refusal whether it exists',
      run: otherTenantIsRefusedAsForAMissingCall,
    },
    {
      name: 'a lost route is followed by a look at the original call and never by a replacement',
      kind: 'failure',
      decision:
        'the coordinator inspects the original call and repeats its original admission instead of admitting another call',
      run: lostRouteIsFollowedByInspectNotByAReplacement,
    },
  ],
} satisfies { role: string; paths: readonly Path[] }
