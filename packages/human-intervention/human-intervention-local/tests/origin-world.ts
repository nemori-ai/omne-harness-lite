import { randomBytes } from 'node:crypto'
import {
  ListPoolSchema,
  type Origin,
  type PoolFilter,
  type RegisterRequest,
} from '@omne-harness/human-intervention'
import {
  createIndependentHitlApplication,
  type HitlGuards,
} from '@omne-harness/human-intervention-local'
import { openIdentityWorld } from './identity-world.ts'

const worlds: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
const applications: ReturnType<typeof createIndependentHitlApplication>[] = []

export async function closeOriginWorlds() {
  for (const app of applications.splice(0)) await app.close()
  for (const world of worlds.splice(0)) await world.close()
}

export function switchableGuards() {
  const state = { verdict: 'live' as 'live' | 'ended' | 'none', calls: [] as Origin[] }
  const guards: HitlGuards = origin => {
    state.calls.push(origin)
    return origin.sessionRef === undefined || state.verdict === 'none'
      ? []
      : [{ participant: 'fixture.hitl.guard', facts: { verdict: state.verdict } }]
  }
  return { state, guards }
}

export async function openOriginWorld(
  guards: HitlGuards,
  transform?: (request: RegisterRequest) => RegisterRequest,
) {
  const w = await openIdentityWorld(transform ? { transformRegistration: transform } : {})
  worlds.push(w)
  const app = createIndependentHitlApplication({
    ...w.terminalOptions,
    destination: w.destination,
    required: [],
    locationRef: 'local',
    cursorKey: randomBytes(32),
    identity: {
      verifier: w.authority.verifier,
      standing: w.identity.standing,
      reservations: w.identity.reservations,
    },
    guards,
  })
  applications.push(app)
  return { ...w, app }
}
export type OriginWorld = Awaited<ReturnType<typeof openOriginWorld>>

export async function pool(w: OriginWorld, filter: Partial<PoolFilter> = {}) {
  const page = await w.app.listPool(
    w.principal,
    ListPoolSchema.parse({
      protocol: 'hitl/1',
      tenantRef: w.request.operation.tenantRef,
      locationRef: 'local',
      filter: { states: ['pending', 'decided', 'invalidated'], ...filter },
      limit: 100,
    }),
  )
  if (page.kind !== 'page') throw new Error(JSON.stringify(page))
  return page.items
}
