import { writeFile, mkdir } from 'node:fs/promises'
import {
  createCalendarSupplyApplication,
  CALENDAR_SUPPLY_POLICY_VERSION,
  shippedCalendarSupplyPolicies,
} from '@omne-harness/calendar'
import { calendarSeedPackSchema, instantSchema } from '@omne-harness/calendar-contract'
import { openSeedWorld } from './sql-world.mjs'

import { hash, releaseInputs } from './inputs.mjs'
const root = new URL('../../data/seeds/', import.meta.url)
const { input, materials } = await releaseInputs(root)
const at = instantSchema.parse(input.generatedAt)
const adapters = materials.map(material => ({
  sourceId: material.sourceId,
  async acquire() {
    return { kind: 'acquired', material }
  },
  async probe() {
    throw new Error('Release generation does not probe the network')
  },
}))
const world = await openSeedWorld()
const app = createCalendarSupplyApplication({
  ...world,
  sourceAdapters: adapters,
  independenceRegistry: input.independenceRegistry,
  authority: {
    async check() {
      return { kind: 'allowed', authorityGuardRefs: ['same-transaction-seed-fixture'] }
    },
  },
  clock: { now: () => at },
  ids: { versionId: () => `seed-${input.releaseDate}-${nextId++}` },
})
let nextId = 1
const calendars = [],
  reports = []
try {
  for (const declaration of input.calendars) {
    const { calendarId, authorityCoverageEnd } = declaration
    const result = await app.refresh(world.context, {
      calendarId,
      policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
      operationKey: `generate-${calendarId}`,
    })
    if (result.kind !== 'ok' || result.value.kind !== 'recorded')
      throw new Error(JSON.stringify(result))
    const record = await world.repository.getCandidate({
      candidateRef: result.value.receipt.candidateRef,
    })
    reports.push({ calendarId, result, candidate: record })
    if (record.kind !== 'ok' || !record.value) throw new Error('Candidate evidence unavailable')
    if (result.value.receipt.disposition !== 'published') continue
    const snapshot = await world.repository.getSnapshot({
      calendarId,
      version: { kind: 'current' },
    })
    if (snapshot.kind !== 'ok' || !snapshot.value) throw new Error('Published snapshot unavailable')
    const policy = shippedCalendarSupplyPolicies.find(p => p.calendarId === calendarId)
    const entryMaterials = materials
      .filter(m => policy.sources.some(s => s.sourceId === m.sourceId))
      .map(({ content, ...metadata }) => ({
        ...metadata,
        rawHash: hash(content),
        contentBase64: content.toString('base64'),
      }))
    calendars.push({
      policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
      policyHash: record.value.command.policyHash,
      snapshot: snapshot.value,
      authorityCoverageEnd,
      materials: entryMaterials,
    })
  }
  const evidence = new URL('../../../../../tmp/calendar-a1-seeds/', import.meta.url)
  await mkdir(evidence, { recursive: true })
  await writeFile(
    new URL('generation-report.json', evidence),
    JSON.stringify(reports, null, 2) + '\n',
  )
  if (calendars.length !== input.calendars.length)
    throw new Error(
      'Source validation withheld at least one declared calendar; inspect generation-report.json',
    )
  const pack = calendarSeedPackSchema.parse({
    format: 'omne.calendar-seed/1',
    releaseRef: input.releaseRef,
    releaseDate: input.releaseDate,
    calendars,
  })
  const bytes = Buffer.from(JSON.stringify(pack) + '\n')
  await writeFile(new URL('calendar-2026-11-03.json', root), bytes)
  console.log(
    JSON.stringify({
      packHash: hash(bytes),
      calendars: calendars.map(e => ({
        id: e.snapshot.calendarId,
        start: e.snapshot.coverageStart,
        end: e.snapshot.coverageEnd,
        knowledge: e.snapshot.knowledgeAsOf,
      })),
    }),
  )
} finally {
  app.stop()
  await world.close()
}
