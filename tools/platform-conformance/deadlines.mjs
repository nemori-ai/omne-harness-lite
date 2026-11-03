import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const channel = 'OMNE_PLATFORM_DEADLINE_FILE'
const now = () => performance.timeOrigin + performance.now()

function parseStage(line) {
  const stage = JSON.parse(line)
  if (
    stage === null ||
    typeof stage !== 'object' ||
    !['runner', 'subprocess'].includes(stage.phase) ||
    !Number.isFinite(stage.startedAt) ||
    stage.startedAt < 0 ||
    stage.startedAt > Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(stage.timeoutMs) ||
    stage.timeoutMs < 0
  )
    throw new Error('Invalid deadline stage record')
  return stage
}

export function enterStage(phase, timeoutMs = 0) {
  const path = process.env[channel]
  if (path) appendFileSync(path, `${JSON.stringify({ phase, timeoutMs, startedAt: now() })}\n`)
}

export function slotDeadline(config, settleMs, env = process.env) {
  if (!Number.isSafeInteger(settleMs) || settleMs < 0)
    throw new Error('Invalid deadline stage settlement budget')
  const seconds = (key, initial, minimum) => {
    const text = env[key] ?? initial
    const value = Number(text)
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value * 1000) || value < minimum)
      throw new Error(`${key} must be an integer of at least ${minimum} seconds`)
    return value * 1000
  }
  const waitMs = seconds('OMNE_TEST_SLOT_MAX_WAIT_SECONDS', '7200', 0)
  const pollMs = seconds('OMNE_TEST_SLOT_POLL_SECONDS', '5', 1)
  const parent = dirname(config.out ?? config.root)
  mkdirSync(parent, { recursive: true })
  const directory = mkdtempSync(join(parent, '.platform-deadlines-'))
  const path = join(directory, 'stages.jsonl')
  writeFileSync(path, '', { mode: 0o600 })
  const queuedAt = now()
  return {
    env: { [channel]: path },
    read() {
      // Ignore an unfinished append until the runner completes that record.
      const lines = readFileSync(path, 'utf8').split('\n')
      const line = lines.at(-2)
      const stage =
        line !== undefined
          ? parseStage(line)
          : { phase: 'slot-wait', startedAt: queuedAt, timeoutMs: waitMs + pollMs }
      const remainingMs = stage.startedAt + stage.timeoutMs + settleMs - now()
      if (!Number.isFinite(remainingMs)) throw new Error('Invalid deadline stage remaining time')
      return {
        ...stage,
        settleMs,
        remainingMs,
      }
    },
    close() {
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export const withoutDeadlineChannel = { [channel]: '' }
