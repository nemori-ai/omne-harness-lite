import { access, readFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sql } from 'kysely'
import { expect, it } from 'vitest'
import type { Instant } from '@omne-harness-lite/offer-expiry'
import type { PreflightCheck, Storage } from '@omne-harness-lite/storage'
import { openLeaseClock, clockResourcePreflight } from '../src/index.ts'
import { newManifest, writeManifest } from '../src/resource-manifest.ts'
import { fakeSources, openTempStorage, tempFile } from './support.ts'

async function check(storage: Storage, preflight: PreflightCheck) {
  return storage.read(tx =>
    preflight({
      tx,
      tables: new Set(['clock_lease']),
      appliedMigrations: [],
    }),
  )
}

it('refuses a higher imported legacy floor even when a prepared manifest exists', async () => {
  const { storage, file: business } = await openTempStorage('prepared-legacy')
  const file = tempFile('prepared-clock')
  try {
    await storage.write(tx => sql`INSERT INTO clock_lease VALUES(1,210,200)`.execute(tx.db))
    await writeManifest(
      `${file}.clock.json`,
      newManifest({
        writtenAt: 100 as Instant,
        upperBound: 110 as Instant,
      }),
      true,
    )
    const result = await check(
      storage,
      clockResourcePreflight({ file, initialize: true }, fakeSources(150).sources),
    )
    expect(result).toMatchObject({ ok: false, check: 'clock-rolled-back' })
    await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    await storage.close()
    await Promise.all(
      [dirname(file), dirname(business)].map(path => rm(path, { recursive: true, force: true })),
    )
  }
})

it('checks a committed prepared floor without changing database bytes', async () => {
  const { storage, file } = await openTempStorage('prepared-persisted')
  const { storage: business, file: businessFile } = await openTempStorage('prepared-business')
  await storage.write(tx => sql`INSERT INTO clock_lease VALUES(1,210,200)`.execute(tx.db))
  await storage.close()
  try {
    await writeManifest(
      `${file}.clock.json`,
      newManifest({ writtenAt: 100 as Instant, upperBound: 110 as Instant }),
      true,
    )
    const bytes = await readFile(file)
    expect(
      await check(business, clockResourcePreflight({ file }, fakeSources(150).sources)),
    ).toMatchObject({ ok: false, check: 'clock-rolled-back' })
    expect(await readFile(file)).toEqual(bytes)
  } finally {
    await business.close()
    await Promise.all(
      [dirname(file), dirname(businessFile)].map(path =>
        rm(path, { recursive: true, force: true }),
      ),
    )
  }
})

it('ordinary preflight neither creates a missing resource nor imports an obsolete business floor', async () => {
  const { storage, file: business } = await openTempStorage('ordinary-preflight')
  const file = tempFile('ordinary-clock')
  try {
    const preflight = clockResourcePreflight({ file }, fakeSources(1_000).sources)
    expect(await check(storage, preflight)).toMatchObject({ ok: false })
    await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })
    const owner = await openLeaseClock({
      file,
      initialize: {},
      sources: fakeSources(1_000).sources,
    })
    await owner.close()
    await storage.write(tx => sql`INSERT INTO clock_lease VALUES(1,100000,100000)`.execute(tx.db))
    const bytes = await readFile(file)
    expect(await check(storage, preflight)).toEqual({ ok: true })
    expect(await readFile(file)).toEqual(bytes)
  } finally {
    await storage.close()
    await Promise.all(
      [dirname(file), dirname(business)].map(path => rm(path, { recursive: true, force: true })),
    )
  }
})
