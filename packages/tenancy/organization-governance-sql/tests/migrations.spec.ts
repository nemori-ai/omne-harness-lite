// 迁移工厂（I-4）：sqlite 上可跑、幂等（重跑不报错）、约束名可反查、外键两向、不建 CHECK、迁移模块不 import AI 包。
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Kysely } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import {
  ReferenceViolation,
  type Storage,
  UniqueViolation,
  composedMigrationName,
} from '@omne-harness-lite/storage'
import { NodeSqliteDialect, openStorage, storageSqlPlugin } from '@omne-harness-lite/storage-sql'
import {
  OG_TABLES,
  organizationGovernanceMigrations,
} from '@omne-harness-lite/organization-governance-sql'
import {
  ACCOUNT_TABLE,
  OWNER_ACCOUNT_FK,
  accountTestMigrations,
  composedMigrations,
  ogFragments,
  storageConfig,
  tempSqliteFile,
} from './support.ts'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
})

function sqliteMaster(file: string): { type: string; name: string; sql: string | null }[] {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare('SELECT type, name, sql FROM sqlite_master').all() as {
      type: string
      name: string
      sql: string | null
    }[]
  } finally {
    db.close()
  }
}

async function freshStorage(): Promise<{ file: string; storage: Storage }> {
  const file = tempSqliteFile('migrations')
  const storage = await openStorage(storageConfig(file))
  closers.push(() => storage.close())
  return { file, storage }
}

describe('organizationGovernanceMigrations 工厂', () => {
  it('六个片段，名字 = 表名、次序稳定；合成名按全局位置编号，AI 同形片段在前', async () => {
    expect(ogFragments.map(f => f.name)).toEqual([
      'organization',
      'membership',
      'invitation',
      'affiliation_request',
      'current_tenant_selection',
      'team_creation_key',
    ])
    expect(Object.values(OG_TABLES)).toEqual(ogFragments.map(f => f.name))
    const names = Object.keys(await composedMigrations().getMigrations())
    expect(names).toEqual(
      [...accountTestMigrations, ...ogFragments].map((f, i) => composedMigrationName(i + 1, f)),
    )
    // 片段只有 up，不带 down（M-8）
    for (const fragment of ogFragments) expect(fragment.migration.down).toBeUndefined()
  })

  it('参数缺或空 ⇒ 立即抛出（装配错误），不静默建一条没有目标的外键', () => {
    expect(() =>
      organizationGovernanceMigrations({
        ownerAccountReference: { table: '', column: 'account_id' },
        ownerAccountForeignKey: OWNER_ACCOUNT_FK,
      }),
    ).toThrow(TypeError)
    expect(() =>
      organizationGovernanceMigrations({
        ownerAccountReference: { table: 'account', column: 'account_id' },
        ownerAccountForeignKey: '',
      }),
    ).toThrow(TypeError)
  })

  it('经 storage-sql 插件（带 migrations 写 upgrade: false）在 sqlite 上跑通，六张表都在', async () => {
    const file = tempSqliteFile('plugin-path')
    const assembly = await bootAssembly({
      plugins: [{ plugin: storageSqlPlugin, config: storageConfig(file) }],
    })
    closers.push(() => assembly.dispose())
    const tables = sqliteMaster(file)
      .filter(r => r.type === 'table')
      .map(r => r.name)
    for (const table of Object.values(OG_TABLES)) expect(tables).toContain(table)
  })

  it('幂等：每个片段的 up 在已建好的库上再跑一遍不报错、不改 schema', async () => {
    const { file, storage } = await freshStorage()
    await storage.read(async () => undefined)
    const before = sqliteMaster(file)
    const db = new Kysely({ dialect: new NodeSqliteDialect({ file, role: 'write' }) })
    try {
      for (const fragment of [...accountTestMigrations, ...ogFragments]) {
        await fragment.migration.up(db)
        await fragment.migration.up(db)
      }
    } finally {
      await db.destroy()
    }
    expect(sqliteMaster(file)).toEqual(before)
  })

  it('不建 CHECK（M-7）；唯一约束是显式命名的 CREATE UNIQUE INDEX（M-2）', async () => {
    const { file } = await freshStorage()
    const master = sqliteMaster(file)
    for (const table of Object.values(OG_TABLES)) {
      const ddl = master.find(r => r.type === 'table' && r.name === table)?.sql ?? ''
      expect(ddl.toLowerCase()).not.toContain('check')
      expect(ddl.toLowerCase()).not.toContain(' unique')
    }
    const index = master.find(
      r => r.type === 'index' && r.name === 'organization_owner_account_unique',
    )
    expect(index?.sql).toMatch(/create unique index/i)
    expect(index?.sql).toMatch(/"owner_account"/)
  })

  it('外键在 organization 的 CREATE TABLE 里按参数声明：显式名、目标、ON DELETE RESTRICT、不延迟', async () => {
    const { file } = await freshStorage()
    const ddl = sqliteMaster(file).find(r => r.type === 'table' && r.name === 'organization')?.sql
    expect(ddl).toMatch(
      new RegExp(
        `constraint "${OWNER_ACCOUNT_FK}" foreign key \\("owner_account"\\) references "${ACCOUNT_TABLE}" \\("account_id"\\) on delete restrict`,
        'i',
      ),
    )
    expect(ddl?.toLowerCase()).not.toContain('deferrable')
  })

  it('约束名可反查：各 *_pkey 与 organization_owner_account_unique 冲突时报出迁移里的名字', async () => {
    const { storage } = await freshStorage()
    const now = 1
    await storage.write(async tx => {
      for (const id of ['a1', 'a2']) {
        await tx.db
          .insertInto(ACCOUNT_TABLE)
          .values({
            account_id: id,
            login_identifier: `l-${id}`,
            credential_material: 'x',
            activated: 1,
            produced_at: now,
            retention_deadline: now,
            expired_at: null,
          })
          .execute()
      }
    })
    const duplicate = async (table: string, row: Record<string, unknown>) => {
      await storage.write(async tx => {
        await tx.db.insertInto(table).values(row).execute()
      })
      try {
        await storage.write(async tx => {
          await tx.db.insertInto(table).values(row).execute()
        })
      } catch (error) {
        return error
      }
      return undefined
    }
    const cases: [string, Record<string, unknown>, string][] = [
      [
        // owner 为空，冲突只落在主键上
        'organization',
        { organization_id: 'o0', kind: 'team', parent: null, owner_account: null, created_at: now },
        'organization_pkey',
      ],
      [
        'organization',
        {
          organization_id: 'o1',
          kind: 'personal',
          parent: null,
          owner_account: 'a1',
          created_at: now,
        },
        // 同一行再插：sqlite 先撞到 owner 唯一索引（两个约束都违反时报哪一个由方言定）
        'organization_owner_account_unique',
      ],
      [
        'membership',
        { organization_id: 'o1', account_id: 'a1', effective: 1, role: 'superAdministrator' },
        'membership_pkey',
      ],
      [
        'invitation',
        {
          invitation_id: 'i1',
          issuer_organization: 'o1',
          invited_account: 'a2',
          role: 'member',
          issued_at: now,
          expires_at: now + 1,
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
          direction: 'recipientAsParent',
          issued_at: now,
          expires_at: now + 1,
          settled: null,
        },
        'affiliation_request_pkey',
      ],
      [
        'current_tenant_selection',
        { login_state_id: 's1', organization_id: 'o1', account_id: 'a1' },
        'current_tenant_selection_pkey',
      ],
      [
        'team_creation_key',
        { creator_account: 'a1', creation_key: 'k1', organization_id: 'o1', registered_at: now },
        'team_creation_key_pkey',
      ],
    ]
    for (const [table, row, constraint] of cases) {
      const error = await duplicate(table, row)
      expect(error, table).toBeInstanceOf(UniqueViolation)
      expect((error as UniqueViolation).constraint, table).toBe(constraint)
    }
    // 个人组织 owner 非空时唯一：另一行指向同一账号 ⇒ 普通唯一索引的名字
    const second = await storage
      .write(async tx => {
        await tx.db
          .insertInto('organization')
          .values({
            organization_id: 'o9',
            kind: 'personal',
            parent: null,
            owner_account: 'a1',
            created_at: now,
          })
          .execute()
      })
      .catch((error: unknown) => error)
    expect(second).toBeInstanceOf(UniqueViolation)
    expect((second as UniqueViolation).constraint).toBe('organization_owner_account_unique')
    // NULL 互不相等：多个团队组织的 owner_account 都是 NULL
    await storage.write(async tx => {
      for (const id of ['t1', 't2']) {
        await tx.db
          .insertInto('organization')
          .values({
            organization_id: id,
            kind: 'team',
            parent: null,
            owner_account: null,
            created_at: now,
          })
          .execute()
      }
    })
  })

  it('外键两向：指向不存在的账号 ⇒ missing-target；删除被引用的账号 ⇒ delete-restricted', async () => {
    const { storage } = await freshStorage()
    const missing = await storage
      .write(async tx => {
        await tx.db
          .insertInto('organization')
          .values({
            organization_id: 'o1',
            kind: 'personal',
            parent: null,
            owner_account: 'ghost',
            created_at: 1,
          })
          .execute()
      })
      .catch((error: unknown) => error)
    expect(missing).toBeInstanceOf(ReferenceViolation)
    expect((missing as ReferenceViolation).kind).toBe('missing-target')

    await storage.write(async tx => {
      await tx.db
        .insertInto(ACCOUNT_TABLE)
        .values({
          account_id: 'a1',
          login_identifier: 'l1',
          credential_material: 'x',
          activated: 0,
          produced_at: 1,
          retention_deadline: 1,
          expired_at: null,
        })
        .execute()
      await tx.db
        .insertInto('organization')
        .values({
          organization_id: 'o1',
          kind: 'personal',
          parent: null,
          owner_account: 'a1',
          created_at: 1,
        })
        .execute()
    })
    const restricted = await storage
      .write(async tx => {
        await tx.db.deleteFrom(ACCOUNT_TABLE).where('account_id', '=', 'a1').execute()
      })
      .catch((error: unknown) => error)
    expect(restricted).toBeInstanceOf(ReferenceViolation)
    expect((restricted as ReferenceViolation).kind).toBe('delete-restricted')
  })

  it('迁移模块不 import account-identity 包（只收两个字符串）', () => {
    const source = readFileSync(new URL('../src/migrations.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1])
    expect(imports).not.toContain('@omne-harness-lite/account-identity')
    expect(imports.every(i => i === 'kysely' || i === '@omne-harness-lite/storage')).toBe(true)
  })
})
