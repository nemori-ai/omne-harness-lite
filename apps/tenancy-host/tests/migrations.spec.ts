// 迁移合成与存储约束（verification：assembly.migration-composition、assembly.migrations-idempotent、
// assembly.constraint-names-resolve、assembly.fk-organization-owner-account 两向与负向运行）。
// 全部经 boot() 装出来的那一个 `storage` 实例，在临时 sqlite 文件上跑本节点的全部迁移。
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ReferenceViolation,
  type Storage,
  UniqueViolation,
  composeMigrations,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  ORGANIZATION_OWNER_ACCOUNT_FK,
  composedMigrationNames,
  hostMigrationFragments,
} from '../src/index.ts'
import { centerIdOf, deployment, dumpDatabase, query, tablesOf } from './support/deployment.ts'
import { Hosts } from './support/host.ts'

const hosts = new Hosts()
afterEach(() => hosts.stopAll())

/**
 * 上一个发布版的合成序列（M-9 的快照）：本次序列必须以它为前缀——只多不改、不重排。
 * 发布新片段时只在末尾追加，这里同步追加；改动或重排任何一个名字这条测试就红。
 */
const RELEASED_SEQUENCE = [
  '0001_account_identity',
  '0002_organization',
  '0003_membership',
  '0004_invitation',
  '0005_affiliation_request',
  '0006_current_tenant_selection',
  '0007_team_creation_key',
  '0008_clock_lease',
  '0009_governance_center',
] as const

const TEN_TABLES = [
  'account',
  'affiliation_request',
  'clock_lease',
  'current_tenant_selection',
  'governance_center',
  'invitation',
  'login_state',
  'membership',
  'organization',
  'team_creation_key',
]

function account(id: string, identifier = `id-${id}`) {
  return {
    account_id: id,
    login_identifier: identifier,
    credential_material: 'opaque',
    activated: 0,
    produced_at: 1,
    retention_deadline: 2,
    expired_at: null,
  }
}

function personal(id: string, owner: string | null, kind = 'personal') {
  return { organization_id: id, kind, parent: null, owner_account: owner, created_at: 1 }
}

async function insert(storage: Storage, table: string, row: Record<string, unknown>) {
  await storage.write(async tx => {
    await tx.db.insertInto(table).values(row).execute()
  })
}

async function thrown(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (error: unknown) => error,
  )
}

describe('assembly.migration-composition', () => {
  it('空库上跑合成的迁移 ⇒ 十张表都在，governance_center 恰一行未铸的占位（入口层随即铸出标识）；AI 片段编号在 OG 之前', async () => {
    const d = await deployment('compose')
    const { host } = await hosts.start(d)
    await hosts.stop(host)
    expect(tablesOf(d.file).filter(t => !t.startsWith('kysely_'))).toEqual(TEN_TABLES)
    const registered = query<{ name: string }>(
      d.file,
      'SELECT name FROM kysely_migration ORDER BY name',
    )
    expect(registered.map(r => r.name)).toEqual([...RELEASED_SEQUENCE])
    const rows = query<{ slot: string; center_id: string | null }>(
      d.file,
      'SELECT * FROM governance_center',
    )
    expect(rows).toEqual([{ slot: 'center', center_id: host.serving.centerId }])
  })

  it('迁移本身在空库上建的是「未铸」的占位行（不经入口层）', async () => {
    const d = await deployment('placeholder')
    const storage = await openStorage({
      dialect: 'sqlite',
      file: d.file,
      migrations: composeMigrations(hostMigrationFragments),
      upgrade: false,
    })
    await storage.close()
    expect(query(d.file, 'SELECT * FROM governance_center')).toEqual([
      { slot: 'center', center_id: null },
    ])
  })

  it('organization 上恰有一条外键，名字、目标、ON DELETE RESTRICT、不延迟都由本节点给出', async () => {
    const d = await deployment('fk-shape')
    const { host } = await hosts.start(d)
    await hosts.stop(host)
    const keys = query<{ table: string; from: string; to: string; on_delete: string }>(
      d.file,
      'SELECT "table", "from", "to", on_delete FROM pragma_foreign_key_list(\'organization\')',
    )
    expect(keys).toEqual([
      { table: 'account', from: 'owner_account', to: 'account_id', on_delete: 'RESTRICT' },
    ])
    const [ddl] = query<{ sql: string }>(
      d.file,
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'organization'",
    )
    expect(ddl?.sql).toContain(`constraint "${ORGANIZATION_OWNER_ACCOUNT_FK}" foreign key`)
    expect(ddl?.sql.toLowerCase()).not.toContain('deferrable')
    // 其余表都没有外键（M-5：只建这一条）
    for (const table of TEN_TABLES.filter(t => t !== 'organization'))
      expect(query(d.file, `SELECT * FROM pragma_foreign_key_list('${table}')`)).toEqual([])
  })

  it('M-9 编号名快照：本次合成序列以上一个发布版的序列为前缀（只多不改、不重排）', () => {
    const current = composedMigrationNames(hostMigrationFragments)
    expect(current.slice(0, RELEASED_SEQUENCE.length)).toEqual([...RELEASED_SEQUENCE])
  })
})

describe('assembly.migrations-idempotent', () => {
  it('每个片段在已迁移的库上再跑一次：不报错、schema 不变；已铸的标识不被打回未铸（存在即不插）', async () => {
    const d = await deployment('idempotent')
    const { host } = await hosts.start(d)
    const centerId = host.serving.centerId
    await hosts.stop(host)
    const before = dumpDatabase(d.file)
    const storage = await openStorage({ dialect: 'sqlite', file: d.file, upgrade: false })
    try {
      for (const fragment of hostMigrationFragments)
        await storage.write(async tx => {
          await fragment.migration.up(tx.db)
        })
    } finally {
      await storage.close()
    }
    const after = dumpDatabase(d.file)
    expect(after.schema).toEqual(before.schema)
    expect(after.rows).toEqual(before.rows)
    expect(centerIdOf(d.file)).toBe(centerId)
    expect(query(d.file, 'SELECT count(*) AS n FROM governance_center')).toEqual([{ n: 1 }])
  })

  it('同一文件上起两次：第二次没有待跑迁移，标识不变', async () => {
    const d = await deployment('twice')
    const first = await hosts.start(d)
    await hosts.stop(first.host)
    const second = await hosts.start(d)
    expect(second.host.serving.centerId).toBe(first.host.serving.centerId)
    expect(second.host.confirmation).toEqual({
      migrated: false,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
  })
})

describe('assembly.constraint-names-resolve（经装配出的 storage，任何一条映射成 StorageDefect 就是片段没按 M-2／M-3 命名）', () => {
  it('唯一约束与主键都报迁移里起的名字', async () => {
    const d = await deployment('names')
    const { host } = await hosts.start(d)
    const storage = host.context.get('storage') as Storage
    await insert(storage, 'account', account('a1', 'ada'))

    const cases: [string, Record<string, unknown>, string][] = [
      ['account', account('a2', 'ada'), 'account_login_identifier_unique'],
      ['account', account('a1', 'other'), 'account_pkey'],
      [
        'login_state',
        { login_state_id: 'l1', account_id: 'a1', issued_at: 1, revoked: 0 },
        'login_state_pkey',
      ],
      [
        'membership',
        { organization_id: 'o1', account_id: 'a1', effective: 1, role: 'member' },
        'membership_pkey',
      ],
      [
        'team_creation_key',
        { creator_account: 'a1', creation_key: 'k', organization_id: 'o1', registered_at: 1 },
        'team_creation_key_pkey',
      ],
      ['governance_center', { slot: 'center', center_id: null }, 'governance_center_pkey'],
      [
        'invitation',
        {
          invitation_id: 'i1',
          issuer_organization: 'o1',
          invited_account: 'a1',
          role: 'member',
          issued_at: 1,
          expires_at: 2,
          settled: null,
        },
        'invitation_pkey',
      ],
      [
        'affiliation_request',
        {
          affiliation_request_id: 'r1',
          initiator: 'o1',
          recipient: 'o2',
          direction: 'up',
          issued_at: 1,
          expires_at: 2,
          settled: null,
        },
        'affiliation_request_pkey',
      ],
      [
        'current_tenant_selection',
        { login_state_id: 'l1', organization_id: 'o1', account_id: 'a1' },
        'current_tenant_selection_pkey',
      ],
    ]
    // 先各插一行（governance_center 那一行迁移已插），再插重复的
    await insert(storage, 'login_state', {
      login_state_id: 'l1',
      account_id: 'a1',
      issued_at: 1,
      revoked: 0,
    })
    await insert(storage, 'membership', {
      organization_id: 'o1',
      account_id: 'a1',
      effective: 1,
      role: 'member',
    })
    await insert(storage, 'team_creation_key', {
      creator_account: 'a1',
      creation_key: 'k',
      organization_id: 'o1',
      registered_at: 1,
    })
    await insert(storage, 'invitation', {
      invitation_id: 'i1',
      issuer_organization: 'o1',
      invited_account: 'a1',
      role: 'member',
      issued_at: 1,
      expires_at: 2,
      settled: null,
    })
    await insert(storage, 'affiliation_request', {
      affiliation_request_id: 'r1',
      initiator: 'o1',
      recipient: 'o2',
      direction: 'up',
      issued_at: 1,
      expires_at: 2,
      settled: null,
    })
    await insert(storage, 'current_tenant_selection', {
      login_state_id: 'l1',
      organization_id: 'o1',
      account_id: 'a1',
    })
    for (const [table, row, constraint] of cases) {
      const error = await thrown(insert(storage, table, row))
      expect(error, `${table} → ${constraint}`).toBeInstanceOf(UniqueViolation)
      expect((error as UniqueViolation).constraint).toBe(constraint)
    }

    // 个人组织：同一 owner_account 第二个 ⇒ organization_owner_account_unique；两个 owner_account 为 NULL 的团队组织都能插
    await insert(storage, 'organization', personal('p1', 'a1'))
    const second = await thrown(insert(storage, 'organization', personal('p2', 'a1')))
    expect((second as UniqueViolation).constraint).toBe('organization_owner_account_unique')
    const pkey = await thrown(insert(storage, 'organization', personal('p1', null, 'team')))
    expect((pkey as UniqueViolation).constraint).toBe('organization_pkey')
    await insert(storage, 'organization', personal('t1', null, 'team'))
    await insert(storage, 'organization', personal('t2', null, 'team'))
  })
})

describe('assembly.fk-organization-owner-account（S-35 孤儿不可达在存储层的唯一直接实证）', () => {
  it('① 指向不存在账号的组织行 ⇒ missing-target；② 删被引用的账号行 ⇒ delete-restricted、账号行仍在；③ 负向运行：外键关着的裸句柄删除静默成功', async () => {
    const d = await deployment('fk')
    const { host } = await hosts.start(d)
    const storage = host.context.get('storage') as Storage

    const missing = await thrown(insert(storage, 'organization', personal('orphan', 'nobody')))
    expect(missing).toBeInstanceOf(ReferenceViolation)
    expect((missing as ReferenceViolation).kind).toBe('missing-target')

    await insert(storage, 'account', account('owner'))
    await insert(storage, 'organization', personal('owned', 'owner'))
    const restricted = await thrown(
      storage.write(async tx => {
        await tx.db.deleteFrom('account').where('account_id', '=', 'owner').execute()
      }),
    )
    expect(restricted).toBeInstanceOf(ReferenceViolation)
    expect((restricted as ReferenceViolation).kind).toBe('delete-restricted')
    expect(query(d.file, "SELECT account_id FROM account WHERE account_id = 'owner'")).toHaveLength(
      1,
    )
    await hosts.stop(host)

    // ③ 同一文件、同一删除，句柄没有 foreign_keys=ON ⇒ 删得掉：①② 看的正是那条外键
    const raw = new DatabaseSync(d.file, { enableForeignKeyConstraints: false })
    try {
      raw.prepare("DELETE FROM account WHERE account_id = 'owner'").run()
    } finally {
      raw.close()
    }
    expect(query(d.file, "SELECT account_id FROM account WHERE account_id = 'owner'")).toEqual([])
  })
})
