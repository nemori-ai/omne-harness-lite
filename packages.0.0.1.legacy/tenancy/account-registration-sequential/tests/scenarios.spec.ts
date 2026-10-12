// composition.account-registration v1 §八的规范场景 S-27～S-31，加 S-5（四值闭合的运行期一面）与 S-8 失败值映射。
// 全部是真实组合：真实 AI／OG／AR 插件、真实 storage-sql（临时 sqlite 文件）、真实 clock（需要前推时间的用包内替身）；
// 凭据是真实 credential-verification（测试参数）。
import { afterEach, describe, expect, it } from 'vitest'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { TERMINAL_OUTCOMES, type TerminalOutcome } from '@omne-harness-lite/account-registration'
import {
  type Composition,
  type CompositionOptions,
  HOUR,
  NO_VIOLATIONS,
  OTHER_PASSWORD,
  PASSWORD,
  accountIdOf,
  accountsOf,
  bootComposition,
  committed,
  formOf,
  invariantViolations,
  membershipsOf,
  personalOrganizationsOf,
  settleTurns,
  stmt,
  tamper,
} from './support.ts'

const compositions: Composition[] = []
afterEach(async () => {
  for (const c of compositions.splice(0).reverse()) await c.dispose()
})
async function boot(options: CompositionOptions = {}): Promise<Composition> {
  const c = await bootComposition(options)
  compositions.push(c)
  return c
}

const activateUpdate = stmt.on('update', 'account', { column: 'activated' })
const accountInsert = stmt.on('insert', 'account')
const organizationInsert = stmt.on('insert', 'organization')

async function unloadAt(
  c: Composition,
  identifier: string,
  predicate: Parameters<Composition['storage']['pauseAfterCommit']>[0],
  owner: 'registration' | 'organizationGovernance' = 'registration',
) {
  const gate = c.storage.pauseAfterCommit(predicate)
  const running = c.service().register(identifier, PASSWORD)
  await gate.reached
  let ended = false
  const stopping = c.fibers[owner].dispose().then(() => {
    ended = true
  })
  try {
    await settleTurns(2)
    expect(ended).toBe(false) // whole registration still owns its paused step
  } finally {
    gate.release()
  }
  const outcome = await running
  await stopping
  return { outcome, afterDispose: c.storage.statements.length }
}

function expectTerminal(outcome: TerminalOutcome): void {
  expect(TERMINAL_OUTCOMES).toContain(outcome)
}

/** 注册成立的存储形态：账号已激活、恰一个个人组织、该账号在其中有效且为超管。 */
async function expectRegistered(c: Composition, identifier: string) {
  const [account, ...more] = await accountsOf(c, identifier)
  expect(more).toEqual([])
  expect(account?.activated).toBe(1)
  const organizations = await personalOrganizationsOf(c, account?.account_id)
  expect(organizations).toHaveLength(1)
  expect(await membershipsOf(c, organizations[0]?.organization_id ?? '')).toEqual([
    {
      organization_id: organizations[0]?.organization_id,
      account_id: account?.account_id,
      effective: 1,
      role: 'superAdministrator',
    },
  ])
  expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
  return account?.account_id
}

describe('S-27 中途失败后用同一标识重来', () => {
  it('② 提交前注入存储故障 ⇒ interrupted、账号停在未激活；同标识同凭据重来 ⇒ 不报 identifier-taken，从 ② 接着走到 registered，恰一个个人组织', async () => {
    const c = await boot()
    c.storage.failStatement(organizationInsert)
    expect(await c.service().register('alice', PASSWORD)).toBe('interrupted')
    const [stopped] = await accountsOf(c, 'alice')
    expect(stopped?.activated).toBe(0)
    expect(await personalOrganizationsOf(c)).toEqual([])

    expect(await c.service().register('alice', PASSWORD)).toBe('registered')
    const registered = await expectRegistered(c, 'alice')
    expect(registered).toBe(stopped?.account_id) // ① 认回同一个 AccountId，不产生第二个
  })

  it('停在 ①、②、③ 任一位置之后重来都能接着完成；③ 那一支证 ② 幂等那一路照样产出激活依据', async () => {
    const c = await boot()
    // 停在 ① 之前（① 自己的写失败）：没有账号
    c.storage.failStatement(accountInsert)
    expect(await c.service().register('p1', PASSWORD)).toBe('interrupted')
    expect(await accountsOf(c, 'p1')).toEqual([])
    expect(await c.service().register('p1', PASSWORD)).toBe('registered')
    await expectRegistered(c, 'p1')

    // 停在 ③ 之前（③ 的提交失败）：个人组织已在；重来时 ② 走幂等那一路，依据照样产出，③ 走得通
    c.storage.failCommit(committed(activateUpdate))
    expect(await c.service().register('p3', PASSWORD)).toBe('interrupted')
    const p3 = await accountIdOf(c, 'p3')
    const [organization] = await personalOrganizationsOf(c, p3)
    expect(organization).toBeDefined()
    expect(await c.service().register('p3', PASSWORD)).toBe('registered')
    await expectRegistered(c, 'p3')
    expect(await personalOrganizationsOf(c, p3)).toEqual([organization]) // 认回的是既有的那一个
  })

  it('③ 提交成立而回执没到（S-6 第四行）：存储已是注册成立；以同一标识重来得 identifier-taken', async () => {
    const c = await boot()
    expect(await c.service().register('carol', PASSWORD)).toBe('registered')
    expect(await c.service().register('carol', PASSWORD)).toBe('identifier-taken')
    await expectRegistered(c, 'carol')
  })
})

describe('S-28 在任意位置中断，没有第三种形态', () => {
  it('① 之后、② 之后（编排者撤除）、③ 提交之前（提交失败）三个位置各中断一次、此后不重试：每一个都落在两种形态之一', async () => {
    const c = await boot()
    const outcomes: TerminalOutcome[] = []

    outcomes.push((await unloadAt(c, 'after-1', committed(accountInsert))).outcome)
    await c.reload('registration')

    outcomes.push((await unloadAt(c, 'after-2', committed(organizationInsert))).outcome)
    await c.reload('registration')

    c.storage.failCommit(committed(activateUpdate))
    outcomes.push(await c.service().register('before-3', PASSWORD))

    expect(outcomes).toEqual(['interrupted', 'interrupted', 'interrupted'])
    for (const identifier of ['after-1', 'after-2', 'before-3']) {
      expect(await formOf(c, identifier)).toBe('no-usable-account')
    }
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
  })

  it('同三个位置以存储故障中断（不撤编排者）：同样只有两种形态', async () => {
    const c = await boot()
    c.storage.failStatement(stmt.on('select', 'account', { inWrite: false }))
    c.storage.failStatement(stmt.on('select', 'organization', { inWrite: true }))
    const outcomes = [
      await c.service().register('f1', PASSWORD), // ① 的快照读失败
      await c.service().register('f2', PASSWORD), // ② 的账号读面失败（① 已提交）
    ]
    c.storage.failStatement(activateUpdate)
    outcomes.push(await c.service().register('f3', PASSWORD)) // ③ 的写失败
    expect(outcomes).toEqual(['interrupted', 'interrupted', 'interrupted'])
    for (const identifier of ['f1', 'f2', 'f3'])
      expect(await formOf(c, identifier)).toBe('no-usable-account')
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
  })
})

describe('S-29 参与方缺席时不放行', () => {
  it('装配期缺席：撤掉 organization-governance ⇒ 本 fiber PENDING、registration 解析不到；装回后恢复', async () => {
    const c = await boot()
    await c.fibers.organizationGovernance.dispose()
    expect(c.fibers.registration.state as number).toBe(FIBER_STATE.PENDING)
    expect(c.registration()).toBeUndefined()

    await c.reload('organizationGovernance')
    await settleTurns()
    expect(c.fibers.registration.state as number).toBe(FIBER_STATE.ACTIVE)
    expect(await c.service().register('back', PASSWORD)).toBe('registered')
  })

  it('运行期不可用：② 返回 unavailable ⇒ 不激活（③ 根本不调用），interrupted，账号停在未激活', async () => {
    const c = await boot()
    c.storage.failStatement(stmt.on('select', 'organization', { inWrite: true }))
    const before = c.storage.statements.length
    expect(await c.service().register('dave', PASSWORD)).toBe('interrupted')
    const [account] = await accountsOf(c, 'dave')
    expect(account?.activated).toBe(0)
    expect(c.storage.statements.slice(before).filter(activateUpdate)).toEqual([])
    expect(
      c.storage.statements.slice(before).filter(stmt.on('select', 'account', { inWrite: true })),
    ).toHaveLength(2) // ① 的锁定读 + ②内AI3 read；③ 的锁定读不存在
  })

  it('在途时 organization-governance 被撤：① 与 ② 之间撤掉它 ⇒ 本插件随之卸载，在途尝试 interrupted，账号停在未激活、不激活', async () => {
    const c = await boot()
    const before = c.storage.statements.length
    expect(
      (await unloadAt(c, 'erin', committed(accountInsert), 'organizationGovernance')).outcome,
    ).toBe('interrupted')
    expect(c.fibers.registration.state as number).toBe(FIBER_STATE.PENDING)
    const [account] = await accountsOf(c, 'erin')
    expect(account?.activated).toBe(0)
    expect(await personalOrganizationsOf(c)).toEqual([])
    expect(c.storage.statements.slice(before).filter(activateUpdate)).toEqual([])
  })
})

describe('S-30 编排者被卸载，在途尝试等同崩溃', () => {
  it('① 与 ② 之间卸载 registration ⇒ interrupted；账号停在未激活、没有任何清理；装回后以同一标识重来接着完成', async () => {
    const c = await boot()
    const { outcome, afterDispose } = await unloadAt(c, 'frank', committed(accountInsert))
    expect(outcome).toBe('interrupted')
    const stopped = await accountIdOf(c, 'frank')
    const [account] = await accountsOf(c, 'frank')
    expect(account?.activated).toBe(0)
    expect(await personalOrganizationsOf(c)).toEqual([])
    // 没有清理：撤除之后本次尝试没有再发任何语句（不删账号、不建组织）
    expect(c.storage.statements.length).toBe(afterDispose)
    expect(c.registration()).toBeUndefined()

    await c.reload('registration')
    expect(await c.service().register('frank', PASSWORD)).toBe('registered')
    expect(await expectRegistered(c, 'frank')).toBe(stopped)
  })
})

describe('S-31 两个同标识并发注册', () => {
  it('同一凭据并发：只产生一个账号、一个个人组织；至少一次 registered，另一次是 registered 或（对方 ③ 已先提交时）identifier-taken', async () => {
    // S-31「两次都可以是 registered」是允许不是必须：后到的 ① 若在先到者 ③ 提交之后才判定，按 S-12 第二行得 identifier-taken。
    // 两次都 registered 的那一种由下面「强制交错」一例钉住
    const c = await boot()
    for (let round = 0; round < 8; round += 1) {
      const identifier = `same-${round}`
      const outcomes = await Promise.all([
        c.service().register(identifier, PASSWORD),
        c.service().register(identifier, PASSWORD),
      ])
      expect(outcomes, JSON.stringify(c.messages())).toContain('registered')
      for (const outcome of outcomes)
        expect(['registered', 'identifier-taken'], JSON.stringify(c.messages())).toContain(outcome)
      await expectRegistered(c, identifier)
    }
  })

  it('不同凭据并发：先成者 registered，后成者 identifier-taken；账号的凭据是先成者的', async () => {
    const c = await boot()
    for (let round = 0; round < 5; round += 1) {
      const identifier = `diff-${round}`
      const [a, b] = await Promise.all([
        c.service().register(identifier, PASSWORD),
        c.service().register(identifier, OTHER_PASSWORD),
      ])
      expect([a, b].sort(), JSON.stringify(c.messages())).toEqual([
        'identifier-taken',
        'registered',
      ])
      await expectRegistered(c, identifier)
      // 先成者的凭据认得回这条记录（① 认回走比对），后成者的不行
      const winner = a === 'registered' ? PASSWORD : OTHER_PASSWORD
      const loser = a === 'registered' ? OTHER_PASSWORD : PASSWORD
      expect(await c.service().register(identifier, winner)).toBe('identifier-taken')
      expect(await c.service().register(identifier, loser)).toBe('identifier-taken')
    }
  })

  it('强制交错：A 在 ① 提交之后停住，B 同标识走完；A 放行后收场按 S-12（同凭据 registered，不同凭据 identifier-taken）', async () => {
    const c = await boot()
    const same = c.storage.pauseAfterCommit(committed(accountInsert))
    const a = c.service().register('forced-same', PASSWORD)
    await same.reached
    expect(await c.service().register('forced-same', PASSWORD)).toBe('registered')
    same.release()
    expect(await a).toBe('registered')
    await expectRegistered(c, 'forced-same')

    const diff = c.storage.pauseAfterCommit(committed(accountInsert))
    const first = c.service().register('forced-diff', PASSWORD)
    await diff.reached
    expect(await c.service().register('forced-diff', OTHER_PASSWORD)).toBe('identifier-taken')
    diff.release()
    expect(await first).toBe('registered')
    await expectRegistered(c, 'forced-diff')
  })
})

describe('S-8 参与方失败值 → 终结结果（主链；清除链那一半在 purge.spec）', () => {
  it('① 的四个失败值：identifier-taken／credential-rejected／invalid-input（另记入口缺陷）／storage-unavailable', async () => {
    const c = await boot()
    expect(await c.service().register('taken', PASSWORD)).toBe('registered')
    const outcomes = [
      await c.service().register('taken', OTHER_PASSWORD),
      await c.service().register('short', 'short'),
      await c.service().register(' leading-space', PASSWORD),
    ]
    c.storage.failStatement(stmt.on('select', 'account', { inWrite: false }))
    outcomes.push(await c.service().register('flaky', PASSWORD))
    expect(outcomes).toEqual([
      'identifier-taken',
      'credential-rejected',
      'interrupted',
      'interrupted',
    ])
    outcomes.forEach(expectTerminal)
    // credential-rejected 不占用标识；表示层不合格与存储不可用都不留账号
    expect(await accountsOf(c, 'short')).toEqual([])
    expect(await accountsOf(c, 'flaky')).toEqual([])
    // 只有 invalid-input 那一支另记缺陷，且是入口缺陷；存储不可用的 interrupted 不记
    expect(c.defects()).toEqual([{ kind: 'entry-defect', step: 1, failure: 'invalid-input' }])
  })

  it('② 的失败值：accountRecordExpired ⇒ interrupted 不记；accountDoesNotExist ⇒ interrupted 并记组合缺陷；unavailable ⇒ interrupted 不记', async () => {
    const c = await boot({ clock: 'test', retention: HOUR })
    const clock = c.clock!
    // accountRecordExpired：① 提交之后期限过去
    c.storage.afterCommit(committed(accountInsert), async () => clock.advance(HOUR + 1))
    expect(await c.service().register('late', PASSWORD)).toBe('interrupted')
    expect(await personalOrganizationsOf(c)).toEqual([])
    expect(c.defects()).toEqual([])

    // accountDoesNotExist：① 提交之后账号记录被人删掉（绕过一切，构造「期间没跑清除链却不在了」）
    c.storage.afterCommit(committed(accountInsert), async () =>
      tamper(c, "DELETE FROM account WHERE login_identifier = 'vanished'"),
    )
    expect(await c.service().register('vanished', PASSWORD)).toBe('interrupted')
    const [defect] = c.defects()
    expect(defect).toMatchObject({
      kind: 'composition-defect',
      step: 2,
      failure: 'accountDoesNotExist',
    })
    expect(defect?.accountId).toEqual(expect.any(String))

    c.storage.failStatement(stmt.on('select', 'organization', { inWrite: true }))
    expect(await c.service().register('down', PASSWORD)).toBe('interrupted')
    expect(c.defects()).toHaveLength(1)
  })

  it('③ 的失败值：account-record-expired／storage-unavailable ⇒ interrupted 不记；account-not-found 与 warrant-invalid ⇒ interrupted 并记组合缺陷', async () => {
    const c = await boot({ clock: 'test', retention: HOUR })
    const clock = c.clock!
    c.storage.afterCommit(committed(organizationInsert), async () => clock.advance(HOUR + 1))
    expect(await c.service().register('expired-at-3', PASSWORD)).toBe('interrupted')
    const [expiredAt3] = await accountsOf(c, 'expired-at-3')
    expect(expiredAt3?.activated).toBe(0)

    c.storage.failStatement(activateUpdate)
    expect(await c.service().register('down-at-3', PASSWORD)).toBe('interrupted')
    expect(c.defects()).toEqual([])

    // account-not-found：② 提交之后账号行被绕过外键删掉
    c.storage.afterCommit(committed(organizationInsert), async () =>
      tamper(c, "DELETE FROM account WHERE login_identifier = 'gone-at-3'"),
    )
    expect(await c.service().register('gone-at-3', PASSWORD)).toBe('interrupted')
    expect(c.defects()).toMatchObject([
      { kind: 'composition-defect', step: 3, failure: 'account-not-found' },
    ])
  })

  it('warrant-invalid：AI 核实用的公钥与本插件的私钥不配对 ⇒ interrupted，记组合缺陷，账号停在未激活', async () => {
    const c = await boot({ mismatchedActivationKey: true })
    expect(await c.service().register('mismatch', PASSWORD)).toBe('interrupted')
    const [account] = await accountsOf(c, 'mismatch')
    expect(account?.activated).toBe(0)
    expect(c.defects()).toEqual([
      {
        kind: 'composition-defect',
        step: 3,
        failure: 'warrant-invalid',
        accountId: account?.account_id,
      },
    ])
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
  })
})
