import { sessionTenancyTablePlugin } from '../src/cordis.ts'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  composeMigrations,
  narrow,
  StorageDefect,
  StorageUnavailable,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { createSessionTenancyReader, sessionTenancyMigrations } from '../src/index.ts'
import { type SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { SessionTenancyDb } from '../src/reader.ts'

const tenant = unwrap(parseTenantId({ organization: 'org_a', account: 'acc_a' }))
async function database<T>(fn: (storage: SqlStorage, file: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'omne-stt-'))
  const file = join(root, 'store.sqlite')
  const storage = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: composeMigrations(sessionTenancyMigrations),
    upgrade: false,
  })
  try {
    return await fn(storage, file)
  } finally {
    await storage.close()
    rmSync(root, { recursive: true, force: true })
  }
}
async function insert(
  storage: SqlStorage,
  session: string,
  body = writeJsonLossless(tenant),
): Promise<void> {
  await storage.write(async tx => {
    await narrow<SessionTenancyDb>(tx)
      .insertInto('session_tenancy')
      .values({ session, tenant: body })
      .execute()
  })
}
test('real file identity survives reader and storage restart; absent does not become a default tenant', async () => {
  await database(async (storage, file) => {
    const reader = createSessionTenancyReader(storage)
    expect(await reader.holdingTenant('session_a')).toEqual({ failure: 'sessionNotFound' })
    await insert(storage, 'session_a')
    expect(await reader.holdingTenant('session_a')).toEqual({ tenant })
    await reader.close()
    await storage.close()
    const reopened = await openStorage({ dialect: 'sqlite', file })
    try {
      expect(await createSessionTenancyReader(reopened).holdingTenant('session_a')).toEqual({
        tenant,
      })
    } finally {
      await reopened.close()
    }
  })
})
test.each([undefined, null, '', ' session', 'session\n', { session: 'a' }])(
  'invalid session %j does zero storage work',
  async value => {
    await database(async storage => {
      const read = vi.spyOn(storage, 'read')
      expect(await createSessionTenancyReader(storage).holdingTenant(value)).toEqual({
        failure: 'invalidInput',
      })
      expect(read).not.toHaveBeenCalled()
    })
  },
)
test('unavailability is mapped; malformed persisted identity remains a defect', async () => {
  await database(async storage => {
    const reader = createSessionTenancyReader(storage)
    const read = vi
      .spyOn(storage, 'read')
      .mockRejectedValueOnce(new StorageUnavailable('injected actual read failure'))
    expect(await reader.holdingTenant('session_a')).toEqual({ failure: 'unavailable' })
    read.mockRestore()
    await insert(storage, 'session_a', '{"organization":"org_a","account":""}')
    await expect(reader.holdingTenant('session_a')).rejects.toBeInstanceOf(StorageDefect)
    await reader.close()
  })
})
test('participation uses the real shared unit and never starts a nested ordinary read', async () => {
  await database(async storage => {
    await insert(storage, 'session_a')
    const read = vi.spyOn(storage, 'read')
    const reader = createSessionTenancyReader(storage)
    await storage.atomic(async unit => {
      expect(await reader.participate(unit).holdingTenant('session_a')).toEqual({ tenant })
      expect(await reader.participate(unit).holdingTenant('bad ')).toEqual({
        failure: 'invalidInput',
      })
    })
    expect(read).not.toHaveBeenCalled()
    let escaped: StorageUnit | undefined
    await storage.atomic(async unit => {
      escaped = unit
    })
    if (escaped === undefined) throw new Error('unit missing')
    await expect(reader.participate(escaped).holdingTenant('session_a')).rejects.toBeInstanceOf(
      StorageDefect,
    )
    await reader.close()
  })
})
test('different storage instance is rejected even if both point to real file databases', async () => {
  await database(async storage => {
    await database(async other => {
      const reader = createSessionTenancyReader(storage)
      await expect(
        other.atomic(unit => reader.participate(unit).holdingTenant('session_a')),
      ).rejects.toBeInstanceOf(StorageDefect)
      await reader.close()
    })
  })
})
test('participating unavailability poisons the whole unit, including when caller catches it', async () => {
  await database(async storage => {
    const reader = createSessionTenancyReader(storage)
    await reader.close()
    await expect(
      storage.atomic(async unit => {
        await unit.mutate(async tx => {
          await narrow<SessionTenancyDb>(tx)
            .insertInto('session_tenancy')
            .values({ session: 'should_roll_back', tenant: writeJsonLossless(tenant) })
            .execute()
        })
        try {
          await reader.participate(unit).holdingTenant('session_a')
        } catch (error) {
          expect(error).toBeInstanceOf(StorageUnavailable)
        }
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable)
    expect(await createSessionTenancyReader(storage).holdingTenant('should_roll_back')).toEqual({
      failure: 'sessionNotFound',
    })
  })
})
test('close after a previous idle read waits for a later real transaction and blocks new admission', async () => {
  await database(async storage => {
    await insert(storage, 'session_a')
    const reader = createSessionTenancyReader(storage)
    expect(await reader.holdingTenant('session_a')).toEqual({ tenant })
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    let entered: (() => void) | undefined
    const started = new Promise<void>(resolve => {
      entered = resolve
    })
    const actual = storage.read.bind(storage)
    const spy = vi.spyOn(storage, 'read').mockImplementation(fn =>
      actual(async tx => {
        entered?.()
        await gate
        return fn(tx)
      }),
    )
    const active = reader.holdingTenant('session_a')
    await started
    let ended = false
    const closing = reader.close().then(() => {
      ended = true
    })
    await Promise.resolve()
    expect(ended).toBe(false)
    expect(await reader.holdingTenant('session_a')).toEqual({ failure: 'unavailable' })
    release?.()
    expect(await active).toEqual({ tenant })
    await closing
    expect(ended).toBe(true)
    spy.mockRestore()
  })
})
test('real Cordis service exposes one read and withdrawal closes old references without deleting rows', async () => {
  await database(async storage => {
    await insert(storage, 'session_a')
    const ctx = new Context()
    ctx.provide('storage', storage)
    const fiber = ctx.plugin(sessionTenancyTablePlugin, {})
    await fiber
    const service = ctx.get('sessionTenancy') as SessionTenancyService
    expect(Object.keys(service)).toEqual(['holdingTenant'])
    expect(await service.holdingTenant('session_a')).toEqual({ tenant })
    await fiber.dispose()
    expect(await service.holdingTenant('session_a')).toEqual({ failure: 'unavailable' })
    expect(await createSessionTenancyReader(storage).holdingTenant('session_a')).toEqual({ tenant })
  })
})
