import { describe, expect, it } from 'vitest'
import { createHitlContribution } from '../src/contribution.ts'
import type { CardChanges, LoginTenants } from '../src/ports.ts'
import { createChangesDouble } from './fixtures/changes-double.ts'
import { HITL_LOCATION } from './fixtures/hitl-double.ts'
import { fixtureLogin, loginIdentity } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')

type Admission = Awaited<ReturnType<LoginTenants['admits']>>
type Step = IteratorResult<unknown, unknown>

function setup() {
  const signals = createChangesDouble()
  const changes: { current: CardChanges | undefined } = { current: signals.changes }
  const login = {
    answer: 'admitted' as Admission | 'throw',
    calls: 0,
    gate: undefined as Promise<void> | undefined,
  }
  const contribution = createHitlContribution({
    faces: () => undefined,
    entryPrincipals: { issue: async () => ({ kind: 'refused' }) },
    logins: {
      async admits() {
        login.calls += 1
        if (login.gate !== undefined) await login.gate
        if (login.answer === 'throw') throw new Error('identity is down')
        return login.answer
      },
    },
    changes: () => changes.current,
    settings: { locationRef: HITL_LOCATION },
  })
  const controller = new AbortController()
  const open = () =>
    contribution.observations['observe-cards'](
      {
        principal: loginIdentity(ALICE),
        messageId: 'm-observe',
        revision: 1,
        signal: controller.signal,
      },
      { tenant: ALICE.tenant },
    )
  const frames = async () => {
    const opened = await open()
    if (opened.outcome !== 'succeeded') throw new Error(`not established: ${opened.outcome}`)
    return opened.frames
  }
  const live = () => signals.live(ALICE.tenantText)
  const changed = () => signals.changed(ALICE.tenantText)
  return { signals, changes, login, controller, open, frames, live, changed }
}

const FRAME: Step = { done: false, value: { kind: 'changed' } }
const ended = (value: string): Step => ({ done: true, value })

async function settledOf(step: Promise<Step>): Promise<Step | 'pending'> {
  const marker = Symbol('pending')
  await new Promise<void>(resolve => setImmediate(resolve))
  const first = await Promise.race([step, Promise.resolve(marker)])
  return first === marker ? 'pending' : (first as Step)
}

describe('establishing observe-cards', () => {
  it.each([
    ['denied', 'denied'],
    ['basis-unavailable', 'basis-unavailable'],
    ['throw', 'basis-unavailable'],
  ] as const)(
    'when the login answers %s the observation is not established and nothing is subscribed',
    async (answer, outcome) => {
      const world = setup()
      world.login.answer = answer
      expect(await world.open()).toEqual({ outcome })
      expect(world.signals.subscribed).toEqual([])
    },
  )

  it('without a signal source the answer is basis-unavailable', async () => {
    const world = setup()
    world.changes.current = undefined
    expect(await world.open()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('when subscribing throws the answer is basis-unavailable', async () => {
    const world = setup()
    world.signals.failSubscribe.value = true
    expect(await world.open()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('subscribes for the tenant of the opening value before answering succeeded', async () => {
    const world = setup()
    const opened = await world.open()
    expect(opened.outcome).toBe('succeeded')
    expect(world.signals.subscribed).toEqual([ALICE.tenantText])
    expect(world.live()).toBe(1)
  })
})

describe('the frames of observe-cards', () => {
  it('gives the first frame without waiting for any change, then waits', async () => {
    const world = setup()
    const frames = await world.frames()
    expect(await frames.next()).toEqual(FRAME)
    expect(await settledOf(frames.next())).toBe('pending')
  })

  it('one change gives one frame, and a frame carries nothing but its kind', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    const second = frames.next()
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

  it('checks the login again before every frame', async () => {
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
    world.signals.closed()
    expect(await step).toEqual(ended('unavailable'))
    expect(world.live()).toBe(0)
  })

  it('when the source closes with a change still pending it ends without giving the frame', async () => {
    const world = setup()
    const frames = await world.frames()
    world.signals.closed()
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

  it('when the frames are returned it unsubscribes', async () => {
    const world = setup()
    const frames = await world.frames()
    await frames.next()
    expect(world.live()).toBe(1)
    await frames.return(undefined as never)
    expect(world.live()).toBe(0)
  })
})
