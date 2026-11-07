// Journal 字节测量与增长守卫（终态设计 12.3，R2-D294）。
//
// 两部分，各自只说明自己的范围；测量设施本身的快层测试（WAL 读取器、增长判据与它的负控、事实体守卫的负控）
// 在 `journal-measure.spec.ts`。
// 1. 测量入口（慢层，环境变量选择）：在 line-through 联合世界里跑「N 步工具用例」，读每次提交按参加者的
//    字节、页数、fsync、每步提交次数与 Journal 自有字节对 `sl_entry` 字节的比值，写到 `tmp/journal-bytes/`。
//    现状基线曲线从这里来，数字记在 `docs/engineering/perf-baseline.md`。
// 2. 增长用例（慢层）：20 步断言第 20 步的最大一次发布 ≤ 第 5 步 + 2 KiB；200 步断言累计自有字节 ≤ J0 + W × 步数。
//    200 步的用例每次运行要几十分钟，默认跳过；改动触及 Journal 路径时设 OMNE_JOURNAL_GROWTH_200=1 运行。
//    终态 provider（K-23 删桥）合入后启用（R2-D294、R2-D347）。没有完成的运行把记录里的终结事实写进
//    `errors`，断言信息带上它，失败不静默。200 步必须正常结束；累计自有字节超出 J0 + W × 步数
//    仍由现状用例记录（D-92，R2-D380）。防回退的是每个工具步
//    自有字节与发布次数的上限（R2-D380）；事实守卫与 core.* 行数各自独立断言。
//
// 世界：真实 session-adapters 的 Journal 提供者、真实 sqlite-provider、真实 Agent 循环；Model 与 Tool 是脚本
// 替身。不访问网络。存储经 `vi.mock` 换成被记录器包住的版本（见 fixtures/journal-world.ts）。
// @module-tag slow
// Why slow: 真实 Worker、真实文件与整条 line-through 世界，几十到几百步的 Model 与 Tool 调用。
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

/**
 * The rows of the former K-23 bridge (`core.*` kinds) in the measured databases: zero after the
 * bridge was deleted (R2-D347). A copy of the reader records beside the facts would show up here.
 */
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

// --- 2. 测量入口 -------------------------------------------------------------------------------

const outDir = join(repoRoot, 'tmp', 'journal-bytes')
const factsDir = join(repoRoot, 'tmp', 'journal-facts')

/**
 * 基线用例。`release`：存储用 release 的 command 上限（1 MiB），现状在第 6 步被拒；`relaxed`：放开存储上限，
 * 让现状的曲线走到第 20 步。环境变量 `OMNE_JOURNAL_BYTES` 选用例（逗号分隔的 id，或 `all`）；不设就不跑。
 */
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
/**
 * The 200-step growth cases run only when asked: each run takes tens of minutes, so they are not
 * part of every slow tier. Set OMNE_JOURNAL_GROWTH_200=1 when a change touches the Journal path.
 */
const growth200 = process.env['OMNE_JOURNAL_GROWTH_200'] === '1'

/** 放开存储上限：同 line-through 联合世界的长跑上限（w2-world 的 LONG_RUN_LIMITS）。 */
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

// --- 3. 增长用例（终态 provider 合入后启用，R2-D294）---------------------------------------------

const TIERS_UNDER_GUARD = ['small', '3k'] as const
type GuardTier = (typeof TIERS_UNDER_GUARD)[number]

/**
 * The ceiling of a tool step's own bytes: the largest step of the 200-step run measured on
 * 3155a676d (238.9 KiB small, 286.5 KiB 3k) plus 25% (R2-D380). It guards against growth while the
 * R2-D294 target is a known limit (D-92); it is not that target.
 */
const STEP_OWN_CEILING: Readonly<Record<GuardTier, number>> = {
  small: Math.ceil(238.9 * 1024 * 1.25),
  '3k': Math.ceil(286.5 * 1024 * 1.25),
}

/** The publications of a tool step in that run: 32 in every step (R2-D380). */
const PUBLICATIONS_PER_STEP = 32

/** The tool steps of a run: steps 1 to 200, without the start and the closing step. */
const toolSteps = (measured: RunMeasurement) =>
  measured.summary.filter(item => item.step >= 1 && item.step <= 200)

/** One 200-step run per tier, shared by the cases that judge it (D-88, D-92, below). */
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
  // 删桥前的红读数（小消息档，release 的 command 上限，WIRE 4d5a7e0bc）：每步最大一次发布
  // 231,217 / 405,558 / 579,926 / 754,600 / 929,352 字节，第 6 步被存储拒绝（command_limit），运行停止。
  // 负控见 `journal-measure.spec.ts` 的「the growth judgements」。
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

  // - D-92 (R2-D380): the cumulative own bytes are far above J0 + W × steps (the R2-D294 target,
  //   constants unchanged). Measured on 3155a676d: 48,922,259 B (small) and 58,718,933 B (3k)
  //   against 2,523,136 B, about 19 and 23 times; 32 publications in every tool step, 229-239 KiB
  //   (small) and 277-287 KiB (3k) of own bytes per tool step. In that run 65 (small) and 57 (3k)
  //   of the 201 steps each had one refused commit, at varying steps (a later run refused one in
  //   the closing step); that is the current state, not asserted.
  // The guard against further growth is STEP_OWN_CEILING and PUBLICATIONS_PER_STEP (R2-D380).
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
        // All 200 tool steps are there, so the red verdict is the bytes, not a short run.
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
