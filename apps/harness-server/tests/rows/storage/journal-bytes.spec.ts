// @module-tag slow
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  judgeBoundedPublication,
  judgeLinearOwnBytes,
  LINEAR_OWN_BYTES,
  ownToEntryRatio,
  stepTable,
} from './fixtures/journal-measure.ts'
import type { RunMeasurement } from './fixtures/journal-world.ts'

vi.mock('@omne-harness/sqlite-provider', async importOriginal =>
  (await import('./fixtures/journal-world.ts')).measuringProvider(await importOriginal()),
)

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url))
const script = join(repoRoot, 'scripts', 'check-journal-facts.mjs')
const runCheck = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

function coreRows(...files: string[]): number {
  let count = 0
  for (const file of files) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const row = db.prepare("SELECT COUNT(*) AS n FROM er_fact WHERE kind LIKE 'core.%'").get() as
        | { n: number | bigint }
        | undefined
      count += Number(row?.n ?? 0)
    } finally {
      db.close()
    }
  }
  return count
}

const outDir = join(repoRoot, 'tmp', 'journal-bytes')
const factsDir = join(repoRoot, 'tmp', 'journal-facts')

const MEASURE_CASES = [
  { id: '20-small-release', steps: 20, tier: 'small', limits: 'release' },
  { id: '20-3k-release', steps: 20, tier: '3k', limits: 'release' },
  { id: '200-small-release', steps: 200, tier: 'small', limits: 'release' },
  { id: '200-3k-release', steps: 200, tier: '3k', limits: 'release' },
  { id: '20-small-relaxed', steps: 20, tier: 'small', limits: 'relaxed' },
  { id: '20-3k-relaxed', steps: 20, tier: '3k', limits: 'relaxed' },
  { id: '200-small-relaxed', steps: 200, tier: 'small', limits: 'relaxed' },
  { id: '200-3k-relaxed', steps: 200, tier: '3k', limits: 'relaxed' },
] as const
const selected = (process.env['OMNE_JOURNAL_BYTES'] ?? '').split(',').filter(item => item !== '')
const chosen = (id: string): boolean => selected.includes('all') || selected.includes(id)
const growth200 = process.env['OMNE_JOURNAL_GROWTH_200'] === '1'

const RELAXED = { maxCommandBytes: 1 << 30 } as const

describe('the measurement entry (OMNE_JOURNAL_BYTES=<case id,...|all>)', () => {
  for (const item of MEASURE_CASES)
    it(
      `measures ${item.id}`,
      { tags: ['slow'], timeout: 7_200_000, skip: !chosen(item.id) },
      async () => {
        const { measureToolRun } = await import('./fixtures/journal-world.ts')
        const measured = await measureToolRun({
          steps: item.steps,
          tier: item.tier,
          label: item.id,
          keepDatabasesIn: factsDir,
          ...(item.limits === 'relaxed' ? { storageLimits: RELAXED } : {}),
        })
        mkdirSync(outDir, { recursive: true })
        const ratio = ownToEntryRatio(measured.readings)
        const report = {
          case: item.id,
          ended: measured.ended,
          outcome: measured.outcome,
          admissions: measured.admissions,
          pageSize: measured.pageSize,
          ratioOwnToEntry: ratio,
          entryBytes: Math.max(0, ...measured.readings.map(item => item.entryBytes)),
          ownBytesTotal: measured.summary.reduce((total, item) => total + item.ownBytes, 0),
          stateBytesTotal: measured.summary.reduce((total, item) => total + item.stateBytes, 0),
          bounded: judgeBoundedPublication(measured.summary),
          linear: judgeLinearOwnBytes(measured.summary, item.steps),
          warnings: measured.warnings,
          errors: measured.errors,
          summary: measured.summary,
        }
        writeFileSync(join(outDir, `${item.id}.json`), JSON.stringify(report, null, 1))
        writeFileSync(join(outDir, `${item.id}.md`), `${stepTable(measured.summary)}\n`)
        console.log(
          `JOURNAL-BYTES ${item.id} ended=${measured.ended} admissions=${measured.admissions} ratio=${String(ratio)}\n${stepTable(measured.summary)}`,
        )
        expect(measured.readings.length).toBeGreaterThan(0)
      },
    )
})

const TIERS_UNDER_GUARD = ['small', '3k'] as const
type GuardTier = (typeof TIERS_UNDER_GUARD)[number]

const STEP_OWN_CEILING: Readonly<Record<GuardTier, number>> = {
  small: Math.ceil(238.9 * 1024 * 1.25),
  '3k': Math.ceil(286.5 * 1024 * 1.25),
}

const PUBLICATIONS_PER_STEP = 32

const toolSteps = (measured: RunMeasurement) =>
  measured.summary.filter(item => item.step >= 1 && item.step <= 200)

const runs200 = new Map<GuardTier, Promise<RunMeasurement>>()
function run200(tier: GuardTier): Promise<RunMeasurement> {
  const known = runs200.get(tier)
  if (known !== undefined) return known
  const run = import('./fixtures/journal-world.ts').then(async ({ measureToolRun }) => {
    const measured = await measureToolRun({
      steps: 200,
      tier,
      label: `guard-200-${tier}`,
      keepDatabasesIn: factsDir,
      totalMs: 7_000_000,
    })
    console.log(
      [
        `JOURNAL-BYTES guard-200-${tier} ended=${measured.ended} admissions=${String(measured.admissions)}`,
        `errors=${JSON.stringify(measured.errors)}`,
        stepTable(measured.summary),
      ].join('\n'),
    )
    return measured
  })
  runs200.set(tier, run)
  return run
}

describe('Journal growth (R2-D294)', () => {
  for (const tier of TIERS_UNDER_GUARD)
    it(
      `20 steps, ${tier} messages: the largest publication of step 20 is at most step 5 plus 2 KiB (R2-D294)`,
      { tags: ['slow'], timeout: 1_800_000 },
      async () => {
        const { measureToolRun } = await import('./fixtures/journal-world.ts')
        const measured = await measureToolRun({
          steps: 20,
          tier,
          label: `guard-20-${tier}`,
          keepDatabasesIn: factsDir,
        })
        expect(measured.ended, JSON.stringify(measured.errors)).toBe('completed')
        const judged = judgeBoundedPublication(measured.summary)
        expect(judged, JSON.stringify(judged)).toMatchObject({ ok: true })
        const facts = runCheck(...measured.databases)
        expect(facts.status, facts.stdout).toBe(0)
        expect(coreRows(...measured.databases)).toBe(0)
      },
    )

  for (const tier of TIERS_UNDER_GUARD) {
    it(
      `200 steps, ${tier} messages: every publication is bounded, and no tool step grows past its ceiling in own bytes or publications (R2-D294, R2-D380)`,
      { tags: ['slow'], timeout: 7_200_000, skip: !growth200 },
      async () => {
        const measured = await run200(tier)
        const tool = toolSteps(measured)
        expect(tool.map(item => item.step)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1))
        const bound = (tool.find(item => item.step === 5)?.maxPublicationBytes ?? 0) + 2 * 1024
        const over = tool.filter(item => item.step >= 5 && item.maxPublicationBytes > bound)
        expect(
          over.map(item => [item.step, item.maxPublicationBytes]),
          `bound ${String(bound)}`,
        ).toEqual([])
        const ceiling = STEP_OWN_CEILING[tier]
        expect(
          tool.filter(item => item.ownBytes > ceiling).map(item => [item.step, item.ownBytes]),
          `ceiling ${String(ceiling)}`,
        ).toEqual([])
        expect(
          tool
            .filter(item => item.publications > PUBLICATIONS_PER_STEP)
            .map(item => [item.step, item.publications]),
        ).toEqual([])
      },
    )

    it(
      `200 steps, ${tier} messages: the fact guard of the records passes`,
      { tags: ['slow'], timeout: 7_200_000, skip: !growth200 },
      async () => {
        const measured = await run200(tier)
        expect(measured.databases.length).toBeGreaterThan(0)
        const facts = runCheck(...measured.databases)
        expect(facts.status, facts.stdout).toBe(0)
      },
    )

    it(
      `200 steps, ${tier} messages: no row of the former K-23 bridge (core.*) is written`,
      { tags: ['slow'], timeout: 7_200_000, skip: !growth200 },
      async () => {
        const measured = await run200(tier)
        expect(measured.databases.length).toBeGreaterThan(0)
        expect(coreRows(...measured.databases)).toBe(0)
      },
    )

    it(
      `200 steps, ${tier} messages: D-92 known limit (R2-D380), cumulative own bytes are above J0 + W × steps; once wave 3 fixes it this case turns red: then assert the linear bound as a plain case and remove this one`,
      { tags: ['slow'], timeout: 7_200_000, skip: !growth200 },
      async () => {
        const measured = await run200(tier)
        const judged = judgeLinearOwnBytes(measured.summary, 200)
        expect(judged.steps).toBe(200)
        expect(judged.limit).toBe(LINEAR_OWN_BYTES.j0Bytes + LINEAR_OWN_BYTES.wBytesPerStep * 200)
        expect(judged.total, JSON.stringify(judged)).toBeGreaterThan(judged.limit)
        expect(judged.ok).toBe(false)
      },
    )

    it(
      `200 steps, ${tier} messages: the closing step reaches a committed completed terminal (D-88)`,
      { tags: ['slow'], timeout: 7_200_000, skip: !growth200 },
      async () => {
        const measured = await run200(tier)
        expect(measured.admissions).toBe(201)
        expect(measured.ended, JSON.stringify(measured.errors)).toBe('completed')
        expect(measured.outcome).toBe('completed')
        const closing = measured.summary.find(item => item.step === 201)
        expect(closing?.commits ?? 0).toBeGreaterThan(0)
      },
    )
  }
})
