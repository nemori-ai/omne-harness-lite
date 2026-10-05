// capability.account-identity v2 §八的规范场景（契约 v2），按节点 verification.md 的行逐条落到真实库上。
// 夹具：真实 storage-sql（临时文件库）+ 真实 credential-verification + 包内 Clock 替身。
// 归别处的支写成带指向的 it.skip。
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type AccountId,
  isOk,
  issueHandoffWarrant,
  parseOpaqueIdentifier,
} from '@omne-harness-lite/identity-values'
import {
  type Harness,
  HOUR_MS,
  activationWarrant,
  asLoginStateId,
  loginOk,
  openHarness,
  produceOk,
  purgeWarrant,
  registerActivated,
  rows,
  warrantKeys,
} from './support.ts'

let open: Harness[] = []
async function harness(label: string, options = {}): Promise<Harness> {
  const h = await openHarness({ label, ...options })
  open.push(h)
  return h
}
afterEach(async () => {
  for (const h of open) await h.dispose()
  open = []
})

/** 测试自己的 SHA-256（被测实现之外）：出示物逐码点的 UTF-8 → SHA-256 → 64 个小写十六进制。 */
function independentDerive(presentation: string): string {
  return createHash('sha256').update(Buffer.from(presentation, 'utf8')).digest('hex')
}

/** S-46 的三种形式：原样、UTF-8 字节的 base64url（带与不带填充）、UTF-8 字节的十六进制（大小写）。 */
function exposureForms(presentation: string): string[] {
  const bytes = Buffer.from(presentation, 'utf8')
  const unpadded = bytes.toString('base64url')
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4)
  const hex = bytes.toString('hex')
  return [presentation, unpadded, padded, hex, hex.toUpperCase()]
}

/** 库文件／预写日志里的可打印 ASCII 串（`strings` 的做法），每一段都当出示物试一遍。 */
function printableRuns(bytes: Buffer, minLength = 8): string[] {
  const runs: string[] = []
  let start = -1
  for (let i = 0; i <= bytes.length; i += 1) {
    const byte = i < bytes.length ? bytes[i]! : 0
    const printable = byte >= 0x21 && byte <= 0x7e
    if (printable && start === -1) start = i
    if (!printable && start !== -1) {
      if (i - start >= minLength) runs.push(bytes.subarray(start, i).toString('latin1'))
      start = -1
    }
  }
  return runs
}

describe('capability.account-identity v2 · 规范场景', () => {
  it('S-31 三种登录失败反馈完全一致：不存在／凭据错／未激活，同一次演练里比对', async () => {
    const h = await harness('s31')
    await registerActivated(h, 'alice', 'alice-password')
    await produceOk(h, 'bob-unactivated', 'bob-password')
    const nonexistent = await h.logins.issue('nobody', 'whatever-password')
    const wrongCredential = await h.logins.issue('alice', 'not-alice-password')
    const unactivated = await h.logins.issue('bob-unactivated', 'bob-password')
    expect(nonexistent).toStrictEqual({ failure: 'identifier-or-credential-rejected' })
    expect(wrongCredential).toStrictEqual(nonexistent)
    expect(unactivated).toStrictEqual(nonexistent)
    // 返回值的任何位置都没有可区分的痕迹：序列化逐字相同，且只有一个键
    expect(JSON.stringify(wrongCredential)).toBe(JSON.stringify(nonexistent))
    expect(JSON.stringify(unactivated)).toBe(JSON.stringify(nonexistent))
    expect(Object.keys(unactivated)).toEqual(['failure'])
    // 三次都没留下登录状态
    expect(await rows(h, 'login_state')).toHaveLength(0)
  })

  it('S-33 退出的作用范围：撤销 A 之后，B 过 verify、B 的出示物过 exchange，A 的出示物被拒', async () => {
    const h = await harness('s33')
    const accountId = await registerActivated(h, 'carol', 'carol-password')
    const a = await loginOk(h, 'carol', 'carol-password')
    const b = await loginOk(h, 'carol', 'carol-password')
    expect(await h.logins.revoke(a.loginStateId, a.loginStateId)).toBe('ok')
    expect(await h.logins.verify(b.loginStateId)).toStrictEqual({ ok: accountId })
    expect(await h.logins.exchange(b.presentation)).toStrictEqual({
      ok: { loginStateId: b.loginStateId, accountId },
    })
    expect(await h.logins.exchange(a.presentation)).toStrictEqual({
      failure: 'login-state-rejected',
    })
    expect(h.events).toContainEqual({
      name: 'account-identity/login-revoked',
      payload: { loginStateId: a.loginStateId, accountId },
    })
  })

  it('S-16 撤销（v2 改写：来源要求只及发起方）：目标以未标类型的字符串交进去，五支同一次里跑', async () => {
    const h = await harness('s16')
    await registerActivated(h, 'dave', 'dave-password')
    await registerActivated(h, 'erin', 'erin-password')
    const dave = await loginOk(h, 'dave', 'dave-password')
    const daveOther = await loginOk(h, 'dave', 'dave-password')
    const erin = await loginOk(h, 'erin', 'erin-password')
    const wire = (value: string): unknown => value

    // ① 目标是另一个账号的有效 LoginStateId；② 目标从没存在过——逐字相同，两个账号的登录状态都原样
    const otherAccount = await h.logins.revoke(wire(erin.loginStateId), dave.loginStateId)
    const neverExisted = await h.logins.revoke(wire('f'.repeat(64)), dave.loginStateId)
    expect(otherAccount).toStrictEqual({ failure: 'login-state-not-found' })
    expect(neverExisted).toStrictEqual(otherAccount)
    expect(await h.logins.verify(erin.loginStateId)).toHaveProperty('ok')
    expect(await h.logins.verify(dave.loginStateId)).toHaveProperty('ok')

    // ③ 目标合 IV S-31 但不是十六进制（26 个字符的 base32）⇒ 查不到，不是 invalid-input（表示层没有收紧）
    expect(
      await h.logins.revoke(wire('abcdefghijklmnopqrstuvwxyz'), dave.loginStateId),
    ).toStrictEqual({ failure: 'login-state-not-found' })

    // ④ 目标为空串或首尾带空白 ⇒ invalid-input；发起方已失效时也是它（表示层先于授权）
    expect(await h.logins.revoke(wire(''), dave.loginStateId)).toStrictEqual({
      failure: 'invalid-input',
    })
    expect(await h.logins.revoke(wire(` ${erin.loginStateId}`), dave.loginStateId)).toStrictEqual({
      failure: 'invalid-input',
    })

    // 在列表上撤掉同账号的另一个登录状态，再撤一次 ⇒ ok（两半授权都过之后才幂等）
    expect(await h.logins.revoke(wire(daveOther.loginStateId), dave.loginStateId)).toBe('ok')
    expect(await h.logins.revoke(wire(daveOther.loginStateId), dave.loginStateId)).toBe('ok')
    expect(h.events.filter(e => e.name === 'account-identity/login-revoked')).toHaveLength(1)

    // 发起方退出；⑤ 发起方已失效，目标存在与不存在各跑一次 ⇒ 都是 not-authorized
    expect(await h.logins.revoke(wire(dave.loginStateId), dave.loginStateId)).toBe('ok')
    expect(await h.logins.revoke(wire(erin.loginStateId), dave.loginStateId)).toStrictEqual({
      failure: 'not-authorized',
    })
    expect(await h.logins.revoke(wire('0'.repeat(64)), dave.loginStateId)).toStrictEqual({
      failure: 'not-authorized',
    })
    // 重复退出：第二次的发起方正是刚被撤掉的那一个 ⇒ not-authorized，不是 ok
    expect(await h.logins.revoke(wire(dave.loginStateId), dave.loginStateId)).toStrictEqual({
      failure: 'not-authorized',
    })
    // ④ 的后半：发起方已失效、目标表示非法 ⇒ 仍是 invalid-input
    expect(await h.logins.revoke(wire('\t'), dave.loginStateId)).toStrictEqual({
      failure: 'invalid-input',
    })
    expect(await h.logins.verify(erin.loginStateId)).toHaveProperty('ok')
  })

  it('S-34 同标识四路对比 + 求值次序支，同一次演练里比对', async () => {
    const h = await harness('s34')
    // 1. 已激活 ⇒ identifier-taken，且没有第二条记录
    await registerActivated(h, 'route1', 'first-password')
    const route1 = await h.accounts.produce('route1', 'first-password')
    // 2. 未激活、期限内、凭据匹配 ⇒ 同一个 AccountId
    const route2Id = await produceOk(h, 'route2', 'first-password')
    const route2 = await h.accounts.produce('route2', 'first-password')
    // 3. 未激活、期限内、凭据不匹配 ⇒ identifier-taken，与第 1 路逐字相同
    await produceOk(h, 'route3', 'first-password')
    const route3 = await h.accounts.produce('route3', 'other-password')
    // 4. 未激活、已过期 ⇒ identifier-held-by-expired-record 携 AccountId；凭据匹配与否两支都跑、值完全一样
    const route4Id = await produceOk(h, 'route4', 'first-password')
    h.clock.advance(HOUR_MS + 1)
    const route4Match = await h.accounts.produce('route4', 'first-password')
    const route4Mismatch = await h.accounts.produce('route4', 'other-password')
    // 5. 求值次序：不合规凭据撞已激活标识 ⇒ credential-rejected，不是 identifier-taken
    const route5 = await h.accounts.produce('route1', 'short')

    expect(route1).toStrictEqual({ failure: 'identifier-taken' })
    expect(route2).toStrictEqual({ ok: route2Id })
    expect(route3).toStrictEqual(route1)
    expect(route4Match).toStrictEqual({
      failure: 'identifier-held-by-expired-record',
      expiredRecord: route4Id,
    })
    expect(route4Mismatch).toStrictEqual(route4Match)
    expect(route5).toStrictEqual({ failure: 'credential-rejected', reason: 'min-length:8' })
    const identifiers = (await rows(h, 'account')).map(row => row['login_identifier'])
    expect(identifiers.sort()).toEqual(['route1', 'route2', 'route3', 'route4'])
    // 注册路径不发事件（未激活账号对外等同于不存在）
    expect(h.events.filter(e => e.name !== 'account-identity/account-activated')).toHaveLength(0)
  })

  it('S-40 有效登录状态列得全 + 读不到不返回空集，两支同一次里跑', async () => {
    const h = await harness('s40')
    await registerActivated(h, 'frank', 'frank-password')
    const first = await loginOk(h, 'frank', 'frank-password')
    h.clock.advance(1000)
    const second = await loginOk(h, 'frank', 'frank-password')
    h.clock.advance(1000)
    const third = await loginOk(h, 'frank', 'frank-password')
    const listed = await h.logins.listEffective(second.loginStateId)
    expect(listed).toStrictEqual({
      ok: [
        {
          loginStateId: first.loginStateId,
          issuedAt: h.clock.current - 2000,
          lastActivityAt: h.clock.current - 2000,
          absoluteExpiresAt: h.clock.current - 2000 + 8 * HOUR_MS,
          idleExpiresAt: h.clock.current - 2000 + HOUR_MS,
        },
        {
          loginStateId: second.loginStateId,
          issuedAt: h.clock.current - 1000,
          lastActivityAt: h.clock.current - 1000,
          absoluteExpiresAt: h.clock.current - 1000 + 8 * HOUR_MS,
          idleExpiresAt: h.clock.current - 1000 + HOUR_MS,
        },
        {
          loginStateId: third.loginStateId,
          issuedAt: h.clock.current,
          lastActivityAt: h.clock.current,
          absoluteExpiresAt: h.clock.current + 8 * HOUR_MS,
          idleExpiresAt: h.clock.current + HOUR_MS,
        },
      ],
    })
    expect(await h.logins.revoke(first.loginStateId, second.loginStateId)).toBe('ok')
    const after = await h.logins.listEffective(second.loginStateId)
    expect('ok' in after && after.ok.map(s => s.loginStateId)).toEqual([
      second.loginStateId,
      third.loginStateId,
    ])
    expect(await h.logins.verify(third.loginStateId)).toHaveProperty('ok')

    h.storage.readUnavailable = true
    expect(await h.logins.listEffective(second.loginStateId)).toStrictEqual({
      failure: 'storage-unavailable',
    })
  })

  it('S-41 未激活记录到期释放标识：五支同一次里跑', async () => {
    const h = await harness('s41')
    // ① 到期后清除，再用同一标识重注册 ⇒ 清除 ok，重注册成功且是另一个 AccountId
    const stale = await produceOk(h, 'gina', 'gina-password')
    // ② 用的记录：期限内
    const young = await produceOk(h, 'young', 'young-password')
    // ③ 用的账号：已激活
    const active = await registerActivated(h, 'harry', 'harry-password')
    // ④⑤ 用的记录：未激活且会过期
    const lonely = await produceOk(h, 'lonely', 'lonely-password')
    const bystander = await produceOk(h, 'bystander', 'bystander-password')

    // ② 期限内（依据齐全）⇒ not-expired，记录原样，同标识同凭据仍认回同一个 AccountId
    expect(await h.accounts.purge(young, purgeWarrant(h.keys, young))).toStrictEqual({
      failure: 'not-expired',
    })
    expect(await h.accounts.produce('young', 'young-password')).toStrictEqual({ ok: young })

    h.clock.advance(HOUR_MS + 1)
    expect(await h.accounts.purge(stale, purgeWarrant(h.keys, stale))).toBe('ok')
    const reborn = await h.accounts.produce('gina', 'gina-password')
    expect('ok' in reborn && reborn.ok).not.toBe(stale)
    expect(reborn).toHaveProperty('ok')
    expect(h.events).toContainEqual({
      name: 'account-identity/account-expired',
      payload: { accountId: stale, loginIdentifier: 'gina' },
    })

    // ③ 已激活（依据齐全）⇒ not-expired，账号仍然可用
    expect(await h.accounts.purge(active, purgeWarrant(h.keys, active))).toStrictEqual({
      failure: 'not-expired',
    })
    expect(await h.logins.issue('harry', 'harry-password')).toHaveProperty('ok')

    // ④ 不带依据（记录确实未激活且已过期）⇒ purge-warrant-invalid，记录原样
    expect(await h.accounts.purge(lonely, undefined)).toStrictEqual({
      failure: 'purge-warrant-invalid',
    })
    // ⑤ 带一份为另一个账号产出的依据 ⇒ purge-warrant-invalid，两个账号的记录都原样
    expect(await h.accounts.purge(lonely, purgeWarrant(h.keys, bystander))).toStrictEqual({
      failure: 'purge-warrant-invalid',
    })
    const remaining = (await rows(h, 'account')).map(row => row['account_id'])
    expect(remaining).toContain(lonely)
    expect(remaining).toContain(bystander)
    expect(remaining).not.toContain(stale)
    // 已被清除的记录再清一次 ⇒ 幂等 ok（仍须依据），不再发事件
    expect(await h.accounts.purge(stale, purgeWarrant(h.keys, stale))).toBe('ok')
    expect(h.events.filter(e => e.name === 'account-identity/account-expired')).toHaveLength(1)
  })

  it('S-42 伪造的依据两侧都被拒：用另一把密钥签一份形状合法的凭证，三支同一次里跑', async () => {
    const h = await harness('s42')
    const forger = warrantKeys()
    const expired = await produceOk(h, 'ivan', 'ivan-password')
    const activated = await registerActivated(h, 'kate', 'kate-password')
    h.clock.advance(HOUR_MS + 1)
    const fresher = await produceOk(h, 'judy2', 'judy2-password')

    // 1. 自制清除依据调 S-38（记录确实未激活且已过期）⇒ purge-warrant-invalid，记录原样
    const forgedPurge = issueHandoffWarrant(forger.purgeSigning, 'purge', expired)
    expect(await h.accounts.purge(expired, forgedPurge)).toStrictEqual({
      failure: 'purge-warrant-invalid',
    })
    // 2. 自制激活依据调 S-14（存在、未过期）⇒ warrant-invalid，账号停在未激活
    const forgedActivation = issueHandoffWarrant(forger.activationSigning, 'activation', fresher)
    expect(await h.accounts.activate(fresher, forgedActivation)).toStrictEqual({
      failure: 'warrant-invalid',
    })
    expect(await h.accounts.read(fresher)).toStrictEqual({
      ok: { activated: false, retentionExpired: false },
    })
    // 3. 自制激活依据调 S-14 于已激活账号 ⇒ warrant-invalid，不是幂等的 ok
    const forgedOnActive = issueHandoffWarrant(forger.activationSigning, 'activation', activated)
    expect(await h.accounts.activate(activated, forgedOnActive)).toStrictEqual({
      failure: 'warrant-invalid',
    })
    // 对照：用途错位（拿清除依据去激活）同样不认
    expect(await h.accounts.activate(fresher, purgeWarrant(h.keys, fresher))).toStrictEqual({
      failure: 'warrant-invalid',
    })
    expect((await rows(h, 'account')).map(row => row['account_id'])).toContain(expired)
  })

  it('S-43 第 1 支（可操纵时间源）：依据先产出、记录后过期 ⇒ account-record-expired，账号停在未激活', async () => {
    const h = await harness('s43')
    const accountId = await produceOk(h, 'liam', 'liam-password')
    // 组合在治理 S-20 成功时产出激活依据，握在手上
    const warrant = activationWarrant(h.keys, accountId)
    h.clock.advance(HOUR_MS + 1)
    // 清除链 ① 的现读（治理 S-53 经 accounts.read）：首次观测落盘过期事实
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: true },
    })
    // 然后才拿那份依据激活
    expect(await h.accounts.activate(accountId, warrant)).toStrictEqual({
      failure: 'account-record-expired',
    })
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: true },
    })
    // 不经 read、直接激活的那一路同样由激活自己的提交现读挡住
    const other = await produceOk(h, 'liam-2', 'liam-password')
    const otherWarrant = activationWarrant(h.keys, other)
    h.clock.advance(HOUR_MS + 1)
    expect(await h.accounts.activate(other, otherWarrant)).toStrictEqual({
      failure: 'account-record-expired',
    })
    expect(h.events.filter(e => e.name === 'account-identity/account-activated')).toHaveLength(0)
  })

  it.skip('S-43 第 2 支（真并发）：S-14 与清除链 ① 在同一条已过期记录上并发提交——归 W2-A（AI + AR + OG 同一次演练，真外键两实例夹具）', () => {})

  it('S-44 求值与三个出口：①–⑥ 同一次里跑，加本节点的第 ⑦ 支（不设捷径）', async () => {
    const h = await harness('s44')
    const accountId = await registerActivated(h, 'mia', 'mia-password')
    const issued = await loginOk(h, 'mia', 'mia-password')
    const revokedOne = await loginOk(h, 'mia', 'mia-password')
    // ① 刚签发的出示物 ⇒ 通过，LoginStateId 等于派生值、AccountId 是登录的账号
    expect(await h.logins.exchange(issued.presentation)).toStrictEqual({
      ok: { loginStateId: independentDerive(issued.presentation), accountId },
    })
    // ② 撤销之后 ⇒ login-state-rejected
    expect(await h.logins.revoke(revokedOne.loginStateId, issued.loginStateId)).toBe('ok')
    expect(await h.logins.exchange(revokedOne.presentation)).toStrictEqual({
      failure: 'login-state-rejected',
    })
    // ③ 从没签发过的值；④ 拿 LoginStateId 当出示物——两者逐字相同
    const neverIssued = await h.logins.exchange('A'.repeat(43))
    const idAsPresentation = await h.logins.exchange(issued.loginStateId)
    expect(neverIssued).toStrictEqual({ failure: 'login-state-rejected' })
    expect(idAsPresentation).toStrictEqual(neverIssued)
    // ⑤ 表示层：缺席、空串、首尾空白、孤立代理码点、1025 个标量值 ⇒ invalid-input；1024 个过表示层、得 rejected
    for (const bad of [
      undefined,
      null,
      42,
      '',
      ` ${issued.presentation}`,
      `${issued.presentation}　`,
      'abc\uD800def',
      '\uDC00abc',
      '𝒜'.repeat(1025),
      'x'.repeat(1025),
    ]) {
      expect(await h.logins.exchange(bad)).toStrictEqual({ failure: 'invalid-input' })
    }
    expect(await h.logins.exchange('𝒜'.repeat(1024))).toStrictEqual({
      failure: 'login-state-rejected',
    })
    expect(await h.logins.exchange('x'.repeat(1024))).toStrictEqual({
      failure: 'login-state-rejected',
    })
    // ⑥ 存储读不到 ⇒ storage-unavailable；⑦ 读不到时拿 LoginStateId 当出示物也是 storage-unavailable
    h.storage.readUnavailable = true
    expect(await h.logins.exchange(issued.presentation)).toStrictEqual({
      failure: 'storage-unavailable',
    })
    expect(await h.logins.exchange(issued.loginStateId)).toStrictEqual({
      failure: 'storage-unavailable',
    })
    h.storage.readUnavailable = false
    // 所属账号未激活的那一支：未激活的账号签不出登录状态，这一支在本契约的操作面上构造不出（S-20 已激活不回退）
    expect(await h.logins.exchange(issued.presentation)).toHaveProperty('ok')
  })

  it('S-45 出示物的形状：43 个 base64url 字符、无填充、过 IV S-31 与 S-45 的解析，且每次都不同', async () => {
    const h = await harness('s45')
    await registerActivated(h, 'noah', 'noah-password')
    const seen = new Set<string>()
    for (let i = 0; i < 8; i += 1) {
      const { presentation, loginStateId } = await loginOk(h, 'noah', 'noah-password')
      expect(presentation).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(presentation).not.toContain('=')
      expect(isOk(parseOpaqueIdentifier(presentation, 'LoginStatePresentation'))).toBe(true)
      // 与 LoginStateId 形状互斥：一个 43 字符的值永远不是 64 个小写十六进制
      expect(loginStateId).toMatch(/^[0-9a-f]{64}$/)
      expect(presentation).not.toBe(loginStateId)
      seen.add(presentation)
    }
    expect(seen.size).toBe(8)
  })

  it('S-46 存储里翻不出能用的出示物：①（库文件、预写日志、每一条记录的每一个字符串值，含正对照）②（诊断与事件）③（拿列表当凭证）同一次里跑', async () => {
    const h = await harness('s46')
    await registerActivated(h, 'olivia', 'olivia-password')
    const issued = [
      await loginOk(h, 'olivia', 'olivia-password'),
      await loginOk(h, 'olivia', 'olivia-password'),
      await loginOk(h, 'olivia', 'olivia-password'),
    ]
    const [revoked, valid1, valid2] = issued as [
      (typeof issued)[0],
      (typeof issued)[0],
      (typeof issued)[0],
    ]
    expect(await h.logins.revoke(revoked.loginStateId, valid1.loginStateId)).toBe('ok')
    // 让诊断通道真的有输出：读不到存储时换取、随机源不可用时签发
    h.storage.readUnavailable = true
    await h.logins.exchange(valid1.presentation)
    h.storage.readUnavailable = false
    h.random.mode = 'throw'
    await h.logins.issue('olivia', 'olivia-password')
    h.random.mode = 'crypto'
    expect(h.diagnosticsOutput.length).toBeGreaterThan(0)

    // ① 翻持久数据：每条记录（含已撤销的那一条）的每一个字符串值都当作出示物交给 exchange
    const values: string[] = []
    for (const table of ['account', 'login_state'] as const) {
      for (const row of await rows(h, table)) {
        for (const value of Object.values(row)) if (typeof value === 'string') values.push(value)
      }
    }
    // 库文件与预写日志里的每一段可打印串也都试一遍
    const files = [h.file, `${h.file}-wal`].filter(path => existsSync(path))
    expect(files).toContain(`${h.file}-wal`)
    const fileBytes = files.map(path => readFileSync(path))
    for (const bytes of fileBytes) values.push(...printableRuns(bytes))
    for (const value of values) {
      const answer = await h.logins.exchange(value)
      expect('ok' in answer, `persisted value passed S-44: ${value.slice(0, 12)}…`).toBe(false)
    }
    // 三个出示物没有一个以三种形式出现在持久内容里
    for (const { presentation } of issued) {
      for (const form of exposureForms(presentation)) {
        for (const bytes of fileBytes) expect(bytes.includes(Buffer.from(form, 'utf8'))).toBe(false)
        for (const value of values) expect(value.includes(form)).toBe(false)
      }
    }
    // 正对照：两个仍有效的出示物都通过
    expect(await h.logins.exchange(valid1.presentation)).toHaveProperty('ok')
    expect(await h.logins.exchange(valid2.presentation)).toHaveProperty('ok')

    // ② 翻诊断输出与事件载荷
    const emitted = [...h.diagnosticsOutput, ...h.events.map(e => JSON.stringify(e))].join('\n')
    for (const { presentation } of issued) {
      for (const form of exposureForms(presentation)) expect(emitted.includes(form)).toBe(false)
    }

    // ③ 拿列表当凭证：列出的每一个 LoginStateId 交给 exchange ⇒ 全部 rejected，与从没签发过的值逐字相同
    const listed = await h.logins.listEffective(valid1.loginStateId)
    if (!('ok' in listed)) throw new Error('list must succeed')
    const never = await h.logins.exchange('never-issued-presentation-value')
    for (const { loginStateId } of listed.ok) {
      expect(await h.logins.exchange(loginStateId)).toStrictEqual(never)
    }
    expect(never).toStrictEqual({ failure: 'login-state-rejected' })
  })

  it.skip('S-46 ① 的快照部分：翻装配留下的升级快照——归 W2-A／W3-A（快照由 tenancy-host 的升级守卫产生）', () => {})

  it('S-47 第 1 支：已知答案向量（外部工具算好）+ 每次登录的独立重算', async () => {
    // 向量由 `printf '%s' <值> | sha256sum` 与 Python hashlib 在被测实现之外算出（2026-09-23）
    const vectors: readonly (readonly [string, string])[] = [
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a',
      ],
      ['出示物-ü-🔑', 'fa8240ed05cf3251248c2a5c95019e30c51f19bd41c02ed3ee908118eb4c6f93'],
    ]
    // 先核测试自己的重算器与外部工具一致，再用它独立重算每次登录的返回
    for (const [preimage, expected] of vectors) {
      expect(independentDerive(preimage)).toBe(expected)
    }
    const h = await harness('s47')
    const accountId = await registerActivated(h, 'peter', 'peter-password')
    for (let i = 0; i < 5; i += 1) {
      const { presentation, loginStateId } = await loginOk(h, 'peter', 'peter-password')
      expect(loginStateId).toBe(independentDerive(presentation))
      expect(await h.logins.exchange(presentation)).toStrictEqual({
        ok: { loginStateId, accountId },
      })
    }
  })

  it('S-47 第 1 支（向量对着被测派生函数）：派生 = UTF-8 → SHA-256 → 小写十六进制，含非 ASCII 一条', async () => {
    const { deriveLoginStateId } = await import('../src/presentation.ts')
    const { parseLoginStatePresentation } = await import('@omne-harness-lite/account-identity')
    const vectors: readonly (readonly [string, string])[] = [
      ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
      [
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a',
      ],
      ['出示物-ü-🔑', 'fa8240ed05cf3251248c2a5c95019e30c51f19bd41c02ed3ee908118eb4c6f93'],
    ]
    for (const [preimage, expected] of vectors) {
      const parsed = parseLoginStatePresentation(preimage)
      if (!isOk(parsed)) throw new Error('vector must parse')
      expect(deriveLoginStateId(parsed.ok)).toBe(expected)
    }
  })

  it('S-30「只有 S-44 认出示物」：出示物交给 verify／listEffective／revoke 的发起方一律不认', async () => {
    const h = await harness('s30')
    await registerActivated(h, 'quinn', 'quinn-password')
    const issued = await loginOk(h, 'quinn', 'quinn-password')
    // 未标类型的调用方把出示物当 LoginStateId 送进来：过了 IV S-31 的表示层，但查不到
    const asId = asLoginStateId(issued.presentation)
    expect(await h.logins.verify(asId)).toStrictEqual({ failure: 'login-state-rejected' })
    expect(await h.logins.listEffective(asId)).toStrictEqual({ failure: 'login-state-rejected' })
    expect(await h.logins.revoke(issued.loginStateId, asId)).toStrictEqual({
      failure: 'not-authorized',
    })
    // 正对照：LoginStateId 在进程内照常可用
    expect(await h.logins.verify(issued.loginStateId)).toHaveProperty('ok')
  })

  it('S-22 登录路径分辨不出账号存在性：已过期未激活、已清除的记录也与不存在逐字相同', async () => {
    const h = await harness('s22')
    await produceOk(h, 'rachel', 'rachel-password')
    await produceOk(h, 'purged', 'purged-password')
    h.clock.advance(HOUR_MS + 1)
    const purgedId = (await rows(h, 'account')).find(r => r['login_identifier'] === 'purged')?.[
      'account_id'
    ] as AccountId
    expect(await h.accounts.purge(purgedId, purgeWarrant(h.keys, purgedId))).toBe('ok')
    const baseline = await h.logins.issue('nobody', 'nobody-password')
    expect(await h.logins.issue('rachel', 'rachel-password')).toStrictEqual(baseline)
    expect(await h.logins.issue('purged', 'purged-password')).toStrictEqual(baseline)
    expect(await h.logins.issue('rachel', 'wrong-password')).toStrictEqual(baseline)
    expect(baseline).toStrictEqual({ failure: 'identifier-or-credential-rejected' })
  })

  it.skip('S-35 静态检查：账号记录无跨账号关联字段——规则形式归 W2-C（tools/ts-checks，identity-values SC-2）；记录类型只含一个 AccountId 列由 types.spec-d.ts 守', () => {})

  it.skip('S-36 静态检查的规则形式——归 W2-C（tools/ts-checks）；九个方法的失败集合闭合在 types.spec-d.ts 的类型层已守', () => {})
})
