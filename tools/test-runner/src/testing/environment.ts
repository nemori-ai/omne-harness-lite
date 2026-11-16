import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'

export const BOOTSTRAP_ENV = 'OMNE_CHECK_BOOTSTRAP'

// `not-bootstrapped`：进程内直接调用检查函数，没经过启动段。`install-failed` 只出现在启动段之前的旧记录里。
export type DependencyStatus =
  | 'in-sync'
  | 'reinstalled'
  | 'no-lockfile'
  | 'not-bootstrapped'
  | 'install-failed'
export const DEPENDENCY_STATUSES: readonly DependencyStatus[] = [
  'in-sync',
  'reinstalled',
  'no-lockfile',
  'not-bootstrapped',
  'install-failed',
]

export interface DependencyCheck {
  readonly status: DependencyStatus
  readonly detail: string
}

export interface BootstrapResult {
  readonly toolchain: { readonly pnpm: string; readonly node: string; readonly runtime: string }
  readonly dependencies: DependencyCheck
  readonly native: { readonly status: 'ok' | 'repaired'; readonly detail: string }
}

export interface EnvironmentHealing {
  readonly dependencies: DependencyCheck
  readonly lineEndings: {
    readonly restored: readonly string[]
    readonly kept: readonly string[]
    readonly blocked?: string
  }
}

export const NOT_BOOTSTRAPPED: DependencyCheck = {
  status: 'not-bootstrapped',
  detail: '没有经过启动段（进程内直接调用检查函数），不核对依赖',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')
const START_STATUSES: readonly unknown[] = ['in-sync', 'reinstalled', 'no-lockfile']

export function parseBootstrap(text: string | undefined): BootstrapResult | undefined {
  if (text === undefined || text.trim() === '') return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(value)) return undefined
  const { toolchain, dependencies, native } = value
  if (!isRecord(toolchain) || !isRecord(dependencies) || !isRecord(native)) return undefined
  const { pnpm, node, runtime } = toolchain
  if (typeof pnpm !== 'string' || typeof node !== 'string' || typeof runtime !== 'string')
    return undefined
  if (!START_STATUSES.includes(dependencies['status'])) return undefined
  if (typeof dependencies['detail'] !== 'string') return undefined
  if (native['status'] !== 'ok' && native['status'] !== 'repaired') return undefined
  if (typeof native['detail'] !== 'string') return undefined
  return {
    toolchain: { pnpm, node, runtime },
    dependencies: {
      status: dependencies['status'] as DependencyStatus,
      detail: dependencies['detail'],
    },
    native: { status: native['status'], detail: native['detail'] },
  }
}

function blobSha(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

const EOL_LINE = /^i\/(\S+)\s+w\/(\S+)\s+attr\/\S*\s*\t(.+)$/u

function crlfWorkingCopies(root: string): string[] {
  const paths: string[] = []
  for (const line of nulSeparated(git(root, ['ls-files', '--eol', '-z']))) {
    const match = EOL_LINE.exec(line)
    if (match !== null && match[1] === 'lf' && match[2] === 'crlf' && match[3] !== undefined)
      paths.push(match[3])
  }
  return paths
}

function indexBlobs(root: string, paths: readonly string[]): Map<string, string> {
  const blobs = new Map<string, string>()
  for (const line of nulSeparated(git(root, ['ls-files', '-s', '-z', '--', ...paths]))) {
    const match = /^\d+ ([0-9a-f]+) \d\t(.+)$/u.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) blobs.set(match[2], match[1])
  }
  return blobs
}

const CHUNK = 100

function autocrlf(root: string): string {
  try {
    return git(root, ['config', '--get', 'core.autocrlf']).trim()
  } catch {
    return ''
  }
}

function healLineEndings(root: string): EnvironmentHealing['lineEndings'] {
  if (autocrlf(root) === 'true')
    return {
      restored: [],
      kept: [],
      blocked:
        '本仓库 core.autocrlf=true，检出就写 CRLF，不从索引重新检出；设 git config core.autocrlf input 后再检出',
    }
  const candidates = crlfWorkingCopies(root)
  if (candidates.length === 0) return { restored: [], kept: [] }
  const blobs = indexBlobs(root, candidates)
  const restored: string[] = []
  const kept: string[] = []
  for (const path of candidates) {
    const working = readFileSync(join(root, path))
    const normalized = Buffer.from(working.toString('latin1').replaceAll('\r\n', '\n'), 'latin1')
    if (blobs.get(path) === blobSha(normalized)) restored.push(path)
    else kept.push(path)
  }
  for (let index = 0; index < restored.length; index += CHUNK)
    git(root, ['checkout-index', '-f', '--', ...restored.slice(index, index + CHUNK)])
  return { restored, kept }
}

export function healEnvironment(
  root: string,
  bootstrap: BootstrapResult | undefined,
): EnvironmentHealing {
  return {
    dependencies: bootstrap?.dependencies ?? NOT_BOOTSTRAPPED,
    lineEndings: healLineEndings(root),
  }
}

export function describeHealing(healing: EnvironmentHealing): string[] {
  const { dependencies, lineEndings } = healing
  const lines = [
    `环境自检：依赖（启动段）——${dependencies.detail}${dependencies.status === 'reinstalled' ? '' : '，不动'}`,
  ]
  if (lineEndings.blocked !== undefined) lines.push(`环境自检：换行——${lineEndings.blocked}`)
  else if (lineEndings.restored.length === 0 && lineEndings.kept.length === 0)
    lines.push('环境自检：换行——没有索引 LF、工作副本 CRLF 的已跟踪文件，不动')
  if (lineEndings.restored.length > 0)
    lines.push(
      `环境自检：换行——${lineEndings.restored.length} 个工作副本为 CRLF 的文件已从索引重新检出：${lineEndings.restored.join('、')}`,
    )
  if (lineEndings.kept.length > 0)
    lines.push(
      `环境自检：换行——${lineEndings.kept.length} 个 CRLF 文件另有内容改动，没有覆盖（format:check 会报它们）：${lineEndings.kept.join('、')}`,
    )
  return lines
}

export function parseEnvironmentHealing(value: unknown): EnvironmentHealing | undefined {
  if (!isRecord(value) || !isRecord(value['dependencies']) || !isRecord(value['lineEndings']))
    return undefined
  const { status, detail } = value['dependencies']
  const { restored, kept, blocked } = value['lineEndings']
  if (!(DEPENDENCY_STATUSES as readonly unknown[]).includes(status) || typeof detail !== 'string')
    return undefined
  if (!isStringArray(restored) || !isStringArray(kept)) return undefined
  if (blocked !== undefined && typeof blocked !== 'string') return undefined
  return {
    dependencies: { status: status as DependencyStatus, detail },
    lineEndings: { restored, kept, ...(blocked === undefined ? {} : { blocked }) },
  }
}
