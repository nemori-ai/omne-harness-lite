// 测量用的测试世界：line-through 联合世界（真实 session-adapters 的 Journal 提供者、真实 sqlite-provider、
// 真实 Agent 循环与接收方；Model 与 Tool 是脚本替身，不访问网络）上跑一次「N 步工具用例」，读出每次提交。
//
// 使用它的测试文件必须在顶部这样挂住存储，否则没有读数：
//
//   vi.mock('@omne-harness/sqlite-provider', async importOriginal =>
//     (await import('./fixtures/journal-world.ts')).measuringProvider(await importOriginal()))
//
// 一步 = 一次 Model 调用加它请求的那次 Tool 调用。步以 Model 调用被受理为界：第 k 步（k ≥ 1）是第 k 次受理到
// 第 k+1 次受理之间的全部存储提交；第 0 步是建会话与受理输入；最后一次受理（文本答复，不带 Tool）之后是
// 收尾步 N+1。
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createRecorder,
  summarizeSteps,
  type CommitReading,
  type Recorder,
  type StepSummary,
} from './journal-measure.ts'

let active: Recorder | null = null

/** 把 sqlite-provider 模块换成「创建出的存储被当前记录器包住」的版本；没有记录器时原样穿过。 */
export function measuringProvider<
  M extends { createSqliteStorage: (input: never) => Promise<any> },
>(original: M): M {
  return {
    ...original,
    createSqliteStorage: async (input: never) => {
      const created = await original.createSqliteStorage(input)
      if (created.kind !== 'created' || active === null) return created
      return { ...created, storage: active.wrap(created.storage) }
    },
  }
}

/** 消息内容的两档：脚本化小消息，和 3 KiB 消息。 */
export const TIERS = {
  small: 'a scripted small message',
  '3k': `${'0123456789abcdef'.repeat(192)}`,
} as const
export type Tier = keyof typeof TIERS

/** release 配置的单个 command 上限；现状的 provider 在它之上写不出去。 */
export const RELEASE_COMMAND_LIMIT = 1_048_576

export type RunOptions = Readonly<{
  /** 工具步数 N。 */
  steps: number
  tier: Tier
  /** 存储上限里要改的成员；默认只设 release 的 command 上限。 */
  storageLimits?: Readonly<Record<string, number>>
  /** 这么久没有新的存储提交也没有终态，就判这次运行停了。 */
  stallMs?: number
  /** 整次运行的上限。 */
  totalMs?: number
  /** 给了就把最终的库文件复制到这个目录，供 `scripts/check-journal-facts.mjs` 扫。 */
  keepDatabasesIn?: string
  /** 复制出去的库文件名（不含扩展名）；默认「档-步数」。 */
  label?: string
}>

export type RunMeasurement = Readonly<{
  steps: number
  tier: Tier
  /** `completed`：Run 到了终态；`stalled`：没有进展；`timeout`：超过总时限。 */
  ended: 'completed' | 'stalled' | 'timeout'
  outcome: string | null
  /** 运行停下时已经受理的 Model 调用次数。 */
  admissions: number
  readings: readonly CommitReading[]
  summary: readonly StepSummary[]
  pageSize: number
  warnings: readonly string[]
  errors: readonly string[]
  /** 复制出去的库文件。 */
  databases: readonly string[]
}>

export async function measureToolRun(options: RunOptions): Promise<RunMeasurement> {
  const { replyText, toolCallBlock, openW2World } =
    await import('../../../../../../packages/agent/agent-host-local/tests/line-through/w2-world.ts')
  const text = TIERS[options.tier]
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'journal-bytes-')))
  const recorder = createRecorder(join(root, 'storage'))
  active = recorder
  let admissions = 0
  const world = await openW2World({
    model: admission => {
      admissions = admission.index + 1
      recorder.setStep(admissions)
      return admission.index < options.steps
        ? {
            parts: [replyText(`m${admission.index}`, text), toolCallBlock(`tc-${admission.index}`)],
            reason: 'tool-suggestions',
          }
        : { parts: [replyText('done', text)], reason: 'stop' }
    },
    tool: index => ({ content: [replyText(`tool-${index}`, text)] }),
    defaultDelayMs: 20,
    root,
    storageLimits: { maxCommandBytes: RELEASE_COMMAND_LIMIT, ...options.storageLimits },
  })
  let ended: RunMeasurement['ended'] = 'completed'
  let outcome: string | null = null
  const databases: string[] = []
  try {
    await world.createSession('journal-bytes')
    const totalMs = options.totalMs ?? 3_600_000
    const stallMs = options.stallMs ?? 90_000
    const run = world.runRound(1, text, totalMs).then(
      () => 'completed' as const,
      () => 'timeout' as const,
    )
    let lastSeen = recorder.readings.length
    let lastProgress = Date.now()
    const stalled = new Promise<'stalled'>(resolve => {
      const timer = setInterval(() => {
        if (recorder.readings.length !== lastSeen) {
          lastSeen = recorder.readings.length
          lastProgress = Date.now()
        } else if (Date.now() - lastProgress > stallMs) {
          clearInterval(timer)
          resolve('stalled')
        }
      }, 500)
      void run.then(() => clearInterval(timer))
    })
    ended = await Promise.race([run, stalled])
    if (ended === 'completed') outcome = await world.lastOutcome()
  } finally {
    const warnings = [...world.warnings]
    const errors = [...world.errors]
    await world.close()
    recorder.finish()
    active = null
    if (options.keepDatabasesIn !== undefined) {
      mkdirSync(options.keepDatabasesIn, { recursive: true })
      for (const file of new Set(recorder.readings.map(reading => reading.file))) {
        if (file === '') continue
        const target = join(
          options.keepDatabasesIn,
          `${options.label ?? `${options.tier}-${options.steps}`}.sqlite`,
        )
        copyFileSync(file, target)
        databases.push(target)
      }
    }
    rmSync(root, { recursive: true, force: true })
    lastWarnings = warnings
    lastErrors = errors
  }
  return {
    steps: options.steps,
    tier: options.tier,
    ended,
    outcome,
    admissions,
    readings: recorder.readings,
    summary: summarizeSteps(recorder.readings),
    pageSize: recorder.pageSize,
    warnings: lastWarnings.slice(0, 5),
    errors: lastErrors.slice(0, 5),
    databases,
  }
}

let lastWarnings: readonly string[] = []
let lastErrors: readonly string[] = []
