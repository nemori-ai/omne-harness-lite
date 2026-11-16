import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import type { BaselineObservation } from '../arch/conformance.ts'
import { git } from '../core/git.ts'
import { observeBaselineAt, type BaselineReader } from './sensors/conformance.ts'

const FORMAT = 1
export const BASELINE_DIRECTORY = 'hook-baseline'
const KEEP = 10

const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')

export interface BaselineKeyInputs {
  readonly commit: string
  readonly architecture: unknown
  readonly tool: string
}

export function baselineKey(inputs: BaselineKeyInputs): string {
  return sha256(
    JSON.stringify([FORMAT, inputs.commit, JSON.stringify(inputs.architecture), inputs.tool]),
  )
}

export function toolDigest(codeRoot = fileURLToPath(new URL('..', import.meta.url))): string {
  const lines: string[] = [`typescript ${ts.version}`]
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile())
        lines.push(
          `${relative(codeRoot, full).replaceAll('\\', '/')} ${sha256(readFileSync(full))}`,
        )
    }
  }
  walk(codeRoot)
  return sha256(lines.sort().join('\n'))
}

interface Entry {
  readonly key: string
  readonly observation: BaselineObservation
}

function isEntry(value: unknown, key: string): value is Entry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as { key?: unknown; observation?: unknown }
  if (entry.key !== key || typeof entry.observation !== 'object' || entry.observation === null)
    return false
  const { constraints, actual, stock } = entry.observation as Record<string, unknown>
  return (
    typeof constraints === 'object' &&
    constraints !== null &&
    typeof actual === 'object' &&
    actual !== null &&
    Array.isArray(stock)
  )
}

function readEntry(path: string, key: string): BaselineObservation | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isEntry(value, key)) return undefined
    const now = new Date()
    utimesSync(path, now, now)
    return value.observation
  } catch {
    return undefined
  }
}

function writeEntry(directory: string, path: string, entry: Entry): boolean {
  const staged = `${path}.${process.pid}.tmp`
  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(staged, JSON.stringify(entry))
    renameSync(staged, path)
    prune(directory)
    return true
  } catch {
    return false
  }
}

function prune(directory: string): void {
  const files = readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .flatMap(name => {
      try {
        return [{ path: join(directory, name), at: statSync(join(directory, name)).mtimeMs }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.at - a.at)
  for (const { path } of files.slice(KEEP))
    try {
      unlinkSync(path)
    } catch {}
}

function at(observation: BaselineObservation, root: string): BaselineObservation {
  const { constraints } = observation
  return {
    ...observation,
    constraints: { ...constraints, source: { ...constraints.source, root } },
  }
}

export interface CachedBaselineOptions {
  readonly tool?: string
  readonly compute?: BaselineReader
  readonly onPrepared?: (commit: string) => void
}

export function cachedBaselineReader(
  home: string,
  architecture: unknown,
  options: CachedBaselineOptions = {},
): BaselineReader {
  const compute = options.compute ?? observeBaselineAt
  let tool = options.tool
  const memo = new Map<string, BaselineObservation | undefined>()
  return (root, base) => {
    const commit = git(root, ['rev-parse', '--verify', `${base}^{commit}`])
    if (memo.has(commit)) return memo.get(commit)
    tool ??= toolDigest()
    const key = baselineKey({ commit, architecture, tool })
    const directory = join(home, BASELINE_DIRECTORY)
    const path = join(directory, `${key}.json`)
    const hit = readEntry(path, key)
    let observed = hit === undefined ? undefined : at(hit, root)
    if (observed === undefined) {
      observed = compute(root, commit)
      if (observed !== undefined && writeEntry(directory, path, { key, observation: observed }))
        options.onPrepared?.(commit)
    }
    memo.set(commit, observed)
    return observed
  }
}
