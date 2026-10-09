// @module-tag slow
import { mkdtemp, rm, readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import type { Instant } from '@omne-harness-lite/offer-expiry'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { newManifest, writeManifest } from '../src/resource-manifest.ts'
import { openLeaseClock } from '../src/resource.ts'
import { fakeSources } from './support.ts'

const roots: string[] = []
const clocks: Awaited<ReturnType<typeof openLeaseClock>>[] = []
async function file() {
  const root = await mkdtemp(join(tmpdir(), 'omne-clock-resource-'))
  roots.push(root)
  return join(root, 'clock.sqlite')
}
afterEach(async () => {
  for (const clock of clocks.splice(0)) await clock.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function clock(options: Parameters<typeof openLeaseClock>[0]) {
  const value = await openLeaseClock(options)
  clocks.push(value)
  return value
}

describe('independent clock resource', () => {
  it('requires explicit creation and refuses missing initialized state', async () => {
    const path = await file()
    await expect(openLeaseClock({ file: path })).rejects.toThrow('explicit initialization')
    const owner = await clock({ file: path, initialize: {} })
    expect(await owner.now()).not.toBe('unavailable')
    await owner.close()
    await unlink(path)
    await expect(openLeaseClock({ file: path })).rejects.toThrow(
      'initialized clock database is missing',
    )
  })

  it('refuses an identity mismatch instead of silently creating a new resource', async () => {
    const path = await file()
    const owner = await clock({ file: path, initialize: {} })
    await owner.close()
    const manifest = JSON.parse(await readFile(`${path}.clock.json`, 'utf8'))
    manifest.id = 'a146590a-8737-44c8-a182-44b6858ec361'
    await writeFile(`${path}.clock.json`, JSON.stringify(manifest))
    await expect(openLeaseClock({ file: path })).rejects.toThrow('identity does not match')
  })

  it.each(['missing', 'negative', 'inverted', 'unsafe'] as const)(
    'refuses a ready resource with a %s durable floor and releases its owner',
    async corruption => {
      const path = await file()
      const sources = fakeSources(1_000_000).sources
      const owner = await clock({ file: path, initialize: {}, sources })
      await owner.close()
      const storage = await openStorage({ dialect: 'sqlite', file: path })
      try {
        await storage.write(async tx => {
          if (corruption === 'missing') await sql`DELETE FROM clock_lease WHERE id=1`.execute(tx.db)
          else {
            const writtenAt =
              corruption === 'negative' ? -1 : corruption === 'unsafe' ? 9_007_199_254_740_992n : 2
            const upperBound = corruption === 'inverted' ? 1 : writtenAt
            await sql`UPDATE clock_lease SET written_at=${writtenAt}, lease_until=${upperBound} WHERE id=1`.execute(
              tx.db,
            )
          }
        })
      } finally {
        await storage.close()
      }
      const refused = openLeaseClock({ file: path, sources })
      if (corruption === 'unsafe') await expect(refused).rejects.toThrow()
      else
        await expect(refused).rejects.toThrow(
          corruption === 'missing' ? 'no durable floor' : 'bounds are malformed',
        )
      // Startup refusal must release exclusive ownership without changing the malformed row.
      const reopened = await openStorage({ dialect: 'sqlite', file: path })
      try {
        if (corruption === 'unsafe')
          expect(
            await reopened.read(tx =>
              sql`SELECT CAST(written_at AS TEXT) AS value FROM clock_lease WHERE id=1`.execute(
                tx.db,
              ),
            ),
          ).toMatchObject({ rows: [{ value: '9007199254740992' }] })
      } finally {
        await reopened.close()
      }
    },
  )

  it('renews within a business write without waiting for that same transaction', async () => {
    const path = await file()
    const sources = fakeSources(1_000_000)
    const owner = await clock({ file: path, initialize: {}, sources: sources.sources })
    const business = await openStorage({
      dialect: 'sqlite',
      file: join(roots.at(-1)!, 'business.sqlite'),
    })
    try {
      sources.state.wall += 60_000
      expect(await business.write(async () => owner.now())).toBe(sources.state.wall)
      await expect(openLeaseClock({ file: path })).rejects.toMatchObject({ stage: 'occupied' })
    } finally {
      await business.close()
    }
  })

  it('keeps a restored higher floor across reopen and never lowers it', async () => {
    const path = await file()
    const sources = fakeSources(2_000_000)
    const owner = await clock({ file: path, initialize: {}, sources: sources.sources })
    expect(await owner.now()).toBe(2_000_000)
    const checkpoint = await owner.checkpoint()
    expect(checkpoint).not.toBe('unavailable')
    await owner.close()
    const restored = await clock({
      file: path,
      sources: sources.sources,
      minimum: {
        writtenAt: 2_000_000 as Instant,
        upperBound: 2_030_000 as Instant,
      },
    })
    expect(await restored.now()).toBe('unavailable')
    await restored.close()
    sources.state.wall = 2_030_000
    const reopened = await clock({ file: path, sources: sources.sources })
    expect(await reopened.now()).toBe(2_030_000)
  })
})

it('closes native storage even when a clock source throws during reclamation', async () => {
  const path = await file()
  const time = fakeSources(3_000_000)
  let broken = false
  const sources = {
    ...time.sources,
    wall: () => {
      if (broken) throw new Error('wall source failed')
      return time.sources.wall()
    },
  }
  const owner = await openLeaseClock({ file: path, initialize: {}, sources })
  expect(await owner.now()).toBe(3_000_000)
  broken = true
  await expect(owner.close()).rejects.toThrow('wall source failed')
  broken = false
  time.state.wall += 20_000
  const next = await clock({ file: path, sources })
  expect(await next.now()).toBe(3_020_000)
})

it('retains a higher initialization floor when resuming a prepared resource', async () => {
  const path = await file()
  await writeManifest(
    `${path}.clock.json`,
    newManifest({
      writtenAt: 100 as Instant,
      upperBound: 110 as Instant,
    }),
    true,
  )
  const time = fakeSources(150)
  await expect(
    openLeaseClock({
      file: path,
      sources: time.sources,
      initialize: {
        floor: {
          writtenAt: 200 as Instant,
          upperBound: 210 as Instant,
        },
      },
    }),
  ).rejects.toMatchObject({ name: 'ClockRollbackDetected' })
  const manifest = JSON.parse(await readFile(`${path}.clock.json`, 'utf8'))
  expect(manifest.floor).toEqual({ writtenAt: 200, upperBound: 210 })
  time.state.wall = 210
  const resumed = await clock({ file: path, sources: time.sources })
  expect(await resumed.now()).toBe(210)
})
