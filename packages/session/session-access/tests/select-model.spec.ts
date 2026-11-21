import { describe, expect, it } from 'vitest'
import type { SessionId } from '@omne-harness/session-contract'
import {
  DEFINITION,
  TARGET_BASIS,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type World,
} from './fixtures/world.ts'

const signal = new AbortController().signal
const ops = (world: World) => world.contribution.operations
const as = <P>(principal: P) => ({ principal, messageId: 'm-1', signal })

const ALICE = fixtureLogin('a')
const BOB = fixtureLogin('b')
const MODEL = 'anthropic/claude-sonnet-5'

async function created(world: World): Promise<SessionId> {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const select = (world: World, session: string, controlId = 'control-1', who = ALICE) =>
  ops(world)['select-model'](as(loginIdentity(who)), {
    tenant: who.tenant,
    session,
    controlId,
    model: MODEL,
  })

const changes = (world: World) =>
  world.session.controls.calls().filter(call => call.method === 'change')

describe('select-model, row by row of T3', () => {
  it('row 1: a login that cannot act for the tenant is refused before anything is asked', async () => {
    for (const [refusal, expected] of [
      ['denied', { outcome: 'denied' }],
      ['basis-unavailable', { outcome: 'basis-unavailable' }],
      ['throw', { outcome: 'basis-unavailable' }],
    ] as const) {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      expect(await select(world, session)).toEqual(expected)
      expect(world.targets.calls()).toEqual([])
      expect(changes(world)).toEqual([])
    }
  })

  it('row 2: a session that does not exist and a session of another tenant get the same answer', async () => {
    const world = createWorld()
    const session = await created(world)
    const missing = await select(world, 'no-such-session')
    const foreign = await select(world, session, 'control-1', BOB)
    expect(missing).toEqual(foreign)
    expect(changes(world).every(call => call.operation !== undefined)).toBe(true)
  })

  it.each(['unknown-name', 'withdrawn', 'excluded'] as const)(
    'row 3: a route that resolves to no profile (%s) is refused with its reason and nothing is committed',
    async reason => {
      const world = createWorld()
      const session = await created(world)
      world.targets.answer({ kind: 'refused', reason })
      expect(await select(world, session)).toEqual({ outcome: 'invalid', body: { reason } })
      expect(changes(world)).toEqual([])
    },
  )

  it.each(['modality', 'locked', 'scope'] as const)(
    'row 4: a profile that is not selectable (%s) is refused with its reason and nothing is committed',
    async reason => {
      const world = createWorld()
      const session = await created(world)
      world.targets.answer({ kind: 'refused', reason })
      expect(await select(world, session)).toEqual({ outcome: 'invalid', body: { reason } })
      expect(changes(world)).toEqual([])
    },
  )

  it('row 4: the blocks of the history the target cannot read are named, sixteen at most', async () => {
    const world = createWorld()
    const session = await created(world)
    const blocks = Array.from({ length: 18 }, (_, n) => ({
      message: `msg_${String(n)}`,
      block: `blk_${String(n)}`,
    }))
    world.targets.answer({ kind: 'refused', reason: 'modality', blocks: blocks.slice(0, 2) })
    expect(await select(world, session)).toEqual({
      outcome: 'invalid',
      body: { reason: 'modality', blocks: blocks.slice(0, 2) },
    })
    world.targets.answer({ kind: 'refused', reason: 'modality', blocks })
    expect(await select(world, session, 'control-2')).toEqual({
      outcome: 'invalid',
      body: { reason: 'modality', blocks: blocks.slice(0, 16) },
    })
    expect(changes(world)).toEqual([])
  })

  it('the target is judged for the session it is selected in', async () => {
    const world = createWorld()
    const session = await created(world)
    await select(world, session)
    expect(world.targets.calls().at(-1)).toMatchObject({ route: MODEL, session })
  })

  it('row 5: a selectable target without a credential is committed, and the answer says so', async () => {
    const world = createWorld()
    const session = await created(world)
    world.targets.answer({ kind: 'selectable', credential: 'missing', basis: TARGET_BASIS })
    expect(await select(world, session)).toEqual({
      outcome: 'succeeded',
      body: { controlId: 'control-1', model: MODEL, credential: 'missing' },
    })
    const [change] = changes(world)
    expect(change?.input).toEqual({ kind: 'model', name: MODEL, basis: TARGET_BASIS })
    expect(world.targets.calls()).toEqual([
      expect.objectContaining({ tenant: ALICE.tenant, route: MODEL }),
    ])
  })

  it('row 6: selecting the current model commits like any other selection', async () => {
    const world = createWorld()
    const session = await created(world)
    expect((await select(world, session, 'control-1')).outcome).toBe('succeeded')
    expect((await select(world, session, 'control-2')).outcome).toBe('succeeded')
    expect(changes(world)).toHaveLength(2)
  })

  it('row 7: a session with a Run in progress takes the selection; the Run is not touched', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.addRun(session, 'run-1')
    expect((await select(world, session)).outcome).toBe('succeeded')
    const methods = world.session.controls.calls().map(call => call.method)
    expect(methods.filter(method => method !== 'create' && method !== 'change')).toEqual([])
  })

  it.each([
    [{ kind: 'archived' }, 'archived'],
    [{ kind: 'frozen' }, 'frozen'],
    [{ kind: 'conflict', operation: 'op' }, 'conflict'],
  ] as const)(
    'row 8: Session refusing the command (%j) is answered as %s',
    async (failure, outcome) => {
      const world = createWorld()
      const session = await created(world)
      world.session.controls.failNext(failure as never)
      expect(await select(world, session)).toEqual({ outcome, body: {} })
    },
  )

  it('row 9: an unconfirmed commit answers unknown; the same control identity is the same operation', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('change', new Error('connection lost'))
    expect(await select(world, session)).toEqual({ outcome: 'unknown' })
    world.session.controls.restore()
    expect((await select(world, session)).outcome).toBe('succeeded')
    const [first, second] = changes(world)
    expect(first?.operation).toBeDefined()
    expect(second?.operation).toBe(first?.operation)
    expect((await select(world, session, 'control-2')).outcome).toBe('succeeded')
    expect(changes(world)[2]?.operation).not.toBe(first?.operation)
  })

  it('answers basis-unavailable, and commits nothing, when the model targets are absent or throw', async () => {
    for (const fault of ['absent', 'throw', 'unavailable'] as const) {
      const world = createWorld()
      const session = await created(world)
      if (fault === 'absent') world.remove('modelTargets')
      else if (fault === 'throw') world.targets.answer('throw')
      else world.targets.answer({ kind: 'unavailable' })
      expect(await select(world, session)).toEqual({ outcome: 'basis-unavailable' })
      expect(changes(world)).toEqual([])
    }
  })

  it('answers basis-unavailable, and asks nothing, when the principal has no login fact', async () => {
    const world = createWorld()
    const session = await created(world)
    world.breakFacts('undescribed')
    expect(await select(world, session)).toEqual({ outcome: 'basis-unavailable' })
    expect(world.targets.calls()).toEqual([])
    expect(changes(world)).toEqual([])
  })
})

describe('create-session with a model', () => {
  const create = (world: World, model: string | undefined, createCallId = 'create-m') =>
    ops(world)['create-session'](as(world.issue(ALICE)), {
      createCallId,
      definition: DEFINITION,
      purpose: 'hello',
      ...(model === undefined ? {} : { model }),
    })
  const creations = (world: World) =>
    world.session.controls.calls().filter(call => call.method === 'create')
  const read = (world: World, session: string, who = ALICE) =>
    ops(world)['read-model-selection'](as(loginIdentity(who)), { tenant: who.tenant, session })

  it('without a model: starts at the one the deployment maps the definition to, and asks Model nothing', async () => {
    const world = createWorld()
    const answer = await create(world, undefined)
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    expect(world.targets.calls()).toEqual([])
    const stands = await read(world, answer.body.session)
    expect(stands).toMatchObject({ outcome: 'succeeded' })
    expect(stands.outcome === 'succeeded' && stands.body.model).not.toBe(MODEL)
  })

  it('with a selectable model: asks Model as the member, and the session starts at it', async () => {
    const world = createWorld()
    world.targets.answer({ kind: 'selectable', credential: 'missing', basis: TARGET_BASIS })
    const answer = await create(world, MODEL)
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    expect(world.targets.calls()).toEqual([
      expect.objectContaining({ tenant: ALICE.tenant, route: MODEL }),
    ])
    expect(await read(world, answer.body.session)).toEqual({
      outcome: 'succeeded',
      body: { model: MODEL, revision: expect.any(String) },
    })
  })

  it.each(['unknown-name', 'withdrawn', 'excluded', 'modality', 'locked', 'scope'] as const)(
    'with a model that cannot be selected (%s): answers invalid and creates nothing',
    async reason => {
      const world = createWorld()
      world.targets.answer({ kind: 'refused', reason })
      expect(await create(world, MODEL)).toEqual({ outcome: 'invalid', body: {} })
      expect(creations(world)).toEqual([])
    },
  )

  it('with a model while Model cannot say: answers basis-unavailable and creates nothing', async () => {
    for (const script of [{ kind: 'unavailable' } as const, 'throw' as const, 'removed' as const]) {
      const world = createWorld()
      if (script === 'removed') world.remove('modelTargets')
      else world.targets.answer(script)
      expect(await create(world, MODEL)).toEqual({ outcome: 'basis-unavailable' })
      expect(creations(world)).toEqual([])
    }
  })

  it('the same create call with the same model is the same session', async () => {
    const world = createWorld()
    const first = await create(world, MODEL)
    const again = await create(world, MODEL)
    if (first.outcome !== 'succeeded' || again.outcome !== 'succeeded') throw new Error('create')
    expect(again.body).toEqual({ session: first.body.session, recovered: true })
  })
})

describe('read-model-selection', () => {
  const read = (world: World, session: string, who = ALICE) =>
    ops(world)['read-model-selection'](as(loginIdentity(who)), { tenant: who.tenant, session })

  it('answers the route the session stands at: the one selected last', async () => {
    const world = createWorld()
    const session = await created(world)
    const before = await read(world, session)
    expect((await select(world, session)).outcome).toBe('succeeded')
    const after = await read(world, session)
    if (before.outcome !== 'succeeded' || after.outcome !== 'succeeded') throw new Error('read')
    expect(after.body.model).toBe(MODEL)
    expect(before.body.model).not.toBe(MODEL)
    expect(BigInt(after.body.revision)).toBeGreaterThan(BigInt(before.body.revision))
    // A read changes nothing.
    expect(await read(world, session)).toEqual(after)
  })

  it('a login that cannot act for the tenant is refused before the session is read', async () => {
    for (const [refusal, expected] of [
      ['denied', { outcome: 'denied' }],
      ['basis-unavailable', { outcome: 'basis-unavailable' }],
      ['throw', { outcome: 'basis-unavailable' }],
    ] as const) {
      const world = createWorld()
      const session = await created(world)
      world.refuseTargets(refusal)
      expect(await read(world, session)).toEqual(expected)
    }
  })

  it('a session that does not exist and a session of another tenant get the same answer', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await read(world, 'no-such-session')).toEqual(await read(world, session, BOB))
  })

  it('answers basis-unavailable while Session is off or its read throws', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await read(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })
})
