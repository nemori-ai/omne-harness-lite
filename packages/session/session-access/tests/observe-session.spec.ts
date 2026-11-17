import { describe, expect, it } from 'vitest'
import type { SessionObservationFrame } from '@omne-harness/session-observation'
import type { RunId, SessionRevision } from '@omne-harness/session-contract'
import { createWorld, fixtureLogin, loginIdentity } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const SESSION = 'f'.repeat(64)
const open = { tenant: ALICE.tenant, session: SESSION }

const FRAMES: readonly SessionObservationFrame[] = [
  {
    kind: 'state',
    run: 'run-1' as RunId,
    revision: '7' as SessionRevision,
    phase: 'streaming',
    attempts: null,
    target: { projection: 'model-output-v1' },
  },
  { kind: 'snapshot', projection: 'model-output-v1', value: { kind: 'string', value: 'he' } },
  { kind: 'delta', projection: 'model-output-v1', value: { kind: 'string', value: 'llo' } },
  { kind: 'gap', reason: 'buffer' },
  { kind: 'refreshing' },
]

// What the protocol carries for a frame: a state frame without progress has no such field.
const written = (frame: SessionObservationFrame) => {
  if (frame.kind !== 'state' || frame.attempts !== null) return frame
  const { attempts: _none, ...rest } = frame
  return rest
}

function source(world: ReturnType<typeof createWorld>) {
  return world.contribution.observations['observe-session']
}

async function drain<T, R>(frames: AsyncGenerator<T, R>): Promise<{ frames: T[]; end: R }> {
  const seen: T[] = []
  for (;;) {
    const next = await frames.next()
    if (next.done === true) return { frames: seen, end: next.value }
    seen.push(next.value)
  }
}

const context = (signal = new AbortController().signal) => ({
  principal: loginIdentity(ALICE),
  messageId: 'o-1',
  signal,
})

describe('observe-session', () => {
  it('sends the dispatch progress of the state frame, and of its last fault the cause and the upstream status only', async () => {
    const [state] = FRAMES
    if (state?.kind !== 'state') throw new Error('fixture')
    const world = createWorld()
    world.script({
      kind: 'opened',
      frames: [
        {
          ...state,
          attempts: {
            allowed: 2,
            made: 2,
            last: { cause: 'upstream-unavailable', upstreamStatus: '503', diagnostic: 'http-503' },
            notBefore: '2026-11-17T00:00:01.000Z',
          },
        },
      ],
      end: 'refresh-exhausted',
    })
    const opened = await source(world)(context(), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    const { frames } = await drain(opened.frames)
    expect(frames).toEqual([
      {
        ...state,
        attempts: {
          allowed: 2,
          made: 2,
          last: { cause: 'upstream-unavailable', upstreamStatus: '503' },
          notBefore: '2026-11-17T00:00:01.000Z',
        },
      },
    ])
  })

  it('sends a dispatch progress without a last fault as it is', async () => {
    const [state] = FRAMES
    if (state?.kind !== 'state') throw new Error('fixture')
    const attempts = { allowed: 3, made: 1, last: null, notBefore: null }
    const world = createWorld()
    world.script({ kind: 'opened', frames: [{ ...state, attempts }], end: 'refresh-exhausted' })
    const opened = await source(world)(context(), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    expect((await drain(opened.frames)).frames).toEqual([{ ...state, attempts }])
  })

  it('opens with the principal of the target tenant and sends the five frames as they are', async () => {
    const world = createWorld()
    world.script({ kind: 'opened', frames: FRAMES, end: 'refresh-exhausted' })
    const opened = await source(world)(context(), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    const { frames, end } = await drain(opened.frames)
    expect(frames).toEqual(FRAMES.map(written))
    expect(frames[0]).not.toHaveProperty('attempts')
    expect(end).toBe('refresh-exhausted')
    const [access] = world.opens()
    expect(access?.session).toBe(SESSION)
    expect(access?.tenant).toBe(ALICE.tenant)
    expect(access?.principal).toMatchObject({
      kind: 'acting-for-tenant',
      work: { owner: 'identity-login', work: ALICE.loginText },
    })
  })

  it('ends with refresh-exhausted when the observation does', async () => {
    const world = createWorld()
    world.script({ kind: 'opened', frames: [], end: 'refresh-exhausted' })
    const opened = await source(world)(context(), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    expect(await drain(opened.frames)).toEqual({ frames: [], end: 'refresh-exhausted' })
  })

  it('ends when the observer cancels, with no reason of the observation itself', async () => {
    const world = createWorld()
    world.script({ kind: 'opened', frames: FRAMES.slice(0, 1) })
    const controller = new AbortController()
    const opened = await source(world)(context(controller.signal), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    expect(await opened.frames.next()).toEqual({ done: false, value: FRAMES.map(written)[0] })
    const pending = opened.frames.next()
    controller.abort()
    expect(await pending).toEqual({ done: true, value: 'unavailable' })
    expect(await opened.frames.next()).toEqual({ done: true, value: undefined })
  })

  it('closes the observation frames when the hub closes the frames it was given', async () => {
    const world = createWorld()
    world.script({ kind: 'opened', frames: FRAMES })
    const opened = await source(world)(context(), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    await opened.frames.next()
    await opened.frames.return('unavailable')
    expect(world.closed()).toBe(true)
  })

  it.each(FRAMES.map(frame => [frame.kind, frame] as const))(
    'writes a %s frame field by field',
    async (_kind, frame) => {
      const world = createWorld()
      world.script({ kind: 'opened', frames: [frame], end: 'refresh-exhausted' })
      const opened = await source(world)(context(), open)
      if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
      const [sent] = (await drain(opened.frames)).frames
      expect(sent).toStrictEqual(written(frame))
      expect(sent).not.toBe(frame)
    },
  )

  it('answers denied when the observation refuses the log read', async () => {
    const world = createWorld()
    world.script({ kind: 'denied' })
    expect(await source(world)(context(), open)).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable when the observation is unavailable', async () => {
    const world = createWorld()
    world.script({ kind: 'unavailable' })
    expect(await source(world)(context(), open)).toEqual({ outcome: 'basis-unavailable' })
  })

  it.each(['denied', 'basis-unavailable'] as const)(
    'answers %s when identity refuses the target tenant, without opening',
    async refusal => {
      const world = createWorld()
      world.refuseTargets(refusal)
      expect(await source(world)(context(), open)).toEqual({ outcome: refusal })
      expect(world.opens()).toEqual([])
    },
  )

  it('answers denied to a target tenant of another account', async () => {
    const world = createWorld()
    expect(await source(world)(context(), { tenant: BOB.tenant, session: SESSION })).toEqual({
      outcome: 'denied',
    })
    expect(world.opens()).toEqual([])
  })

  it('answers basis-unavailable while the session observation is not on the tree', async () => {
    const world = createWorld()
    world.remove('observation')
    expect(await source(world)(context(), open)).toEqual({ outcome: 'basis-unavailable' })
  })
})
