// The frame source of `observe-session` over a session observation stand-in (seam three): the three
// results of `open` become `succeeded`, `denied` and `basis-unavailable`; frames pass as they are;
// `refresh-exhausted` ends as it is; a cancelled observation ends without a reason.
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
    target: { projection: 'model-output-v1' },
  },
  { kind: 'snapshot', projection: 'model-output-v1', value: { kind: 'string', value: 'he' } },
  { kind: 'delta', projection: 'model-output-v1', value: { kind: 'string', value: 'llo' } },
  { kind: 'gap', reason: 'buffer' },
  { kind: 'refreshing' },
]

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
  it('opens with the principal of the target tenant and sends the five frames as they are', async () => {
    const world = createWorld()
    world.script({ kind: 'opened', frames: FRAMES, end: 'refresh-exhausted' })
    const opened = await source(world)(context(), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    const { frames, end } = await drain(opened.frames)
    expect(frames).toEqual(FRAMES)
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

  it('ends without a reason when the observer cancels', async () => {
    const world = createWorld()
    world.script({ kind: 'opened', frames: FRAMES.slice(0, 1) })
    const controller = new AbortController()
    const opened = await source(world)(context(controller.signal), open)
    if (opened.outcome !== 'succeeded') throw new Error(`opened ${opened.outcome}`)
    expect(await opened.frames.next()).toEqual({ done: false, value: FRAMES[0] })
    const pending = opened.frames.next()
    controller.abort()
    expect(await pending).toEqual({ done: true, value: undefined })
  })

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
