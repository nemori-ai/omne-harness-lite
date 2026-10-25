// The observation facade on the public stream protocol (tool-contract SPEC「公共流协议上的观察」):
// `instances.current` and `observation.observe` of the runtime, routed through a directory double
// to the controlled publisher of stream-source.ts. The cases follow the SPEC's verification
// obligations: every Tool situation in the public failure order, the two Tool-owned end values,
// snapshot before subscription, a terminal gap, abort, the four cases of an old generation's
// terminal frame, and every row of the `current` table.
import { describe, expect, it } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeStreamId,
  encodeStreamRef,
  readStreamRef,
  type StreamId,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { createToolRuntime } from '@omne-harness/tool'
import {
  type ToolFailure,
  type ToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  toolStreamCallCodec,
  type ToolDirectory,
  type ToolHandle,
} from '@omne-harness/tool-contract/provider'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { testAssembly } from './testing-values.ts'
import {
  dummyRequest,
  ok,
  principalA,
  tenantA,
  tenantB,
  text,
  type Principal,
} from './runtime-values.ts'
import { createTestStreamSource, type Frame } from './stream-source.ts'

type Route = Awaited<ReturnType<ToolDirectory<Principal>['connect']>>

const access = { principal: principalA, tenant: tenantA }
const signal = () => new AbortController().signal

function accepted(outcome: ToolInvokeOutcome) {
  if (outcome.kind !== 'accepted') throw new Error(JSON.stringify(outcome))
  return outcome
}

function streamId(text: string): StreamId {
  return ok(decodeStreamId(text))
}

function refOf(reference: ToolInvocationRef, stream: StreamId): StreamRef {
  return ok(
    encodeStreamRef(
      { tenant: tenantA, producer: 'tool', call: reference, stream },
      toolStreamCallCodec,
    ),
  )
}

/** A publication generation of a call: its handle and the publisher behind it. */
function generation(
  reference: ToolInvocationRef,
  name: string,
  state: ToolState,
  limits: { queuedFrames?: number; snapshotBytes?: number } = {},
) {
  const stream = streamId(`str_${name}`)
  const ref = refOf(reference, stream)
  const source = createTestStreamSource<Principal>({
    stream,
    ref,
    initial: { state, process: [], foreground: null },
    ...limits,
  })
  const handle: ToolHandle<Principal> = {
    instance: ok(decodeToolInstanceId(`instance-${name}`)),
    generation: name,
    stream,
    observation: source.observation,
  }
  return { handle, source, ref, stream }
}

const live = (handle: ToolHandle<Principal>): Route => succeed({ kind: 'live', handle })
const noRoute: Route = succeed({ kind: 'no-live-route' })

/**
 * A runtime over the test assembly whose directory answers the last entry of `routes` at the time
 * of the call; the test pushes routes after it has invoked and knows the call's reference.
 */
function world(initial: readonly Route[] = [noRoute]) {
  const base = testAssembly()
  /** `'throw'` makes the directory reject, as a provider exception does. */
  const routes: (Route | 'throw')[] = [...initial]
  const connects: unknown[] = []
  let controls = 0
  const runtime = createToolRuntime(
    {
      ...base.dependencies,
      commands: {
        ...base.dependencies.commands,
        control: input => {
          controls += 1
          return base.dependencies.commands.control(input)
        },
      },
      instances: {
        ...base.dependencies.instances,
        directory: {
          connect: input => {
            connects.push(input)
            const answer = routes.at(-1)
            if (answer === undefined) throw new Error('no route scripted')
            if (answer === 'throw') return Promise.reject(new Error('directory exploded'))
            return Promise.resolve(answer)
          },
        },
      },
    },
    base.configuration,
  ).runtime
  return {
    base,
    runtime,
    routes,
    connects,
    controls: () => controls,
    async invoke() {
      return accepted(await runtime.invoke({ ...access, request: dummyRequest() }))
    },
  }
}

async function take(iterable: AsyncIterable<Frame>, count: number): Promise<Frame[]> {
  const seen: Frame[] = []
  const iterator = iterable[Symbol.asyncIterator]()
  while (seen.length < count) {
    const next = await iterator.next()
    if (next.done) break
    seen.push(next.value)
  }
  return seen
}

async function drain(iterable: AsyncIterable<Frame>): Promise<Frame[]> {
  const seen: Frame[] = []
  for await (const frame of iterable) seen.push(frame)
  return seen
}

const endedWith = (reason: string): Frame[] => [{ kind: 'ended', reason } as Frame]

describe('instances.current (SPEC「current 的回复」)', () => {
  it('answers denied for a foreign tenant and invalid for a malformed reference, without the directory', async () => {
    const w = world()
    const call = await w.invoke()
    expect(
      await w.runtime.instances.current({
        access: { principal: principalA, tenant: tenantB },
        reference: call.reference,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'connect' } })
    expect(
      await w.runtime.instances.current({ access, reference: '[]' as ToolInvocationRef }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'reference' } })
    expect(w.connects).toEqual([])
  })

  it.each([
    fail({ kind: 'unavailable' as const, dependency: 'toolInstances', diagnostic: 'offline' }),
    fail({ kind: 'unsupported' as const, adoption: dummyRequest().settings, reason: 'directory' }),
  ])('passes the directory answer %j through, never as current: null', async answer => {
    const w = world([answer as Route])
    const call = await w.invoke()
    expect(await w.runtime.instances.current({ access, reference: call.reference })).toEqual(answer)
  })

  it('answers current: null with the authoritative state when the directory has no live route', async () => {
    const w = world()
    const call = await w.invoke()
    const selection = ok(await w.runtime.instances.current({ access, reference: call.reference }))
    expect(selection.current).toBeNull()
    const looked = ok(await w.runtime.queries.lookup({ ...access, reference: call.reference }))
    expect(looked.kind === 'found' && looked.state).toEqual(selection.state)
  })

  it('answers the public reference, instance, generation and projection of the current generation', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const selection = ok(await w.runtime.instances.current({ access, reference: call.reference }))
    expect(selection.current).toEqual({
      ref: g1.ref,
      instance: g1.handle.instance,
      generation: 'g1',
      projection: 'tool-process-v1',
    })
    expect(readStreamRef(g1.ref)).toEqual({
      producer: 'tool',
      call: call.reference,
      stream: g1.stream,
    })
    expect(selection.state).toEqual(call.state)
  })

  it('answers the failure of the state read instead of the directory answer', async () => {
    const base = testAssembly()
    const unreadable: Outcome<never, ToolFailure> = fail({
      kind: 'unavailable',
      dependency: 'toolReads',
      diagnostic: 'store offline',
    })
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        reads: { ...base.dependencies.reads, lookup: async () => unreadable },
        instances: {
          ...base.dependencies.instances,
          directory: { connect: async () => noRoute },
        },
      },
      base.configuration,
    ).runtime
    const call = accepted(await runtime.invoke({ ...access, request: dummyRequest() }))
    expect(await runtime.instances.current({ access, reference: call.reference })).toEqual(
      unreadable,
    )
  })

  it('answers invalid for a reference whose admission was never accepted', async () => {
    const w = world()
    const call = await w.invoke()
    const never = call.reference.replace(/"[^"]*"\]$/u, '"op-never"]') as ToolInvocationRef
    expect(await w.runtime.instances.current({ access, reference: never })).toMatchObject({
      failure: { kind: 'invalid', field: 'reference' },
    })
  })
})

describe('observation.observe: Tool in the public failure order', () => {
  it('ends with denied for an unminted or foreign tenant, before any lookup', async () => {
    const w = world()
    const call = await w.invoke()
    const ref = refOf(call.reference, streamId('str_a'))
    const foreign = { principal: principalA, tenant: tenantB }
    expect(
      await drain(w.runtime.observation.observe({ ref, access: foreign, signal: signal() })),
    ).toEqual(endedWith('denied'))
    const unminted = {
      principal: principalA,
      tenant: { ...tenantA, account: { text: 'acc_forged' } } as never,
    }
    expect(
      await drain(w.runtime.observation.observe({ ref, access: unminted, signal: signal() })),
    ).toEqual(endedWith('denied'))
    expect(w.connects).toEqual([])
  })

  it('ends with stale-stream for unreadable syntax, a wrong producer or a malformed call, before any lookup', async () => {
    const w = world()
    const modelRef = JSON.stringify(['stream-ref', 1, 'model', '["model-invocation",1]', 'str_a'])
    const malformedCall = JSON.stringify(['stream-ref', 1, 'tool', '[]', 'str_a'])
    for (const ref of ['not a reference', modelRef, malformedCall] as StreamRef[])
      expect(await drain(w.runtime.observation.observe({ ref, access, signal: signal() }))).toEqual(
        endedWith('stale-stream'),
      )
    expect(w.connects).toEqual([])
  })

  it.each([
    [fail({ kind: 'denied' as const, action: 'connect' }), 'denied'],
    [
      fail({ kind: 'unavailable' as const, dependency: 'toolInstances', diagnostic: 'x' }),
      'unavailable',
    ],
    [
      fail({ kind: 'unsupported' as const, adoption: dummyRequest().settings, reason: 'x' }),
      'unavailable',
    ],
  ])('maps the directory answer %j to %s', async (answer, reason) => {
    const w = world([answer as Route])
    const call = await w.invoke()
    const ref = refOf(call.reference, streamId('str_a'))
    expect(await drain(w.runtime.observation.observe({ ref, access, signal: signal() }))).toEqual(
      endedWith(reason),
    )
  })

  it('ends with unavailable when the directory throws', async () => {
    const base = testAssembly()
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        instances: {
          ...base.dependencies.instances,
          directory: { connect: () => Promise.reject(new Error('directory exploded')) },
        },
      },
      base.configuration,
    ).runtime
    const call = accepted(await runtime.invoke({ ...access, request: dummyRequest() }))
    const ref = refOf(call.reference, streamId('str_a'))
    expect(await drain(runtime.observation.observe({ ref, access, signal: signal() }))).toEqual(
      endedWith('unavailable'),
    )
  })
})

describe('observation.observe: generations (SPEC「旧代次的终止帧」)', () => {
  it('case 3: a request for a generation that is not the current one ends with stale-stream at the facade, no handle contacted', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    const g2 = generation(call.reference, 'g2', call.state)
    // No publication for the call.
    expect(
      await drain(w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() })),
    ).toEqual(endedWith('stale-stream'))
    // g2 is current; g1 is retired.
    w.routes.push(live(g2.handle))
    expect(
      await drain(w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() })),
    ).toEqual(endedWith('stale-stream'))
    expect(g1.source.observed).toEqual([])
    expect(g2.source.observed).toEqual([])
  })

  it('routes a current reference to the handle of that generation with the canonical reference and access', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const seen = await take(
      w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() }),
      1,
    )
    expect(seen).toEqual([
      {
        kind: 'snapshot',
        cursor: expect.any(String),
        value: { state: call.state, process: [], foreground: null },
      },
    ])
    expect(g1.source.observed).toEqual([{ ref: g1.ref, access }])
  })

  it('case 4: the handle source ends a reference to another stream with stale-stream', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    const other = refOf(call.reference, streamId('str_other'))
    expect(
      await drain(g1.source.observation.observe({ ref: other, access, signal: signal() })),
    ).toEqual(endedWith('stale-stream'))
  })

  it('case 1: an established observation ends with producer-ended/stale-instance when its generation is replaced; current moves on', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    const g2 = generation(call.reference, 'g2', call.state)
    w.routes.push(live(g1.handle))
    const first = ok(await w.runtime.instances.current({ access, reference: call.reference }))
    expect(first.current?.generation).toBe('g1')
    const iterator = w.runtime.observation
      .observe({ ref: first.current?.ref as StreamRef, access, signal: signal() })
      [Symbol.asyncIterator]()
    expect((await iterator.next()).value).toMatchObject({ kind: 'snapshot' })
    // The host replaces the generation: the old publisher ends its observers, the directory serves g2.
    w.routes.push(live(g2.handle))
    g1.source.end('stale-instance')
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'producer-ended', value: { reason: 'stale-instance' } },
    })
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    const second = ok(await w.runtime.instances.current({ access, reference: call.reference }))
    expect(second.current?.generation).toBe('g2')
    expect(second.current?.ref).toBe(g2.ref)
  })

  it('case 2: an established observation ends with producer-ended/closed when the execution settles and the source closes', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const iterator = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: signal() })
      [Symbol.asyncIterator]()
    await iterator.next()
    g1.source.end('closed')
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'producer-ended', value: { reason: 'closed' } },
    })
    // Observed again before the directory retires the generation: still the Tool-owned end.
    expect(
      await drain(w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() })),
    ).toEqual([{ kind: 'ended', reason: 'producer-ended', value: { reason: 'closed' } }])
  })
})

describe('observation.observe: frames through the facade', () => {
  const delta = (state: ToolState, n: number) => ({
    state,
    blocks: [
      {
        index: String(n),
        mode: 'append' as const,
        state: 'open' as const,
        sequence: String(n),
        content: text(`b${n}`, 'x'),
        trim: null,
      },
    ],
  })

  it('delivers the snapshot first, then each delta from the cursor last delivered, with no gap in between', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const controller = new AbortController()
    const iterator = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: controller.signal })
      [Symbol.asyncIterator]()
    const first = await iterator.next()
    if (first.done || first.value.kind !== 'snapshot') throw new Error('no snapshot first')
    g1.source.confirm(delta(call.state, 1), {
      ...first.value.value,
      process: delta(call.state, 1).blocks,
    })
    g1.source.confirm(delta(call.state, 2), {
      ...first.value.value,
      process: delta(call.state, 2).blocks,
    })
    const second = await iterator.next()
    const third = await iterator.next()
    if (second.done || second.value.kind !== 'delta') throw new Error('no first delta')
    if (third.done || third.value.kind !== 'delta') throw new Error('no second delta')
    expect(second.value).toMatchObject({ from: first.value.cursor, value: delta(call.state, 1) })
    expect(third.value).toMatchObject({ from: second.value.cursor, value: delta(call.state, 2) })
    controller.abort()
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'observer-closed' },
    })
  })

  it('ends with a terminal gap(buffer) after a queue overflow and delivers nothing more', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state, { queuedFrames: 1 })
    w.routes.push(live(g1.handle))
    const iterator = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: signal() })
      [Symbol.asyncIterator]()
    const first = await iterator.next()
    if (first.done || first.value.kind !== 'snapshot') throw new Error('no snapshot first')
    for (let n = 1; n <= 3; n += 1) g1.source.confirm(delta(call.state, n), first.value.value)
    expect(g1.source.subscribers()).toBe(0)
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'gap', after: first.value.cursor, reason: 'buffer' },
    })
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })

  it('ends with a terminal gap(source-history) when the history after the delivered cursor is gone; the consumer restarts from a new snapshot', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const iterator = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: signal() })
      [Symbol.asyncIterator]()
    const first = await iterator.next()
    if (first.done || first.value.kind !== 'snapshot') throw new Error('no snapshot first')
    g1.source.confirm(delta(call.state, 1), first.value.value)
    g1.source.dropHistory()
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'gap', after: first.value.cursor, reason: 'source-history' },
    })
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    const again = await take(
      w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() }),
      1,
    )
    expect(again[0]).toMatchObject({ kind: 'snapshot' })
  })

  it('ends with observer-closed on abort and on return, and cancels nothing', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const commits = w.base.store.commits
    const controller = new AbortController()
    const iterator = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: controller.signal })
      [Symbol.asyncIterator]()
    await iterator.next()
    expect(g1.source.subscribers()).toBe(1)
    controller.abort()
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'observer-closed' },
    })
    expect(g1.source.subscribers()).toBe(0)
    expect(await iterator.next()).toEqual({ done: true, value: undefined })

    const returned = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: signal() })
      [Symbol.asyncIterator]()
    await returned.next()
    expect(await returned.return?.()).toEqual({ done: true, value: undefined })
    expect(g1.source.subscribers()).toBe(0)

    expect(
      await drain(
        w.runtime.observation.observe({ ref: g1.ref, access, signal: AbortSignal.abort() }),
      ),
    ).toEqual(endedWith('observer-closed'))
    expect(w.controls()).toBe(0)
    expect(w.base.store.commits).toBe(commits)
  })

  it('ends with capacity when the snapshot exceeds the declared limit', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state, { snapshotBytes: 8 })
    w.routes.push(live(g1.handle))
    expect(
      await drain(w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() })),
    ).toEqual(endedWith('capacity'))
  })
})

describe('observation.observe: eligibility before every frame (stream-arrival「Disclosure, capacity, and close」)', () => {
  const blockDelta = (state: ToolState, n: number) => ({
    state,
    blocks: [
      {
        index: String(n),
        mode: 'append' as const,
        state: 'open' as const,
        sequence: String(n),
        content: text(`b${n}`, 'x'),
        trim: null,
      },
    ],
  })

  async function established() {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    const iterator = w.runtime.observation
      .observe({ ref: g1.ref, access, signal: signal() })
      [Symbol.asyncIterator]()
    const first = await iterator.next()
    if (first.done || first.value.kind !== 'snapshot') throw new Error('no snapshot first')
    return { w, call, g1, iterator, snapshot: first.value.value }
  }

  it('ends with denied before the next delta when the access is revoked after the snapshot, removing the subscription and its queue', async () => {
    const { w, call, g1, iterator, snapshot } = await established()
    w.routes.push(fail({ kind: 'denied', action: 'connect' }))
    g1.source.confirm(blockDelta(call.state, 1), snapshot)
    g1.source.confirm(blockDelta(call.state, 2), snapshot)
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'denied' },
    })
    expect(g1.source.subscribers()).toBe(0)
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })

  it('ends with denied instead of the producer end when the access is revoked before it', async () => {
    const { w, g1, iterator } = await established()
    w.routes.push(fail({ kind: 'denied', action: 'connect' }))
    g1.source.end('closed')
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'denied' },
    })
  })

  it.each([
    [
      'answers unavailable',
      fail({ kind: 'unavailable' as const, dependency: 'toolInstances', diagnostic: 'x' }),
    ],
    ['throws', 'throw' as const],
  ])('ends with unavailable when the eligibility source %s mid-stream', async (_name, answer) => {
    const { w, call, g1, iterator, snapshot } = await established()
    w.routes.push(answer as Route | 'throw')
    g1.source.confirm(blockDelta(call.state, 1), snapshot)
    expect(await iterator.next()).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'unavailable' },
    })
    expect(g1.source.subscribers()).toBe(0)
  })

  it('keeps handing on frames while the eligibility holds, whatever generation the directory now serves', async () => {
    const { w, call, g1, iterator, snapshot } = await established()
    w.routes.push(noRoute)
    g1.source.confirm(blockDelta(call.state, 1), snapshot)
    expect((await iterator.next()).value).toMatchObject({ kind: 'delta' })
  })
})

describe('observation.observe: an untrusted request', () => {
  it.each([
    ['no request', undefined],
    ['a null request', null],
    ['a number', 42],
    ['a null access', { ref: 'x', access: null, signal: new AbortController().signal }],
    [
      'an access without principal',
      { ref: 'x', access: { tenant: tenantA }, signal: new AbortController().signal },
    ],
    [
      'an access without tenant',
      { ref: 'x', access: { principal: principalA }, signal: new AbortController().signal },
    ],
    ['a signal that is not an AbortSignal', { ref: 'x', access, signal: 'abort' }],
  ])('ends with denied for %s, without a TypeError or a directory call', async (_name, request) => {
    const w = world()
    expect(await drain(w.runtime.observation.observe(request as never))).toEqual(
      endedWith('denied'),
    )
    expect(w.connects).toEqual([])
  })

  it('lets an exception of the handle source through as a connection failure, not an end frame', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    const broken: ToolHandle<Principal> = {
      ...g1.handle,
      observation: {
        observe: () => {
          throw new Error('source exploded')
        },
      },
    }
    w.routes.push(live(broken))
    await expect(
      drain(w.runtime.observation.observe({ ref: g1.ref, access, signal: signal() })),
    ).rejects.toThrow('source exploded')
  })
})

describe('observation.observe: abort around routing', () => {
  it('ends with observer-closed without routing when the signal is already aborted', async () => {
    const w = world()
    const call = await w.invoke()
    const g1 = generation(call.reference, 'g1', call.state)
    w.routes.push(live(g1.handle))
    expect(
      await drain(
        w.runtime.observation.observe({ ref: g1.ref, access, signal: AbortSignal.abort() }),
      ),
    ).toEqual(endedWith('observer-closed'))
    expect(w.connects).toEqual([])
    expect(g1.source.observed).toEqual([])
  })

  it('ends with observer-closed when the signal aborts while the route is pending, contacting no handle', async () => {
    const base = testAssembly()
    let answer: (route: Route) => void = () => undefined
    const runtime = createToolRuntime(
      {
        ...base.dependencies,
        instances: {
          ...base.dependencies.instances,
          directory: {
            connect: () =>
              new Promise<Route>(resolve => {
                answer = resolve
              }),
          },
        },
      },
      base.configuration,
    ).runtime
    const call = accepted(await runtime.invoke({ ...access, request: dummyRequest() }))
    const g1 = generation(call.reference, 'g1', call.state)
    const controller = new AbortController()
    const pending = runtime.observation
      .observe({ ref: g1.ref, access, signal: controller.signal })
      [Symbol.asyncIterator]()
      .next()
    await new Promise(resolve => setImmediate(resolve))
    controller.abort()
    expect(await pending).toEqual({
      done: false,
      value: { kind: 'ended', reason: 'observer-closed' },
    })
    answer(live(g1.handle))
    await new Promise(resolve => setImmediate(resolve))
    expect(g1.source.observed).toEqual([])
  })
})
