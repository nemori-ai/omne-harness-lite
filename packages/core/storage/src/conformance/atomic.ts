import type * as Vitest from 'vitest'

type ConformanceRunner = Pick<
  typeof Vitest,
  'afterAll' | 'beforeAll' | 'beforeEach' | 'describe' | 'expect' | 'it'
>
import { StorageDefect, UniqueViolation } from '../errors.ts'
import type { AtomicStorage, StorageInstance, StorageUnit } from '../protocol.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

/** P-13 的独立符合性；不要求旧 Storage 消费者具备此扩展。 */
export function describeAtomicStorageConformance(
  name: string,
  factory: () => Promise<AtomicStorage & StorageInstance>,
  runner: ConformanceRunner,
): void {
  const { afterAll, beforeAll, beforeEach, describe, expect, it } = runner
  describe(`atomic storage conformance · ${name}`, () => {
    let storage: AtomicStorage & StorageInstance
    let other: AtomicStorage & StorageInstance
    const insert = (unit: StorageUnit, id: string) =>
      unit.mutate(tx => tx.db.insertInto('atomic_probe').values({ id }).execute())
    const rows = () =>
      storage.read(tx => tx.db.selectFrom('atomic_probe').selectAll().orderBy('id').execute())

    beforeAll(async () => {
      storage = await factory()
      other = await factory()
      await storage.write(tx =>
        tx.db.schema
          .createTable('atomic_probe')
          .ifNotExists()
          .addColumn('id', 'text', c => c.primaryKey())
          .execute(),
      )
    })
    beforeEach(async () => {
      await storage.write(tx => tx.db.deleteFrom('atomic_probe').execute())
    })
    afterAll(async () => {
      await other?.close()
      await storage?.close()
    })

    it('P13-1: nested sequential participants share staged values and one durable commit', async () => {
      const result = await storage.atomic(async unit => {
        unit.assertStorage(storage)
        await unit.run(async () => {
          await insert(unit, 'a')
          await unit.run(async () => {
            await insert(unit, 'b')
          })
        })
        return unit.query(tx =>
          tx.db.selectFrom('atomic_probe').selectAll().orderBy('id').execute(),
        )
      })
      expect(result).toEqual([{ id: 'a' }, { id: 'b' }])
      const reopened = await factory()
      try {
        expect(
          await reopened.read(tx =>
            tx.db.selectFrom('atomic_probe').selectAll().orderBy('id').execute(),
          ),
        ).toEqual(result)
      } finally {
        await reopened.close()
      }
    })

    it.each([new Error('participant failure'), undefined, null, false])(
      'P13-2: caught run failure still aborts, including %s',
      async failure => {
        const result = storage.atomic(async unit => {
          try {
            await unit.run(async () => {
              await insert(unit, 'a')
              throw failure
            })
          } catch {
            /* 祖先不能解除污染。 */
          }
        })
        await expect(result).rejects.toBe(failure)
        expect(await rows()).toEqual([])
      },
    )

    it('P13-3: P-2 conflict handled inside run allows continuation', async () => {
      await storage.atomic(unit =>
        unit.run(async () => {
          await insert(unit, 'a')
          await expect(insert(unit, 'a')).rejects.toBeInstanceOf(UniqueViolation)
          await insert(unit, 'b')
        }),
      )
      expect(await rows()).toEqual([{ id: 'a' }, { id: 'b' }])
    })

    it('P13-4: a conflict escaping run cannot be recovered by the parent', async () => {
      await expect(
        storage.atomic(async unit => {
          try {
            await unit.run(async () => {
              await insert(unit, 'a')
              await insert(unit, 'a')
            })
          } catch {
            /* 单元仍须回滚。 */
          }
        }),
      ).rejects.toBeInstanceOf(UniqueViolation)
      expect(await rows()).toEqual([])
    })

    it('P13-5: wrong instance poisons the unit even when caught', async () => {
      await expect(
        storage.atomic(async unit => {
          await insert(unit, 'a')
          try {
            unit.assertStorage(other)
          } catch {
            /* 不得提交。 */
          }
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
      expect(await rows()).toEqual([])
    })

    it('P13-6: closed unit rejects later calls without undoing the commit', async () => {
      let saved!: StorageUnit
      await storage.atomic(async unit => {
        saved = unit
        await insert(unit, 'a')
      })
      expect(() => saved.run(async () => {})).toThrow(StorageDefect)
      expect(() => saved.afterCommit(() => {})).toThrow(StorageDefect)
      expect(await rows()).toEqual([{ id: 'a' }])
    })

    it('P13-7: overlapping participants reject and roll back', async () => {
      await expect(
        storage.atomic(async unit => {
          const gate = deferred()
          const started = deferred()
          const first = unit.run(async () => {
            await insert(unit, 'a')
            started.resolve()
            await gate.promise
          })
          await started.promise
          try {
            unit.run(async () => {
              await insert(unit, 'b')
            })
          } catch {
            /* 仍需回滚。 */
          }
          gate.resolve()
          await first
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
      expect(await rows()).toEqual([])
    })

    it('P13-8: callback exit waits for admitted work to stop before rollback', async () => {
      const started = deferred()
      const release = deferred()
      const returned = deferred()
      let stopped = false
      let settled = false
      const operation = storage.atomic(async unit => {
        void unit.run(async () => {
          await insert(unit, 'a')
          started.resolve()
          await release.promise
          stopped = true
        })
        await started.promise
        returned.resolve()
      })
      const observed = operation.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )
      await returned.promise
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(settled).toBe(false)
      release.resolve()
      await expect(operation).rejects.toBeInstanceOf(StorageDefect)
      await observed
      expect(stopped).toBe(true)
      expect(await rows()).toEqual([])
    })

    it('P13-9: observed unawaited failure cannot become a commit', async () => {
      const failure = new Error('unawaited participant')
      await expect(
        storage.atomic(async unit => {
          void unit.run(async () => {
            await insert(unit, 'a')
            throw failure
          })
          await new Promise<void>(resolve => setImmediate(resolve))
        }),
      ).rejects.toBe(failure)
      expect(await rows()).toEqual([])
    })

    it('P13-10: notifications run after commit outside the transaction context', async () => {
      let readback: ReturnType<typeof rows> | undefined
      await storage.atomic(async unit => {
        await insert(unit, 'a')
        unit.afterCommit(() => {
          readback = rows()
          void readback.catch(() => undefined)
        })
        expect(readback).toBeUndefined()
      })
      expect(readback).toBeDefined()
      expect(await readback).toEqual([{ id: 'a' }])
      let notified = false
      await expect(
        storage.atomic(async unit => {
          unit.afterCommit(() => {
            notified = true
          })
          await insert(unit, 'b')
          throw new Error('abort')
        }),
      ).rejects.toThrow('abort')
      expect(notified).toBe(false)
      expect(await rows()).toEqual([{ id: 'a' }])
    })

    it('P13-11: ordinary storage calls are not implicitly joined', async () => {
      await expect(
        storage.atomic(async unit => {
          await insert(unit, 'a')
          await storage.read(async () => undefined)
        }),
      ).rejects.toBeInstanceOf(StorageDefect)
      expect(await rows()).toEqual([])
    })
  })
}
