// 真实组合、真实 TLS 连接（tests/support/composition.ts）：四个真实参与方 + 本包两个插件 + 真实 sqlite。
// 覆盖：T-2、T-3、T-4、T-5（含备份那一半）、T-6、T-7、T-9 的客户端一面、T-16，最后 T-11 在本文件全部输出里搜秘密。
// 「桩」在这里是对真实服务实例的 vi.spyOn：计数、或在认人与办事之间插一次真实的撤销。
import { copyFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoginsService } from '@omne-harness-lite/account-identity'
import { entryAnswerBytes } from '../src/routing/answers.ts'
import {
  type Center,
  type CenterOptions,
  HEALTH,
  LIST_LOGINS,
  LOGIN,
  OG,
  PASSWORD,
  REGISTER,
  REVOKE,
  type Session,
  bodyOf,
  bootCenter,
  envelopeOf,
  login,
  registerAndLogin,
  tempSqliteFile,
} from './support/composition.ts'
import { TLS_FIXTURES, httpRequest, tlsExchange } from './support/wire.ts'

const REJECTED = entryAnswerBytes('login-state-rejected')
const INVALID = entryAnswerBytes('invalid-input')
const UNAVAILABLE = entryAnswerBytes('unavailable')
const VERSION = entryAnswerBytes('version-mismatch')

// ---- T-11 的收集：本文件里每一份答复、每一份体检、每一条日志 ----
const outputs: string[] = []
const presentations = new Set<string>()
const secrets = new Set<string>([PASSWORD, TLS_FIXTURES.leafKeyPem])
const accountIds = new Set<string>()
const organizationIds = new Set<string>()
const payloadValues = new Set<string>()

const centers: Center[] = []
afterEach(async () => {
  for (const c of centers.splice(0)) {
    outputs.push(c.logText())
    for (const secret of c.deploymentSecrets) secrets.add(secret)
    await c.dispose()
  }
})

async function boot(options: CenterOptions = {}): Promise<Center> {
  const c = await bootCenter(options)
  centers.push(c)
  await c.open()
  return c
}

async function ask(c: Center, envelope: Record<string, unknown>): Promise<Buffer> {
  const bytes = await c.call(envelope)
  outputs.push(bytes.toString('latin1'))
  const payload = envelope['payload']
  if (typeof payload === 'object' && payload !== null) {
    for (const value of Object.values(payload))
      if (typeof value === 'string' && value.length > 6) payloadValues.add(value)
  }
  return bytes
}

async function askRaw(c: Center, body: string | Buffer): Promise<Buffer> {
  const reply = await tlsExchange(c.port, httpRequest(body))
  outputs.push(reply.bytes.toString('latin1'))
  return reply.bytes
}

async function session(
  c: Center,
  identifier: string,
): Promise<Session & { readonly account: string; readonly personal: string }> {
  const s = await registerAndLogin(c, identifier)
  presentations.add(s.presentation)
  const tenant = bodyOf(await ask(c, envelopeOf(OG(36), {}, s.presentation)))
  const current = result(tenant)
  if (
    typeof current !== 'object' ||
    current === null ||
    !('account' in current) ||
    !('organization' in current)
  ) {
    throw new Error('no current tenant')
  }
  const account = String(current.account)
  const personal = String(current.organization)
  accountIds.add(account)
  organizationIds.add(personal)
  return { ...s, account, personal }
}

function result(reply: unknown): unknown {
  if (typeof reply !== 'object' || reply === null || !('result' in reply)) {
    throw new Error(`not a result: ${JSON.stringify(reply)}`)
  }
  return reply.result
}

function spyLogins(c: Center) {
  const logins: LoginsService = c.logins()
  return {
    exchange: vi.spyOn(logins, 'exchange'),
    verify: vi.spyOn(logins, 'verify'),
    revoke: vi.spyOn(logins, 'revoke'),
    listEffective: vi.spyOn(logins, 'listEffective'),
    logins,
  }
}

describe('T-2 线上逐字节相同（真实组合）', () => {
  it('没带、两个、三种表示层不合格、查不到、已撤销、撤销落在认人与办事之间：八次都是同一份 137 字节；表示层不合格那三次没调 exchange', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const revoked = await login(c, 'ada@example.invalid')
    presentations.add(revoked.presentation)
    await ask(c, envelopeOf(REVOKE, { loginStateHandle: revoked.handle }, ada.presentation))
    const spies = spyLogins(c)
    const mine = OG(27)
    const replies: Buffer[] = []
    replies.push(await ask(c, envelopeOf(mine, {})))
    replies.push(
      await askRaw(
        c,
        `{"protocolVersion":"1","presentedLoginState":"${ada.presentation}","presentedLoginState":"${ada.presentation}x","operation":"${mine}","payload":{}}`,
      ),
    )
    for (const malformed of [` ${ada.presentation}`, 'lsp_\\uD800x', 'x'.repeat(1025)]) {
      replies.push(
        await askRaw(
          c,
          `{"protocolVersion":"1","presentedLoginState":"${malformed}","operation":"${mine}","payload":{}}`,
        ),
      )
    }
    expect(spies.exchange).not.toHaveBeenCalled()
    replies.push(await ask(c, envelopeOf(mine, {}, 'lsp_Zt5Rn0aB7cD2eF9gH4iJ6kL1mN3oP8qS0uVx')))
    replies.push(await ask(c, envelopeOf(mine, {}, revoked.presentation)))
    // 入口层认人只经 exchange（S-44），从不调 verify（下面测试自己插进去的那次撤销在 AI 内部会用到它，所以先核）
    expect(spies.verify).not.toHaveBeenCalled()
    // 撤销落在认人与办事之间：exchange 认出人之后、推导读 OG S-36 之前，同一登录状态被真实撤销
    const victim = await login(c, 'ada@example.invalid')
    presentations.add(victim.presentation)
    const exchange = spies.logins.exchange.bind(spies.logins)
    spies.exchange.mockImplementationOnce(async presentation => {
      const identity = await exchange(presentation)
      if ('ok' in identity)
        await spies.logins.revoke(identity.ok.loginStateId, identity.ok.loginStateId)
      return identity
    })
    replies.push(
      await ask(c, envelopeOf(OG(23), { invitedAccount: ada.account }, victim.presentation)),
    )
    expect(replies).toHaveLength(8)
    for (const reply of replies) expect(reply).toEqual(REJECTED)
  })

  it('请求体含非法 UTF-8 ⇒ version-mismatch；公开体检一次运行期间是同一份字节，没有 Date 头', async () => {
    const c = await boot()
    expect(await askRaw(c, Buffer.from([0x7b, 0xff, 0x7d]))).toEqual(VERSION)
    const first = await askRaw(c, JSON.stringify({ operation: HEALTH }))
    const second = await askRaw(
      c,
      JSON.stringify({ operation: HEALTH, protocolVersion: '0-obsolete' }),
    )
    expect(first).toEqual(second)
    expect(first.toString('latin1')).not.toMatch(/\r\nDate:/i)
    expect(bodyOf(first)).toEqual({
      reachable: true,
      centerId: c.serving[0]?.centerId,
      version: '0.1.0',
    })
  })
})

describe('T-3 判定次序（真实组合）', () => {
  it('版本对不上 × 四种出示物 ⇒ 四次 version-mismatch；公开体检照常', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const gone = await login(c, 'ada@example.invalid')
    presentations.add(gone.presentation)
    await ask(c, envelopeOf(REVOKE, { loginStateHandle: gone.handle }, ada.presentation))
    for (const presentation of [undefined, ada.presentation, gone.presentation, ' x']) {
      const envelope = { ...envelopeOf(OG(27), {}, presentation), protocolVersion: '0-obsolete' }
      expect(await ask(c, envelope)).toEqual(VERSION)
    }
    expect(bodyOf(await askRaw(c, JSON.stringify({ operation: HEALTH })))).toMatchObject({
      reachable: true,
    })
  })

  it('数据所在够不着：已撤销得 unavailable、没带得 login-state-rejected；有效配坏载荷 invalid-input、已撤销配同一份 login-state-rejected；注册与登录的坏载荷在存储不可用时仍 invalid-input', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const gone = await login(c, 'ada@example.invalid')
    presentations.add(gone.presentation)
    await ask(c, envelopeOf(REVOKE, { loginStateHandle: gone.handle }, ada.presentation))
    const bad = { invitedAccount: ada.account, unexpected: true }
    expect(await ask(c, envelopeOf(OG(23), bad, ada.presentation))).toEqual(INVALID)
    expect(await ask(c, envelopeOf(OG(23), bad, gone.presentation))).toEqual(REJECTED)
    c.storage.down = true
    expect(await ask(c, envelopeOf(OG(27), {}, gone.presentation))).toEqual(UNAVAILABLE)
    expect(await ask(c, envelopeOf(OG(27), {}))).toEqual(REJECTED)
    expect(
      await ask(c, envelopeOf(REGISTER, { loginIdentifier: ' bad', credential: PASSWORD })),
    ).toEqual(INVALID)
    expect(
      await ask(c, envelopeOf(LOGIN, { loginIdentifier: 'ada@example.invalid', credential: '' })),
    ).toEqual(INVALID)
    c.storage.down = false
  })
})

describe('T-4 三个出口不合并（真实组合 + 运维面）', () => {
  it('存储不可用时以有效登录状态问事得 unavailable，恢复后同一个登录状态照常；参与方给出集合外的值 ⇒ unavailable 且 defectCount 加一', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    c.storage.down = true
    expect(await ask(c, envelopeOf(OG(27), {}, ada.presentation))).toEqual(UNAVAILABLE)
    c.storage.down = false
    expect(bodyOf(await ask(c, envelopeOf(OG(27), {}, ada.presentation)))).toMatchObject({
      result: [{ account: ada.account }],
    })
    const before = bodyOf((await c.ops()).bytes)
    expect(before).toMatchObject({ defectCount: 0 })
    outputs.push(JSON.stringify(before))
    const spies = spyLogins(c)
    spies.listEffective.mockResolvedValueOnce({ failure: 'somethingElse' } as never)
    expect(await ask(c, envelopeOf(LIST_LOGINS, {}, ada.presentation))).toEqual(UNAVAILABLE)
    const after = bodyOf((await c.ops()).bytes)
    outputs.push(JSON.stringify(after))
    expect(after).toMatchObject({ defectCount: 1 })
    expect(c.events.defect).toBe(1)
  })
})

describe('T-5 列表句柄、撤销与备份（真实组合）', () => {
  it('登录答复的句柄等于列表里自己那一项；列表项恰 { loginStateHandle, issuedAt }；每个句柄当出示物都得 login-state-rejected，与从没签发过的值逐字节相同，verify 一次都没被调用', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const second = await login(c, 'ada@example.invalid')
    presentations.add(second.presentation)
    const listed = result(bodyOf(await ask(c, envelopeOf(LIST_LOGINS, {}, ada.presentation))))
    expect(Array.isArray(listed)).toBe(true)
    const items = listed as { loginStateHandle: string; issuedAt: string }[]
    expect(items.map(item => Object.keys(item))).toEqual([
      ['loginStateHandle', 'issuedAt'],
      ['loginStateHandle', 'issuedAt'],
    ])
    expect(items.map(item => item.loginStateHandle).sort()).toEqual(
      [ada.handle, second.handle].sort(),
    )
    const spies = spyLogins(c)
    const never = await ask(c, envelopeOf(OG(27), {}, 'never-issued-presentation'))
    for (const item of items)
      expect(await ask(c, envelopeOf(OG(27), {}, item.loginStateHandle))).toEqual(never)
    expect(never).toEqual(REJECTED)
    expect(spies.verify).not.toHaveBeenCalled()
  })

  it('按句柄撤销同账号另一个 ⇒ ok，再撤仍 ok；别的账号的句柄与从没签发过的句柄 ⇒ login-state-not-found 逐字节相同；首尾空白 ⇒ invalid-input 且 revoke 未被调用；abc 原样到达 revoke；只有一次领域调用；撤自己之后再来 ⇒ login-state-rejected', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const bob = await session(c, 'bob@example.invalid')
    const other = await login(c, 'ada@example.invalid')
    presentations.add(other.presentation)
    const spies = spyLogins(c)
    expect(
      bodyOf(
        await ask(c, envelopeOf(REVOKE, { loginStateHandle: other.handle }, ada.presentation)),
      ),
    ).toEqual({ result: 'ok' })
    expect(
      bodyOf(
        await ask(c, envelopeOf(REVOKE, { loginStateHandle: other.handle }, ada.presentation)),
      ),
    ).toEqual({ result: 'ok' })
    const foreign = await ask(
      c,
      envelopeOf(REVOKE, { loginStateHandle: bob.handle }, ada.presentation),
    )
    const unknown = await ask(
      c,
      envelopeOf(REVOKE, { loginStateHandle: '0'.repeat(64) }, ada.presentation),
    )
    expect(bodyOf(foreign)).toEqual({ failure: 'login-state-not-found' })
    expect(foreign).toEqual(unknown)
    const calls = spies.revoke.mock.calls.length
    expect(
      await ask(c, envelopeOf(REVOKE, { loginStateHandle: ` ${bob.handle}` }, ada.presentation)),
    ).toEqual(INVALID)
    expect(spies.revoke.mock.calls.length).toBe(calls)
    expect(
      bodyOf(await ask(c, envelopeOf(REVOKE, { loginStateHandle: 'abc' }, ada.presentation))),
    ).toEqual({ failure: 'login-state-not-found' })
    expect(spies.revoke.mock.calls.at(-1)?.[0]).toBe('abc')
    expect(spies.listEffective).not.toHaveBeenCalled()
    expect(
      bodyOf(await ask(c, envelopeOf(REVOKE, { loginStateHandle: ada.handle }, ada.presentation))),
    ).toEqual({ result: 'ok' })
    expect(await ask(c, envelopeOf(LIST_LOGINS, {}, ada.presentation))).toEqual(REJECTED)
  })

  it('两条交错：认人与撤销之间目标被别处撤掉 ⇒ ok；发起方被撤掉 ⇒ login-state-rejected', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const target = await login(c, 'ada@example.invalid')
    presentations.add(target.presentation)
    const spies = spyLogins(c)
    const revoke = spies.logins.revoke.bind(spies.logins)
    spies.revoke.mockImplementationOnce(async (targetId, initiator) => {
      await revoke(target.handle, initiator)
      return revoke(targetId, initiator)
    })
    expect(
      bodyOf(
        await ask(c, envelopeOf(REVOKE, { loginStateHandle: target.handle }, ada.presentation)),
      ),
    ).toEqual({ result: 'ok' })
    const another = await login(c, 'ada@example.invalid')
    presentations.add(another.presentation)
    spies.revoke.mockImplementationOnce(async (targetId, initiator) => {
      await revoke(initiator, initiator)
      return revoke(targetId, initiator)
    })
    expect(
      await ask(c, envelopeOf(REVOKE, { loginStateHandle: another.handle }, ada.presentation)),
    ).toEqual(REJECTED)
  })

  it('备份那一半（契约 S-41 后半）：登录三次、撤销一次、停机备份；备份里每一个字符串值当出示物都得 login-state-rejected，与没带时逐字节相同；两个仍有效的照常能用', async () => {
    const file = tempSqliteFile('backup')
    const c = await bootCenter({ file })
    centers.push(c)
    await c.open()
    const first = await session(c, 'ada@example.invalid')
    const second = await login(c, 'ada@example.invalid')
    const third = await login(c, 'ada@example.invalid')
    for (const s of [second, third]) presentations.add(s.presentation)
    await ask(c, envelopeOf(REVOKE, { loginStateHandle: second.handle }, first.presentation))
    centers.splice(centers.indexOf(c), 1)
    outputs.push(c.logText())
    await c.dispose()
    const backup = `${file}.backup`
    copyFileSync(file, backup)
    const values = stringValues(backup)
    expect(values.length).toBeGreaterThan(10)
    const restarted = await boot({ file })
    const absent = await ask(restarted, envelopeOf(OG(27), {}))
    for (const value of values) {
      expect(await ask(restarted, envelopeOf(OG(27), {}, value)), value.slice(0, 16)).toEqual(
        absent,
      )
    }
    for (const valid of [first, third]) {
      expect(
        bodyOf(await ask(restarted, envelopeOf(OG(27), {}, valid.presentation))),
      ).toMatchObject({ result: [{}] })
    }
  })
})

/** 一份 sqlite 备份里每一张表每一行的每一个字符串值（去重）。 */
function stringValues(file: string): string[] {
  const db = new DatabaseSync(file)
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(row => String(row['name']))
    const values = new Set<string>()
    for (const table of tables) {
      for (const row of db.prepare(`SELECT * FROM "${table}"`).all()) {
        for (const value of Object.values(row))
          if (typeof value === 'string' && value.length > 0) values.add(value)
      }
    }
    return [...values]
  } finally {
    db.close()
  }
}

describe('T-6 身份推导与补授权（真实组合）', () => {
  it('切到组织 A 后发邀请由 A 发出；载荷夹带「以组织 B 行事」⇒ invalid-input 且没有邀请被发出；读不在的与不存在的组织 ⇒ notAuthorized；上级链一个不在 ⇒ notAuthorized', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const bob = await session(c, 'bob@example.invalid')
    const team = String(result(bodyOf(await ask(c, envelopeOf(OG(21), {}, ada.presentation)))))
    organizationIds.add(team)
    expect(
      bodyOf(
        await ask(
          c,
          envelopeOf(
            OG(37),
            { targetTenant: { organization: team, account: ada.account } },
            ada.presentation,
          ),
        ),
      ),
    ).toEqual({ result: 'ok' })
    const invitation = String(
      result(
        bodyOf(await ask(c, envelopeOf(OG(23), { invitedAccount: bob.account }, ada.presentation))),
      ),
    )
    const view = result(
      bodyOf(
        await ask(
          c,
          envelopeOf(OG(55), { invitation, callerIdentityKind: 'tenant' }, ada.presentation),
        ),
      ),
    )
    expect(view).toMatchObject({ issuerOrganization: team, invitedAccount: bob.account })
    expect(
      await ask(
        c,
        envelopeOf(
          OG(23),
          {
            invitedAccount: bob.account,
            issuerTenant: { organization: bob.personal, account: ada.account },
          },
          ada.presentation,
        ),
      ),
    ).toEqual(INVALID)
    const issued = result(bodyOf(await ask(c, envelopeOf(OG(58), {}, ada.presentation))))
    expect(issued).toMatchObject({ invitations: [{ invitation }] })
    expect((issued as { invitations: unknown[] }).invitations).toHaveLength(1)
    expect(
      bodyOf(await ask(c, envelopeOf(OG(22), { organization: bob.personal }, ada.presentation))),
    ).toEqual({ failure: 'notAuthorized' })
    expect(
      bodyOf(
        await ask(c, envelopeOf(OG(22), { organization: 'org_does_not_exist' }, ada.presentation)),
      ),
    ).toEqual({ failure: 'notAuthorized' })
    expect(
      bodyOf(
        await ask(c, envelopeOf(OG(34), { organizations: [team, bob.personal] }, ada.presentation)),
      ),
    ).toEqual({ failure: 'notAuthorized' })
    expect(
      bodyOf(
        await ask(c, envelopeOf(OG(34), { organizations: [team, ada.personal] }, ada.presentation)),
      ),
    ).toEqual({ result: false })
  })

  it('个人组织发邀请 ⇒ issuerIsPersonalOrganization 原样透传', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const bob = await session(c, 'bob@example.invalid')
    expect(
      bodyOf(await ask(c, envelopeOf(OG(23), { invitedAccount: bob.account }, ada.presentation))),
    ).toEqual({ failure: 'issuerIsPersonalOrganization' })
  })
})

describe('T-7 δ = 0：每个请求现读（真实组合）', () => {
  it('撤销之后立刻用它 ⇒ login-state-rejected；切换当前租户身份后下一个请求就以新身份行事；解除成员资格后下一次补授权即 notAuthorized', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const bob = await session(c, 'bob@example.invalid')
    const throwaway = await login(c, 'ada@example.invalid')
    presentations.add(throwaway.presentation)
    expect(
      bodyOf(
        await ask(
          c,
          envelopeOf(REVOKE, { loginStateHandle: throwaway.handle }, throwaway.presentation),
        ),
      ),
    ).toEqual({ result: 'ok' })
    expect(await ask(c, envelopeOf(OG(27), {}, throwaway.presentation))).toEqual(REJECTED)

    const team = String(result(bodyOf(await ask(c, envelopeOf(OG(21), {}, ada.presentation)))))
    organizationIds.add(team)
    expect(
      bodyOf(await ask(c, envelopeOf(OG(23), { invitedAccount: bob.account }, ada.presentation))),
    ).toEqual({ failure: 'issuerIsPersonalOrganization' })
    await ask(
      c,
      envelopeOf(
        OG(37),
        { targetTenant: { organization: team, account: ada.account } },
        ada.presentation,
      ),
    )
    const invitation = String(
      result(
        bodyOf(await ask(c, envelopeOf(OG(23), { invitedAccount: bob.account }, ada.presentation))),
      ),
    )
    expect(bodyOf(await ask(c, envelopeOf(OG(25), { invitation }, bob.presentation)))).toEqual({
      result: { organization: team, account: bob.account },
    })
    expect(
      bodyOf(await ask(c, envelopeOf(OG(22), { organization: team }, bob.presentation))),
    ).toEqual({ result: { organization: team, organizationKind: 'team' } })
    expect(
      bodyOf(
        await ask(
          c,
          envelopeOf(
            OG(29),
            { targetTenant: { organization: team, account: bob.account } },
            ada.presentation,
          ),
        ),
      ),
    ).toEqual({ result: 'ok' })
    expect(
      bodyOf(await ask(c, envelopeOf(OG(22), { organization: team }, bob.presentation))),
    ).toEqual({ failure: 'notAuthorized' })
  })
})

describe('T-9 客户端一面没有第三张面', () => {
  it('客户端一面没有读完整体检或写部署事实的路由：发这类 operation 得 invalid-input', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    for (const operation of [
      'composition.governance-center-entry/v1#S-26',
      'composition.governance-center-entry/v1#S-25',
      'deployment/write',
    ]) {
      expect(await ask(c, envelopeOf(operation, {}, ada.presentation))).toEqual(INVALID)
    }
  })
})

describe('T-16 不记住来访、不区别对待来者', () => {
  it('同一个有效登录状态、同一件事，从两个对端地址、以人用客户端与脚本的写法各发一次 ⇒ 答复逐字节相同', async () => {
    const c = await boot()
    const ada = await session(c, 'ada@example.invalid')
    const body = JSON.stringify(envelopeOf(OG(27), {}, ada.presentation))
    const human = httpRequest(body, {
      headers: ['User-Agent: omne-cli/0.1 (human)', 'Accept: application/json'],
    })
    const script = httpRequest(body, {
      method: 'PUT',
      path: '/script?run=1',
      headers: ['User-Agent: curl/8.0'],
    })
    const replies = [
      await tlsExchange(c.port, human, { localAddress: '127.0.0.1' }),
      await tlsExchange(c.port, script, { localAddress: '127.0.0.1' }),
      await tlsExchange(c.port, human, { localAddress: '127.0.0.2' }),
      await tlsExchange(c.port, script, { localAddress: '127.0.0.2' }),
    ]
    for (const reply of replies) outputs.push(reply.bytes.toString('latin1'))
    expect(bodyOf(replies[0]?.bytes ?? Buffer.alloc(0))).toMatchObject({
      result: [{ account: ada.account }],
    })
    for (const reply of replies) expect(reply.bytes).toEqual(replies[0]?.bytes)
  })
})

describe('T-11 秘密不进任何输出（本文件全部答复、体检、工程记录）', () => {
  it('部署签名私钥、凭据材料、TLS 私钥、出示物（原样、base64url 带与不带填充、十六进制大小写）只出现在登录成功答复里；工程记录里没有对端地址、AccountId、TenantId、载荷值', async () => {
    const c = await boot()
    await session(c, 'zed@example.invalid')
    outputs.push((await c.ops()).bytes.toString('latin1'))
    centers.splice(centers.indexOf(c), 1)
    outputs.push(c.logText())
    for (const secret of c.deploymentSecrets) secrets.add(secret)
    await c.dispose()

    expect(presentations.size).toBeGreaterThan(5)
    const loginReplies = outputs.filter(text => text.includes('"loginState":'))
    const rest = outputs.filter(text => !text.includes('"loginState":')).join('\n')
    for (const secret of secrets) {
      for (const line of secret.split('\n').filter(l => l.length > 20 && !l.startsWith('-----'))) {
        expect(outputs.join('\n')).not.toContain(line)
      }
    }
    for (const presentation of presentations) {
      const utf8 = Buffer.from(presentation, 'utf8')
      const forms = [
        presentation,
        utf8.toString('base64url'),
        utf8.toString('base64'),
        utf8.toString('hex'),
        utf8.toString('hex').toUpperCase(),
      ]
      for (const form of forms) expect(rest, form.slice(0, 12)).not.toContain(form)
    }
    // 登录成功答复里只有那一个出示物
    for (const reply of loginReplies) expect(reply.match(/"loginState":/g)).toHaveLength(1)

    const engineering = outputs
      .filter(text => /governance-center-(entry|ops) /.test(text))
      .join('\n')
    expect(engineering.length).toBeGreaterThan(0)
    expect(engineering).not.toContain('127.0.0.1')
    expect(engineering).not.toContain('127.0.0.2')
    for (const id of accountIds) expect(engineering).not.toContain(id)
    for (const id of organizationIds) expect(engineering).not.toContain(id)
    for (const value of payloadValues) expect(engineering).not.toContain(value)
  })
})
