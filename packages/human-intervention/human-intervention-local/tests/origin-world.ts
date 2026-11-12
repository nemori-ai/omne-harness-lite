// 带会话的来源（tool、admission、agent-extension）共用的测试世界：公开应用入口、真实 Identity 与真实
// SQLite，守卫参与者是替身（fixtures/guard.mjs）。
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

/** 关掉本文件打开的全部应用与世界；每个用例之后调用。 */
export async function closeOriginWorlds() {
  for (const app of applications.splice(0)) await app.close()
  for (const world of worlds.splice(0)) await world.close()
}

/** 守卫的判定可在测试中途切换；calls 记下装配收到的每个来源。 */
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

/** 打开世界与应用；`transform` 把世界准备的独立登记改成要测的来源，不给时保持独立来源。 */
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

/** 读者在一个过滤范围里看到的全部卡片，默认三种状态都读。 */
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
