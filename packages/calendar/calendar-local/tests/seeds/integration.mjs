import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  createCalendarSupplyApplication,
  classifyDay,
  CALENDAR_SUPPLY_POLICY_VERSION,
} from '@omne-harness/calendar'
import { calendarIdSchema, instantSchema, localDateSchema } from '@omne-harness/calendar-contract'
import {
  createShippedCalendarSeedRegistry,
  shippedCalendarSeedRelease,
} from '@omne-harness/calendar-local'
import { openSeedWorld } from '../../tools/seeds/sql-world.mjs'
import { releaseInputs } from '../../tools/seeds/inputs.mjs'

const hash = b => createHash('sha256').update(b).digest('hex')
const original = await readFile(
  new URL('../../data/seeds/calendar-2026-11-03.json', import.meta.url),
)
const pack = JSON.parse(original)
const registry = new Map(createShippedCalendarSeedRegistry())
const register = (key, document) => {
  const bytes = Buffer.from(JSON.stringify(document))
  registry.set(key, { kind: 'bytes', read: async () => bytes })
  return { packRef: key, packHash: hash(bytes), releaseRef: document.releaseRef, operationKey: key }
}
const damaged = structuredClone(pack)
damaged.calendars[0].materials[0].contentBase64 = Buffer.from('damaged material').toString('base64')
const damagedIntent = register('damaged', damaged)
const shortYear = structuredClone(pack)
shortYear.releaseDate = '2031-11-03'
const shortIntent = register('missing-release-year', shortYear)
const futureOmitted = structuredClone(pack)
for (const entry of futureOmitted.calendars) entry.authorityCoverageEnd = '2035-12-31'
const futureIntent = register('missing-authority-horizon', futureOmitted)
const old = structuredClone(pack)
for (const entry of old.calendars) {
  entry.snapshot.versionId = `older-${entry.snapshot.versionId}`
  entry.snapshot.knowledgeAsOf = '2025-01-01T00:00:00.000Z'
  for (const material of entry.materials) material.knowledgeAsOf = '2025-01-01T00:00:00.000Z'
}
const oldIntent = register('older-equivalent-seed', old)
const world = await openSeedWorld({ registry, scope: 'offline-independent-installation' })
const app = createCalendarSupplyApplication({
  ...world,
  sourceAdapters: [],
  independenceRegistry: [],
  authority: {
    async check() {
      return { kind: 'allowed', authorityGuardRefs: ['same-transaction-seed-fixture'] }
    },
  },
  clock: { now: () => instantSchema.parse('2026-11-03T14:00:00.000Z') },
})
function dispositions(result) {
  assert.equal(result.kind, 'ok', JSON.stringify(result))
  return result.value.results.map(entry => {
    assert.equal(entry.outcome.kind, 'recorded', JSON.stringify(entry))
    return entry.outcome.receipt.disposition
  })
}
async function snapshots() {
  const values = []
  for (const entry of pack.calendars) {
    const result = await world.repository.getSnapshot({
      calendarId: entry.snapshot.calendarId,
      version: { kind: 'current' },
    })
    assert.equal(result.kind, 'ok')
    values.push(result.value)
  }
  return values
}
try {
  await assert.rejects(fetch('https://www.cao.go.jp', { signal: AbortSignal.timeout(1500) }))
  const intent = { ...shippedCalendarSeedRelease, operationKey: 'initial' }
  delete intent.releaseDate
  const first = await app.importSeed(world.context, intent)
  assert.deepEqual(
    dispositions(first),
    pack.calendars.map(() => 'published'),
  )
  const initial = await snapshots()
  assert.ok(initial.every(Boolean))
  for (const snapshot of initial) {
    const classification = classifyDay({ snapshot, date: localDateSchema.parse('2026-01-01') })
    assert.equal(classification.kind, 'ok', JSON.stringify(classification))
  }
  const replay = await app.importSeed(world.context, intent)
  assert.ok(
    replay.kind === 'ok' &&
      replay.value.results.every(
        entry => entry.outcome.kind === 'recorded' && entry.outcome.replayed,
      ),
  )
  assert.deepEqual(
    dispositions(await app.importSeed(world.context, { ...intent, operationKey: 'repeat' })),
    pack.calendars.map(() => 'noChange'),
  )
  assert.deepEqual(
    dispositions(await app.importSeed(world.context, oldIntent)),
    pack.calendars.map(() => 'noChange'),
  )
  const badHash = await app.importSeed(world.context, {
    ...intent,
    packHash: '0'.repeat(64),
    operationKey: 'bad-hash',
  })
  assert.equal(badHash.kind, 'error')
  assert.equal((await app.importSeed(world.context, damagedIntent)).kind, 'error')
  assert.deepEqual(
    dispositions(await app.importSeed(world.context, shortIntent)),
    pack.calendars.map(() => 'rejected'),
  )
  assert.deepEqual(
    dispositions(await app.importSeed(world.context, futureIntent)),
    pack.calendars.map(() => 'rejected'),
  )
  const { materials } = await releaseInputs(new URL('../../data/seeds/', import.meta.url))
  const refresher = createCalendarSupplyApplication({
    ...world,
    authority: {
      async check() {
        return { kind: 'allowed', authorityGuardRefs: ['same-transaction-seed-fixture'] }
      },
    },
    independenceRegistry: JSON.parse(
      await readFile(new URL('../../data/seeds/inputs.json', import.meta.url), 'utf8'),
    ).independenceRegistry,
    sourceAdapters: materials.map(material => ({
      sourceId: material.sourceId,
      async acquire() {
        return { kind: 'acquired', material }
      },
      async probe() {
        throw new Error('No network probe during offline verification')
      },
    })),
    clock: { now: () => instantSchema.parse('2026-11-03T14:00:00.000Z') },
  })
  try {
    for (const entry of pack.calendars) {
      const result = await refresher.refresh(world.context, {
        calendarId: entry.snapshot.calendarId,
        policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
        operationKey: 'refresh-after-seed',
      })
      assert.equal(result.kind, 'ok', JSON.stringify(result))
      assert.equal(result.value.kind, 'recorded', JSON.stringify(result))
      assert.equal(result.value.receipt.disposition, 'noChange', JSON.stringify(result))
    }
  } finally {
    refresher.stop()
  }
  assert.deepEqual(await snapshots(), initial)
  for (const entry of pack.calendars) {
    const versions = await world.repository.listVersions({
      calendarId: calendarIdSchema.parse(entry.snapshot.calendarId),
      limit: 100,
      after: null,
    })
    assert.equal(versions.kind, 'ok')
    assert.equal(versions.value.items.length, 1)
  }
  console.log(
    JSON.stringify({
      network: 'OS sandbox denied',
      calendars: initial.map(s => s.calendarId),
      initial: 'published',
      replay: 'same receipt',
      repeated: 'noChange',
      olderKnowledge: 'noChange',
      subsequentRefresh: 'noChange',
      hashTamper: 'rejected',
      rawTamper: 'rejected',
      yearOmission: 'rejected',
      futureOmission: 'rejected',
      unchanged: true,
    }),
  )
} finally {
  app.stop()
  await world.close()
}
