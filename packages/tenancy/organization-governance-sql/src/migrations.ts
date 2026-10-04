// 本包六张表的迁移片段（共用接口 I-4）。列名与显式约束名按 tenancy-host design「迁移清单」，
// 逻辑名按本节点 design「持久记录（存储布局候选）」。跨 owner 的那条外键目标与名字由装配经参数给出：
// 本模块**不 import account-identity 包**，只收两个字符串。
// 纪律（tenancy-host M-1～M-9）：幂等（ifNotExists）、唯一约束用 CREATE UNIQUE INDEX 显式命名、主键名恒为 <table>_pkey、
// 外键 ON DELETE RESTRICT 不延迟、不建 CHECK、不带 down、片段名只追加不重排。
import type { Kysely } from 'kysely'
import type { MigrationFragment } from '@omne-harness-lite/storage'

export interface OrganizationGovernanceMigrationOptions {
  /** `organization.owner_account` 引用的账号表与列（装配给出，候选 `{ table: 'account', column: 'account_id' }`）。 */
  readonly ownerAccountReference: { readonly table: string; readonly column: string }
  /** 那条外键的显式名字（装配给出，候选 `organization_owner_account_fk`）。 */
  readonly ownerAccountForeignKey: string
}

/** 表名常量：迁移与查询共用一处。 */
export const OG_TABLES = {
  organization: 'organization',
  membership: 'membership',
  invitation: 'invitation',
  affiliationRequest: 'affiliation_request',
  currentTenantSelection: 'current_tenant_selection',
  teamCreationKey: 'team_creation_key',
} as const

function requireName(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`organizationGovernanceMigrations: ${what} must be a non-empty string`)
  }
  return value
}

/**
 * 六张表的迁移片段，次序即依赖序（本包内没有表之间的外键）。片段名 = 表名：表名在同一 schema 里全局唯一，
 * 合成时因此不会与别的 owner 撞名。名字发布后不改、不重排，新片段只追加在末尾。
 * 装配须把 account-identity 的片段排在本数组之前（外键目标要先存在）。
 */
export function organizationGovernanceMigrations(
  options: OrganizationGovernanceMigrationOptions,
): readonly MigrationFragment[] {
  const targetTable = requireName(
    options.ownerAccountReference.table,
    'ownerAccountReference.table',
  )
  const targetColumn = requireName(
    options.ownerAccountReference.column,
    'ownerAccountReference.column',
  )
  const foreignKey = requireName(options.ownerAccountForeignKey, 'ownerAccountForeignKey')

  return [
    {
      name: OG_TABLES.organization,
      migration: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async up(db: Kysely<any>) {
          await db.schema
            .createTable(OG_TABLES.organization)
            .ifNotExists()
            .addColumn('organization_id', 'text', c => c.notNull())
            .addColumn('kind', 'text', c => c.notNull())
            .addColumn('parent', 'text')
            .addColumn('owner_account', 'text')
            .addColumn('created_at', 'bigint', c => c.notNull())
            .addPrimaryKeyConstraint('organization_pkey', ['organization_id'])
            // R-6：删除受限、不延迟（M-4）；目标与名字由装配给出
            .addForeignKeyConstraint(
              foreignKey,
              ['owner_account'],
              targetTable,
              [targetColumn],
              fk => fk.onDelete('restrict'),
            )
            .execute()
          // 普通唯一索引即「非空时唯一」：两方言的 NULL 互不相等（OG R-2）
          await db.schema
            .createIndex('organization_owner_account_unique')
            .ifNotExists()
            .unique()
            .on(OG_TABLES.organization)
            .column('owner_account')
            .execute()
        },
      },
    },
    {
      name: OG_TABLES.membership,
      migration: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async up(db: Kysely<any>) {
          await db.schema
            .createTable(OG_TABLES.membership)
            .ifNotExists()
            .addColumn('organization_id', 'text', c => c.notNull())
            .addColumn('account_id', 'text', c => c.notNull())
            // 0/1：node:sqlite 绑不了布尔参数，两方言都用整数列
            .addColumn('effective', 'integer', c => c.notNull())
            .addColumn('role', 'text', c => c.notNull())
            // 复合主键就是 TenantId，不拼标量键
            .addPrimaryKeyConstraint('membership_pkey', ['organization_id', 'account_id'])
            .execute()
        },
      },
    },
    {
      name: OG_TABLES.invitation,
      migration: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async up(db: Kysely<any>) {
          await db.schema
            .createTable(OG_TABLES.invitation)
            .ifNotExists()
            .addColumn('invitation_id', 'text', c => c.notNull())
            .addColumn('issuer_organization', 'text', c => c.notNull())
            .addColumn('invited_account', 'text', c => c.notNull())
            .addColumn('role', 'text', c => c.notNull())
            .addColumn('issued_at', 'bigint', c => c.notNull())
            .addColumn('expires_at', 'bigint', c => c.notNull())
            // 只存终结记录（accepted／withdrawn）；expired 是读时派生，不可写（OE S-7）
            .addColumn('settled', 'text')
            .addPrimaryKeyConstraint('invitation_pkey', ['invitation_id'])
            .execute()
        },
      },
    },
    {
      name: OG_TABLES.affiliationRequest,
      migration: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async up(db: Kysely<any>) {
          await db.schema
            .createTable(OG_TABLES.affiliationRequest)
            .ifNotExists()
            .addColumn('affiliation_request_id', 'text', c => c.notNull())
            .addColumn('initiator', 'text', c => c.notNull())
            .addColumn('recipient', 'text', c => c.notNull())
            .addColumn('direction', 'text', c => c.notNull())
            .addColumn('issued_at', 'bigint', c => c.notNull())
            .addColumn('expires_at', 'bigint', c => c.notNull())
            .addColumn('settled', 'text')
            .addPrimaryKeyConstraint('affiliation_request_pkey', ['affiliation_request_id'])
            .execute()
        },
      },
    },
    {
      name: OG_TABLES.currentTenantSelection,
      migration: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async up(db: Kysely<any>) {
          await db.schema
            .createTable(OG_TABLES.currentTenantSelection)
            .ifNotExists()
            .addColumn('login_state_id', 'text', c => c.notNull())
            .addColumn('organization_id', 'text', c => c.notNull())
            .addColumn('account_id', 'text', c => c.notNull())
            .addPrimaryKeyConstraint('current_tenant_selection_pkey', ['login_state_id'])
            .execute()
        },
      },
    },
    {
      name: OG_TABLES.teamCreationKey,
      migration: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async up(db: Kysely<any>) {
          await db.schema
            .createTable(OG_TABLES.teamCreationKey)
            .ifNotExists()
            .addColumn('creator_account', 'text', c => c.notNull())
            .addColumn('creation_key', 'text', c => c.notNull())
            .addColumn('organization_id', 'text', c => c.notNull())
            .addColumn('registered_at', 'bigint', c => c.notNull())
            .addPrimaryKeyConstraint('team_creation_key_pkey', ['creator_account', 'creation_key'])
            .execute()
        },
      },
    },
  ]
}
