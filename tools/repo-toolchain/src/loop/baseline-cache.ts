// 收工钩子的 BASE 一侧架构观测，按提交存在回路目录里。BASE 是一个提交，内容不变，它的观测算一次、存下，之后只读；
// 热路径上只剩当前工作树那一侧。键含全部影响结果的输入：BASE 提交、配置里的 `sensors.architecture` 一段、
// 检查器代码的摘要（本包全部代码文件与 TypeScript 版本）、存储格式版本。键对不上就重算并覆盖，不给旧数。
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

/** 存下的观测的格式版本；`BaselineObservation` 的形状或取法变了就加一。 */
const FORMAT = 1
/** 回路目录里放缓存的子目录。 */
export const BASELINE_DIRECTORY = 'hook-baseline'
/** 最多留几份，按最近读写的时间留。 */
const KEEP = 10

const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')

/** 键的输入。`architecture` 是配置里 `sensors.architecture` 那一段的原值。 */
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

/** 本包代码（这份文件所在的 `src/` 或 `dist/` 整棵）逐个文件的路径与内容，加上 TypeScript 的版本。 */
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

/** 文件不在、JSON 坏、键或形状对不上都按未命中。命中时刷新修改时间，清理时留最近用过的。 */
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

/** 写不进去返回 false：读数照常给出，下次再重算。 */
function writeEntry(directory: string, path: string, entry: Entry): boolean {
  // 先写临时文件再改名：被按时限终止或几棵工作树同时写时，读到的总是完整的一份。
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

/** 只留最近读写的 `KEEP` 份；别的进程同时在清、文件已经不在了，不算出错。 */
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
    } catch {
      // 已被别的进程清掉。
    }
}

/**
 * 存下的观测里只有 BASE 坐标的 `root` 是算它的那棵工作树；同一仓库的工作树共用回路目录，读出来换成当前的根。
 * 其余内容只取决于提交与检查器代码。
 */
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
  /** 这一次没命中、重算并存下之后调用。 */
  readonly onPrepared?: (commit: string) => void
}

/** 按提交缓存在 `home` 里的 BASE 观测；同一个读取器里同一提交只读一次文件。 */
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
      // BASE 里没有 workspace 时没有观测，重算也只跑一次 git，不存。
      if (observed !== undefined && writeEntry(directory, path, { key, observation: observed }))
        options.onPrepared?.(commit)
    }
    memo.set(commit, observed)
    return observed
  }
}
