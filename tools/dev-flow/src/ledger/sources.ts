/**
 * Reads the ledger input files into the types of derive.ts. Every read problem becomes an
 * InputError that names the option and the file; the derivation itself reads no file.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  calendarDate,
  InputError,
  issueNumberArgument,
  parseCapture,
  record,
  type DeliveryCapture,
} from '../delivery/protocol.ts'
import { errorCode } from '../delivery/events.ts'
import type { AdmissionInput, AdmissionRun, BoardEntry, SlotRow } from './derive.ts'

function readText(option: string, path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    const code = errorCode(error)
    if (code !== undefined) throw new InputError(`${option} ${path}: cannot read (${code})`)
    throw error
  }
}
function parseJson(option: string, where: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) throw new InputError(`${option} ${where}: not valid JSON`)
    throw error
  }
}
function listDirectories(option: string, path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort()
  } catch (error) {
    const code = errorCode(error)
    if (code !== undefined) throw new InputError(`${option} ${path}: cannot read (${code})`)
    throw error
  }
}
function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

/** `--capture`: a `github-delivery-capture@1` file, parsed by the delivery protocol. */
export function readCapture(path: string): DeliveryCapture {
  const value = parseJson('--capture', path, readText('--capture', path))
  try {
    return parseCapture(value)
  } catch (error) {
    if (error instanceof InputError) throw new InputError(`--capture ${path}: ${error.message}`)
    throw error
  }
}

/** A run directory name `<time>[-fast|-slow]`. */
const RUN_DIRECTORY = /^(\d{8}-\d{6})(?:-(fast|slow))?$/
/** One run directory that holds a ledger.json, reduced to what a run needs. */
type RunDirectory = {
  time: string
  tier: 'fast' | 'slow' | 'all'
  branch: string | null
  wallSeconds: number
  failed: boolean
}
/** `meta.branch`: a string, or null when the ledger has none; any other value is an input error. */
function branchOf(value: unknown, file: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string')
    throw new InputError(`--admission ${file}: meta.branch must be a string or null`)
  return value
}
function readRunDirectory(file: string, time: string, tier: RunDirectory['tier']): RunDirectory {
  const text = readText('--admission', file)
  const ledger = record(parseJson('--admission', file, text), `--admission ${file}`)
  const meta = record(ledger.meta, `--admission ${file} meta`)
  const wallSeconds = meta.wallSeconds
  if (typeof wallSeconds !== 'number' || !Number.isFinite(wallSeconds) || wallSeconds < 0)
    throw new InputError(`--admission ${file}: meta.wallSeconds must be a number of seconds`)
  if (!Array.isArray(ledger.failures))
    throw new InputError(`--admission ${file}: failures must be an array`)
  return {
    time,
    tier,
    branch: branchOf(meta.branch, file),
    wallSeconds,
    failed: ledger.failures.length > 0,
  }
}
/**
 * `--admission`: the test ledger root, `<head>[-dirty]/<time>[-fast|-slow]/ledger.json`.
 * Directories whose name is not a run time are left out; run directories without ledger.json are
 * counted and left out. Within one head directory, in time order, a `-fast` directory directly
 * followed by a `-slow` directory is one run (`pnpm run check` runs the fast tier, then the slow
 * tier); every other directory is a run on its own. The run's branch is `meta.branch`.
 */
export function readAdmission(root: string): AdmissionInput {
  const runs: AdmissionRun[] = []
  let directoriesWithoutLedger = 0
  for (const head of listDirectories('--admission', root)) {
    const directories: RunDirectory[] = []
    for (const name of listDirectories('--admission', join(root, head))) {
      const match = RUN_DIRECTORY.exec(name),
        time = match?.[1]
      if (match === null || time === undefined) continue
      const tier = match[2] === 'fast' ? 'fast' : match[2] === 'slow' ? 'slow' : 'all'
      const file = join(root, head, name, 'ledger.json')
      if (!existsSync(file)) {
        directoriesWithoutLedger += 1
        continue
      }
      directories.push(readRunDirectory(file, time, tier))
    }
    directories.sort((left, right) => left.time.localeCompare(right.time))
    for (let index = 0; index < directories.length; index += 1) {
      const first = directories[index]
      if (first === undefined) continue
      const next = directories[index + 1]
      const group = first.tier === 'fast' && next?.tier === 'slow' ? [first, next] : [first]
      index += group.length - 1
      runs.push({
        key: `${head}/${first.time}`,
        branch: group.find(item => item.branch !== null)?.branch ?? null,
        wallSeconds: group.reduce((total, item) => total + item.wallSeconds, 0),
        failed: group.some(item => item.failed),
      })
    }
  }
  return { runs, directoriesWithoutLedger }
}

function slotRow(value: unknown, where: string): SlotRow {
  const row = record(value, where)
  const { event, command, cwd, issue, exitCode, endedAt } = row
  if (event !== 'ran' && event !== 'gave-up')
    throw new InputError(`${where}: event must be ran or gave-up`)
  if (typeof command !== 'string' || typeof cwd !== 'string')
    throw new InputError(`${where}: command and cwd must be strings`)
  if (exitCode !== null && (typeof exitCode !== 'number' || !Number.isInteger(exitCode)))
    throw new InputError(`${where}: exitCode must be an integer or null`)
  if (!isTimestamp(endedAt)) throw new InputError(`${where}: endedAt must be a time`)
  if (
    issue !== undefined &&
    issue !== null &&
    (typeof issue !== 'number' || !Number.isSafeInteger(issue) || issue < 1)
  )
    throw new InputError(`${where}: issue must be a card number or null`)
  return { event, command, cwd, issue: issue ?? null, exitCode, endedAt }
}
/** `--slots`: the test slot ledger, one JSON object per line; blank lines are skipped. */
export function readSlots(path: string): SlotRow[] {
  return readText('--slots', path)
    .split('\n')
    .flatMap((line, index) => {
      if (line.trim() === '') return []
      const where = `${path} line ${index + 1}`
      return [slotRow(parseJson('--slots', where, line), `--slots ${where}`)]
    })
}

const BOARD_KEYS = ['wave', 'dispatchedAt', 'deliveredAt', 'acceptedAt', 'cycleDays'] as const
function boardEntry(value: unknown, where: string): BoardEntry {
  const raw = record(value, where)
  const unknown = Object.keys(raw).filter(key => !BOARD_KEYS.some(known => known === key))
  if (unknown.length > 0) throw new InputError(`${where}: unknown fields ${unknown.join(', ')}`)
  const entry: BoardEntry = {}
  if (raw.wave !== undefined) {
    if (typeof raw.wave !== 'string' || raw.wave.trim() === '')
      throw new InputError(`${where}.wave must be a non-empty string`)
    entry.wave = raw.wave
  }
  for (const key of ['dispatchedAt', 'deliveredAt', 'acceptedAt'] as const) {
    const date = raw[key]
    if (date === undefined) continue
    if (typeof date !== 'string') throw new InputError(`${where}.${key} must be YYYY-MM-DD`)
    entry[key] = calendarDate(date, `${where}.${key}`)
  }
  if (raw.cycleDays !== undefined) {
    if (typeof raw.cycleDays !== 'number' || !Number.isFinite(raw.cycleDays) || raw.cycleDays < 0)
      throw new InputError(`${where}.cycleDays must be a number of days`)
    entry.cycleDays = raw.cycleDays
  }
  return entry
}
/** `--board`: `{ "<card>": { wave, dispatchedAt, deliveredAt, acceptedAt, cycleDays } }`. */
export function readBoard(path: string): Map<number, BoardEntry> {
  const raw = record(parseJson('--board', path, readText('--board', path)), `--board ${path}`)
  const board = new Map<number, BoardEntry>()
  for (const [key, value] of Object.entries(raw)) {
    const card = issueNumberArgument(key)
    if (card === undefined || key.startsWith('#'))
      throw new InputError(`--board ${path}: key ${key} is not a card number`)
    try {
      board.set(card, boardEntry(value, `card ${key}`))
    } catch (error) {
      if (error instanceof InputError) throw new InputError(`--board ${path}: ${error.message}`)
      throw error
    }
  }
  return board
}
