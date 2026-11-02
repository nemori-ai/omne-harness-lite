import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
} from '@omne-harness/stream-arrival'
import { createToolRuntimeFacade } from '@omne-harness/tool'
import {
  decodeToolInstanceId,
  toolStreamCallCodec,
  type ToolDirectory,
  type ToolHandle,
} from '@omne-harness/tool-contract/provider'
import { dummyRequest, ok, principalA, tenantA, type Principal } from './runtime-values.ts'
import { testAssembly } from './testing-values.ts'
import { createTestStreamSource, type Frame } from './stream-source.ts'

type Route = Awaited<ReturnType<ToolDirectory<Principal>['connect']>>
const access = { principal: principalA, tenant: tenantA }
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

async function world(beforeStateRead: () => Promise<void> = async () => {}) {
  const base = testAssembly()
  let route: () => Promise<Route> = async () => succeed({ kind: 'no-live-route' })
  const runtime = createToolRuntimeFacade(
    {
      ...base.dependencies,
      reads: {
        ...base.dependencies.reads,
        lookup: async input => {
          await beforeStateRead()
          return base.dependencies.reads.lookup(input)
        },
      },
      instances: { ...base.dependencies.instances, directory: { connect: () => route() } },
    },
    base.configuration,
  )
  const call = await runtime.invoke({ ...access, request: dummyRequest() })
  if (call.kind !== 'accepted') throw new Error('The observation fixture was not admitted.')
  const stream = ok(decodeStreamId('str_order'))
  const ref = ok(
    encodeStreamRef(
      { tenant: tenantA, producer: 'tool', call: call.reference, stream },
      toolStreamCallCodec,
    ),
  )
  const snapshot: Extract<Frame, { kind: 'snapshot' }> = {
    kind: 'snapshot',
    cursor: ok(encodeStreamCursor({ ref, position: ok(decodeStreamPosition('0')) })),
    value: { state: call.state, process: [], foreground: null },
  }
  const source = createTestStreamSource<Principal>({ stream, ref, initial: snapshot.value })
  const handle: ToolHandle<Principal> = {
    instance: ok(decodeToolInstanceId('observer-order')),
    generation: '1',
    stream,
    observation: source.observation,
  }
  const live: Route = succeed({ kind: 'live', handle })
  route = async () => live
  return {
    base,
    runtime,
    call,
    handle,
    source,
    live,
    snapshot,
    route(value: Route | (() => Promise<Route>)) {
      route = typeof value === 'function' ? value : async () => value
    },
    replaceSource(observation: ToolHandle<Principal>['observation']) {
      route = async () => succeed({ kind: 'live', handle: { ...handle, observation } })
    },
    observe: (signal: AbortSignal) =>
      runtime.observation.observe({ ref, access, signal })[Symbol.asyncIterator](),
  }
}

it.each(['denied', 'unavailable', 'stale-stream'] as const)(
  'preserves the source %s end when abort arrives with that end',
  async reason => {
    const w = await world()
    const controller = new AbortController()
    let pulled = 0
    let returns = 0
    w.replaceSource({
      observe: () => ({
        [Symbol.asyncIterator]: () => ({
          async next(): Promise<IteratorResult<Frame>> {
            if (pulled++ === 0) return { done: false, value: w.snapshot }
            controller.abort()
            return { done: false, value: { kind: 'ended', reason } }
          },
          async return() {
            returns += 1
            return { done: true, value: undefined }
          },
        }),
      }),
    })
    const iterator = w.observe(controller.signal)
    await iterator.next()
    expect(await iterator.next()).toEqual({ done: false, value: { kind: 'ended', reason } })
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    expect(returns).toBe(1)
  },
)

it.each(['denied', 'unavailable'] as const)(
  'finishes the current permission check before publishing an aborted %s frame',
  async reason => {
    const w = await world()
    const controller = new AbortController()
    const iterator = w.observe(controller.signal)
    await iterator.next()
    const permission = Promise.withResolvers<Route>()
    w.route(() => permission.promise)
    w.source.confirm({ state: w.snapshot.value.state, blocks: [] }, w.snapshot.value)
    let settled = false
    const next = iterator.next().then(value => {
      settled = true
      return value
    })
    await tick()
    controller.abort()
    await tick()
    expect(settled).toBe(false)
    permission.resolve(
      reason === 'denied'
        ? fail({ kind: 'denied', action: 'connect' })
        : fail({
            kind: 'unavailable',
            dependency: 'toolInstances',
            diagnostic: 'frozen unavailable',
          }),
    )
    expect(await next).toEqual({ done: false, value: { kind: 'ended', reason } })
    expect(w.source.subscribers()).toBe(0)
  },
)

it('return resolves a pending source next immediately and leaves business records unchanged', async () => {
  const w = await world()
  const commits = w.base.store.commits
  const iterator = w.observe(new AbortController().signal)
  await iterator.next()
  const next = iterator.next()
  await tick()
  expect(w.source.subscribers()).toBe(1)
  expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
  expect(await next).toEqual({ done: true, value: undefined })
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
  expect(w.source.subscribers()).toBe(0)
  expect(w.base.store.commits).toBe(commits)
})

it('return detaches during routing and never contacts a handle that arrives later', async () => {
  const w = await world()
  const route = Promise.withResolvers<Route>()
  w.route(() => route.promise)
  const iterator = w.observe(new AbortController().signal)
  const next = iterator.next()
  await tick()
  expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
  expect(await next).toEqual({ done: true, value: undefined })
  route.resolve(w.live)
  await tick()
  expect(w.source.observed).toEqual([])
})

it('return resolves pending next even while final permission is still unanswered', async () => {
  const w = await world()
  const iterator = w.observe(new AbortController().signal)
  await iterator.next()
  const permission = Promise.withResolvers<Route>()
  w.route(() => permission.promise)
  w.source.confirm({ state: w.snapshot.value.state, blocks: [] }, w.snapshot.value)
  const pending = iterator.next()
  await tick()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
    const result = await Promise.race([
      pending,
      new Promise<'still-pending'>(resolve => {
        timer = setTimeout(() => resolve('still-pending'), 1000)
      }),
    ])
    expect(result).toEqual({ done: true, value: undefined })
    expect(w.source.subscribers()).toBe(0)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    permission.resolve(w.live)
  }
})

it('current refuses a publication that retires while its authoritative state is being read', async () => {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  let hold = false
  const w = await world(async () => {
    if (hold) {
      entered.resolve()
      await released.promise
    }
  })
  hold = true
  const selection = w.runtime.instances.current({ access, reference: w.call.reference })
  await entered.promise
  w.route(succeed({ kind: 'no-live-route' }))
  released.resolve()
  expect(await selection).toEqual({
    failure: { kind: 'stale-instance', instance: w.handle.instance },
  })
})
