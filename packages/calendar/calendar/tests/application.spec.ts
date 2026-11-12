import { expect, it } from 'vitest'
import { calendarResolveSchema, calendarSeedPackSchema } from '@omne-harness/calendar-contract'
import { createCalendarApplication } from '../src/application.ts'
import { context, intent, world } from './supply-application/fixture.ts'
import { shippedCalendarSupplyPolicies } from '../src/supply/index.ts'
import { supplyDigest } from '../src/supply-application/encoding.ts'

function total(w: ReturnType<typeof world>) {
  return createCalendarApplication({
    repository: w.deps.repository,
    persistence: w.deps.persistence,
    queries: {
      authority: {
        async check() {
          return { kind: 'allowed' }
        },
      },
      environment: {
        async read() {
          return { kind: 'missing' }
        },
      },
      clock: { now: () => 1767225600000 },
      catalog: [
        {
          calendarId: intent.calendarId,
          timezone: 'America/New_York',
          semanticBoundary: 'US federal holidays',
        },
      ],
    },
    supply: w.deps,
  })
}

const query = calendarResolveSchema.parse({
  selection: { kind: 'explicit', calendarId: intent.calendarId },
  version: { kind: 'latest' },
  query: { kind: 'day', date: '2026-01-01' },
})

it('shares publication storage with independent queries and keeps published answers offline', async () => {
  const w = world()
  const app = total(w)
  expect(await app.supply.refresh(context, intent)).toMatchObject({
    kind: 'ok',
    value: { kind: 'recorded', receipt: { disposition: 'published' } },
  })
  const before = await app.queries.resolve(context, query)
  expect(before).toMatchObject({ kind: 'ok', value: { versionId: w.current()?.versionId } })
  w.flags.adapterFails = true
  expect(await app.supply.refresh(context, { ...intent, operationKey: 'offline' })).toMatchObject({
    kind: 'ok',
    value: { kind: 'recorded', receipt: { disposition: 'rejected' } },
  })
  expect(await app.queries.resolve(context, query)).toEqual(before)
  w.flags.deny = true
  expect(await app.supply.refresh(context, { ...intent, operationKey: 'denied' })).toMatchObject({
    kind: 'error',
    error: { code: 'forbidden' },
  })
  expect(await app.queries.resolve(context, query)).toEqual(before)
})

it('makes a validated offline seed immediately queryable and retains a prepared run after stop', async () => {
  const source = world()
  await source.app().refresh(context, intent)
  const pack = calendarSeedPackSchema.parse({
    format: 'omne.calendar-seed/1',
    releaseRef: 'release-1',
    releaseDate: '2026-01-01',
    calendars: [
      {
        snapshot: source.current(),
        policyVersion: intent.policyVersion,
        policyHash: supplyDigest(
          shippedCalendarSupplyPolicies.find(policy => policy.calendarId === intent.calendarId),
        ),
        authorityCoverageEnd: '2026-12-31',
        materials: [...source.raw.values()].map(stored => {
          const { content, ...metadata } = stored.material
          return {
            ...metadata,
            rawHash: stored.rawHash,
            contentBase64: Buffer.from(content).toString('base64'),
          }
        }),
      },
    ],
  })
  const w = world()
  w.setSeed(pack)
  w.flags.adapterFails = true
  const app = total(w)
  const completed = Promise.withResolvers<void>()
  const committing = Promise.withResolvers<void>()
  const commit = w.deps.persistence.commitDisposition
  w.deps.persistence.commitDisposition = async command => {
    const result = await commit(command)
    committing.resolve()
    await completed.promise
    return result
  }
  const imported = app.supply.importSeed(context, {
    packRef: 'seed',
    packHash: supplyDigest(pack),
    releaseRef: 'release-1',
    operationKey: 'seed-intent',
  })
  await committing.promise
  expect(w.runs.size).toBe(1)
  expect(app.supply.stop()).toEqual({ kind: 'admissionStopped', durableRuns: 'retained' })
  completed.resolve()
  expect(await imported).toMatchObject({
    kind: 'ok',
    value: { results: [{ outcome: { kind: 'recorded', receipt: { disposition: 'published' } } }] },
  })
  expect(await app.queries.resolve(context, query)).toMatchObject({
    kind: 'ok',
    value: { versionId: w.current()?.versionId },
  })
  expect(w.calls.acquire).toBe(0)
  expect(w.runs.size).toBe(1)
})
