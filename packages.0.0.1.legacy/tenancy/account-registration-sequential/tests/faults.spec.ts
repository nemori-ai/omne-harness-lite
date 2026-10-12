// 「孤儿个人组织」（S-35 被破）与「已激活而无个人组织」（S-13 被破）两个状态不可达：在两条链的每一步之间注入失败，
// 事后直接对库断言两种状态都不存在，再不带故障重来，断言收敛到注册成立。
// 注入点不是手挑的：先跑一遍无故障的流程数出语句与写事务的个数，再逐个位置各跑一次——
// ① 第 i 条语句以存储不可用失败；② 第 j 个写事务提交失败（回滚）；③ 第 j 个写事务提交之后、返回之前撤掉编排者。
// 真实 AI／OG／AR + 真实 storage-sql；时间用包内替身（没有后台续约语句，位置编号稳定）。
import { afterEach, describe, expect, it } from 'vitest'
import { TERMINAL_OUTCOMES, type TerminalOutcome } from '@omne-harness-lite/account-registration'
import {
  type Composition,
  HOUR,
  NO_VIOLATIONS,
  PASSWORD,
  accountIdOf,
  bootComposition,
  committed,
  formOf,
  invariantViolations,
  personalOrganizationsOf,
  stmt,
} from './support.ts'

const compositions: Composition[] = []
afterEach(async () => {
  for (const c of compositions.splice(0).reverse()) await c.dispose()
})
async function boot(): Promise<Composition> {
  const c = await bootComposition({ clock: 'test', retention: HOUR })
  compositions.push(c)
  return c
}

type Setup = (c: Composition) => Promise<void>
type Flow = (c: Composition) => Promise<TerminalOutcome | 'purged' | 'purge-failed'>

const register: Flow = c => c.service().register('target', PASSWORD)

/** 前提：target 走完 ①②、③ 提交失败、随后过期——下一次注册要先就地跑清除链再重跑 ①。 */
const expiredWithOrganization: Setup = async c => {
  c.storage.failCommit(committed(stmt.on('update', 'account', { column: 'activated' })))
  expect(await c.service().register('target', PASSWORD)).toBe('interrupted')
  expect(await personalOrganizationsOf(c, await accountIdOf(c, 'target'))).toHaveLength(1)
  c.clock!.advance(HOUR + 1)
}

/** 清扫发起：对 target 那条过期记录跑一次清除链。 */
const sweep: Flow = async c => {
  const result = await c.service().purgeExpired(await accountIdOf(c, 'target'))
  return result === 'ok' ? 'purged' : 'purge-failed'
}

async function measure(setup: Setup | undefined, flow: Flow) {
  const c = await boot()
  if (setup !== undefined) await setup(c)
  const mark = c.storage.statements.length
  let writes = 0
  c.storage.failCommit(() => {
    writes += 1
    return false
  })
  await flow(c)
  return { statements: c.storage.statements.length - mark, writes }
}

/** 一次注入之后：两个不可达状态都不存在，S-20 只有两种形态；不带故障重来，收敛到注册成立。 */
async function expectConverges(c: Composition, outcome: unknown, label: string) {
  // 清扫发起的链在编排者撤除时以 RegistrationStopped 拒绝（「什么也收不到」），其余一律是四个终结结果或清除链的两支返回
  const allowed = [...TERMINAL_OUTCOMES, 'purged', 'purge-failed', 'RegistrationStopped']
  expect(allowed, label).toContain(outcome)
  expect(await invariantViolations(c), label).toEqual(NO_VIOLATIONS)
  expect(['registered', 'no-usable-account'], label).toContain(await formOf(c, 'target'))
  if (c.registration() === undefined) await c.reload('registration')
  const again = await c.service().register('target', PASSWORD)
  expect(['registered', 'identifier-taken'], label).toContain(again)
  expect(await formOf(c, 'target'), label).toBe('registered')
  expect(await invariantViolations(c), label).toEqual(NO_VIOLATIONS)
}

async function sweepEveryPosition(name: string, setup: Setup | undefined, flow: Flow) {
  const { statements, writes } = await measure(setup, flow)
  expect(statements).toBeGreaterThan(0)
  let cases = 0

  for (let i = 0; i < statements; i += 1) {
    const c = await boot()
    if (setup !== undefined) await setup(c)
    let seen = 0
    c.storage.failStatement(() => seen++ === i)
    await expectConverges(c, await flow(c), `${name}: statement ${i} fails`)
    cases += 1
  }
  for (let j = 0; j < writes; j += 1) {
    const c = await boot()
    if (setup !== undefined) await setup(c)
    let seen = 0
    c.storage.failCommit(() => seen++ === j)
    await expectConverges(c, await flow(c), `${name}: write ${j} rolls back`)
    cases += 1

    const d = await boot()
    if (setup !== undefined) await setup(d)
    let committedSeen = 0
    const gate = d.storage.pauseAfterCommit(() => committedSeen++ === j)
    const running = flow(d).catch((error: unknown) => (error as Error).name)
    await gate.reached
    const stopping = d.fibers.registration.dispose()
    gate.release()
    const stopped = await running
    await stopping
    await expectConverges(d, stopped, `${name}: unloaded after write ${j}`)
    cases += 1
  }
  return { statements, writes, cases }
}

describe('S-13／S-35 两个不可达状态：每一步之间注入失败', () => {
  it('注册主链（全新标识）：每条语句失败、每个写事务回滚、每次提交后撤编排者', async () => {
    const run = await sweepEveryPosition('fresh', undefined, register)
    expect(run.writes).toBeGreaterThanOrEqual(3) // ①②③ 至少各一次提交
    expect(run.cases).toBe(run.statements + 2 * run.writes)
  }, 60_000)

  it('注册主链撞上已过期记录（就地清除链 ①② ＋ 重跑 ①②③）：同样三类注入', async () => {
    const run = await sweepEveryPosition('expired', expiredWithOrganization, register)
    expect(run.writes).toBeGreaterThanOrEqual(5)
  }, 60_000)

  it('清扫发起的清除链：同样三类注入；事后重扫与重新注册都收敛', async () => {
    const run = await sweepEveryPosition('sweep', expiredWithOrganization, sweep)
    expect(run.writes).toBeGreaterThanOrEqual(2)
  }, 60_000)
})
