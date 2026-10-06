import {
  isNonNegativeJsonInteger,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { isOk, parseTenantId } from '@omne-harness-lite/identity-values'
import { indexFoldVersion } from './codec.ts'
import { checkKey, object } from '@omne-harness-lite/session-log'
import { addInteger, compareInteger, positiveInteger } from '@omne-harness-lite/session-log'
import { emptyLogState } from './state.ts'
import type { JsonNumber, LogCommit, LogState, TenantId, AttemptId } from './types.ts'

export interface IndexRow {
  readonly v: number
  readonly first: JsonNumber
  readonly count: number
  readonly start: number
  readonly end: number
  readonly dedupe: readonly string[]
  readonly read: readonly (readonly [string, JsonNumber])[]
  readonly runs: readonly (readonly [string, AttemptId])[]
  readonly tenant?: TenantId
}
export function indexRow(
  commit: LogCommit,
  start: number,
  end: number,
  firstRow: boolean,
): IndexRow {
  const entry = commit.entries[0]
  if (entry === undefined) throw new TypeError('empty commit cannot be indexed')
  const runs = new Map<string, JsonNumber>()
  for (const item of commit.entries)
    if (item.run !== undefined && item.attempt !== undefined) {
      const seen = runs.get(item.run)
      if (seen === undefined || compareInteger(item.attempt, seen) > 0)
        runs.set(item.run, item.attempt)
    }
  return Object.freeze({
    v: indexFoldVersion,
    first: commit.first,
    count: commit.entries.length,
    start,
    end,
    dedupe: Object.freeze(
      commit.entries.flatMap(item => (item.dedupeKey === undefined ? [] : [item.dedupeKey])),
    ),
    read: Object.freeze(
      commit.entries.flatMap((item, index) =>
        item.readKeys.map(key => Object.freeze([key, addInteger(commit.first, index)] as const)),
      ),
    ),
    runs: Object.freeze([...runs].map(([run, attempt]) => Object.freeze([run, attempt] as const))),
    ...(firstRow ? { tenant: entry.tenant } : {}),
  })
}
export function encodeIndexRows(rows: readonly IndexRow[]): Uint8Array {
  return new TextEncoder().encode(rows.map(row => `${writeJsonLossless(row)}\n`).join(''))
}
function byteOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function pairs(
  value: JsonValue | undefined,
  attempt: boolean,
): readonly (readonly [string, JsonNumber])[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: (readonly [string, JsonNumber])[] = []
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || !checkKey(pair[0])) return undefined
    const number = pair[1]
    if (!(attempt ? positiveInteger(number) : isNonNegativeJsonInteger(number))) return undefined
    result.push(Object.freeze([pair[0], number]))
  }
  return Object.freeze(result)
}
/** Structure only: a structurally valid missing dedupe key is the documented SLJ-11 counterexample. */
export function decodeIndexBytes(bytes: Uint8Array): readonly IndexRow[] | undefined {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
  const lines = text.split('\n')
  lines.pop() // An incomplete final line never contributes a derived row.
  const result: IndexRow[] = []
  let next: JsonNumber = 1
  let offset = 0
  for (const line of lines) {
    const decoded = readJsonStrict(line)
    if ('failed' in decoded || !object(decoded.ok)) return undefined
    const row = decoded.ok
    if (
      Object.keys(row).some(
        key =>
          !['v', 'first', 'count', 'start', 'end', 'dedupe', 'read', 'runs', 'tenant'].includes(
            key,
          ),
      ) ||
      row.v !== indexFoldVersion ||
      !positiveInteger(row.first) ||
      compareInteger(row.first, next) !== 0 ||
      !byteOffset(row.count) ||
      row.count < 1 ||
      !byteOffset(row.start) ||
      row.start !== offset ||
      !byteOffset(row.end) ||
      row.end <= row.start ||
      !Array.isArray(row.dedupe)
    )
      return undefined
    const dedupe: string[] = []
    for (const key of row.dedupe) {
      if (!checkKey(key) || dedupe.includes(key)) return undefined
      dedupe.push(key)
    }
    const read = pairs(row.read, false)
    const runs = pairs(row.runs, true)
    if (read === undefined || runs === undefined) return undefined
    const last = addInteger(row.first, row.count - 1)
    const first = row.first
    if (
      read.some(
        ([, position]) => compareInteger(position, first) < 0 || compareInteger(position, last) > 0,
      )
    )
      return undefined
    let tenant: TenantId | undefined
    if (result.length === 0) {
      const checked = parseTenantId(row.tenant)
      if (!isOk(checked)) return undefined
      tenant = Object.freeze(checked.ok)
    } else if (Object.hasOwn(row, 'tenant')) return undefined
    result.push(
      Object.freeze({
        v: indexFoldVersion,
        first: row.first,
        count: row.count,
        start: row.start,
        end: row.end,
        dedupe: Object.freeze(dedupe),
        read,
        runs,
        ...(tenant === undefined ? {} : { tenant }),
      }),
    )
    next = addInteger(row.first, row.count)
    offset = row.end
  }
  return Object.freeze(result)
}
export function foldIndexRows(rows: readonly IndexRow[]): LogState {
  let tail: JsonNumber = 0
  const dedupe = new Set<string>()
  const read: (readonly [string, JsonNumber])[] = []
  const runs = new Map<string, AttemptId>()
  const tenant = rows[0]?.tenant
  for (const row of rows) {
    tail = addInteger(row.first, row.count - 1)
    for (const key of row.dedupe) dedupe.add(key)
    read.push(...row.read)
    for (const [run, attempt] of row.runs) {
      const seen = runs.get(run)
      if (seen === undefined || compareInteger(attempt, seen) > 0) runs.set(run, attempt)
    }
  }
  if (rows.length === 0) return emptyLogState()
  if (tenant === undefined) throw new Error('validated index has no tenant')
  return Object.freeze({
    tenant,
    tail,
    dedupeKeys: Object.freeze([...dedupe]),
    readPositions: Object.freeze(read),
    maxAttempts: Object.freeze([...runs].map(pair => Object.freeze(pair))),
  })
}
