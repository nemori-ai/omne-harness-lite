import { afterEach, expect, it } from 'vitest'
import { bootAssembly, type Assembly } from '@omne-harness-lite/kernel-basis/testing'
import { StorageDefect, StorageUnavailable, type Storage } from '@omne-harness-lite/storage'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { openStorage, type SqlStorage } from '../src/index.ts'
import { SqlStorageService } from '../src/cordis.ts'
import { tempSqliteFile } from './support.ts'

const resources: { assembly: Assembly; raw: SqlStorage }[] = []
afterEach(async () => {
  for (const { assembly, raw } of resources.splice(0).reverse()) {
    await assembly.dispose()
    await raw.close()
  }
})

async function bind(file: string) {
  const raw = await openStorage({ dialect: 'sqlite', file, upgrade: false })
  const assembly = await bootAssembly({
    plugins: [
      {
        plugin: {
          name: 'borrowed-sql-test',
          apply(ctx) {
            new SqlStorageService(ctx, raw)
          },
        },
      },
    ],
  })
  resources.push({ assembly, raw })
  const one = assembly.ctx.get(STORAGE_SERVICE) as SqlStorageService
  const two = assembly.ctx.extend().get(STORAGE_SERVICE) as SqlStorageService
  return { raw, assembly, one, two }
}

it('raw and caller Services share the same commit, but another instance of the file is rejected', async () => {
  const file = tempSqliteFile('service-identity')
  const { raw, one, two } = await bind(file)
  const other = await bind(file)
  expect(one).not.toBe(two)
  let notices = 0
  await raw.write(tx => tx.db.schema.createTable('items').addColumn('id', 'integer').execute())
  for (const owner of [raw, one]) {
    await owner.atomic(async unit => {
      for (const face of [raw, one, two]) {
        unit.assertStorage(face)
        await unit.run(() =>
          unit.mutate(tx => tx.db.insertInto('items').values({ id: 1 }).execute()),
        )
      }
      unit.afterCommit(() => {
        notices++
      })
    })
  }
  expect(notices).toBe(2)
  for (const foreign of [other.raw, other.one]) {
    await expect(
      raw.atomic(async unit => {
        await unit.mutate(tx => tx.db.insertInto('items').values({ id: 2 }).execute())
        unit.afterCommit(() => {
          notices++
        })
        try {
          unit.assertStorage(foreign)
        } catch {
          /* A caught mismatch still poisons the unit. */
        }
      }),
    ).rejects.toThrow('storage unit belongs to a different instance')
  }
  expect(await raw.read(tx => tx.db.selectFrom('items').selectAll().execute())).toHaveLength(6)
  expect(notices).toBe(2)
})

it('identity is immutable and unreadable identity poisons through the original mismatch branch', async () => {
  const { raw, one } = await bind(tempSqliteFile('service-marker'))
  const marker = Object.getOwnPropertySymbols(one).find(
    key => Object.getOwnPropertyDescriptor(one, key)?.value === raw,
  )
  if (marker === undefined) throw new Error('missing instance projection')
  expect(Symbol.keyFor(marker)).toBeUndefined()
  expect(Object.getOwnPropertyDescriptor(one, marker)).toMatchObject({
    writable: false,
    configurable: false,
  })
  expect(Reflect.set(one, marker, {})).toBe(false)
  expect(Reflect.defineProperty(one, marker, { value: {} })).toBe(false)
  let reads = 0
  const unreadable = new Proxy(one, {
    get(target, key, receiver) {
      if (key === marker) {
        reads++
        throw new Error('unreadable')
      }
      return Reflect.get(target, key, receiver)
    },
  })
  let notices = 0
  await expect(
    raw.atomic(async unit => {
      unit.afterCommit(() => {
        notices++
      })
      try {
        unit.assertStorage(unreadable)
      } catch (error) {
        expect(error).toBeInstanceOf(StorageDefect)
      }
    }),
  ).rejects.toThrow('storage unit belongs to a different instance')
  expect(reads).toBe(1)
  expect(notices).toBe(0)
  const first = new Error('first failure')
  await expect(
    raw.atomic(async unit => {
      try {
        await unit.run(() => Promise.reject(first))
      } catch {
        /* Check precedence below. */
      }
      expect(() => unit.assertStorage(unreadable)).toThrow(first)
    }),
  ).rejects.toBe(first)
  expect(reads).toBe(1)
  await raw.atomic(async unit => {
    unit.assertStorage(one)
  })
})

it('borrowed publication does not close its backend and an old generation cannot join a new one', async () => {
  const file = tempSqliteFile('service-generation')
  const old = await bind(file)
  await old.assembly.dispose()
  expect(old.assembly.ctx.get(STORAGE_SERVICE)).toBeUndefined()
  const result = {}
  expect(await old.one.read(async () => result)).toBe(result)
  const next = await bind(file)
  await expect(
    next.raw.atomic(async unit => {
      unit.assertStorage(old.one as Storage)
    }),
  ).rejects.toBeInstanceOf(StorageDefect)
  await old.raw.close()
  await expect(old.one.read(async () => result)).rejects.toBeInstanceOf(StorageUnavailable)
  expect(await next.one.read(async () => result)).toBe(result)
})
