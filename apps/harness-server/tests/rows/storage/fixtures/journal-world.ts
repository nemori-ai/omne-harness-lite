import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { unpackText } from '@omne-harness/sql-contract/worker'
import {
  createRecorder,
  summarizeSteps,
  type CommitReading,
  type Recorder,
  type StepSummary,
} from './journal-measure.ts'

let active: Recorder | null = null

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

export const TIERS = {
  small: 'a scripted small message',
  '3k': `${'0123456789abcdef'.repeat(192)}`,
} as const
export type Tier = keyof typeof TIERS

export const RELEASE_COMMAND_LIMIT = 1_048_576

export type RunOptions = Readonly<{
  steps: number
  tier: Tier
  storageLimits?: Readonly<Record<string, number>>
  stallMs?: number
  totalMs?: number
  keepDatabasesIn?: string
  label?: string
}>

export type RunMeasurement = Readonly<{
  steps: number
  tier: Tier
  ended: 'completed' | 'stalled' | 'timeout'
  outcome: string | null
  admissions: number
  readings: readonly CommitReading[]
  summary: readonly StepSummary[]
  pageSize: number
  warnings: readonly string[]
  errors: readonly string[]
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
    maxRunSteps: options.steps + 2,
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
    if (outcome !== 'completed')
      errors.push(...endedReasons(new Set(recorder.readings.map(reading => reading.file))))
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

function endedReasons(files: ReadonlySet<string>): string[] {
  const reasons: string[] = []
  for (const file of files) {
    if (file === '') continue
    let db: DatabaseSync | null = null
    try {
      db = new DatabaseSync(file, { readOnly: true })
      const rows = db
        .prepare(
          `SELECT pub, kind, body FROM er_fact
           WHERE kind IN ('finish.ended', 'finish.candidate', 'settlement.recorded', 'control.stage')
           ORDER BY pub DESC LIMIT 8`,
        )
        .all() as unknown as readonly { pub: number; kind: string; body: Uint8Array }[]
      if (rows.length === 0) {
        reasons.push(`${file}: no finishing fact recorded (the run did not reach an ended)`)
        continue
      }
      for (const row of rows)
        reasons.push(
          `${file}: pub ${String(row.pub)} ${row.kind} ${unpackText(row.body).slice(0, 600)}`,
        )
    } catch (error) {
      reasons.push(`${file}: the records are not readable: ${String(error)}`)
    } finally {
      db?.close()
    }
  }
  return reasons
}
