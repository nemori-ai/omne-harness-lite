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

export function enterStage(phase, timeoutMs = 0) {
  const path = process.env[channel]
  if (path) appendFileSync(path, `${JSON.stringify({ phase, timeoutMs, startedAt: now() })}\n`)
}

export function slotDeadline(config, settleMs, env = process.env) {
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
      const stage = line
        ? JSON.parse(line)
        : { phase: 'slot-wait', startedAt: queuedAt, timeoutMs: waitMs + pollMs }
      return {
        ...stage,
        settleMs,
        remainingMs: stage.startedAt + stage.timeoutMs + settleMs - now(),
      }
    },
    close() {
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export const withoutDeadlineChannel = { [channel]: '' }
