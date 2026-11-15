import { describe, expect, it } from 'vitest'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import { controlOperation } from '../src/derivation.ts'
import {
  DEFINITION,
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

async function created(world: World) {
  const answer = await ops(world)['create-session'](as(world.issue(ALICE)), {
    createCallId: 'create-1',
    definition: DEFINITION,
    purpose: 'hello',
  })
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const bodyOf = (session: string) => ({
  tenant: ALICE.tenant,
  session,
  controlId: 'control-1',
  run: 'run-1',
})

const retry = (world: World, session: string, who = ALICE) =>
  ops(world)['retry-run'](as(loginIdentity(who)), bodyOf(session))

describe('retry-run', () => {
  it('answers succeeded under the control operation derived from the login, recalled the second time', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await retry(world, session)).toEqual({
      outcome: 'succeeded',
      body: { recovered: false },
    })
    const call = world.session.controls.calls()[1]
    expect(call).toMatchObject({ method: 'retryRun', input: { run: 'run-1' } })
    expect(call?.operation).toBe(
      controlOperation(ALICE.loginText, ALICE.tenantText, session, 'control-1'),
    )
    expect(await retry(world, session)).toEqual({ outcome: 'succeeded', body: { recovered: true } })
  })

  it.each([
    [
      { kind: 'invalid', field: 'run', reason: 'empty' },
      { outcome: 'invalid', body: {} },
    ],
    [{ kind: 'archived' }, { outcome: 'archived', body: {} }],
    [
      { kind: 'frozen', verdict: null },
      { outcome: 'frozen', body: {} },
    ],
    [{ kind: 'not-found' }, { outcome: 'not-found', body: {} }],
    [{ kind: 'nothing-pending' }, { outcome: 'no-change', body: {} }],
    [
      { kind: 'conflict', operation: 'op' },
      { outcome: 'conflict', body: {} },
    ],
    [{ kind: 'commit-unknown', operation: 'op' }, { outcome: 'unknown' }],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, { outcome: 'basis-unavailable' }],
  ] as const)('maps the Session failure %j', async (failure, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await retry(world, session)).toEqual(expected)
  })

  it('answers unknown when Session throws after the call began', async () => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.throwOn('retryRun', new Error('boom'))
    expect(await retry(world, session)).toEqual({ outcome: 'unknown' })
  })

  it('answers denied to a session that does not exist and to a tenant of another account', async () => {
    const world = createWorld()
    const session = await created(world)
    expect(await retry(world, '0'.repeat(64))).toEqual({ outcome: 'denied' })
    expect(await retry(world, session, BOB)).toEqual({ outcome: 'denied' })
  })

  it('answers basis-unavailable while Session is not on the tree', async () => {
    const world = createWorld()
    const session = await created(world)
    world.remove('faces')
    expect(await retry(world, session)).toEqual({ outcome: 'basis-unavailable' })
  })
})
