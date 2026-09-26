// 一致性套件：任何 Storage 提供者都必须通过。用例编号 C-n 对应节点 design.md「要求到协议，再到会红的测试」表。
// factory 每次返回一个新实例，指向同一个底层库；套件最多同时持有三个实例。无 in-memory 夹具（D-026）。
import { sql, type Kysely } from 'kysely'
import type * as Vitest from 'vitest'

type ConformanceRunner = Pick<
  typeof Vitest,
  'afterAll' | 'beforeAll' | 'describe' | 'expect' | 'it'
>
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
} from '../errors.ts'
import type { StorageInstance } from '../protocol.ts'

export interface ConformanceTables {
  conformance_account: { id: string; name: string }
  conformance_counter: { id: string; value: number }
  conformance_parent: { id: string }
  conformance_child: { id: string; parent_id: string }
  conformance_checked: { id: string; n: number }
}

export const CONFORMANCE_UNIQUE_CONSTRAINT = 'conformance_account_name_unique'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

class CallerError extends Error {
  override readonly name = 'CallerError'
}

export function describeStorageConformance(
  name: string,
  factory: () => Promise<StorageInstance>,
  runner: ConformanceRunner,
): void {
  const { afterAll, beforeAll, describe, expect, it } = runner
  describe(`storage conformance · ${name}`, () => {
    let s0: StorageInstance
    let s1: StorageInstance
    const db = (tx: { db: Kysely<unknown> }) => tx.db as Kysely<ConformanceTables>

    beforeAll(async () => {
      s0 = await factory()
      s1 = await factory()
      await s0.write(async tx => {
        const d = db(tx)
        await d.schema
          .createTable('conformance_account')
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .addColumn('name', 'text', c => c.notNull())
          .execute()
        await d.schema
          .createIndex(CONFORMANCE_UNIQUE_CONSTRAINT)
          .ifNotExists()
          .on('conformance_account')
          .column('name')
          .unique()
          .execute()
        await d.schema
          .createTable('conformance_counter')
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .addColumn('value', 'integer', c => c.notNull())
          .execute()
        await d.schema
          .createTable('conformance_parent')
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .execute()
        await d.schema
          .createTable('conformance_child')
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .addColumn('parent_id', 'text', c => c.notNull())
          .addForeignKeyConstraint(
            'conformance_child_parent_fk',
            ['parent_id'],
            'conformance_parent',
            ['id'],
            cb => cb.onDelete('restrict'),
          )
          .execute()
        await d.schema
          .createTable('conformance_checked')
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .addColumn('n', 'integer', c => c.notNull().check(sql`n > 0`))
          .execute()
        await d.deleteFrom('conformance_child').execute()
        await d.deleteFrom('conformance_parent').execute()
        await d.deleteFrom('conformance_account').execute()
        await d.deleteFrom('conformance_counter').execute()
        await d.deleteFrom('conformance_checked').execute()
        await d.insertInto('conformance_counter').values({ id: 'c', value: 0 }).execute()
      })
    })

    afterAll(async () => {
      await s0.write(async tx => {
        const d = db(tx)
        await d.schema.dropTable('conformance_child').ifExists().execute()
        await d.schema.dropTable('conformance_parent').ifExists().execute()
        await d.schema.dropTable('conformance_checked').ifExists().execute()
        await d.schema.dropTable('conformance_counter').ifExists().execute()
        await d.schema.dropTable('conformance_account').ifExists().execute()
      })
      await s0.close()
      await s1.close()
    })

    it('C-1a/C-1b 单次提交原子：fn 抛出 ⇒ 全部回滚，且异常同一实例到达', async () => {
      const thrown = new CallerError('caller failed')
      await expect(
        s0.write(async tx => {
          await db(tx)
            .insertInto('conformance_account')
            .values({ id: 'a1', name: 'atomic-1' })
            .execute()
          await db(tx).insertInto('conformance_parent').values({ id: 'p-atomic' }).execute()
          throw thrown
        }),
      ).rejects.toBe(thrown)
      await s0.read(async tx => {
        expect(
          await db(tx)
            .selectFrom('conformance_account')
            .selectAll()
            .where('id', '=', 'a1')
            .execute(),
        ).toEqual([])
        expect(
          await db(tx)
            .selectFrom('conformance_parent')
            .selectAll()
            .where('id', '=', 'p-atomic')
            .execute(),
        ).toEqual([])
      })
    })

    it('C-1c 正常返回 ⇒ 提交，返回值透传', async () => {
      const value = await s0.write(async tx => {
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'a2', name: 'committed' })
          .execute()
        return { done: true as const }
      })
      expect(value).toEqual({ done: true })
      await s0.read(async tx => {
        expect(
          await db(tx)
            .selectFrom('conformance_account')
            .select('name')
            .where('id', '=', 'a2')
            .executeTakeFirst(),
        ).toEqual({ name: 'committed' })
      })
    })

    it('C-2 唯一冲突 ⇒ UniqueViolation 且 constraint 是迁移里的名字', async () => {
      await s0.write(async tx => {
        await db(tx).insertInto('conformance_account').values({ id: 'u1', name: 'dup' }).execute()
      })
      const error = await s0.write(async tx => {
        try {
          await db(tx).insertInto('conformance_account').values({ id: 'u2', name: 'dup' }).execute()
          return undefined
        } catch (e) {
          return e
        }
      })
      expect(error).toBeInstanceOf(UniqueViolation)
      expect((error as UniqueViolation).constraint).toBe(CONFORMANCE_UNIQUE_CONSTRAINT)
    })

    it('C-2b 主键冲突 ⇒ UniqueViolation 且 constraint 为 <table>_pkey（两方言同一字符串）', async () => {
      const error = await s0.write(async tx => {
        try {
          await db(tx)
            .insertInto('conformance_account')
            .values({ id: 'u1', name: 'pk-dup' })
            .execute()
          return undefined
        } catch (e) {
          return e
        }
      })
      expect(error).toBeInstanceOf(UniqueViolation)
      expect((error as UniqueViolation).constraint).toBe('conformance_account_pkey')
    })

    it('C-3 语句级失败不废事务：撞唯一冲突后同一 tx 重读、再写、提交成功', async () => {
      const existing = await s0.write(async tx => {
        let caught: unknown
        try {
          await db(tx).insertInto('conformance_account').values({ id: 'u3', name: 'dup' }).execute()
        } catch (e) {
          caught = e
        }
        expect(caught).toBeInstanceOf(UniqueViolation)
        const row = await db(tx)
          .selectFrom('conformance_account')
          .select('id')
          .where('name', '=', 'dup')
          .executeTakeFirst()
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'u4', name: 'after-conflict' })
          .execute()
        return row
      })
      expect(existing).toEqual({ id: 'u1' })
      await s0.read(async tx => {
        expect(
          await db(tx)
            .selectFrom('conformance_account')
            .select('id')
            .where('id', '=', 'u4')
            .executeTakeFirst(),
        ).toEqual({ id: 'u4' })
      })
    })

    it('C-4 lockRow：两个实例并发读-让出-写，终值 = 初值 + 2，无一方 StorageUnavailable', async () => {
      const bump = (s: StorageInstance) =>
        s.write(async tx => {
          await tx.lockRow('conformance_counter', { id: 'c' })
          const row = await db(tx)
            .selectFrom('conformance_counter')
            .select('value')
            .where('id', '=', 'c')
            .executeTakeFirstOrThrow()
          await sleep(20)
          await db(tx)
            .updateTable('conformance_counter')
            .set({ value: row.value + 1 })
            .where('id', '=', 'c')
            .execute()
        })
      const before = await s0.read(
        async tx =>
          (
            await db(tx)
              .selectFrom('conformance_counter')
              .select('value')
              .where('id', '=', 'c')
              .executeTakeFirstOrThrow()
          ).value,
      )
      await Promise.all([bump(s0), bump(s1)])
      const after = await s0.read(
        async tx =>
          (
            await db(tx)
              .selectFrom('conformance_counter')
              .select('value')
              .where('id', '=', 'c')
              .executeTakeFirstOrThrow()
          ).value,
      )
      expect(after).toBe(before + 2)
    })

    it('C-5 lockSentinel：同名哨兵下两个实例并发不丢失更新', async () => {
      const bump = (s: StorageInstance) =>
        s.write(async tx => {
          await tx.lockSentinel('conformance-affiliation')
          const row = await db(tx)
            .selectFrom('conformance_counter')
            .select('value')
            .where('id', '=', 'c')
            .executeTakeFirstOrThrow()
          await sleep(20)
          await db(tx)
            .updateTable('conformance_counter')
            .set({ value: row.value + 1 })
            .where('id', '=', 'c')
            .execute()
        })
      const before = await s0.read(
        async tx =>
          (
            await db(tx)
              .selectFrom('conformance_counter')
              .select('value')
              .where('id', '=', 'c')
              .executeTakeFirstOrThrow()
          ).value,
      )
      await Promise.all([bump(s0), bump(s1)])
      const after = await s0.read(
        async tx =>
          (
            await db(tx)
              .selectFrom('conformance_counter')
              .select('value')
              .where('id', '=', 'c')
              .executeTakeFirstOrThrow()
          ).value,
      )
      expect(after).toBe(before + 2)
    })

    it('C-6a/C-6b 提交内读写同源：后开事务读到前一提交；同一写事务读到自己的写', async () => {
      await s0.write(async tx => {
        await db(tx)
          .updateTable('conformance_counter')
          .set({ value: 100 })
          .where('id', '=', 'c')
          .execute()
      })
      await s1.write(async tx => {
        const seen = await db(tx)
          .selectFrom('conformance_counter')
          .select('value')
          .where('id', '=', 'c')
          .executeTakeFirstOrThrow()
        expect(seen.value).toBe(100)
        await db(tx)
          .updateTable('conformance_counter')
          .set({ value: 101 })
          .where('id', '=', 'c')
          .execute()
        const own = await db(tx)
          .selectFrom('conformance_counter')
          .select('value')
          .where('id', '=', 'c')
          .executeTakeFirstOrThrow()
        expect(own.value).toBe(101)
      })
    })

    it('C-7 只读事务快照一致：期间另一实例提交的写不可见，结束后可见', async () => {
      await s0.write(async tx => {
        await db(tx)
          .updateTable('conformance_counter')
          .set({ value: 7 })
          .where('id', '=', 'c')
          .execute()
      })
      await s0.read(async tx => {
        const first = await db(tx)
          .selectFrom('conformance_counter')
          .select('value')
          .where('id', '=', 'c')
          .executeTakeFirstOrThrow()
        expect(first.value).toBe(7)
        await s1.write(async w => {
          await db(w)
            .updateTable('conformance_counter')
            .set({ value: 8 })
            .where('id', '=', 'c')
            .execute()
        })
        const again = await db(tx)
          .selectFrom('conformance_counter')
          .select('value')
          .where('id', '=', 'c')
          .executeTakeFirstOrThrow()
        expect(again.value).toBe(7)
      })
      await s0.read(async tx => {
        expect(
          (
            await db(tx)
              .selectFrom('conformance_counter')
              .select('value')
              .where('id', '=', 'c')
              .executeTakeFirstOrThrow()
          ).value,
        ).toBe(8)
      })
    })

    it('C-7b 只读事务里写 ⇒ StorageDefect，且库中无变化', async () => {
      await expect(
        s0.read(async tx => {
          await db(tx)
            .insertInto('conformance_account')
            .values({ id: 'ro', name: 'read-only-write' })
            .execute()
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
      await s0.read(async tx => {
        expect(
          await db(tx)
            .selectFrom('conformance_account')
            .selectAll()
            .where('id', '=', 'ro')
            .execute(),
        ).toEqual([])
      })
    })

    it('C-8 持久：写入 → 关闭句柄 → 新实例读到', async () => {
      const s2 = await factory()
      await s2.write(async tx => {
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'durable', name: 'durable' })
          .execute()
      })
      await s2.close()
      const s3 = await factory()
      try {
        await s3.read(async tx => {
          expect(
            await db(tx)
              .selectFrom('conformance_account')
              .select('id')
              .where('id', '=', 'durable')
              .executeTakeFirst(),
          ).toEqual({ id: 'durable' })
        })
      } finally {
        await s3.close()
      }
    })

    it('C-9a 关闭后 read/write ⇒ StorageUnavailable', async () => {
      const s2 = await factory()
      await s2.close()
      await expect(s2.read(async () => 1)).rejects.toBeInstanceOf(StorageUnavailable)
      await expect(s2.write(async () => 1)).rejects.toBeInstanceOf(StorageUnavailable)
    })

    it('C-9b 在途写事务期间从另一异步任务 close：要么完整提交、要么 StorageUnavailable，绝无部分提交；之后不再受理', async () => {
      const s2 = await factory()
      const inflight = s2.write(async tx => {
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'inflight-1', name: 'inflight-1' })
          .execute()
        await sleep(30)
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'inflight-2', name: 'inflight-2' })
          .execute()
        return 'committed' as const
      })
      await sleep(5)
      const closing = s2.close()
      const outcome = await inflight.then(
        value => ({ value }),
        (error: unknown) => ({ error }),
      )
      await closing
      const rows = await s0.read(async tx =>
        db(tx)
          .selectFrom('conformance_account')
          .select('id')
          .where('id', 'in', ['inflight-1', 'inflight-2'])
          .execute(),
      )
      if ('value' in outcome) {
        expect(outcome.value).toBe('committed')
        expect(rows).toHaveLength(2)
      } else {
        expect(outcome.error).toBeInstanceOf(StorageUnavailable)
        expect(rows).toHaveLength(0)
      }
      await expect(s2.write(async () => 1)).rejects.toBeInstanceOf(StorageUnavailable)
    })

    it('C-10 删除即释放：删后下一个事务可插同值', async () => {
      await s0.write(async tx => {
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'r1', name: 'released' })
          .execute()
      })
      await s0.write(async tx => {
        await db(tx).deleteFrom('conformance_account').where('id', '=', 'r1').execute()
      })
      await s0.write(async tx => {
        await db(tx)
          .insertInto('conformance_account')
          .values({ id: 'r2', name: 'released' })
          .execute()
      })
    })

    it('C-11 删除被引用的父行 ⇒ ReferenceViolation delete-restricted，父行仍在', async () => {
      await s0.write(async tx => {
        await db(tx).insertInto('conformance_parent').values({ id: 'p1' }).execute()
        await db(tx)
          .insertInto('conformance_child')
          .values({ id: 'ch1', parent_id: 'p1' })
          .execute()
      })
      const error = await s0.write(async tx => {
        try {
          await db(tx).deleteFrom('conformance_parent').where('id', '=', 'p1').execute()
          return undefined
        } catch (e) {
          return e
        }
      })
      expect(error).toBeInstanceOf(ReferenceViolation)
      expect((error as ReferenceViolation).kind).toBe('delete-restricted')
      await s0.read(async tx => {
        expect(
          await db(tx)
            .selectFrom('conformance_parent')
            .select('id')
            .where('id', '=', 'p1')
            .executeTakeFirst(),
        ).toEqual({ id: 'p1' })
      })
    })

    it('C-12 插入指向不存在目标 ⇒ ReferenceViolation missing-target', async () => {
      const error = await s0.write(async tx => {
        try {
          await db(tx)
            .insertInto('conformance_child')
            .values({ id: 'ch2', parent_id: 'nope' })
            .execute()
          return undefined
        } catch (e) {
          return e
        }
      })
      expect(error).toBeInstanceOf(ReferenceViolation)
      expect((error as ReferenceViolation).kind).toBe('missing-target')
    })

    it('C-13 两个并发创建者：恰一行落库、两事务都提交；后到者要么读到对方的行、要么撞冲突后在同一 tx 重读到它', async () => {
      const create = (s: StorageInstance) =>
        s.write(async tx => {
          await tx.lockRow('conformance_account', { name: 'racer' })
          const seen = await db(tx)
            .selectFrom('conformance_account')
            .select('id')
            .where('name', '=', 'racer')
            .executeTakeFirst()
          if (seen) return { path: 'read-existing' as const, id: seen.id }
          await sleep(10)
          try {
            await db(tx)
              .insertInto('conformance_account')
              .values({ id: `racer-${Math.random()}`, name: 'racer' })
              .execute()
            return { path: 'inserted' as const }
          } catch (e) {
            expect(e).toBeInstanceOf(UniqueViolation)
            const reread = await db(tx)
              .selectFrom('conformance_account')
              .select('id')
              .where('name', '=', 'racer')
              .executeTakeFirstOrThrow()
            return { path: 'conflict-reread' as const, id: reread.id }
          }
        })
      const results = await Promise.all([create(s0), create(s1)])
      expect(results.filter(r => r.path === 'inserted')).toHaveLength(1)
      const rows = await s0.read(async tx =>
        db(tx).selectFrom('conformance_account').select('id').where('name', '=', 'racer').execute(),
      )
      expect(rows).toHaveLength(1)
    })

    it('C-15 嵌套调用 ⇒ StorageDefect：写事务里再 write/read 都被拒，外层事务不受影响', async () => {
      await expect(
        s0.write(async () => {
          await s0.write(async () => 1)
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
      await expect(
        s0.write(async () => {
          await s0.read(async () => 1)
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
      await expect(
        s0.read(async () => {
          await s0.read(async () => 1)
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
    })

    it('C-14 缺陷不折成不可用：非法语句与 CHECK 违反 ⇒ StorageDefect 且带 cause', async () => {
      const syntax = await s0.write(async tx => {
        try {
          await sql`SELEC nonsense FROM nowhere`.execute(tx.db)
          return undefined
        } catch (e) {
          return e
        }
      })
      expect(syntax).toBeInstanceOf(StorageDefect)
      expect((syntax as StorageDefect).cause).toBeDefined()
      const check = await s0.write(async tx => {
        try {
          await db(tx).insertInto('conformance_checked').values({ id: 'k', n: 0 }).execute()
          return undefined
        } catch (e) {
          return e
        }
      })
      expect(check).toBeInstanceOf(StorageDefect)
    })
  })
}

export { describeAtomicStorageConformance } from './atomic.ts'
