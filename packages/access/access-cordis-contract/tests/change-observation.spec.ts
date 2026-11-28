import { describe, expect, it } from 'vitest'
import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import {
  createChangeObservation,
  type ChangeAdmission,
  type ChangeListener,
  type LoginIdentity,
} from '@omne-harness/access-cordis-contract'

const watched = defineProtocol({
  name: 'watched',
  major: 1,
  operations: {},
  observations: {
    'observe-things': {
      identity: 'login',
      open: ruleCodec({ kind: 'object', fields: { tenant: { rule: { kind: 'text' } } } }),
      frame: ruleCodec({
        kind: 'object',
        fields: { kind: { rule: { kind: 'literal', values: ['changed'] } } },
      }),
      ends: [],
    },
  },
})
type Observe = (typeof watched)['observations']['observe-things']

type Step = IteratorResult<unknown, unknown>
const FRAME: Step = { done: false, value: { kind: 'changed' } }
const ended = (value: string): Step => ({ done: true, value })
const LOGIN = {} as LoginIdentity
const TENANT = 'tenant-a'

function setup() {
  const listeners = new Map<string, Set<ChangeListener>>()
  const source = { present: true, fail: false, subscribed: [] as string[], unsubscribed: 0 }
  const login = {
    answer: 'admitted' as ChangeAdmission | 'throw',
    calls: 0,
    gate: undefined as Promise<void> | undefined,
    asked: [] as string[],
  }
  const observe = createChangeObservation<Observe>({
    async admits(_principal, open) {
      login.calls += 1
      login.asked.push(open.tenant)
      if (login.gate !== undefined) await login.gate
      if (login.answer === 'throw') throw new Error('identity is down')
      return login.answer
    },
    subscribe(open, listener) {
      if (!source.present) return undefined
      if (source.fail) throw new Error('the signal source is down')
      source.subscribed.push(open.tenant)
      const set = listeners.get(open.tenant) ?? new Set()
      set.add(listener)
      listeners.set(open.tenant, set)
      return () => {
        source.unsubscribed += 1
        set.delete(listener)
      }
    },
    frame: { kind: 'changed' },
  })
  const controller = new AbortController()
  const open = () =>
    observe(
      { principal: LOGIN, messageId: 'm-observe', revision: 1, signal: controller.signal },
      { tenant: TENANT },
    )
  const frames = async () => {
    const opened = await open()
    if (opened.outcome !== 'succeeded') throw new Error(`not established: ${opened.outcome}`)
    return opened.frames
  }
  const live = (tenant = TENANT) => listeners.get(tenant)?.size ?? 0
  const changed = (tenant = TENANT) => {
    for (const listener of listeners.get(tenant) ?? []) listener.changed()
  }
  const closed = () => {
    for (const set of listeners.values()) for (const listener of set) listener.closed()
  }
  return { source, login, controller, open, frames, live, changed, closed }
}

async function settledOf(step: Promise<Step>): Promise<Step | 'pending'> {
  const marker = Symbol('pending')
  await new Promise<void>(resolve => setImmediate(resolve))
  const first = await Promise.race([step, Promise.resolve(marker)])
  return first === marker ? 'pending' : (first as Step)
}

describe('establishing a change observation', () => {
  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'basis-unavailable'],
    ['throw', 'basis-unavailable'],
  ] as const)(
    'when the admission answers %s it is not established and nothing is subscribed',
    async (answer, outcome) => {
      const world = setup()
      world.login.answer = answer
      expect(await world.open()).toEqual({ outcome })
      expect(world.source.subscribed).toEqual([])
    },
  )

  it('an admission answer outside the three is taken as basis-unavailable', async () => {
    const world = setup()
    world.login.answer = 'maybe' as ChangeAdmission
    expect(await world.open()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('without a signal source the answer is basis-unavailable', async () => {
    const world = setup()
    world.source.present = false
    expect(await world.open()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('when subscribing throws the answer is basis-unavailable', async () => {
    const world = setup()
    world.source.fail = true
    expect(await world.open()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('asks and subscribes for what the opening value names before answering succeeded', async () => {
    const world = setup()
    const opened = await world.open()
    expect(opened.outcome).toBe('succeeded')
    expect(world.login.asked).toEqual([TENANT])
    expect(world.source.subscribed).toEqual([TENANT])
    expect(world.live()).toBe(1)
  })
})

describe('the frames of a change observation', () => {
  it('gives the first frame without waiting for any change, then waits', async () => {
    const world = setup()
    const frames = await world.frames()
    expect(await frames.next()).toEqual(FRAME)
    expect(await settledOf(frames.next())).toBe('pending')
  })

  it('one change gives one frame; a change of something else gives none', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    const second = frames.next()
    world.changed('tenant-b')
    expect(await settledOf(second)).toBe('pending')
    world.changed()
    expect(await second).toEqual(FRAME)
    expect(await settledOf(frames.next())).toBe('pending')
  })

  it('three changes before the next frame is taken give only one more frame', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    world.changed()
    world.changed()
    world.changed()
    expect(await frames.next()).toEqual(FRAME)
    expect(await settledOf(frames.next())).toBe('pending')
  })

  it('checks the admission again before every frame', async () => {
    const world = setup()
    const frames = await world.frames()
    expect(world.login.calls).toBe(1)
    await frames.next()
    expect(world.login.calls).toBe(2)
    world.changed()
    await frames.next()
    expect(world.login.calls).toBe(3)
  })

  it('a change that arrives during the check is the next frame', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    let open!: () => void
    world.login.gate = new Promise<void>(resolve => {
      open = resolve
    })
    world.changed()
    const second = frames.next()
    expect(await settledOf(second)).toBe('pending')
    world.changed()
    world.login.gate = undefined
    open()
    expect(await second).toEqual(FRAME)
    expect(await frames.next()).toEqual(FRAME)
    expect(await settledOf(frames.next())).toBe('pending')
  })

  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'unavailable'],
    ['throw', 'unavailable'],
  ] as const)(
    'when the check before a frame answers %s it ends with %s and unsubscribes',
    async (answer, end) => {
      const world = setup()
      const frames = await world.frames()
      await frames.next()
      world.login.answer = answer
      world.changed()
      expect(await frames.next()).toEqual(ended(end))
      expect(world.live()).toBe(0)
    },
  )

  it('when the source closes while waiting it ends with unavailable and unsubscribes', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    const step = frames.next()
    world.closed()
    expect(await step).toEqual(ended('unavailable'))
    expect(world.live()).toBe(0)
  })

  it('when the source closes with a change still pending it ends without giving the frame', async () => {
    const world = setup()
    const frames = await world.frames()
    world.closed()
    expect(await frames.next()).toEqual(ended('unavailable'))
    expect(world.live()).toBe(0)
  })

  it('when the caller aborts while waiting it ends and unsubscribes', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    const step = frames.next()
    world.controller.abort()
    expect(await step).toEqual(ended('unavailable'))
    expect(world.live()).toBe(0)
  })

  it('when the caller aborts before the first frame is taken it unsubscribes and the frames end', async () => {
    const world = setup()
    const frames = await world.frames()
    world.controller.abort()
    expect(world.live()).toBe(0)
    expect(await frames.next()).toEqual(ended('unavailable'))
  })

  it('when the caller has aborted during the establishment it answers and unsubscribes', async () => {
    const world = setup()
    let open!: () => void
    world.login.gate = new Promise<void>(resolve => {
      open = resolve
    })
    const opening = world.open()
    world.controller.abort()
    world.login.gate = undefined
    open()
    expect((await opening).outcome).toBe('succeeded')
    expect(world.live()).toBe(0)
  })

  it('when the frames are returned it unsubscribes, and a later abort does not unsubscribe again', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    expect(world.live()).toBe(1)
    await frames.return(undefined as never)
    expect(world.live()).toBe(0)
    world.controller.abort()
    expect(world.source.unsubscribed).toBe(1)
  })

  it('an abort that ends the waiting frames unsubscribes only once', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    const step = frames.next()
    world.controller.abort()
    expect(await step).toEqual(ended('unavailable'))
    expect(world.source.unsubscribed).toBe(1)
  })
})
