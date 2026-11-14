import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { git, nulSeparated } from '@omne-harness/repo-toolchain/core/git'
import { pnpmCommand } from './support.ts'

export const LOCKFILE = 'pnpm-lock.yaml'
export const INSTALLED_LOCKFILE = 'node_modules/.pnpm/lock.yaml'
export const INSTALL_ARGS = ['install', '--offline', '--frozen-lockfile'] as const

export type DependencyStatus = 'in-sync' | 'reinstalled' | 'install-failed' | 'no-lockfile'
export const DEPENDENCY_STATUSES: readonly DependencyStatus[] = [
  'in-sync',
  'reinstalled',
  'install-failed',
  'no-lockfile',
]

export interface EnvironmentHealing {
  readonly dependencies: {
    readonly status: DependencyStatus
    readonly detail: string
  }
  readonly lineEndings: {
    readonly restored: readonly string[]
    readonly kept: readonly string[]
    readonly blocked?: string
  }
}

export interface EnvironmentIo {
  readonly install: (root: string) => { readonly status: number; readonly output: string }
}

const TAIL_LINES = 8

export const defaultEnvironmentIo: EnvironmentIo = {
  install: root => {
    const pnpm = pnpmCommand()
    const run = spawnSync(pnpm.command, [...pnpm.args, ...INSTALL_ARGS], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (run.error !== undefined) return { status: -1, output: run.error.message }
    return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` }
  },
}

function readOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

const tail = (text: string) =>
  text
    .trimEnd()
    .split('\n')
    .slice(-TAIL_LINES)
    .map(line => line.trimEnd())
    .join('\n')

function healDependencies(root: string, io: EnvironmentIo): EnvironmentHealing['dependencies'] {
  const lockfile = readOrUndefined(join(root, LOCKFILE))
  if (lockfile === undefined)
    return { status: 'no-lockfile', detail: `没有 ${LOCKFILE}，不核对依赖` }
  const installed = readOrUndefined(join(root, INSTALLED_LOCKFILE))
  if (installed === lockfile)
    return { status: 'in-sync', detail: `${INSTALLED_LOCKFILE} 与 ${LOCKFILE} 相同` }
  const why =
    installed === undefined
      ? `没有 ${INSTALLED_LOCKFILE}`
      : `${INSTALLED_LOCKFILE} 与 ${LOCKFILE} 不同`
  const command = `pnpm ${INSTALL_ARGS.join(' ')}`
  const run = io.install(root)
  if (run.status === 0 && readOrUndefined(join(root, INSTALLED_LOCKFILE)) === lockfile)
    return { status: 'reinstalled', detail: `${why}，已 ${command}` }
  return {
    status: 'install-failed',
    detail:
      `${why}，${command} ${run.status === 0 ? '退出 0 但副本仍不同' : `退出 ${run.status}`}：\n${tail(run.output)}\n` +
      '联网后手动 pnpm install --frozen-lockfile',
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
        '本仓库 core.autocrlf=true，检出就写 CRLF，不从索引重新检出；按 docs/development.md 设 git config core.autocrlf input 后再检出',
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
  io: EnvironmentIo = defaultEnvironmentIo,
): EnvironmentHealing {
  return { dependencies: healDependencies(root, io), lineEndings: healLineEndings(root) }
}

export function describeHealing(healing: EnvironmentHealing): string[] {
  const { dependencies, lineEndings } = healing
  const lines = [
    `环境自检：依赖——${dependencies.detail.split('\n')[0] ?? ''}${dependencies.status === 'in-sync' || dependencies.status === 'no-lockfile' ? '，不动' : ''}`,
  ]
  if (dependencies.status === 'install-failed')
    lines.push(
      ...dependencies.detail
        .split('\n')
        .slice(1)
        .map(line => `  ${line}`),
    )
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')

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
