// organizations 服务面与 organization-purge 的操作级义务：S-20、S-21（创建键五支 + 故障注入 + 保留期）、
// S-22、S-33、S-34、S-35、S-7（静态）、S-42 第 4 行（服务面分离）、S-53 依据与 ②乙 两支。
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyHandoffWarrant } from '@omne-harness-lite/identity-values'
import {
  ORGANIZATION_PURGE_SERVICE,
  type OrganizationPurgeService,
  type OrganizationsService,
} from '../src/index.ts'
import {
  CREATION_KEY_RETENTION,
  type Harness,
  addAccount,
  bootOg,
  countRows,
  registeredUser,
  rowsOf,
  teamWith,
} from './support.ts'

const harnesses: Harness[] = []
afterEach(async () => {
  for (const h of harnesses.splice(0).reverse()) await h.dispose()
})
async function boot(): Promise<Harness> {
  const h = await bootOg()
  harnesses.push(h)
  return h
}

describe('S-20 创建个人组织', () => {
  it('幂等不是拒绝：同一 AccountId 连调两次 ⇒ 第二次 ok 且同一个 OrganizationId；组织、成员关系、超管三者同成', async () => {
    const h = await boot()
    const account = await addAccount(h, { activated: false })
    const first = await h.organizations.createPersonal(account)
    const second = await h.organizations.createPersonal(account)
    expect(first).toEqual(second)
    if (!('ok' in first)) throw new Error('first failed')
    expect(await countRows(h, 'organization', { owner_account: account })).toBe(1)
    expect(await rowsOf(h, 'membership', { organization_id: first.ok.organization })).toEqual([
      {
        organization_id: first.ok.organization,
        account_id: account,
        effective: 1,
        role: 'superAdministrator',
      },
    ])
    expect(await h.organizations.read(first.ok.organization)).toEqual({
      ok: { id: first.ok.organization, kind: 'personal', parent: null },
    })
  })

  it('不要求已激活；已过留存期限 ⇒ accountRecordExpired（幂等那一路也一样，不返回已有的个人组织）', async () => {
    const h = await boot()
    const account = await addAccount(h, {
      activated: false,
      retentionDeadline: h.clock.current + 1_000,
    })
    const created = await h.organizations.createPersonal(account)
    expect('ok' in created).toBe(true)
    h.clock.advance(1_001)
    expect(await h.organizations.createPersonal(account)).toEqual({
      failure: 'accountRecordExpired',
    })
    const other = await addAccount(h, { activated: false, retentionDeadline: h.clock.current - 1 })
    expect(await h.organizations.createPersonal(other)).toEqual({ failure: 'accountRecordExpired' })
    expect(await countRows(h, 'organization', { owner_account: other })).toBe(0)
  })

  it('账号不存在 ⇒ accountDoesNotExist；账号读面不可用 ⇒ unavailable，不跳过判定直接建', async () => {
    const h = await boot()
    expect(await h.organizations.createPersonal('no-such-account')).toEqual({
      failure: 'accountDoesNotExist',
    })
    const account = await addAccount(h, { activated: false })
    h.accounts.unavailable = true
    expect(await h.organizations.createPersonal(account)).toEqual({ failure: 'unavailable' })
    h.accounts.unavailable = false
    expect(await countRows(h, 'organization')).toBe(0)
  })

  it('R-6：读账号之后、写入之前账号行被删 ⇒ 引用约束拒绝插入 ⇒ accountDoesNotExist，不留组织', async () => {
    const h = await boot()
    const account = await addAccount(h, { activated: false })
    const realRead = h.accounts.read.bind(h.accounts)
    h.accounts.read = async id => {
      const result = await realRead(id)
      // 清除链的第 ② 步恰在这个窗口里提交
      await h.raw.write(async tx => {
        await tx.db.deleteFrom('account').where('account_id', '=', account).execute()
      })
      return result
    }
    expect(await h.organizations.createPersonal(account)).toEqual({
      failure: 'accountDoesNotExist',
    })
    expect(await countRows(h, 'organization')).toBe(0)
    expect(await countRows(h, 'membership')).toBe(0)
  })
})

describe('S-21 创建团队组织：创建键的幂等边界', () => {
  it('五支同跑：带键／同键重放／同创建者不同键／另一账号同键／不带键两次', async () => {
    const h = await boot()
    const alice = await registeredUser(h)
    const bob = await registeredUser(h)
    const teams = async () => countRows(h, 'organization', { kind: 'team' })

    // ① 带键创建 ⇒ OrganizationId
    const first = await h.organizations.createTeam(alice.account, 'key-1')
    if (!('ok' in first)) throw new Error('① failed')
    const membershipAfterFirst = await rowsOf(h, 'membership', {
      organization_id: first.ok.organization,
    })
    // ② 同创建者同键重放 ⇒ 同一个 OrganizationId、组织数不增、成员关系不重写
    const replay = await h.organizations.createTeam(alice.account, 'key-1')
    expect(replay).toEqual(first)
    expect(await teams()).toBe(1)
    expect(await rowsOf(h, 'membership', { organization_id: first.ok.organization })).toEqual(
      membershipAfterFirst,
    )
    // ③ 同创建者不同键 ⇒ 另一个组织
    const otherKey = await h.organizations.createTeam(alice.account, 'key-2')
    if (!('ok' in otherKey)) throw new Error('③ failed')
    expect(otherKey.ok.organization).not.toBe(first.ok.organization)
    // ④ 另一账号用同一个键 ⇒ 另一个组织（键绑定创建者）
    const bobs = await h.organizations.createTeam(bob.account, 'key-1')
    if (!('ok' in bobs)) throw new Error('④ failed')
    expect(bobs.ok.organization).not.toBe(first.ok.organization)
    expect(bobs.ok.tenant).toEqual({ organization: bobs.ok.organization, account: bob.account })
    // ⑤ 不带键连调两次 ⇒ 两个组织
    const n1 = await h.organizations.createTeam(alice.account)
    const n2 = await h.organizations.createTeam(alice.account)
    if (!('ok' in n1 && 'ok' in n2)) throw new Error('⑤ failed')
    expect(n1.ok.organization).not.toBe(n2.ok.organization)
    expect(await teams()).toBe(5)
    // 每个新组织都有创建者这位有效超管
    for (const created of [first, otherKey, bobs, n1, n2]) {
      expect(await h.memberships.standing(created.ok.tenant)).toEqual({
        standing: 'effective',
        role: 'superAdministrator',
      })
    }
  })

  it('故障注入：键登记读不到 ⇒ unavailable，不得创建（不当作没见过这个键）', async () => {
    const h = await boot()
    const alice = await registeredUser(h)
    const first = await h.organizations.createTeam(alice.account, 'key-1')
    if (!('ok' in first)) throw new Error('first failed')
    h.storage.failTables('team_creation_key')
    expect(await h.organizations.createTeam(alice.account, 'key-1')).toEqual({
      failure: 'unavailable',
    })
    expect(await h.organizations.createTeam(alice.account, 'key-new')).toEqual({
      failure: 'unavailable',
    })
    h.storage.heal()
    expect(await countRows(h, 'organization', { kind: 'team' })).toBe(1)
  })

  it('保留期：期内（含边界）同键 ⇒ 同一个；推过保留期之后同键 ⇒ 新组织', async () => {
    const h = await boot()
    const alice = await registeredUser(h)
    const first = await h.organizations.createTeam(alice.account, 'key-1')
    if (!('ok' in first)) throw new Error('first failed')
    h.clock.advance(CREATION_KEY_RETENTION)
    expect(await h.organizations.createTeam(alice.account, 'key-1')).toEqual(first)
    h.clock.advance(1)
    const later = await h.organizations.createTeam(alice.account, 'key-1')
    if (!('ok' in later)) throw new Error('later failed')
    expect(later.ok.organization).not.toBe(first.ok.organization)
    // 登记改指新组织：此后同键认回的是新的那一个
    expect(await h.organizations.createTeam(alice.account, 'key-1')).toEqual(later)
  })

  it('发起者未激活 ⇒ accountNotActivated；不存在 ⇒ accountDoesNotExist；读面不可用 ⇒ unavailable；都不建组织', async () => {
    const h = await boot()
    const pending = await addAccount(h, { activated: false })
    expect(await h.organizations.createTeam(pending, 'k')).toEqual({
      failure: 'accountNotActivated',
    })
    expect(await h.organizations.createTeam('ghost', 'k')).toEqual({
      failure: 'accountDoesNotExist',
    })
    const active = await addAccount(h, { activated: true })
    h.accounts.unavailable = true
    expect(await h.organizations.createTeam(active, 'k')).toEqual({ failure: 'unavailable' })
    h.accounts.unavailable = false
    expect(await countRows(h, 'organization')).toBe(0)
    expect(await countRows(h, 'team_creation_key')).toBe(0)
  })
})

describe('S-22 读组织', () => {
  it('不存在只在 S-53 清除之后可达；读不到 ⇒ unavailable，不是 organizationDoesNotExist', async () => {
    const h = await boot()
    const account = await addAccount(h, {
      activated: false,
      retentionDeadline: h.clock.current + 10,
    })
    const created = await h.organizations.createPersonal(account)
    if (!('ok' in created)) throw new Error('create failed')
    h.storage.failTables('organization')
    expect(await h.organizations.read(created.ok.organization)).toEqual({ failure: 'unavailable' })
    h.storage.heal()
    h.clock.advance(11)
    expect('ok' in (await h.purge.purgePersonalOrganization(account))).toBe(true)
    expect(await h.organizations.read(created.ok.organization)).toEqual({
      failure: 'organizationDoesNotExist',
    })
  })
})

describe('S-32／S-33／S-34 隶属与上级链', () => {
  it('S-32 判环两半：一般的环 ⇒ wouldFormACycle；己方已有上级 ⇒ alreadyHasAParentOrganization；与 S-30 自环同一个值', async () => {
    const h = await boot()
    const [a, b, c] = [await teamWith(h), await teamWith(h), await teamWith(h)]
    // b 作 a 的上级、c 作 b 的上级：a → b → c
    const r1 = await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent')
    const r2 = await h.offers.issueAffiliationRequest(b.owner, c.organization, 'recipientAsParent')
    if (!('ok' in r1 && 'ok' in r2)) throw new Error('issue failed')
    expect(await h.offers.acceptAffiliationRequest(b.owner, r1.ok)).toBe('ok')
    expect(await h.offers.acceptAffiliationRequest(c.owner, r2.ok)).toBe('ok')
    expect(await h.organizations.ancestorChain(a.organization)).toEqual({
      ok: [b.organization, c.organization],
    })
    // c 请 a 作上级 ⇒ c 在 a 的上级链上 ⇒ 成环
    const cycle = await h.offers.issueAffiliationRequest(
      c.owner,
      a.organization,
      'recipientAsParent',
    )
    if (!('ok' in cycle)) throw new Error('cycle issue failed')
    const cycleResult = await h.offers.acceptAffiliationRequest(a.owner, cycle.ok)
    expect(cycleResult).toEqual({ failure: 'wouldFormACycle' })
    // S-30 指向自己：不读存储，同一个值
    const self = await h.offers.issueAffiliationRequest(a.owner, a.organization, 'recipientAsChild')
    expect(self).toEqual(cycleResult)
    // 己方已有上级：a 再请 c 作上级
    const again = await h.offers.issueAffiliationRequest(
      a.owner,
      c.organization,
      'recipientAsParent',
    )
    if (!('ok' in again)) throw new Error('again issue failed')
    expect(await h.offers.acceptAffiliationRequest(c.owner, again.ok)).toEqual({
      failure: 'alreadyHasAParentOrganization',
    })
    expect(await h.organizations.read(c.organization)).toEqual({
      ok: { id: c.organization, kind: 'team', parent: null },
    })
  })

  it('S-32 判环的「child === newParent」那一半：一份绕过 S-30 写进来的自指请求照样被拒（Alloy 曾给出的反例）', async () => {
    const h = await boot()
    const a = await teamWith(h)
    const now = h.clock.current
    await h.raw.write(async tx => {
      await tx.db
        .insertInto('affiliation_request')
        .values({
          affiliation_request_id: 'forged-self',
          initiator: a.organization,
          recipient: a.organization,
          direction: 'recipientAsParent',
          issued_at: now,
          expires_at: now + 60_000,
          settled: null,
        })
        .execute()
    })
    expect(await h.offers.acceptAffiliationRequest(a.owner, 'forged-self')).toEqual({
      failure: 'wouldFormACycle',
    })
    expect(await h.organizations.read(a.organization)).toEqual({
      ok: { id: a.organization, kind: 'team', parent: null },
    })
  })

  it('S-32 判环读不到部分链 ⇒ unavailable，不判「不成环」', async () => {
    const h = await boot()
    const [a, b] = [await teamWith(h), await teamWith(h)]
    const request = await h.offers.issueAffiliationRequest(
      a.owner,
      b.organization,
      'recipientAsParent',
    )
    if (!('ok' in request)) throw new Error('issue failed')
    // 构造：b 的上级指向一行读不到的组织（链上断了一环）
    await h.raw.write(async tx => {
      await tx.db
        .updateTable('organization')
        .set({ parent: 'vanished' })
        .where('organization_id', '=', b.organization)
        .execute()
    })
    expect(await h.offers.acceptAffiliationRequest(b.owner, request.ok)).toEqual({
      failure: 'unavailable',
    })
    expect(await h.organizations.ancestorChain(b.organization)).toEqual({ failure: 'unavailable' })
    expect(await h.organizations.read(a.organization)).toEqual({
      ok: { id: a.organization, kind: 'team', parent: null },
    })
  })

  it('S-33 解除隶属：任一方超管单方面即可；属性已空 ⇒ noSuchAffiliation；第三方 ⇒ notAuthorized；发 affiliation.dissolved', async () => {
    const h = await boot()
    const [child, parent, stranger] = [
      await teamWith(h, ['member']),
      await teamWith(h),
      await teamWith(h),
    ]
    const link = async () => {
      const r = await h.offers.issueAffiliationRequest(
        child.owner,
        parent.organization,
        'recipientAsParent',
      )
      if (!('ok' in r)) throw new Error('issue failed')
      expect(await h.offers.acceptAffiliationRequest(parent.owner, r.ok)).toBe('ok')
    }
    await link()
    expect(await h.organizations.dissolveAffiliation(stranger.owner, child.organization)).toEqual({
      failure: 'notAuthorized',
    })
    expect(await h.organizations.dissolveAffiliation(child.members[0], child.organization)).toEqual(
      {
        failure: 'notAuthorized',
      },
    )
    expect(await h.organizations.dissolveAffiliation(parent.owner, child.organization)).toBe('ok')
    expect(h.events.filter(e => e.name === 'affiliation.dissolved')).toEqual([
      {
        name: 'affiliation.dissolved',
        payload: { child: child.organization, formerParent: parent.organization },
      },
    ])
    expect(await h.organizations.dissolveAffiliation(parent.owner, child.organization)).toEqual({
      failure: 'notAuthorized', // 解除之后 parent 已不是任一方
    })
    expect(await h.organizations.dissolveAffiliation(child.owner, child.organization)).toEqual({
      failure: 'noSuchAffiliation',
    })
    await link()
    expect(await h.organizations.dissolveAffiliation(child.owner, child.organization)).toBe('ok')
  })

  it('S-34 上级链不含自己、个人组织恒空；shareAncestor 含自己（组织与它自己的上级同树），个人组织与别的恒假', async () => {
    const h = await boot()
    const [a, b, c] = [await teamWith(h), await teamWith(h), await teamWith(h)]
    const personal = await registeredUser(h)
    const r = await h.offers.issueAffiliationRequest(a.owner, b.organization, 'recipientAsParent')
    if (!('ok' in r)) throw new Error('issue failed')
    expect(await h.offers.acceptAffiliationRequest(b.owner, r.ok)).toBe('ok')
    expect(await h.organizations.ancestorChain(b.organization)).toEqual({ ok: [] })
    expect(await h.organizations.ancestorChain(personal.personal.organization)).toEqual({ ok: [] })
    expect(await h.organizations.shareAncestor(a.organization, b.organization)).toEqual({
      ok: true,
    })
    expect(await h.organizations.shareAncestor(a.organization, c.organization)).toEqual({
      ok: false,
    })
    expect(
      await h.organizations.shareAncestor(personal.personal.organization, a.organization),
    ).toEqual({ ok: false })
    expect(await h.organizations.ancestorChain('nope')).toEqual({
      failure: 'organizationDoesNotExist',
    })
    expect(await h.organizations.shareAncestor(a.organization, 'nope')).toEqual({
      failure: 'organizationDoesNotExist',
    })
    h.storage.failTables('organization')
    expect(await h.organizations.ancestorChain(a.organization)).toEqual({ failure: 'unavailable' })
    expect(await h.organizations.shareAncestor(a.organization, b.organization)).toEqual({
      failure: 'unavailable',
    })
  })
})

describe('S-35 层身份', () => {
  it('纯计算：两层身份；不读存储（存储全坏也照答），失败集合只有 invalidInput', async () => {
    const h = await boot()
    const tenant = { organization: 'o-1', account: 'a-1' }
    h.storage.failEverything()
    const statements = h.storage.statements
    expect(h.organizations.scopeLayers(tenant)).toEqual({
      ok: {
        organization: { layer: 'organization', organization: 'o-1' },
        tenant: { layer: 'tenant', tenant },
      },
    })
    expect(h.storage.statements).toBe(statements)
    expect(h.organizations.scopeLayers({ organization: 'o-1' })).toEqual({
      failure: 'invalidInput',
    })
    h.storage.heal()
  })
})

describe('S-7 至多一个上级：静态检查', () => {
  it('parent 是 organization 的单列；写 parent 的语句只有两条（接受隶属填值、解除隶属清空），创建一律写 null', () => {
    const src = new URL('../src/', import.meta.url)
    const sources = readdirSync(src)
      .filter(f => f.endsWith('.ts'))
      .map(f => ({ file: f, text: readFileSync(new URL(f, src), 'utf8') }))
    // 每条写 organization 表的语句：从 updateTable／insertInto('organization') 到它的 .execute()
    const statements = sources.flatMap(({ file, text }) =>
      [
        ...text.matchAll(/\.(updateTable|insertInto)\('organization'\)([\s\S]*?)\.execute\(\)/g),
      ].map(m => ({ file, kind: m[1], body: (m[2] ?? '').replace(/\s+/g, ' ') })),
    )
    const updates = statements.filter(s => s.kind === 'updateTable')
    expect(
      updates.map(u => `${u.file}: ${/\.set\(\{([^}]*)\}\)/.exec(u.body)?.[1]?.trim()}`).sort(),
    ).toEqual([
      'offers.ts: parent: newParent', // setParent（S-32 接受隶属请求）
      'organizations.ts: parent: null', // clearParent（S-33 解除隶属）
    ])
    const inserts = statements.filter(s => s.kind === 'insertInto')
    expect(inserts).toHaveLength(1) // 创建组织只有一处（S-20／S-21 共用）
    expect(inserts[0]?.body).toContain('parent: null')
    // 除了这两个函数，源码里没有别处再写 organization 表
    expect(
      sources
        .filter(s => /updateTable\(/.test(s.text))
        .map(s => s.file)
        .sort(),
    ).toEqual(['memberships.ts', 'offers.ts', 'organizations.ts'])
    const migration = sources.find(s => s.file === 'migrations.ts')?.text ?? ''
    expect([...migration.matchAll(/addColumn\('parent'/g)]).toHaveLength(1)
  })

  it('存储形状：organization 表恰一列 parent，没有第二个上级列或上级关系表', async () => {
    const h = await boot()
    const db = new DatabaseSync(h.file, { readOnly: true })
    try {
      const columns = db.prepare('PRAGMA table_info(organization)').all() as { name: string }[]
      expect(columns.map(c => c.name).filter(n => n.includes('parent'))).toEqual(['parent'])
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string
      }[]
      expect(
        tables.filter(
          t =>
            t.name.includes('parent') ||
            (t.name.includes('affiliation') && t.name !== 'affiliation_request'),
        ),
      ).toEqual([])
    } finally {
      db.close()
    }
  })
})

describe('S-42 第 4 行：S-53 单独一个服务名', () => {
  it('organizations 面上没有清除操作；organization-purge 面只有 S-53 这一个方法', async () => {
    const h = await boot()
    const organizations = h.assembly.ctx.get('organizations') as OrganizationsService
    expect(Object.keys(organizations).sort()).toEqual([
      'ancestorChain',
      'createPersonal',
      'createTeam',
      'dissolveAffiliation',
      'read',
      'scopeLayers',
      'shareAncestor',
    ])
    const purge = h.assembly.ctx.get(ORGANIZATION_PURGE_SERVICE) as OrganizationPurgeService
    expect(Object.keys(purge)).toEqual(['purgePersonalOrganization'])
  })
})

describe('S-53 清除依据与 ②乙 两支（替身构造；不作 S-54 ⑥⑦ 证据，那两支归波次 2）', () => {
  it('依据只在 ok 路径产出：三种拒绝与 unavailable 都不带依据；成功与幂等成功都带、都绑定该 AccountId', async () => {
    const h = await boot()
    const active = await registeredUser(h)
    for (const failure of [
      await h.purge.purgePersonalOrganization(active.account),
      await h.purge.purgePersonalOrganization(''),
    ]) {
      expect(Object.keys(failure)).toEqual(['failure'])
    }
  })

  it('②乙 账号读不到、个人组织也不在 ⇒ ok 并返回依据（重扫）；账号读不到、组织还在 ⇒ accountDoesNotExist，组织原样、不签、可观测', async () => {
    const h = await boot()
    const doomed = await addAccount(h, {
      activated: false,
      retentionDeadline: h.clock.current + 10,
    })
    const created = await h.organizations.createPersonal(doomed)
    if (!('ok' in created)) throw new Error('create failed')
    h.clock.advance(11)
    expect('ok' in (await h.purge.purgePersonalOrganization(doomed))).toBe(true)
    // 清除链第 ② 步：账号记录被清（组织已不在，引用约束不拦）
    await h.raw.write(async tx => {
      await tx.db.deleteFrom('account').where('account_id', '=', doomed).execute()
    })
    const rescan = await h.purge.purgePersonalOrganization(doomed)
    if (!('ok' in rescan)) throw new Error(`rescan ${rescan.failure}`)
    expect(verifyHandoffWarrant(h.purgeVerificationKey, 'purge', doomed, rescan.ok.warrant)).toBe(
      'ok',
    )
    expect(h.errorLogs()).toEqual([])

    // 构造「账号已不在、个人组织还在」：绕过引用约束直接删账号行
    const broken = await addAccount(h, { activated: false })
    const brokenOrg = await h.organizations.createPersonal(broken)
    if (!('ok' in brokenOrg)) throw new Error('create failed')
    const raw = new DatabaseSync(h.file, { enableForeignKeyConstraints: false })
    try {
      raw.prepare('DELETE FROM account WHERE account_id = ?').run(broken)
    } finally {
      raw.close()
    }
    const before = await rowsOf(h, 'organization', { organization_id: brokenOrg.ok.organization })
    expect(await h.purge.purgePersonalOrganization(broken)).toEqual({
      failure: 'accountDoesNotExist',
    })
    expect(await rowsOf(h, 'organization', { organization_id: brokenOrg.ok.organization })).toEqual(
      before,
    )
    const logs = h.errorLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.args.map(String).join(' ')).toContain(broken)
  })
})
