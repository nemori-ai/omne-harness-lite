// 节点 verification.md 里没有场景号的义务：逐操作表示层注入、S-27 逐行注入、随机源与派生碰撞的故障注入、
// S-15「出示物只在提交成立之后交出」、S-38 同提交、R-8（持锁段里没有 credentials 调用）、凭据计算挪出写事务后的交错、
// 过期事实的落盘与单调、S-19 同标识并发。
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountId } from '@omne-harness-lite/identity-values'
import {
  type Harness,
  HOUR_MS,
  activationWarrant,
  asLoginStateId,
  gate,
  loginOk,
  openHarness,
  produceOk,
  purgeWarrant,
  registerActivated,
  rows,
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

const INVALID = { failure: 'invalid-input' }
const UNAVAILABLE = { failure: 'storage-unavailable' }

describe('逐操作表示层注入（S-27 第 1 行）：九个操作都在任何判定之前给 invalid-input', () => {
  it('缺席、空、首尾空白、非字符串的身份参数与出示物', async () => {
    const h = await harness('repr')
    await registerActivated(h, 'sam', 'sam-password')
    const valid = await loginOk(h, 'sam', 'sam-password')
    const bad: unknown[] = [undefined, null, '', ' x', 'x\n', 7, {}]
    for (const value of bad) {
      expect(await h.accounts.produce(value, 'sam-password')).toStrictEqual(INVALID)
      expect(await h.accounts.activate(value, 'warrant')).toStrictEqual(INVALID)
      expect(await h.accounts.read(value)).toStrictEqual(INVALID)
      expect(await h.accounts.purge(value, 'warrant')).toStrictEqual(INVALID)
      expect(await h.logins.issue(value, 'sam-password')).toStrictEqual(INVALID)
      expect(await h.logins.exchange(value)).toStrictEqual(INVALID)
      expect(await h.logins.revoke(value, valid.loginStateId)).toStrictEqual(INVALID)
      expect(await h.logins.revoke(valid.loginStateId, value as never)).toStrictEqual(INVALID)
      expect(await h.logins.verify(value as never)).toStrictEqual(INVALID)
      expect(await h.logins.listEffective(value as never)).toStrictEqual(INVALID)
    }
    // 凭据的表示层归 credentials.parse：缺席、空、非字符串 ⇒ invalid-input
    for (const credential of [undefined, '', 12]) {
      expect(await h.accounts.produce('sam-2', credential)).toStrictEqual(INVALID)
      expect(await h.logins.issue('sam', credential)).toStrictEqual(INVALID)
    }
    // 表示层拒绝不是一次判定：没有产生记录、没有撤销
    expect((await rows(h, 'account')).map(r => r['login_identifier'])).toEqual(['sam'])
    expect(await h.logins.verify(valid.loginStateId)).toHaveProperty('ok')
  })
})

describe('S-27 缺席时的默认答案：逐行注入', () => {
  it('发起方已失效：S-16 ⇒ not-authorized（排在目标存在性之前），S-37 ⇒ login-state-rejected', async () => {
    const h = await harness('s27-initiator')
    await registerActivated(h, 'tom', 'tom-password')
    const a = await loginOk(h, 'tom', 'tom-password')
    const b = await loginOk(h, 'tom', 'tom-password')
    expect(await h.logins.revoke(a.loginStateId, a.loginStateId)).toBe('ok')
    expect(await h.logins.revoke(b.loginStateId, a.loginStateId)).toStrictEqual({
      failure: 'not-authorized',
    })
    expect(await h.logins.listEffective(a.loginStateId)).toStrictEqual({
      failure: 'login-state-rejected',
    })
    expect(await h.logins.verify(b.loginStateId)).toHaveProperty('ok')
  })

  it('激活依据、清除依据缺席 ⇒ warrant-invalid／purge-warrant-invalid，不激活、不清除；依据在场也不放宽别的前置', async () => {
    const h = await harness('s27-warrant')
    const accountId = await produceOk(h, 'uma', 'uma-password')
    expect(await h.accounts.activate(accountId, undefined)).toStrictEqual({
      failure: 'warrant-invalid',
    })
    expect(await h.accounts.purge(accountId, undefined)).toStrictEqual({
      failure: 'purge-warrant-invalid',
    })
    // 依据在场、记录未过期 ⇒ not-expired（不因「有依据」放宽）
    expect(await h.accounts.purge(accountId, purgeWarrant(h.keys, accountId))).toStrictEqual({
      failure: 'not-expired',
    })
    // 不存在的记录：幂等 ok 也要先过依据
    const ghost = 'aaaaaaaaaaaaaaaaaaaaaaaaaa' as AccountId
    expect(await h.accounts.purge(ghost, undefined)).toStrictEqual({
      failure: 'purge-warrant-invalid',
    })
    expect(await h.accounts.purge(ghost, purgeWarrant(h.keys, ghost))).toBe('ok')
    expect(await h.accounts.activate(ghost, activationWarrant(h.keys, ghost))).toStrictEqual({
      failure: 'account-not-found',
    })
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: false },
    })
  })

  it('存储读不到或写不进：九个操作一律 storage-unavailable；S-37 不返回空集，S-38 不删', async () => {
    const h = await harness('s27-storage')
    const accountId = await registerActivated(h, 'vera', 'vera-password')
    const stale = await produceOk(h, 'stale', 'stale-password')
    const session = await loginOk(h, 'vera', 'vera-password')
    h.clock.advance(HOUR_MS + 1)
    h.storage.readUnavailable = true
    h.storage.writeUnavailable = true
    expect(await h.accounts.produce('wendy', 'wendy-password')).toStrictEqual(UNAVAILABLE)
    expect(
      await h.accounts.activate(accountId, activationWarrant(h.keys, accountId)),
    ).toStrictEqual(UNAVAILABLE)
    expect(await h.accounts.read(accountId)).toStrictEqual(UNAVAILABLE)
    expect(await h.accounts.purge(stale, purgeWarrant(h.keys, stale))).toStrictEqual(UNAVAILABLE)
    expect(await h.logins.issue('vera', 'vera-password')).toStrictEqual(UNAVAILABLE)
    expect(await h.logins.exchange(session.presentation)).toStrictEqual(UNAVAILABLE)
    expect(await h.logins.revoke(session.loginStateId, session.loginStateId)).toStrictEqual(
      UNAVAILABLE,
    )
    expect(await h.logins.verify(session.loginStateId)).toStrictEqual(UNAVAILABLE)
    expect(await h.logins.listEffective(session.loginStateId)).toStrictEqual(UNAVAILABLE)
    h.storage.readUnavailable = false
    h.storage.writeUnavailable = false
    expect((await rows(h, 'account')).map(r => r['account_id'])).toContain(stale)
    expect(await h.logins.verify(session.loginStateId)).toStrictEqual({
      failure: 'login-state-rejected',
    })
    const fresh = await loginOk(h, 'vera', 'vera-password')
    expect(await h.logins.verify(fresh.loginStateId)).toStrictEqual({ ok: accountId })
  })

  it('credential_policy 取不到（缺省或形状不合）⇒ credential-rejected，不退化为不校验；认回那一路不读它', async () => {
    const absent = await harness('s27-policy-absent', { credentialPolicy: undefined })
    expect(await absent.accounts.produce('xena', 'xena-password')).toStrictEqual({
      failure: 'credential-rejected',
      reason: 'credential-policy-unavailable',
    })
    expect(await rows(absent, 'account')).toHaveLength(0)

    const malformed = await harness('s27-policy-malformed', { credentialPolicy: { min: 3 } })
    expect(await malformed.accounts.produce('yuri', 'yuri-password')).toStrictEqual({
      failure: 'credential-rejected',
      reason: 'credential-policy-unavailable',
    })

    // 认回：同一个库，先在有政策的实例里产生记录，再在无政策的实例里认回 ⇒ 同一个 AccountId
    const withPolicy = await harness('s27-policy-reclaim')
    const accountId = await produceOk(withPolicy, 'zoe', 'zoe-password')
    const file = withPolicy.file
    await withPolicy.dispose()
    open = open.filter(h => h !== withPolicy)
    const withoutPolicy = await harness('s27-policy-reclaim-2', {
      file,
      credentialPolicy: undefined,
    })
    expect(await withoutPolicy.accounts.produce('zoe', 'zoe-password')).toStrictEqual({
      ok: accountId,
    })
  })

  it('credentials 提供者缺席 ⇒ S-13 与 S-15 的凭据步骤 storage-unavailable（判不出来，不是不合规），其余七个操作照常', async () => {
    const h = await harness('s27-credentials-absent')
    const accountId = await registerActivated(h, 'adam', 'adam-password')
    const session = await loginOk(h, 'adam', 'adam-password')
    h.probe.absent = true
    expect(await h.accounts.produce('bea', 'bea-password')).toStrictEqual(UNAVAILABLE)
    expect(await h.logins.issue('adam', 'adam-password')).toStrictEqual(UNAVAILABLE)
    // 标识的表示层不需要凭据的 owner
    expect(await h.accounts.produce('', 'bea-password')).toStrictEqual(INVALID)
    expect(await h.logins.verify(session.loginStateId)).toStrictEqual({ ok: accountId })
    expect(await h.logins.exchange(session.presentation)).toHaveProperty('ok')
    expect(await h.accounts.read(accountId)).toHaveProperty('ok')
    expect(await h.logins.listEffective(session.loginStateId)).toHaveProperty('ok')
  })

  it('时间源读不到 ⇒ S-13／S-14／S-18／S-38 各自那一支 storage-unavailable，不按「未过期」也不按「已过期」猜', async () => {
    const h = await harness('s27-clock')
    const pending = await produceOk(h, 'cleo', 'cleo-password')
    h.clock.setUnavailable(true)
    expect(await h.accounts.produce('dora', 'dora-password')).toStrictEqual(UNAVAILABLE)
    expect(await h.accounts.produce('cleo', 'cleo-password')).toStrictEqual(UNAVAILABLE)
    expect(await h.accounts.activate(pending, activationWarrant(h.keys, pending))).toStrictEqual(
      UNAVAILABLE,
    )
    expect(await h.accounts.read(pending)).toStrictEqual(UNAVAILABLE)
    expect(await h.accounts.purge(pending, purgeWarrant(h.keys, pending))).toStrictEqual(
      UNAVAILABLE,
    )
    h.clock.setUnavailable(false)
    expect(await h.accounts.read(pending)).toStrictEqual({
      ok: { activated: false, retentionExpired: false },
    })
    expect(await rows(h, 'account')).toHaveLength(1)
  })

  it('随机源不可用 ⇒ S-15 storage-unavailable，登录状态表没有新行，不退化为别的来源', async () => {
    const h = await harness('s27-random')
    await registerActivated(h, 'eli', 'eli-password')
    h.random.mode = 'throw'
    expect(await h.logins.issue('eli', 'eli-password')).toStrictEqual(UNAVAILABLE)
    expect(await rows(h, 'login_state')).toHaveLength(0)
    expect(h.diagnosticsOutput.join('\n')).toContain('random-source-unavailable')
  })
})

describe('S-45 派生值碰撞与 S-15 的提交点', () => {
  it('随机源每次返回同一组字节：第二次 issue ⇒ storage-unavailable，第一次的行原样，第二次的返回里没有任何东西', async () => {
    const h = await harness('collision')
    const accountId = await registerActivated(h, 'finn', 'finn-password')
    h.random.mode = 'constant'
    const first = await loginOk(h, 'finn', 'finn-password')
    const second = await h.logins.issue('finn', 'finn-password')
    expect(second).toStrictEqual(UNAVAILABLE)
    const stored = await rows(h, 'login_state')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ login_state_id: first.loginStateId, account_id: accountId })
    expect(await h.logins.exchange(first.presentation)).toHaveProperty('ok')
  })

  it('两个并发的 issue 撞同一主键（真并发）：恰一个成功、一个 storage-unavailable，表里恰一行', async () => {
    const h = await harness('collision-concurrent')
    await registerActivated(h, 'gus', 'gus-password')
    h.random.mode = 'constant'
    const results = await Promise.all([
      h.logins.issue('gus', 'gus-password'),
      h.logins.issue('gus', 'gus-password'),
    ])
    expect(results.filter(r => 'ok' in r)).toHaveLength(1)
    expect(results.filter(r => 'failure' in r)).toStrictEqual([UNAVAILABLE])
    expect(await rows(h, 'login_state')).toHaveLength(1)
  })

  it('S-15「出示物只在提交成立之后交出」：提交失败 ⇒ storage-unavailable，返回里没有出示物，表里没有新行', async () => {
    const h = await harness('issue-commit')
    await registerActivated(h, 'hana', 'hana-password')
    h.storage.failCommit = true
    const result = await h.logins.issue('hana', 'hana-password')
    expect(result).toStrictEqual(UNAVAILABLE)
    expect(JSON.stringify(result)).not.toContain('presentation')
    h.storage.failCommit = false
    expect(await rows(h, 'login_state')).toHaveLength(0)
  })

  it('S-38 删记录与释放标识同提交：提交失败 ⇒ 记录与标识占用都原样（没有「记录没了但标识还占着」或反之）', async () => {
    const h = await harness('purge-commit')
    const accountId = await produceOk(h, 'ian', 'ian-password')
    h.clock.advance(HOUR_MS + 1)
    h.storage.failCommit = true
    expect(await h.accounts.purge(accountId, purgeWarrant(h.keys, accountId))).toStrictEqual(
      UNAVAILABLE,
    )
    h.storage.failCommit = false
    expect((await rows(h, 'account')).map(r => r['account_id'])).toEqual([accountId])
    // 标识仍被那条（已过期的）记录占着
    expect(await h.accounts.produce('ian', 'ian-password')).toStrictEqual({
      failure: 'identifier-held-by-expired-record',
      expiredRecord: accountId,
    })
    expect(h.events.filter(e => e.name === 'account-identity/account-expired')).toHaveLength(0)
    // 提交成立：记录与标识一起消失，同一标识立刻可再注册（R-6）
    expect(await h.accounts.purge(accountId, purgeWarrant(h.keys, accountId))).toBe('ok')
    const reborn = await h.accounts.produce('ian', 'ian-password')
    expect('ok' in reborn && reborn.ok !== accountId).toBe(true)
  })
})

describe('R-8 持锁段里没有 credentials 调用（测试一形；文本规则一形归 W2-C）', () => {
  it('S-13 的四类与认回、S-15 的三支都跑一遍，写事务回调里一次 credentials 调用也没有', async () => {
    const h = await harness('r8')
    await registerActivated(h, 'jade', 'jade-password') // 无 → 新建
    await produceOk(h, 'live', 'live-password')
    expect(await h.accounts.produce('live', 'live-password')).toHaveProperty('ok') // 认回
    expect(await h.accounts.produce('live', 'other-password')).toStrictEqual({
      failure: 'identifier-taken',
    }) // 未过期、不匹配
    expect(await h.accounts.produce('jade', 'jade-password')).toStrictEqual({
      failure: 'identifier-taken',
    }) // 已激活
    h.clock.advance(HOUR_MS + 1)
    expect(await h.accounts.produce('live', 'live-password')).toHaveProperty(
      'failure',
      'identifier-held-by-expired-record',
    ) // 已过期
    expect(await h.logins.issue('jade', 'jade-password')).toHaveProperty('ok')
    expect(await h.logins.issue('jade', 'wrong-password')).toHaveProperty('failure')
    expect(await h.logins.issue('ghost', 'ghost-password')).toHaveProperty('failure')
    expect(await h.logins.issue('live', 'live-password')).toHaveProperty('failure')
    expect(h.probe.callsInsideWrite).toEqual([])
  })

  it('插桩自测：在写事务回调里调一次 credentials 就会被记下（否则上一条永远是空的）', async () => {
    const h = await harness('r8-self')
    // 模拟一个把凭据计算放进持锁段的实现
    await h.storage.write(async () => {
      h.credentials.parse('x')
    })
    expect(h.probe.callsInsideWrite).toEqual(['parse'])
    // 写事务之外的调用不记
    h.credentials.parse('y')
    expect(h.probe.callsInsideWrite).toEqual(['parse'])
  })
})

describe('凭据计算挪出写事务之后的交错（节点 design「状态、并发与失败映射」）', () => {
  it('① S-15 快照 match 之后记录被清除 ⇒ rejected；清除后另一账号占用同一标识并激活 ⇒ 同一个值；放行前激活 ⇒ 签发成功', async () => {
    const h = await harness('interleave-1')
    // 快照 match 之后，那条未激活记录被清除
    const pending = await produceOk(h, 'kai', 'kai-password')
    h.clock.advance(HOUR_MS + 1)
    const g1 = gate()
    h.probe.pauseVerify = g1.wait
    const racing = h.logins.issue('kai', 'kai-password')
    await g1.reached
    expect(await h.accounts.purge(pending, purgeWarrant(h.keys, pending))).toBe('ok')
    g1.release()
    expect(await racing).toStrictEqual({ failure: 'identifier-or-credential-rejected' })
    expect(await rows(h, 'login_state')).toHaveLength(0)

    // 清除后再以同一标识注册另一账号并激活（另一份凭据）⇒ 快照那一行已不在 ⇒ 同一个值
    const pending2 = await produceOk(h, 'lee', 'lee-password')
    h.clock.advance(HOUR_MS + 1)
    const g2 = gate()
    h.probe.pauseVerify = g2.wait
    const racing2 = h.logins.issue('lee', 'lee-password')
    await g2.reached
    expect(await h.accounts.purge(pending2, purgeWarrant(h.keys, pending2))).toBe('ok')
    const usurper = await registerActivated(h, 'lee', 'usurper-password')
    g2.release()
    expect(await racing2).toStrictEqual({ failure: 'identifier-or-credential-rejected' })
    expect(await rows(h, 'login_state')).toHaveLength(0)
    expect(usurper).not.toBe(pending2)

    // 放行前激活该记录 ⇒ 三条前置在提交时都成立，照常签发
    const pending3 = await produceOk(h, 'max', 'max-password')
    const g3 = gate()
    h.probe.pauseVerify = g3.wait
    const racing3 = h.logins.issue('max', 'max-password')
    await g3.reached
    expect(await h.accounts.activate(pending3, activationWarrant(h.keys, pending3))).toBe('ok')
    g3.release()
    expect(await racing3).toHaveProperty('ok')
  })

  it('② S-13 同标识、同一份凭据两路并发（重复提交）⇒ 两路同一个 AccountId，账号表一行', async () => {
    const h = await harness('interleave-2')
    const results = await Promise.all([
      h.accounts.produce('nina', 'nina-password'),
      h.accounts.produce('nina', 'nina-password'),
    ])
    expect(results[0]).toHaveProperty('ok')
    expect(results[1]).toStrictEqual(results[0])
    expect(await rows(h, 'account')).toHaveLength(1)
  })

  it('② 的变体：同标识、不同凭据两路并发 ⇒ 恰一个账号，另一路 identifier-taken', async () => {
    const h = await harness('interleave-2b')
    const results = await Promise.all([
      h.accounts.produce('omar', 'omar-password-1'),
      h.accounts.produce('omar', 'omar-password-2'),
    ])
    expect(results.filter(r => 'ok' in r)).toHaveLength(1)
    expect(results.filter(r => 'failure' in r)).toStrictEqual([{ failure: 'identifier-taken' }])
    expect(await rows(h, 'account')).toHaveLength(1)
  })

  it('③ S-13 认回路径放行前激活该记录 ⇒ 合规凭据得 identifier-taken、不合规得 credential-rejected', async () => {
    const h = await harness('interleave-3')
    // 合规凭据：快照「未过期 + match」，放行前被激活 ⇒ 换了类 ⇒ 重来 ⇒ 已激活 ⇒ 判政策（过）⇒ identifier-taken
    const pending = await produceOk(h, 'pia', 'pia-password')
    const g1 = gate()
    h.probe.pauseVerify = g1.wait
    const racing = h.accounts.produce('pia', 'pia-password')
    await g1.reached
    expect(await h.accounts.activate(pending, activationWarrant(h.keys, pending))).toBe('ok')
    g1.release()
    expect(await racing).toStrictEqual({ failure: 'identifier-taken' })

    // 不合规凭据：记录是以旧政策产生的短凭据；认回不判政策，放行前被激活 ⇒ 重来 ⇒ 判政策 ⇒ credential-rejected
    const lenient = await harness('interleave-3-lenient', { credentialPolicy: { minLength: 1 } })
    const shortPending = await produceOk(lenient, 'quin', 'abc')
    const file = lenient.file
    const keys = lenient.keys
    await lenient.dispose()
    open = open.filter(x => x !== lenient)
    const strict = await harness('interleave-3-strict', { file, keys })
    expect(await strict.accounts.produce('quin', 'abc')).toStrictEqual({ ok: shortPending })
    const g2 = gate()
    strict.probe.pauseVerify = g2.wait
    const racing2 = strict.accounts.produce('quin', 'abc')
    await g2.reached
    expect(
      await strict.accounts.activate(shortPending, activationWarrant(keys, shortPending)),
    ).toBe('ok')
    g2.release()
    expect(await racing2).toStrictEqual({ failure: 'credential-rejected', reason: 'min-length:8' })
  })

  it('④ 重来之后再变一次 ⇒ storage-unavailable，无写入', async () => {
    const h = await harness('interleave-4')
    // 第一次快照「无」、派生放行前另一路占用该标识 ⇒ 重来；第二次快照「未过期」、比对放行前激活 ⇒ 再变
    const g1 = gate()
    h.probe.pauseDerive = g1.wait
    const racing = h.accounts.produce('rosa', 'rosa-password')
    await g1.reached
    const other = await produceOk(h, 'rosa', 'other-password')
    const g2 = gate()
    h.probe.pauseVerify = g2.wait
    g1.release()
    await g2.reached
    expect(await h.accounts.activate(other, activationWarrant(h.keys, other))).toBe('ok')
    g2.release()
    expect(await racing).toStrictEqual(UNAVAILABLE)
    const accounts = await rows(h, 'account')
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ account_id: other })
  })
})

describe('过期事实的落盘与单调（节点 design「已过留存期限是首次观测时落盘的单调事实」）', () => {
  it('① 首次读到期即写 expired_at；此后回拨时钟或时钟不可用仍答「已过期」', async () => {
    const h = await harness('expiry-1')
    const accountId = await produceOk(h, 'sara', 'sara-password')
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: false },
    })
    h.clock.advance(HOUR_MS + 1)
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: true },
    })
    const landed = (await rows(h, 'account'))[0]
    expect(landed?.['expired_at']).not.toBeNull()
    h.clock.advance(-2 * HOUR_MS)
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: true },
    })
    h.clock.setUnavailable(true)
    expect(await h.accounts.read(accountId)).toStrictEqual({
      ok: { activated: false, retentionExpired: true },
    })
    // 同一个事实挡住回拨后的认回与激活
    h.clock.setUnavailable(false)
    expect(await h.accounts.produce('sara', 'sara-password')).toStrictEqual({
      failure: 'identifier-held-by-expired-record',
      expiredRecord: accountId,
    })
    expect(
      await h.accounts.activate(accountId, activationWarrant(h.keys, accountId)),
    ).toStrictEqual({ failure: 'account-record-expired' })
  })

  it('② 写不进事实 ⇒ storage-unavailable，不返回一个没落盘的「是」', async () => {
    const h = await harness('expiry-2')
    const accountId = await produceOk(h, 'tess', 'tess-password')
    h.clock.advance(HOUR_MS + 1)
    h.storage.writeUnavailable = true
    expect(await h.accounts.read(accountId)).toStrictEqual(UNAVAILABLE)
    h.storage.writeUnavailable = false
    expect((await rows(h, 'account'))[0]?.['expired_at']).toBeNull()
    h.storage.failCommit = true
    expect(await h.accounts.read(accountId)).toStrictEqual(UNAVAILABLE)
    h.storage.failCommit = false
    expect((await rows(h, 'account'))[0]?.['expired_at']).toBeNull()
  })

  it('③ activated 与 expired_at 不能同时非空（测试守，存储不建 CHECK）', async () => {
    const h = await harness('expiry-3')
    const a = await registerActivated(h, 'ursa', 'ursa-password')
    const b = await produceOk(h, 'vic', 'vic-password')
    h.clock.advance(HOUR_MS + 1)
    // 各种会落盘过期事实的读点都跑一遍，已激活的那条始终不被落盘
    await h.accounts.read(a)
    await h.accounts.read(b)
    await h.accounts.activate(a, activationWarrant(h.keys, a))
    await h.accounts.activate(b, activationWarrant(h.keys, b))
    await h.accounts.purge(a, purgeWarrant(h.keys, a))
    await h.accounts.produce('ursa', 'ursa-password')
    for (const row of await rows(h, 'account')) {
      const activated = row['activated'] === 1 || row['activated'] === true
      expect(activated && row['expired_at'] !== null).toBe(false)
    }
    expect(await h.accounts.read(a)).toStrictEqual({
      ok: { activated: true, retentionExpired: false },
    })
  })
})

describe('S-19 登录标识部署内唯一：两个人同时用同一个标识注册，第二个必然失败', () => {
  it('五路并发、各自不同的凭据 ⇒ 恰一条记录，其余全是 identifier-taken', async () => {
    const h = await harness('s19')
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(i => h.accounts.produce('walt', `walt-password-${i}`)),
    )
    expect(results.filter(r => 'ok' in r)).toHaveLength(1)
    for (const r of results.filter(r => 'failure' in r)) {
      expect(r).toStrictEqual({ failure: 'identifier-taken' })
    }
    expect(await rows(h, 'account')).toHaveLength(1)
  })
})

describe('事件：只在状态确实改变的那一次提交之后发', () => {
  it('激活、撤销、清除的幂等重入都不再发事件', async () => {
    const h = await harness('events')
    const accountId = await produceOk(h, 'xia', 'xia-password')
    const warrant = activationWarrant(h.keys, accountId)
    expect(await h.accounts.activate(accountId, warrant)).toBe('ok')
    expect(await h.accounts.activate(accountId, warrant)).toBe('ok')
    const keep = await loginOk(h, 'xia', 'xia-password')
    const drop = await loginOk(h, 'xia', 'xia-password')
    expect(await h.logins.revoke(drop.loginStateId, keep.loginStateId)).toBe('ok')
    expect(await h.logins.revoke(drop.loginStateId, keep.loginStateId)).toBe('ok')
    const stale = await produceOk(h, 'yan', 'yan-password')
    h.clock.advance(HOUR_MS + 1)
    expect(await h.accounts.purge(stale, purgeWarrant(h.keys, stale))).toBe('ok')
    expect(await h.accounts.purge(stale, purgeWarrant(h.keys, stale))).toBe('ok')
    expect(h.events).toStrictEqual([
      { name: 'account-identity/account-activated', payload: { accountId } },
      {
        name: 'account-identity/login-revoked',
        payload: { loginStateId: drop.loginStateId, accountId },
      },
      {
        name: 'account-identity/account-expired',
        payload: { accountId: stale, loginIdentifier: 'yan' },
      },
    ])
  })
})

describe('归别处的静态规则形式（本包只提出检查形式与类型一形）', () => {
  it.skip('no-presentation-in-diagnostics 的 lint 一形（模板字符串与间接拼接）——归 W2-C（tools/ts-checks）；类型一形在 types.spec-d.ts', () => {})
  it.skip('R-8 文本规则：storage.write( 回调的词法范围内不出现 credentials.*( ——归 W2-C（tools/ts-checks）；测试一形在本文件「R-8」', () => {})
  it.skip('S-45 熵审阅的两条文本规则：本包源码不出现 Math.random；插件体构造实现类时不传随机源参数——归 W2-C（tools/ts-checks）', () => {})
  it.skip('S-30「进程外来的身份一律先过 S-44」接收边界一侧：边界包不调 logins.verify、不 import parseLoginStateId、不写 as LoginStateId——归 W2-C（规则）与 W2-B（入口层包）', () => {})
  it.skip('凭据计算挪出写事务之后的交错 ② 在 pg 上再跑一次（走撞唯一约束那条路）——归 W3-A（pg 首跑）', () => {})
})
