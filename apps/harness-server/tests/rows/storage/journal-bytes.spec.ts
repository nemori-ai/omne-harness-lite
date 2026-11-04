// Journal 字节测量与增长守卫（终态设计 12.3，R2-D294）。
//
// 两部分，各自只说明自己的范围；测量设施本身的快层测试（WAL 读取器、增长判据与它的负控、事实体守卫的负控）
// 在 `journal-measure.spec.ts`。
// 1. 测量入口（慢层，环境变量选择）：在 line-through 联合世界里跑「N 步工具用例」，读每次提交按参加者的
//    字节、页数、fsync、每步提交次数与 Journal 自有字节对 `sl_entry` 字节的比值，写到 `tmp/journal-bytes/`。
//    现状基线曲线从这里来，数字记在 `docs/engineering/perf-baseline.md`。
// 2. 增长用例（慢层）：20 步断言第 20 步的最大一次发布 ≤ 第 5 步 + 2 KiB；200 步断言累计自有字节 ≤ J0 + W × 步数。
//    现状下两条都会红，先 skip，终态 provider 合入后启用（R2-D294）。
//
// 世界：真实 session-adapters 的 Journal 提供者、真实 sqlite-provider、真实 Agent 循环；Model 与 Tool 是脚本
// 替身。不访问网络。存储经 `vi.mock` 换成被记录器包住的版本（见 fixtures/journal-world.ts）。
// @module-tag slow
// Why slow: 真实 Worker、真实文件与整条 line-through 世界，几十到几百步的 Model 与 Tool 调用。
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  judgeBoundedPublication,
  judgeLinearOwnBytes,
  ownToEntryRatio,
  stepTable,
} from './fixtures/journal-measure.ts'

vi.mock('@omne-harness/sqlite-provider', async importOriginal =>
  (await import('./fixtures/journal-world.ts')).measuringProvider(await importOriginal()),
)

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url))
const script = join(repoRoot, 'scripts', 'check-journal-facts.mjs')
const runCheck = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

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

describe('Journal growth (enable with the final provider, R2-D294)', () => {
  // 现状下的红读数（小消息档，release 的 command 上限，WIRE 4d5a7e0bc）：每步最大一次发布
  // 231,217 / 405,558 / 579,926 / 754,600 / 929,352 字节，第 6 步被存储拒绝（command_limit），运行停止。
  // 第 20 步没有读数，所以判据判红；负控见 `journal-measure.spec.ts` 的「the growth judgements」。
  for (const tier of TIERS_UNDER_GUARD)
    it.skip(
      `20 steps, ${tier} messages: the largest publication of step 20 is at most step 5 plus 2 KiB (enable with the final provider, R2-D294)`,
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
      },
    )

  for (const tier of TIERS_UNDER_GUARD)
    it.skip(
      `200 steps, ${tier} messages: cumulative own bytes are at most J0 + W × steps (enable with the final provider, R2-D294)`,
      { tags: ['slow'], timeout: 7_200_000 },
      async () => {
        const { measureToolRun } = await import('./fixtures/journal-world.ts')
        const measured = await measureToolRun({
          steps: 200,
          tier,
          label: `guard-200-${tier}`,
          keepDatabasesIn: factsDir,
          totalMs: 7_000_000,
        })
        expect(measured.ended, JSON.stringify(measured.errors)).toBe('completed')
        const judged = judgeLinearOwnBytes(measured.summary, 200)
        expect(judged, JSON.stringify(judged)).toMatchObject({ ok: true })
        const facts = runCheck(...measured.databases)
        expect(facts.status, facts.stdout).toBe(0)
      },
    )
})
