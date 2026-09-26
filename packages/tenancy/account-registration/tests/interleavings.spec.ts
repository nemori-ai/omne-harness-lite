// 波次 1 留给本批次的真实组合证据，同一批演练：
// - capability.account-identity S-43 第 2 支（真并发），含 AI design「过期事实」一节列的两条交错：
//   (a) S-14 已读到未过期但未提交时另一路清除链要跑；(b) og#S-20 已读到未过期但未提交时清除链跑完。两种先后各跑一次。
// - capability.organization-governance S-54 ⑥（账号也已不在：①之后真跑 AI S-38 再调）与 ⑦（账号不在、组织还在），挨着跑。
// - composition.account-registration S-34「与注册主链并发」交错表其余几格。
// 真实 AI／OG／AR 插件 + 真实 storage-sql（sqlite：写事务 BEGIN IMMEDIATE，进程内写队列）。「真并发」在这里是两条调用链真的交叠：
// 用插桩存储把一方停在自己的事务里或两次提交之间，另一方在此期间发起；停住的一方放行后看终态。
import { afterEach, describe, expect, it } from 'vitest'
import {
  issueHandoffWarrant,
  loadSigningKey,
  loadVerificationKey,
  unwrap,
  verifyHandoffWarrant,
} from '@omne-harness-lite/identity-values'
import type { PurgeExpiredResult, TerminalOutcome } from '../src/index.ts'
import {
  type Composition,
  type Gate,
  HOUR,
  START,
  NO_VIOLATIONS,
  PASSWORD,
  accountIdOf,
  accountsOf,
  bootComposition,
  committed,
  invariantViolations,
  personalOrganizationsOf,
  settleTurns,
  stmt,
  tamper,
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

const activateUpdate = stmt.on('update', 'account', { column: 'activated' })
const accountInsert = stmt.on('insert', 'account')
const accountDelete = stmt.on('delete', 'account')
const organizationInsert = stmt.on('insert', 'organization')
const organizationDelete = stmt.on('delete', 'organization')
const purgeOneCommit = committed(stmt.on('select', 'organization', { inWrite: true }))

/** 一个还没结束的调用：放行之前断言它确实没结束（停在对方持有的写锁或我们的等待点后面）。 */
function track<T>(promise: Promise<T>) {
  let settled = false
  void promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  return { promise, settled: () => settled }
}

/** OG2把账号现读与个人组织写入放在同一事务；只能在其确认提交后安排外部写交错。 */
async function mainPausedAfterStepTwoCommit(c: Composition, identifier: string) {
  const readGate = c.storage.pauseAfterCommit(committed(organizationInsert))
  const main = track(c.service().register(identifier, PASSWORD))
  await readGate.reached
  return { main, readGate }
}

async function finalState(c: Composition, identifier: string) {
  const accounts = await accountsOf(c, identifier)
  const organizations = await personalOrganizationsOf(c)
  return { accounts, organizations, violations: await invariantViolations(c) }
}

describe('ai#S-43 第 2 支 × ar 同一次演练：激活与清除链 ① 在同一条已过期记录上并发', () => {
  it('I-1 并发形／交错 (a)，S-14 先：③ 在自己的事务里读到「未过期」并写下激活、尚未提交；期限过去，清除链发起——它排在 S-14 的写锁后面，S-14 提交后 ① 现读到已激活 ⇒ accountIsActivated（终止）。终态：已激活 ∧ 有个人组织', async () => {
    const c = await boot()
    const inside = c.storage.pauseAfterStatement(activateUpdate)
    const main = track(c.service().register('a-first', PASSWORD))
    await inside.reached
    const accountId = await accountIdOf(c, 'a-first')
    c.clock!.advance(HOUR + 1)
    const purge = track(c.service().purgeExpired(accountId))
    await settleTurns(50)
    expect(purge.settled()).toBe(false) // 清除链 ① 读不穿 S-14 未提交的事务，也写不进去
    inside.release()
    expect(await main.promise).toBe<TerminalOutcome>('registered')
    expect(await purge.promise).toEqual<PurgeExpiredResult>({
      from: 'S-53',
      failure: 'accountIsActivated',
      class: 'terminal',
    })
    const state = await finalState(c, 'a-first')
    expect(state.accounts.map(a => a.activated)).toEqual([1])
    expect(state.organizations.map(o => o.owner_account)).toEqual([accountId])
    expect(state.violations).toEqual(NO_VIOLATIONS)
    expect(c.defects()).toEqual([])
  })

  it('I-2 并发形／交错 (a)，清除链 ① 先：② 已提交、依据已在手；期限过去，清除链 ① 删组织、尚未提交；③ 排在它后面，提交后现读到已落盘的过期 ⇒ account-record-expired，不激活，本次尝试 interrupted。终态：没有可用账号、没有孤儿', async () => {
    const c = await boot()
    const afterTwo = c.storage.pauseAfterCommit(committed(organizationInsert))
    const main = track(c.service().register('purge-first', PASSWORD))
    await afterTwo.reached
    const accountId = await accountIdOf(c, 'purge-first')
    c.clock!.advance(HOUR + 1)
    const inPurge = c.storage.pauseAfterStatement(organizationDelete)
    const purge = track(c.service().purgeExpired(accountId))
    await inPurge.reached
    afterTwo.release() // 主链带着依据去调 ③
    await settleTurns(50)
    expect(main.settled()).toBe(false) // ③ 的写事务排在清除链 ① 后面
    inPurge.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')
    expect(await purge.promise).toBe('ok')
    const state = await finalState(c, 'purge-first')
    expect(state.accounts).toEqual([])
    expect(state.organizations).toEqual([])
    expect(state.violations).toEqual(NO_VIOLATIONS)
    expect(c.defects()).toEqual([]) // account-record-expired 是正常收场，不是缺陷
  })

  it('OG2已提交个人组织之后清除链跑完，晚到激活读到账号不存在；无孤儿、无误激活', async () => {
    const c = await boot()
    const { main, readGate } = await mainPausedAfterStepTwoCommit(c, 'b-purge-first')
    const accountId = await accountIdOf(c, 'b-purge-first')
    c.clock!.advance(HOUR + 1)
    expect(await c.service().purgeExpired(accountId)).toBe('ok') // ①删掉已提交组织，②删账号
    expect(await accountsOf(c, 'b-purge-first')).toEqual([])
    readGate.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')
    const state = await finalState(c, 'b-purge-first')
    expect(state.organizations).toEqual([])
    expect(state.violations).toEqual(NO_VIOLATIONS)
    // 期间跑过清除链：映射表把这一格记为组合缺陷（「除非期间跑过清除链」），记录带着 AccountId 可供对照
    expect(c.defects()).toEqual([
      { kind: 'composition-defect', step: 3, failure: 'account-not-found', accountId },
    ])
  })

  it('OG2先完整提交，清除①随后删除组织；晚到激活因到期拒绝，清除②正常完成', async () => {
    const c = await boot()
    const { main, readGate } = await mainPausedAfterStepTwoCommit(c, 'b-insert-first')
    const accountId = await accountIdOf(c, 'b-insert-first')
    c.clock!.advance(HOUR + 1)
    const betweenPurgeSteps = c.storage.pauseAfterCommit(purgeOneCommit)
    const purge = track(c.service().purgeExpired(accountId))
    await betweenPurgeSteps.reached // 清除链①已删除组织并提交，②还没开始
    readGate.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')
    const middle = await finalState(c, 'b-insert-first')
    expect(middle.accounts.map(a => [a.activated, a.expired_at !== null])).toEqual([[0, true]])
    expect(middle.organizations).toEqual([])
    expect(middle.violations).toEqual(NO_VIOLATIONS) // 组织有账号；账号未激活
    betweenPurgeSteps.release()
    expect(await purge.promise).toBe<PurgeExpiredResult>('ok')
    // 下一轮：① 这次读到已落盘的过期与那个组织、删掉它；② 再成
    expect(await c.service().purgeExpired(accountId)).toBe('ok')
    const end = await finalState(c, 'b-insert-first')
    expect(end.accounts).toEqual([])
    expect(end.organizations).toEqual([])
    expect(c.defects()).toEqual([])
  })
})

describe('架构评审点名的集成交错（I-1～I-4；与上面 S-43 第 2 支同一批）', () => {
  it('I-1 activate 在 AI 把 expired_at 落盘（C1）之前到达：S-53 的账号读面读到已激活 ⇒ accountIsActivated，组织不动', async () => {
    const c = await boot()
    expect(await c.service().register('i1', PASSWORD)).toBe('registered') // 激活先提交
    const accountId = await accountIdOf(c, 'i1')
    const before = await personalOrganizationsOf(c, accountId)
    c.clock!.advance(HOUR + 1) // 即使时间已过期限：已激活的行不落盘 expired_at
    expect(await c.organizationPurge.purgePersonalOrganization(accountId)).toEqual({
      failure: 'accountIsActivated',
    })
    expect(await personalOrganizationsOf(c, accountId)).toEqual(before)
    const [row] = await accountsOf(c, 'i1')
    expect(row?.expired_at).toBeNull()
  })

  it('I-2 activate 在 C1 之后、OG 删组织的写事务（C2）之前到达：因落盘的 expired_at 被拒；时钟回拨到期限之前再调仍被拒（保护点是列，不是时间谓词）；C2 照常删除', async () => {
    const c = await boot()
    const afterTwo = c.storage.pauseAfterCommit(committed(organizationInsert))
    const main = track(c.service().register('i2', PASSWORD))
    await afterTwo.reached
    const accountId = await accountIdOf(c, 'i2')
    c.clock!.advance(HOUR + 1)
    // 清除链停在 C1（accounts.read 落盘 expired_at 的那次提交）之后、C2 之前
    const afterLanding = c.storage.pauseAfterCommit(
      committed(stmt.on('update', 'account', { column: 'expired_at' })),
    )
    const purge = track(c.service().purgeExpired(accountId))
    await afterLanding.reached
    c.clock!.set(START) // 回拨到期限之前：若激活按「now > deadline」重算，这里就放行了
    afterTwo.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')
    const warrant = issueHandoffWarrant(
      unwrap(loadSigningKey(c.keys.activation.privateKeyPem)),
      'activation',
      accountId,
    )
    expect(await c.accounts.activate(accountId, warrant)).toEqual({
      failure: 'account-record-expired',
    })
    const [row] = await accountsOf(c, 'i2')
    expect(row?.activated).toBe(0)
    afterLanding.release()
    expect(await purge.promise).toBe('ok') // C2 删组织，② 删账号（过期看的是落盘的列）
    expect(await personalOrganizationsOf(c)).toEqual([])
    expect(await accountsOf(c, 'i2')).toEqual([])
  })

  it('OG2已提交组织，随后AI独立读落盘到期；③被拒，清除链收净，无永久孤儿', async () => {
    const c = await boot()
    const { main, readGate } = await mainPausedAfterStepTwoCommit(c, 'i3')
    const accountId = await accountIdOf(c, 'i3')
    c.clock!.advance(HOUR + 1)
    expect(await c.accounts.read(accountId)).toEqual({
      ok: { activated: false, retentionExpired: true },
    }) // 这一次读把 expired_at 落盘
    readGate.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted') // ② 插入成功，③ 读到已落盘的过期
    expect((await personalOrganizationsOf(c, accountId)).map(o => o.owner_account)).toEqual([
      accountId,
    ])
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    expect(await c.service().purgeExpired(accountId)).toBe('ok')
    expect(await personalOrganizationsOf(c)).toEqual([])
    expect(await accountsOf(c, 'i3')).toEqual([])
  })
})

describe('og#S-54 ⑥⑦（真实 AI S-38），挨着跑', () => {
  it('I-5／⑥ ① 之后真跑 AI S-38 清掉账号，再用同一 AccountId 调 S-53 ⇒ ok 且仍返回绑定它的依据，不是 accountDoesNotExist；⑦ 账号不在、组织还在 ⇒ accountDoesNotExist，组织原样、不产依据、可观测', async () => {
    const c = await boot()
    const purgeKey = unwrap(loadVerificationKey(c.purgeVerificationKeyPem))
    // 两个目标：⑥ 的走完 ①②，⑦ 的只构造状态
    c.storage.failCommit(committed(activateUpdate))
    expect(await c.service().register('six', PASSWORD)).toBe('interrupted')
    c.storage.failCommit(committed(activateUpdate))
    expect(await c.service().register('seven', PASSWORD)).toBe('interrupted')
    const six = await accountIdOf(c, 'six')
    const seven = await accountIdOf(c, 'seven')
    c.clock!.advance(HOUR + 1)

    // ⑥
    const first = await c.organizationPurge.purgePersonalOrganization(six)
    if (!('ok' in first)) throw new Error(`⑥ ① ${first.failure}`)
    // I-5 甲：账号在、组织已没 ⇒ ok ＋ 依据（⑦甲 幂等，仍过现读）
    const idempotent = await c.organizationPurge.purgePersonalOrganization(six)
    if (!('ok' in idempotent)) throw new Error(`甲 ${idempotent.failure}`)
    expect(verifyHandoffWarrant(purgeKey, 'purge', six, idempotent.ok.warrant)).toBe('ok')
    expect(await c.accounts.purge(six, first.ok.warrant)).toBe('ok')
    expect(await accountsOf(c, 'six')).toEqual([])
    const again = await c.organizationPurge.purgePersonalOrganization(six)
    if (!('ok' in again)) throw new Error(`⑥ 重扫 ${again.failure}`)
    expect(verifyHandoffWarrant(purgeKey, 'purge', six, again.ok.warrant)).toBe('ok')
    expect(c.errors('organization-governance')).toEqual([])

    // ⑦：输入同样是「账号读不到」，区别只在组织在不在
    const [sevenOrg] = await personalOrganizationsOf(c, seven)
    tamper(c, 'DELETE FROM account WHERE account_id = ?', seven)
    expect(await c.organizationPurge.purgePersonalOrganization(seven)).toEqual({
      failure: 'accountDoesNotExist',
    })
    expect(await personalOrganizationsOf(c, seven)).toEqual([sevenOrg])
    const logged = c.errors('organization-governance')
    expect(logged).toHaveLength(1)
    expect(logged[0]?.args.map(String).join(' ')).toContain(seven)

    // 经本组合发起时两支的收场：⑥ 那一支重扫 ok；⑦ 那一支缺陷型并记契约违反，组织仍在
    expect(await c.service().purgeExpired(six)).toBe('ok')
    expect(await c.service().purgeExpired(seven)).toEqual<PurgeExpiredResult>({
      from: 'S-53',
      failure: 'accountDoesNotExist',
      class: 'defect',
    })
    expect(await personalOrganizationsOf(c, seven)).toEqual([sevenOrg])
    expect(c.defects()).toEqual([
      {
        kind: 'contract-violation',
        step: 'purge-1',
        failure: 'accountDoesNotExist',
        accountId: seven,
      },
    ])
  })
})

describe('ar#S-34 与注册主链并发：交错表其余几格', () => {
  it('主链 ② 先、清除链 ① 删掉它、主链 ③ 在清除链 ② 之前：③ 读到已过期 ⇒ interrupted；清除链 ② 随后清掉账号', async () => {
    const c = await boot()
    const afterTwo = c.storage.pauseAfterCommit(committed(organizationInsert))
    const main = track(c.service().register('cell3', PASSWORD))
    await afterTwo.reached
    const accountId = await accountIdOf(c, 'cell3')
    c.clock!.advance(HOUR + 1)
    const betweenPurgeSteps = c.storage.pauseAfterCommit(committed(organizationDelete))
    const purge = track(c.service().purgeExpired(accountId))
    await betweenPurgeSteps.reached
    afterTwo.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')
    betweenPurgeSteps.release()
    expect(await purge.promise).toBe('ok')
    const state = await finalState(c, 'cell3')
    expect(state.accounts).toEqual([])
    expect(state.organizations).toEqual([])
    expect(c.defects()).toEqual([])
  })

  it('清除链 ① 先、主链 ② 后（① 已提交之后才读）：② 现读到已落盘的过期 ⇒ accountRecordExpired，不会再建出组织', async () => {
    const c = await boot()
    const afterOne = c.storage.pauseAfterCommit(committed(accountInsert))
    const main = track(c.service().register('cell4', PASSWORD))
    await afterOne.reached
    const accountId = await accountIdOf(c, 'cell4')
    c.clock!.advance(HOUR + 1)
    const betweenPurgeSteps = c.storage.pauseAfterCommit(purgeOneCommit)
    const purge = track(c.service().purgeExpired(accountId))
    await betweenPurgeSteps.reached
    const mark = c.storage.statements.length
    afterOne.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')
    expect(c.storage.statements.slice(mark).filter(organizationInsert)).toEqual([])
    betweenPurgeSteps.release()
    expect(await purge.promise).toBe('ok')
    expect((await finalState(c, 'cell4')).organizations).toEqual([])
    expect(c.defects()).toEqual([])
  })

  it('清除链 ② 先、主链 ① 后：清除链 ② 删账号、尚未提交时主链 ① 发起；① 排在后面，之后看到标识已释放 ⇒ 一次全新注册', async () => {
    const c = await boot()
    c.storage.failStatement(organizationInsert)
    expect(await c.service().register('cell5', PASSWORD)).toBe('interrupted')
    const old = await accountIdOf(c, 'cell5')
    c.clock!.advance(HOUR + 1)
    const inDelete = c.storage.pauseAfterStatement(accountDelete)
    const purge = track(c.service().purgeExpired(old))
    await inDelete.reached
    const main = track(c.service().register('cell5', PASSWORD))
    await settleTurns(50)
    expect(main.settled()).toBe(false)
    inDelete.release()
    expect(await purge.promise).toBe('ok')
    expect(await main.promise).toBe<TerminalOutcome>('registered')
    expect(await accountIdOf(c, 'cell5')).not.toBe(old)
    expect((await finalState(c, 'cell5')).violations).toEqual(NO_VIOLATIONS)
  })

  it('主链 ③ vs 清除链 ②，任一顺序 ③ 都成不了：清除链整条先跑完 ⇒ ③ account-not-found；清除链 ② 在事务里时 ③ 排队 ⇒ 同样 account-not-found', async () => {
    const c = await boot()
    // 顺序一：主链停在 ② 之后，清除链整条跑完，主链再去 ③
    const afterTwo = c.storage.pauseAfterCommit(committed(organizationInsert))
    const main = track(c.service().register('cell7a', PASSWORD))
    await afterTwo.reached
    const first = await accountIdOf(c, 'cell7a')
    c.clock!.advance(HOUR + 1)
    expect(await c.service().purgeExpired(first)).toBe('ok')
    afterTwo.release()
    expect(await main.promise).toBe<TerminalOutcome>('interrupted')

    // 顺序二：清除链 ② 删账号、尚未提交，主链 ③ 发起
    const afterTwoAgain = c.storage.pauseAfterCommit(committed(organizationInsert))
    const second = track(c.service().register('cell7b', PASSWORD))
    await afterTwoAgain.reached
    const secondId = await accountIdOf(c, 'cell7b')
    c.clock!.advance(HOUR + 1)
    const inDelete = c.storage.pauseAfterStatement(accountDelete)
    const purge = track(c.service().purgeExpired(secondId))
    await inDelete.reached
    afterTwoAgain.release()
    await settleTurns(50)
    expect(second.settled()).toBe(false)
    inDelete.release()
    expect(await purge.promise).toBe('ok')
    expect(await second.promise).toBe<TerminalOutcome>('interrupted')

    const state = await finalState(c, 'cell7b')
    expect(state.accounts).toEqual([])
    expect(state.organizations).toEqual([])
    expect(state.violations).toEqual(NO_VIOLATIONS)
    // 两次 ③ 都是 account-not-found：期间跑过清除链，按映射表记组合缺陷（记录带 AccountId 可对照）
    expect(c.defects()).toEqual([
      { kind: 'composition-defect', step: 3, failure: 'account-not-found', accountId: first },
      { kind: 'composition-defect', step: 3, failure: 'account-not-found', accountId: secondId },
    ])
  })
})
