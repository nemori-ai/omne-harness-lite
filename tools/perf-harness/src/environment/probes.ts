import { closeSync, fsyncSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { median } from '../judgment/growth.ts'
import { unknown, type Field } from './field.ts'

export type Spread = Readonly<{ medianMs: number; highMs: number }>

/** Three fixed pieces of work, timed: what the machine gives right now for the costs the object pays. */
export type Probe = Readonly<{
  computeMs: number
  syncWrite: Field<Spread>
  commit: Field<Spread>
}>

export type CommitSettings = Readonly<{ journalMode: string; synchronous: string }>

const REPEATS = 5
const STEPS = 4_000_000
const WRITES = 64
const BLOCK = 4096

const elapsed = (work: () => void): number => {
  const from = process.hrtime.bigint()
  work()
  return Number(process.hrtime.bigint() - from) / 1e6
}

function compute(): number {
  let state = 0x9e3779b9
  for (let step = 0; step < STEPS; step += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
  }
  return state
}

function spreadOf(times: readonly number[]): Spread {
  const sorted = [...times].sort((a, b) => a - b)
  return {
    medianMs: median(sorted),
    highMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? Number.NaN,
  }
}

function within<T>(directory: string, work: (scratch: string) => T): Field<T> {
  let scratch: string
  try {
    scratch = mkdtempSync(join(directory, '.perf-probe-'))
  } catch {
    return unknown('cannot write in the data directory')
  }
  try {
    return work(scratch)
  } catch (error) {
    return unknown(error instanceof Error ? error.name : 'the probe failed')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function syncWrites(scratch: string): Spread {
  const file = openSync(join(scratch, 'writes'), 'w')
  const block = Buffer.alloc(BLOCK, 1)
  try {
    return spreadOf(
      Array.from({ length: WRITES }, () =>
        elapsed(() => {
          writeSync(file, block)
          fsyncSync(file)
        }),
      ),
    )
  } finally {
    closeSync(file)
  }
}

const SETTING = /^[a-z]+$/i

function commits(scratch: string, settings: CommitSettings): Spread {
  if (!SETTING.test(settings.journalMode) || !SETTING.test(settings.synchronous))
    throw new TypeError('a setting of the commit probe is not a plain word')
  const database = new DatabaseSync(join(scratch, 'commits.sqlite'))
  try {
    database.exec(`pragma journal_mode = ${settings.journalMode}`)
    database.exec(`pragma synchronous = ${settings.synchronous}`)
    database.exec('create table probe (id integer primary key, body blob not null)')
    const insert = database.prepare('insert into probe (body) values (?)')
    const body = Buffer.alloc(256, 1)
    return spreadOf(Array.from({ length: WRITES }, () => elapsed(() => insert.run(body))))
  } finally {
    database.close()
  }
}

/** Runs for a second or so. The scratch files live under the data directory and are removed. */
export function probe(dataDirectory: string, settings: CommitSettings): Probe {
  return {
    computeMs: median(Array.from({ length: REPEATS }, () => elapsed(compute))),
    syncWrite: within(dataDirectory, syncWrites),
    commit: within(dataDirectory, scratch => commits(scratch, settings)),
  }
}
