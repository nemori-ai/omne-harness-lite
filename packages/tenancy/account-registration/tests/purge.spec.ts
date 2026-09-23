// S-34 清除链与 S-8「撞上已过期记录」那一支：两个发起者（主链就地发起、清扫经 purgeExpired 发起）、三分类、
// 缺陷记录、次序在运行期挡得住、两步之间中断后重扫、「重跑 ① 至多一次」。真实组合，时间用包内替身。
import { afterEach, describe, expect, it } from 'vitest'
import {
  type AccountId,
  generateOpaqueIdentifier,
  issueHandoffWarrant,
  loadSigningKey,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { RegistrationStopped } from '../src/index.ts'
import {
  type Composition,
  type CompositionOptions,
  HOUR,
  NO_VIOLATIONS,
  OTHER_PASSWORD,
  PASSWORD,
  START,
  accountIdOf,
  accountsOf,
  bootComposition,
  committed,
  invariantViolations,
  personalOrganizationsOf,
  stmt,
  tamper,
} from './support.ts'

const compositions: Composition[] = []
afterEach(async () => {
  for (const c of compositions.splice(0).reverse()) await c.dispose()
})
async function boot(options: CompositionOptions = {}): Promise<Composition> {
  const c = await bootComposition({ clock: 'test', retention: HOUR, ...options })
  compositions.push(c)
  return c
}

const activateUpdate = stmt.on('update', 'account', { column: 'activated' })
const expiryLanding = stmt.on('update', 'account', { column: 'expired_at' })
const accountInsert = stmt.on('insert', 'account')
const accountDelete = stmt.on('delete', 'account')
const organizationDelete = stmt.on('delete', 'organization')

/** 走完 ①②、③ 提交失败、然后过期：账号未激活、有个人组织、已过留存期限。 */
async function expiredWithOrganization(c: Composition, identifier: string): Promise<AccountId> {
  c.storage.failCommit(committed(activateUpdate))
  expect(await c.service().register(identifier, PASSWORD)).toBe('interrupted')
  const accountId = await accountIdOf(c, identifier)
  expect(await personalOrganizationsOf(c, accountId)).toHaveLength(1)
  c.clock!.advance(HOUR + 1)
  return accountId
}

/** 只走完 ①、然后过期：账号未激活、没有个人组织、已过留存期限。 */
async function expiredWithoutOrganization(c: Composition, identifier: string): Promise<AccountId> {
  c.storage.failStatement(stmt.on('insert', 'organization'))
  expect(await c.service().register(identifier, PASSWORD)).toBe('interrupted')
  const accountId = await accountIdOf(c, identifier)
  c.clock!.advance(HOUR + 1)
  return accountId
}

function insertsOfAccount(c: Composition, from: number): number {
  return c.storage.statements.slice(from).filter(accountInsert).length
}

describe('S-8 撞上已过期记录：本组合就地跑清除链，两步都 ok 才重跑 ① 一次', () => {
  it('不跑清扫，同一标识再注册：这一次就走到 registered，得到一个全新的 AccountId；旧记录与它的个人组织都没了，没有孤儿', async () => {
    const c = await boot()
    const withOrg = await expiredWithOrganization(c, 'grace')
    expect(await c.service().register('grace', PASSWORD)).toBe('registered')
    const renewed = await accountIdOf(c, 'grace')
    expect(renewed).not.toBe(withOrg)
    expect(await personalOrganizationsOf(c, withOrg)).toEqual([])
    expect(await personalOrganizationsOf(c, renewed)).toHaveLength(1)

    // 另一个人（凭据不同）用一个过期未建组织的标识：同样注册得成（「凭据匹不匹配都一样」）
    const other = await expiredWithoutOrganization(c, 'heidi')
    expect(await c.service().register('heidi', OTHER_PASSWORD)).toBe('registered')
    expect(await accountIdOf(c, 'heidi')).not.toBe(other)

    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    expect(c.defects()).toEqual([])
  })

  it('清除链抖动型失败（S-53 unavailable／S-38 storage-unavailable）⇒ interrupted、不重跑 ①、不记缺陷', async () => {
    const c = await boot()
    const first = await expiredWithOrganization(c, 'ivan')
    // 「不重跑 ①」的可观察形式：写事务里读账号的语句只有 ① 那一次（S-53 这时读到的是已落盘的过期，不写），
    // S-38 那一支再加 S-38 自己的一次；重跑 ① 会多出一次
    const lockedAccountReads = (from: number) =>
      c.storage.statements.slice(from).filter(stmt.on('select', 'account', { inWrite: true }))
        .length
    c.storage.failStatement(organizationDelete)
    let mark = c.storage.statements.length
    expect(await c.service().register('ivan', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)
    expect(lockedAccountReads(mark)).toBe(1)
    expect(await personalOrganizationsOf(c, first)).toHaveLength(1) // 什么都没删

    c.storage.failStatement(accountDelete)
    mark = c.storage.statements.length
    expect(await c.service().register('ivan', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)
    expect(lockedAccountReads(mark)).toBe(2)
    // 停在两步之间：账号记录在、未激活、没有个人组织
    const [row] = await accountsOf(c, 'ivan')
    expect(row?.account_id).toBe(first)
    expect(await personalOrganizationsOf(c, first)).toEqual([])

    expect(c.defects()).toEqual([])
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    // 再来一次（没有故障）：从 ① 重扫、续上 ②、重跑 ①
    expect(await c.service().register('ivan', PASSWORD)).toBe('registered')
  })

  it('清除链缺陷型：S-38 purge-warrant-invalid（核实公钥不配对）⇒ interrupted，记组合缺陷，不重跑 ①', async () => {
    const c = await boot({ mismatchedPurgeKey: true })
    const first = await expiredWithOrganization(c, 'judy')
    const mark = c.storage.statements.length
    expect(await c.service().register('judy', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)
    expect(c.defects()).toEqual([
      {
        kind: 'composition-defect',
        step: 'purge-2',
        failure: 'purge-warrant-invalid',
        accountId: first,
      },
    ])
    const [row] = await accountsOf(c, 'judy')
    expect(row?.account_id).toBe(first) // 什么都没删
  })

  it('清除链缺陷型：S-53 accountDoesNotExist（账号不在、组织还在）⇒ interrupted，记契约违反，组织原样、OG 另有可观测记录', async () => {
    const c = await boot()
    const first = await expiredWithOrganization(c, 'ken')
    const [organization] = await personalOrganizationsOf(c, first)
    // ① 判过期并落盘之后，绕过外键删掉账号行（构造「个人组织存在 ⇒ 账号记录存在」被破）
    c.storage.afterCommit(committed(expiryLanding), async () =>
      tamper(c, 'DELETE FROM account WHERE account_id = ?', first),
    )
    const mark = c.storage.statements.length
    expect(await c.service().register('ken', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)
    expect(c.defects()).toEqual([
      {
        kind: 'contract-violation',
        step: 'purge-1',
        failure: 'accountDoesNotExist',
        accountId: first,
      },
    ])
    expect(await personalOrganizationsOf(c, first)).toEqual([organization])
    expect(c.errors('organization-governance')).toHaveLength(1)
  })

  it('主链路径上不可达的终止型：伪造「已过期」被翻回（accountNotExpired）或记录被激活（accountIsActivated）⇒ interrupted，记契约违反，不重跑 ①，不报 identifier-taken', async () => {
    const c = await boot()
    const first = await expiredWithOrganization(c, 'leo')
    c.storage.afterCommit(committed(expiryLanding), async () => {
      tamper(c, 'UPDATE account SET expired_at = NULL WHERE account_id = ?', first)
      c.clock!.set(START)
    })
    let mark = c.storage.statements.length
    expect(await c.service().register('leo', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)

    c.clock!.advance(HOUR + HOUR)
    const second = await expiredWithOrganization(c, 'mia')
    c.storage.afterCommit(committed(expiryLanding), async () =>
      tamper(c, 'UPDATE account SET activated = 1 WHERE account_id = ?', second),
    )
    mark = c.storage.statements.length
    expect(await c.service().register('mia', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)

    expect(c.defects()).toEqual([
      {
        kind: 'contract-violation',
        step: 'purge-1',
        failure: 'accountNotExpired',
        accountId: first,
      },
      {
        kind: 'contract-violation',
        step: 'purge-1',
        failure: 'accountIsActivated',
        accountId: second,
      },
    ])
  })

  it('两个发起者下都不可达的 S-38 not-expired：伪造 ①② 之间被激活 ⇒ interrupted，记契约违反（purge-2），不重跑 ①', async () => {
    const c = await boot()
    const first = await expiredWithOrganization(c, 'nina')
    c.storage.afterCommit(committed(organizationDelete), async () =>
      tamper(c, 'UPDATE account SET activated = 1 WHERE account_id = ?', first),
    )
    const mark = c.storage.statements.length
    expect(await c.service().register('nina', PASSWORD)).toBe('interrupted')
    expect(insertsOfAccount(c, mark)).toBe(0)
    expect(c.defects()).toEqual([
      { kind: 'contract-violation', step: 'purge-2', failure: 'not-expired', accountId: first },
    ])
  })

  it('重跑 ① 仍撞上已过期记录（窗口里又出现一条同标识的过期记录）⇒ interrupted，不再跑第三次、不清第二条', async () => {
    const c = await boot()
    await expiredWithOrganization(c, 'oscar')
    const intruder = generateOpaqueIdentifier()
    c.storage.afterCommit(committed(accountDelete), async () =>
      tamper(
        c,
        'INSERT INTO account (account_id, login_identifier, credential_material, activated, produced_at, retention_deadline, expired_at) VALUES (?, ?, ?, 0, ?, ?, NULL)',
        intruder,
        'oscar',
        'opaque-material',
        START,
        START + 1,
      ),
    )
    const mark = c.storage.statements.length
    expect(await c.service().register('oscar', PASSWORD)).toBe('interrupted')
    const after = c.storage.statements.slice(mark)
    expect(after.filter(accountDelete)).toHaveLength(1) // 只清了第一条
    expect(after.filter(accountInsert)).toHaveLength(0)
    expect((await accountsOf(c, 'oscar')).map(a => a.account_id)).toEqual([intruder])
    expect(c.defects()).toEqual([])
  })
})

describe('S-34 清除链（清扫经 purgeExpired 发起）', () => {
  it('走得通且可重扫：两步都 ok ⇒ 账号记录与个人组织都没了、标识释放；再扫一遍（两样都已不在）仍 ok', async () => {
    const c = await boot()
    const accountId = await expiredWithOrganization(c, 'pat')
    expect(await c.service().purgeExpired(accountId)).toBe('ok')
    expect(await accountsOf(c, 'pat')).toEqual([])
    expect(await personalOrganizationsOf(c, accountId)).toEqual([])
    expect(await c.service().purgeExpired(accountId)).toBe('ok')
    expect(c.errors('organization-governance')).toEqual([]) // 重扫不是缺陷观测
    expect(await c.service().register('pat', OTHER_PASSWORD)).toBe('registered')
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
  })

  it('次序在运行期挡得住：跳过 ① 直接调 ②（不带依据、带一份别的钥签的依据）⇒ purge-warrant-invalid，什么都没删', async () => {
    const c = await boot()
    const accountId = await expiredWithOrganization(c, 'quinn')
    const forged = issueHandoffWarrant(
      unwrap(loadSigningKey(c.activationSigningKeyPem)),
      'purge',
      accountId,
    )
    expect(await c.accounts.purge(accountId, undefined)).toEqual({
      failure: 'purge-warrant-invalid',
    })
    expect(await c.accounts.purge(accountId, forged)).toEqual({ failure: 'purge-warrant-invalid' })
    expect((await accountsOf(c, 'quinn')).map(a => a.account_id)).toEqual([accountId])
    expect(await personalOrganizationsOf(c, accountId)).toHaveLength(1)
  })

  it('两步之间中断（编排者撤除）：purgeExpired 以 RegistrationStopped 拒绝；停下的状态与「① 之后」逐字相同；装回后重扫走完', async () => {
    const c = await boot()
    const accountId = await expiredWithOrganization(c, 'rita')
    c.storage.afterCommit(committed(organizationDelete), () => c.fibers.registration.dispose())
    await expect(c.service().purgeExpired(accountId)).rejects.toThrow(RegistrationStopped)
    const [row] = await accountsOf(c, 'rita')
    expect(row).toMatchObject({ account_id: accountId, activated: 0 })
    expect(await personalOrganizationsOf(c, accountId)).toEqual([])
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)

    await c.reload('registration')
    // 重扫：① 对「组织已不在、账号仍在」幂等 ok 并再产出依据，② 才续得上
    expect(await c.service().purgeExpired(accountId)).toBe('ok')
    expect(await accountsOf(c, 'rita')).toEqual([])
  })

  it('两步之间中断后，发起者带同一标识、同一凭据回来：注册成立（记录已过期，得到的是全新 AccountId）', async () => {
    const c = await boot()
    const accountId = await expiredWithOrganization(c, 'sam')
    c.storage.afterCommit(committed(organizationDelete), () => c.fibers.registration.dispose())
    await expect(c.service().purgeExpired(accountId)).rejects.toThrow(RegistrationStopped)
    await c.reload('registration')
    expect(await c.service().register('sam', PASSWORD)).toBe('registered')
    expect(await accountIdOf(c, 'sam')).not.toBe(accountId)
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
  })

  it('三分类原样带出（两套拼法不翻译）：终止型不记缺陷；缺陷型记；抖动型不记且下一轮续做', async () => {
    const c = await boot()
    // 终止型：已激活、未过期
    expect(await c.service().register('active', PASSWORD)).toBe('registered')
    const active = await accountIdOf(c, 'active')
    const fresh = await (async () => {
      c.storage.failStatement(stmt.on('insert', 'organization'))
      expect(await c.service().register('fresh', PASSWORD)).toBe('interrupted')
      return accountIdOf(c, 'fresh')
    })()
    expect(await c.service().purgeExpired(active)).toEqual({
      from: 'S-53',
      failure: 'accountIsActivated',
      class: 'terminal',
    })
    expect(await c.service().purgeExpired(fresh)).toEqual({
      from: 'S-53',
      failure: 'accountNotExpired',
      class: 'terminal',
    })
    expect(await personalOrganizationsOf(c, active)).toHaveLength(1)
    expect(c.defects()).toEqual([])

    // 抖动型：两步各一支；下一轮续做
    const flaky = await expiredWithOrganization(c, 'flaky')
    c.storage.failStatement(organizationDelete)
    expect(await c.service().purgeExpired(flaky)).toEqual({
      from: 'S-53',
      failure: 'unavailable',
      class: 'transient',
    })
    c.storage.failStatement(accountDelete)
    expect(await c.service().purgeExpired(flaky)).toEqual({
      from: 'S-38',
      failure: 'storage-unavailable',
      class: 'transient',
    })
    expect(c.defects()).toEqual([])
    expect(await c.service().purgeExpired(flaky)).toBe('ok')

    // 缺陷型：表示层（无 AccountId 可带）、目标不是个人组织、账号不在而组织还在
    expect(await c.service().purgeExpired('')).toEqual({
      from: 'S-53',
      failure: 'invalidInput',
      class: 'defect',
    })
    const teamish = await expiredWithOrganization(c, 'teamish')
    tamper(c, "UPDATE organization SET kind = 'team' WHERE owner_account = ?", teamish)
    expect(await c.service().purgeExpired(teamish)).toEqual({
      from: 'S-53',
      failure: 'organizationIsNotPersonal',
      class: 'defect',
    })
    const orphaned = await expiredWithOrganization(c, 'orphaned')
    tamper(c, 'DELETE FROM account WHERE account_id = ?', orphaned)
    expect(await c.service().purgeExpired(orphaned)).toEqual({
      from: 'S-53',
      failure: 'accountDoesNotExist',
      class: 'defect',
    })
    expect(c.defects()).toEqual([
      { kind: 'composition-defect', step: 'purge-1', failure: 'invalidInput' },
      {
        kind: 'composition-defect',
        step: 'purge-1',
        failure: 'organizationIsNotPersonal',
        accountId: teamish,
      },
      {
        kind: 'contract-violation',
        step: 'purge-1',
        failure: 'accountDoesNotExist',
        accountId: orphaned,
      },
    ])
  })

  it('S-38 的缺陷型与不可达的终止型：purge-warrant-invalid 记组合缺陷；not-expired（伪造）标 terminal、记契约违反', async () => {
    const mismatched = await boot({ mismatchedPurgeKey: true })
    const target = await expiredWithOrganization(mismatched, 'uma')
    expect(await mismatched.service().purgeExpired(target)).toEqual({
      from: 'S-38',
      failure: 'purge-warrant-invalid',
      class: 'defect',
    })
    expect(mismatched.defects()).toEqual([
      {
        kind: 'composition-defect',
        step: 'purge-2',
        failure: 'purge-warrant-invalid',
        accountId: target,
      },
    ])

    const c = await boot()
    const forged = await expiredWithOrganization(c, 'victor')
    c.storage.afterCommit(committed(organizationDelete), async () =>
      tamper(c, 'UPDATE account SET activated = 1 WHERE account_id = ?', forged),
    )
    expect(await c.service().purgeExpired(forged)).toEqual({
      from: 'S-38',
      failure: 'not-expired',
      class: 'terminal',
    })
    expect(c.defects()).toEqual([
      { kind: 'contract-violation', step: 'purge-2', failure: 'not-expired', accountId: forged },
    ])
  })
})

describe('S-34 两个发起者在同一条过期记录上并发', () => {
  it('清扫 ① 先：主链就地发起的 ① 走 ⑦甲（组织已清、账号仍在）仍过现读再 ok ＋ 依据；两边的 ② 幂等收敛，主链重跑 ① 得新账号', async () => {
    const c = await boot()
    const old = await expiredWithOrganization(c, 'wendy')
    const sweeperPaused = c.storage.pauseAfterCommit(committed(organizationDelete))
    const sweeper = c.service().purgeExpired(old)
    await sweeperPaused.reached
    expect(await c.service().register('wendy', PASSWORD)).toBe('registered')
    sweeperPaused.release()
    expect(await sweeper).toBe('ok') // ② 对「记录已不存在」幂等（先核依据）
    expect(await accountIdOf(c, 'wendy')).not.toBe(old)
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    expect(c.defects()).toEqual([])
  })

  it('主链 ① 先：清扫在主链两步之间跑完，主链的 ② 幂等 ok、重跑 ① 得新账号', async () => {
    const c = await boot()
    const old = await expiredWithOrganization(c, 'xavier')
    const mainPaused = c.storage.pauseAfterCommit(committed(organizationDelete))
    const main = c.service().register('xavier', PASSWORD)
    await mainPaused.reached
    expect(await c.service().purgeExpired(old)).toBe('ok')
    mainPaused.release()
    expect(await main).toBe('registered')
    expect(await accountIdOf(c, 'xavier')).not.toBe(old)
    expect(await invariantViolations(c)).toEqual(NO_VIOLATIONS)
    expect(c.defects()).toEqual([])
  })
})
