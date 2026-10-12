import { describe, expectTypeOf, it } from 'vitest'
import type { ReferenceViolationKind, Storage, WriteTx } from '../src/index.ts'

describe('storage 协议类型', () => {
  it('引用违反恰两向', () => {
    expectTypeOf<ReferenceViolationKind>().toEqualTypeOf<'delete-restricted' | 'missing-target'>()
  })
  it('协议面恰 read/write；WriteTx 多 lockRow/lockSentinel', () => {
    expectTypeOf<keyof Storage>().toEqualTypeOf<'read' | 'write'>()
    expectTypeOf<keyof WriteTx>().toEqualTypeOf<'db' | 'lockRow' | 'lockSentinel'>()
  })
})

// 共用接口 I-1／I-2（阶段 2 施工计划 §二）：owner 片段与只读核对的形状。
import type { Migration } from 'kysely/migration'
import type { MigrationFragment, PreflightCheck, PreflightResult } from '../src/index.ts'

describe('MigrationFragment 与 PreflightCheck 的形状', () => {
  it('片段只带稳定名字与 kysely Migration', () => {
    const m: Migration = { async up() {} }
    const f: MigrationFragment = { name: 'account', migration: m }
    expectTypeOf(f.name).toEqualTypeOf<string>()
    // @ts-expect-error 片段没有别的成员
    const g: MigrationFragment = { name: 'x', migration: m, down: 1 }
    void g
  })
  it('核对只读同一事务里读好的表清单与迁移登记，结果是 ok 或具名不过', () => {
    const check: PreflightCheck = async ({ tx, tables, appliedMigrations }) => {
      expectTypeOf(tx.db).not.toBeAny()
      expectTypeOf(tables).toEqualTypeOf<ReadonlySet<string>>()
      expectTypeOf(appliedMigrations).toEqualTypeOf<readonly string[]>()
      return { ok: false, check: 'data-format', detail: '登记了本版本不认识的迁移' }
    }
    expectTypeOf(check).returns.resolves.toEqualTypeOf<PreflightResult>()
    // @ts-expect-error 不过时必须具名
    const bad: PreflightResult = { ok: false }
    void bad
  })
})
