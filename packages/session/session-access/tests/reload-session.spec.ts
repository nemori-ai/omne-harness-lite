import { describe, expect, it } from 'vitest'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import {
  DEFINITION,
  createWorld,
  fixtureLogin,
  loginIdentity,
  type World,
} from './fixtures/world.ts'

const signal = new AbortController().signal
const ALICE = fixtureLogin('a')

async function created(world: World) {
  const answer = await world.contribution.operations['create-session'](
    { principal: world.issue(ALICE), messageId: 'm-1', signal },
    { createCallId: 'create-1', definition: DEFINITION, purpose: 'hello' },
  )
  if (answer.outcome !== 'succeeded') throw new Error(`fixture create answered ${answer.outcome}`)
  return answer.body.session as SessionId
}

const reload = (world: World, session: string) =>
  world.contribution.operations['reload-session'](
    { principal: loginIdentity(ALICE), messageId: 'm-2', signal },
    { tenant: ALICE.tenant, session, controlId: 'control-1' },
  )

describe('reload-session', () => {
  it.each([
    [{ kind: 'cancelled' }, { outcome: 'conflict', body: { reason: 'cancelled' } }],
    [
      { kind: 'stale-advance', current: null },
      { outcome: 'conflict', body: { reason: 'not-current' } },
    ],
    [
      { kind: 'changed', revision: '7' },
      { outcome: 'conflict', body: { reason: 'changed' } },
    ],
    [
      { kind: 'invalid', field: 'candidate', reason: 'refused' },
      { outcome: 'invalid', body: { reason: 'refused' } },
    ],
    [{ kind: 'archived' }, { outcome: 'archived', body: {} }],
    [{ kind: 'unavailable', owner: 'x', diagnostic: 'y' }, { outcome: 'basis-unavailable' }],
  ] as const)('says why the run was not handed over: %j', async (failure, expected) => {
    const world = createWorld()
    const session = await created(world)
    world.session.controls.failWith(failure as SessionFailure)
    expect(await reload(world, session)).toEqual(expected)
  })
})
