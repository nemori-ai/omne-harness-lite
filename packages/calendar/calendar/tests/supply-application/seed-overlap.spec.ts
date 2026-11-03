import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  calendarSeedEntrySchema,
  calendarSnapshotSchema,
  instantSchema,
  localDateSchema,
  type CalendarSeedEntry,
  type CalendarSnapshot,
} from '@omne-harness/calendar-contract'
import type { CalendarSourceEvidence } from '../../src/persistence.ts'
import type { CalendarStoredMaterial } from '../../src/supply-application/ports.ts'
import { candidateSnapshot } from '../../src/supply-application/candidate.ts'
import { supplyDigest } from '../../src/supply-application/encoding.ts'
import { materialHash, parseMaterials } from '../../src/supply-application/materials.ts'
import { inspectSeed } from '../../src/supply-application/seed-validation.ts'
import {
  shippedCalendarSupplyPolicies,
  synthesizeCalendarCandidate,
} from '../../src/supply/index.ts'
import type { CalendarSupplyPolicy } from '../../src/supply/index.ts'
import { context, intent, world } from './fixture.ts'

function policyFor(calendarId: string) {
  const policy = shippedCalendarSupplyPolicies.find(item => item.calendarId === calendarId)
  if (!policy) throw new Error(`Missing policy ${calendarId}`)
  return policy
}

function entryFor(policy: CalendarSupplyPolicy, materials: readonly CalendarStoredMaterial[]) {
  const parsed = parseMaterials(materials)
  expect(parsed.findings).toEqual([])
  const built = synthesizeCalendarCandidate({
    policy,
    contributions: parsed.contributions.filter(
      source => source.role === 'truth' || source.role === 'exceptionFeed',
    ),
  })
  if (built.kind !== 'success') throw new Error(JSON.stringify(built.findings))
  return calendarSeedEntrySchema.parse({
    policyVersion: intent.policyVersion,
    policyHash: supplyDigest(policy),
    snapshot: {
      ...candidateSnapshot({
        candidate: built.candidate,
        now: instantSchema.parse('2026-01-01T00:00:00.000Z'),
        versionId: 'proposed-seed',
      }),
      publicationGeneration: 0,
    },
    authorityCoverageEnd: '2026-12-31',
    materials: materials.map(({ material: { content, ...metadata }, rawHash }) => ({
      ...metadata,
      rawHash,
      contentBase64: Buffer.from(content).toString('base64'),
    })),
  })
}

async function inspect(
  entry: CalendarSeedEntry,
  policy: CalendarSupplyPolicy,
  materials: readonly CalendarStoredMaterial[],
  previous: CalendarSnapshot | null,
  previousMaterials = materials,
) {
  const w = world()
  const sources: CalendarSourceEvidence[] = previousMaterials.map(stored => {
    const source = policy.sources.find(item => item.sourceId === stored.material.sourceId)
    if (!source) throw new Error('Missing source policy')
    return {
      ...stored.material,
      role: source.role,
      rawHash: stored.rawHash,
      rawReference: stored.reference,
    }
  })
  for (const material of previousMaterials) w.raw.set(material.reference, material)
  const address = {
    protocol: 'omne.calendar-schedule/1',
    systemScopeRef: 'test-scope',
    operation: 'refresh',
    calendarId: entry.snapshot.calendarId,
    operationKey: 'previous-publication',
  } as const
  return inspectSeed(
    {
      ...w.deps,
      repository: {
        ...w.deps.repository,
        async getSnapshot({ version }) {
          return { kind: 'ok', value: version.kind === 'current' ? previous : null }
        },
        async getCandidate() {
          return {
            kind: 'ok',
            value: {
              candidateRef: 'previous-candidate',
              command: {
                address,
                expectedFingerprint: 'previous-fingerprint',
                expectedGeneration: 0,
                authorityGuardRefs: ['test-guard'],
                policyHash: supplyDigest(policy),
                candidate: {
                  snapshot: previous,
                  sources,
                  semanticBoundary: policy.semanticBoundary,
                  differences: [],
                  reasons: [],
                },
                disposition: { kind: 'noChange' },
              },
              receipt: {
                address,
                fingerprint: 'previous-fingerprint',
                operationRef: 'previous-operation',
                candidateRef: 'previous-candidate',
                disposition: 'published',
                current: previous,
                outboxId: 'previous-outbox',
              },
            },
          }
        },
      },
    },
    'test-scope',
    entry,
    policy,
    materials,
    '2026-01-01',
  )
}

async function usSeed() {
  const w = world()
  await w.app().refresh(context, intent)
  const policy = policyFor(intent.calendarId)
  const materials = [...w.raw.values()]
  return { policy, materials, entry: entryFor(policy, materials) }
}

function previousSnapshot(entry: CalendarSeedEntry, changes: Partial<CalendarSnapshot> = {}) {
  return calendarSnapshotSchema.parse({
    ...entry.snapshot,
    versionId: 'previous-version',
    publicationGeneration: 7,
    contentHash: 'a'.repeat(64),
    ...changes,
  })
}

describe('seed overlap validation', () => {
  it('publishes a locally validated seed when there is no current publication', async () => {
    const { policy, materials, entry } = await usSeed()
    const result = await inspect(entry, policy, materials, null)
    expect(result.findings.filter(item => item.code === 'overlap.unsourced')).toEqual([])
    expect(
      result.findings.some(item => item.severity === 'blocker' && item.status !== 'passed'),
    ).toBe(false)
    expect(result.disposition).toEqual({ kind: 'publish', snapshot: result.candidate.snapshot })
    expect(result.expectedGeneration).toBe(0)
  })

  it('withholds a changed overlap category without new authority', async () => {
    const { policy, materials, entry } = await usSeed()
    const previous = previousSnapshot(entry, {
      overrides: entry.snapshot.overrides.map(day =>
        day.date === '2026-01-01' ? { ...day, classification: 'nonWorkingDay' } : day,
      ),
    })
    const result = await inspect(entry, policy, materials, previous)
    expect(result.findings.filter(item => item.code === 'overlap.unsourced')).toEqual([
      expect.objectContaining({ code: 'overlap.unsourced', status: 'failed', severity: 'warning' }),
    ])
    expect(result.disposition).toEqual({ kind: 'withheld' })
    expect(result.expectedGeneration).toBe(7)
  })

  it('withholds removal of a published override even when the proposed seed has no day record', async () => {
    const { policy, materials, entry } = await usSeed()
    expect(entry.snapshot.overrides.some(day => day.date === '2026-01-02')).toBe(false)
    const previous = previousSnapshot(entry, {
      overrides: [
        ...entry.snapshot.overrides,
        {
          date: localDateSchema.parse('2026-01-02'),
          classification: 'holiday',
          provenanceRefs: ['previous-closure-authority'],
          notes: ['previous published closure'],
        },
      ],
    })
    const result = await inspect(entry, policy, materials, previous)
    expect(result.findings.filter(item => item.code === 'overlap.unsourced')).toEqual([
      expect.objectContaining({ status: 'failed', severity: 'warning' }),
    ])
    expect(result.disposition).toEqual({ kind: 'withheld' })
  })

  it('allows a changed overlap category with new traceable authority', async () => {
    const { policy, materials, entry } = await usSeed()
    const previous = previousSnapshot(entry, {
      overrides: entry.snapshot.overrides.map(day => ({
        ...day,
        classification: day.date === '2026-01-01' ? 'nonWorkingDay' : day.classification,
        provenanceRefs: ['previous-authority'],
      })),
    })
    const result = await inspect(entry, policy, materials, previous)
    expect(result.findings.filter(item => item.code === 'overlap.unsourced')).toEqual([])
    expect(result.disposition).toMatchObject({ kind: 'publish' })
    expect(
      result.candidate.snapshot?.overrides.find(day => day.date === '2026-01-01'),
    ).toMatchObject({
      classification: 'holiday',
      provenanceRefs: ['5 U.S.C. §6103(a); legal_date=2026-01-01; holiday=new_year'],
    })
  })

  it('distinguishes changed first-party truth bytes from unchanged bytes at the same authority', async () => {
    const policy = policyFor('jp-legal-holidays')
    const source = policy.sources.find(item => item.role === 'truth')
    if (!source) throw new Error('Missing JP truth source')
    const material = {
      sourceId: source.sourceId,
      lineageRef: source.lineage,
      authorityRef: 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',
      acquiredAt: instantSchema.parse('2026-08-21T00:00:00.000Z'),
      knowledgeAsOf: instantSchema.parse('2026-08-20T00:00:00.000Z'),
      mediaType: 'text/csv',
      content: readFileSync(
        new URL('../supply/fixtures/current_shape_excerpt.csv', import.meta.url),
      ),
    }
    const currentMaterial = {
      material,
      rawHash: materialHash(material),
      reference: 'jp-current-material',
    }
    const oldMaterial = {
      ...material,
      content: Buffer.from(
        material.content.toString('latin1').replace('2026/5/6,', '2026/5/7,'),
        'latin1',
      ),
    }
    const old = {
      material: oldMaterial,
      rawHash: materialHash(oldMaterial),
      reference: 'jp-previous-material',
    }
    expect(old.rawHash).not.toBe(currentMaterial.rawHash)
    const entry = entryFor(policy, [currentMaterial])
    const previous = previousSnapshot(entryFor(policy, [old]))
    const unchanged = await inspect(entry, policy, [currentMaterial], previous, [currentMaterial])
    const changed = await inspect(entry, policy, [currentMaterial], previous, [old])
    expect(unchanged.findings.filter(item => item.code === 'overlap.unsourced')).toEqual([
      expect.objectContaining({ status: 'failed', severity: 'warning' }),
    ])
    expect(changed.findings.some(item => item.code === 'overlap.unsourced')).toBe(false)
    // The fixed CSV is an excerpt, so its independent annual-floor rejection still applies.
    expect(changed.findings).toContainEqual(
      expect.objectContaining({ code: 'jp.annual_holiday_count_floor', status: 'failed' }),
    )
    expect(changed.disposition).toEqual({ kind: 'rejected' })
  })
})
