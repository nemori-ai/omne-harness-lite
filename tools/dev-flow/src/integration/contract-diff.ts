import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { record, text } from '../delivery/protocol.ts'
import type { ApiSide, Comparison } from '../delivery/api-review-types.ts'
import { clean, exactTextBlob, git } from './git.ts'
import { array, choice, IntegrationError, json, object, sha, string } from './parse.ts'
import {
  SNAPSHOT_CHANGES,
  type ContractDiff,
  type ContractDiffProvider,
  type DiffContracts,
  type SnapshotChange,
} from './ri-notes.ts'

const TOOLCHAIN_PACKAGE = '@omne-harness/repo-toolchain'
const CONTRACT_API_BIN = 'omne-contract-api'
/** The difference kinds and scopes of `omne-contract-api --diff --json` in the pinned version. */
const DIFFERENCE_KINDS = [
  'added',
  'removed',
  'changed',
  'marked',
  'renamed',
  'missing',
  'unresolved',
] as const
const DIFFERENCE_SCOPES = ['snapshot', 'entry', 'export', 'declaration'] as const

export type Difference = {
  scope: (typeof DIFFERENCE_SCOPES)[number]
  kind: (typeof DIFFERENCE_KINDS)[number]
}
export type ComparedMember = {
  status: 'compared'
  directory: string
  before: string | undefined
  after: string | undefined
  change: SnapshotChange
  differences: Difference[]
}
/** One member of the CLI's diff result, reduced to the fields this provider reads. */
export type DiffMember = ComparedMember | { status: 'invalid'; directory: string; message: string }
/** The fields of one `omne-contract-api --diff --json` run that dev-flow reads. */
export type DiffRun = { commit: string; members: DiffMember[] }
export type Unavailable = Extract<ContractDiff, { kind: 'unavailable' }>
type Range = Parameters<DiffContracts>[0]

function optionalPath(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path)
}
function parseDifference(value: unknown, path: string): Difference {
  const v = object(value, path)
  return {
    scope: choice(object(v.target, `${path}.target`).scope, DIFFERENCE_SCOPES, `${path}.target`),
    kind: choice(v.kind, DIFFERENCE_KINDS, `${path}.kind`),
  }
}
function parseMember(value: unknown, path: string): DiffMember {
  const v = object(value, path),
    directory = string(v.directory, `${path}.directory`),
    status = choice(v.status, ['compared', 'invalid'], `${path}.status`)
  switch (status) {
    case 'invalid':
      return { status, directory, message: string(v.message, `${path}.message`) }
    case 'compared':
      return {
        status,
        directory,
        before: optionalPath(v.before, `${path}.before`),
        after: optionalPath(v.after, `${path}.after`),
        change: choice(v.change, SNAPSHOT_CHANGES, `${path}.change`),
        differences: array(v.differences, `${path}.differences`).map((item, index) =>
          parseDifference(item, `${path}.differences[${index}]`),
        ),
      }
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}
/** Parses the CLI's standard output at the boundary; a shape defect throws `IntegrationError`. */
export function parseDiffRun(text: string): DiffRun {
  const v = object(json(text, `${CONTRACT_API_BIN} --diff --json`), 'diff')
  return {
    commit: sha(v.commit, 'diff.commit'),
    members: array(v.members, 'diff.members').map((item, index) =>
      parseMember(item, `diff.members[${index}]`),
    ),
  }
}

/**
 * Why one whole-snapshot difference leaves the member's change unknown, or undefined when the
 * CLI's classification stands.
 */
function wholeSnapshotUnknown(
  member: ComparedMember,
  kind: Difference['kind'],
): string | undefined {
  switch (kind) {
    // Both sides lack a snapshot: the CLI's review says nothing about the change.
    case 'missing':
      return '基线与工作树都没有快照文件'
    // The CLI counts a missing base snapshot as additive, which says nothing about the change.
    case 'added':
      return member.before === undefined
        ? '基线上不是契约成员，没有快照'
        : `基线上没有快照文件 ${member.before}`
    // A member still in the line table lost its snapshot. One that left the table keeps review.
    case 'removed':
      return member.after === undefined ? undefined : `工作树没有快照文件 ${member.after}`
    // Both snapshots were read: a changed package name, an unresolved comparison or a compared
    // change is a classification of the two snapshots.
    case 'renamed':
    case 'unresolved':
    case 'changed':
    case 'marked':
      return undefined
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
/** Why a member's change is unknown, or undefined when it is known. */
function unknownReason(member: DiffMember): string | undefined {
  switch (member.status) {
    case 'invalid':
      return `快照读不出：${member.message}`
    case 'compared':
      return member.differences
        .filter(item => item.scope === 'snapshot')
        .map(item => wholeSnapshotUnknown(member, item.kind))
        .find(reason => reason !== undefined)
    default: {
      const _exhaustive: never = member
      return _exhaustive
    }
  }
}
/** Every member's change, or `unavailable` listing each member whose change is unknown. */
export function contractDiffOf(range: Range, run: DiffRun): ContractDiff {
  if (run.commit !== range.base)
    return {
      kind: 'unavailable',
      reason: `${CONTRACT_API_BIN} 比较的基线是 ${run.commit}，不是 ${range.base}。`,
    }
  const unknown = run.members.flatMap(member => {
    const reason = unknownReason(member)
    return reason === undefined ? [] : [`${member.directory}（${reason}）`]
  })
  if (unknown.length > 0)
    return {
      kind: 'unavailable',
      reason: `${unknown.length} 个契约成员的快照差异不可得，不当作没有变化：${unknown.join('；')}。`,
    }
  const members = new Map<string, SnapshotChange>()
  for (const member of run.members)
    if (member.status === 'compared') members.set(member.directory, member.change)
  return { kind: 'available', ...range, members }
}

/** How to start the CLI: the executable and the arguments before the CLI's own. */
export type ContractApiCommand = { file: string; args: readonly string[] }

/** The manifest of the installed repo-toolchain, or undefined when dev-flow cannot resolve it. */
function toolchainManifest(): string | undefined {
  try {
    return findPackageJSON(TOOLCHAIN_PACKAGE, import.meta.url)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND')
      return undefined
    throw error
  }
}

/** The pinned `omne-contract-api` script, resolved from this member's dependency. */
export function contractApiCommand(): ContractApiCommand | Unavailable {
  const manifest = toolchainManifest()
  if (manifest === undefined)
    return {
      kind: 'unavailable',
      reason: `找不到 ${CONTRACT_API_BIN}：dev-flow 解析不到 ${TOOLCHAIN_PACKAGE}。`,
    }
  const bin = unavailableOnKnown(
    () =>
      string(
        object(object(json(readFileSync(manifest, 'utf8'), manifest), manifest).bin, 'bin')[
          CONTRACT_API_BIN
        ],
        `bin.${CONTRACT_API_BIN}`,
      ),
    error => `找不到 ${CONTRACT_API_BIN}：${error.message}`,
  )
  if (typeof bin !== 'string') return bin
  return { file: process.execPath, args: [join(dirname(manifest), bin)] }
}

/** The CLI's environment: the configuration and the subject both come from the checkout. */
export function contractApiEnv(root: string): NodeJS.ProcessEnv {
  return { ...repositoryEnv(process.env), OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: root }
}

/**
 * Runs `omne-contract-api` with `args` on the checkout `root`. Each failure has its own reason:
 * timeout, process error with its error code, exit code with standard error.
 */
export function runContractApi(
  command: ContractApiCommand,
  args: readonly string[],
  { root, timeoutMs }: { root: string; timeoutMs: number },
): { kind: 'ran'; stdout: string } | Unavailable {
  const result = spawnSync(command.file, [...command.args, ...args, '--root', root], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: contractApiEnv(root),
  })
  if (result.error !== undefined) {
    const code = 'code' in result.error ? result.error.code : undefined
    return code === 'ETIMEDOUT'
      ? {
          kind: 'unavailable',
          reason: `${CONTRACT_API_BIN} 在 ${timeoutMs} 毫秒内没有结束，已终止。`,
        }
      : {
          kind: 'unavailable',
          reason: `${CONTRACT_API_BIN} 进程出错（${typeof code === 'string' ? code : '无错误码'}）：${result.error.message}`,
        }
  }
  const stderr = (result.stderr ?? '').trim()
  if (result.status !== 0)
    return {
      kind: 'unavailable',
      reason: `${CONTRACT_API_BIN} 退出码 ${result.status ?? `null（信号 ${result.signal ?? '未知'}）`}${stderr === '' ? '' : `：${stderr}`}`,
    }
  return { kind: 'ran', stdout: result.stdout }
}
/** Runs `omne-contract-api --diff <base> --json` on the working tree of `root`. */
export function runDiff(
  command: ContractApiCommand,
  { root, base, timeoutMs }: { root: string; base: string; timeoutMs: number },
): { kind: 'ran'; stdout: string } | Unavailable {
  return runContractApi(command, ['--diff', base, '--json'], { root, timeoutMs })
}

/**
 * Runs `step`. A known failure (`IntegrationError`, which includes `GitError`) becomes
 * `unavailable` with the reason `describe` gives; any other error propagates.
 */
function unavailableOnKnown<T>(
  step: () => T,
  describe: (error: IntegrationError) => string,
): T | Unavailable {
  try {
    return step()
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
    return { kind: 'unavailable', reason: describe(error) }
  }
}
function isUnavailable(value: object): value is Unavailable {
  return 'kind' in value && value.kind === 'unavailable'
}

/**
 * The contract snapshot difference from the pinned `omne-contract-api --diff`. The CLI compares
 * the base commit with the working tree and reads more of the checkout than the snapshots, so it
 * runs only when the checkout's HEAD is the range head and the working tree has no uncommitted
 * changes or untracked files (ignored files do not count). Anything it cannot establish is
 * `unavailable` with the reason; an unknown member is never reported as no change.
 */
export const snapshotContractDiff: ContractDiffProvider = snapshotContractDiffWith(() => {})
/**
 * `snapshotContractDiff` that also hands the exact standard output of the CLI run to `onRaw`.
 * The semantic review hashes the raw member objects of that same run.
 */
export function snapshotContractDiffWith(onRaw: (stdout: string) => void): ContractDiffProvider {
  return ({ root, timeoutMs }) =>
    range => {
      const checkout = unavailableOnKnown(
        () => clean(root),
        error =>
          error.code === 'refused'
            ? `检出 ${root} 有未提交改动或未跟踪文件；快照差异读工作树，未运行。`
            : `读不出检出 ${root} 的 Git 状态：${error.message}`,
      )
      if (isUnavailable(checkout)) return checkout
      if (checkout.head !== range.head)
        return {
          kind: 'unavailable',
          reason: `检出 ${root} 的 HEAD 为 ${checkout.head}，不是范围头 ${range.head}；快照差异读工作树，未运行。`,
        }
      const command = contractApiCommand()
      if (isUnavailable(command)) return command
      const ran = runDiff(command, { root, base: range.base, timeoutMs })
      if (ran.kind === 'unavailable') return ran
      onRaw(ran.stdout)
      return unavailableOnKnown(
        () => contractDiffOf(range, parseDiffRun(ran.stdout)),
        error => `${CONTRACT_API_BIN} 的输出解析失败：${error.message}`,
      )
    }
}

/**
 * The raw member objects of one `omne-contract-api --diff --json` stdout, by directory, with
 * every field the CLI printed. The semantic review hashes them; `parseDiffRun` keeps only the
 * fields this module reads.
 */
export function rawDiffMembers(text: string): Map<string, unknown> {
  const v = object(json(text, `${CONTRACT_API_BIN} --diff --json`), 'diff')
  return new Map(
    array(v.members, 'diff.members').map((item, index) => [
      string(object(item, `diff.members[${index}]`).directory, `diff.members[${index}].directory`),
      item,
    ]),
  )
}

/** The pinned toolchain version and the TypeScript version it resolves, or why neither is known. */
export function toolchainFacts():
  | { kind: 'known'; version: string; typescriptVersion: string }
  | Unavailable {
  const manifest = toolchainManifest()
  if (manifest === undefined)
    return {
      kind: 'unavailable',
      reason: `dev-flow 解析不到 ${TOOLCHAIN_PACKAGE}。`,
    }
  const versionOf = (file: string) =>
    string(object(json(readFileSync(file, 'utf8'), file), file).version, `${file} version`)
  const typescript = (() => {
    for (const base of [manifest, import.meta.url]) {
      try {
        const found = findPackageJSON('@typescript/typescript6', base)
        if (found !== undefined) return found
      } catch {
        // Try the next resolution base.
      }
    }
    return undefined
  })()
  if (typescript === undefined)
    return { kind: 'unavailable', reason: '解析不到 @typescript/typescript6。' }
  return unavailableOnKnown(
    () => ({
      kind: 'known' as const,
      version: versionOf(manifest),
      typescriptVersion: versionOf(typescript),
    }),
    error => `读不出工具链版本：${error.message}`,
  )
}

const TOOL_VERSION = '0.0.18'
const LOCK_PATH = 'pnpm-lock.yaml'
/**
 * The tool block of a Comparison, the same for the card, RI and milestone scopes: the installed
 * toolchain must be the version the review path needs, and the lock file is read at `commit`.
 */
export function toolOf(
  root: string,
  commit: string,
  facts: ReturnType<typeof toolchainFacts> = toolchainFacts(),
): Comparison['tool'] {
  if (facts.kind === 'unavailable') throw new IntegrationError('unknown', facts.reason)
  if (facts.version !== TOOL_VERSION)
    throw new IntegrationError(
      'unknown',
      `repo-toolchain ${facts.version} is installed; the review path needs ${TOOL_VERSION}`,
    )
  return {
    packageName: '@omne-harness/repo-toolchain',
    version: TOOL_VERSION,
    typescriptVersion: facts.typescriptVersion,
    lockSha256: createHash('sha256')
      .update(exactTextBlob(root, commit, LOCK_PATH).text, 'utf8')
      .digest('hex'),
  }
}

/** One side of a Comparison: the member tree, its package name and every `*.api.md` snapshot. */
export function sideOf(root: string, commit: string, member: string): ApiSide {
  const apiTree = git(root, ['rev-parse', `${commit}:${member}/api`])
  const snapshots = git(root, ['ls-tree', '-r', '--name-only', commit, '--', `${member}/api`])
    .split('\n')
    .filter(path => path.endsWith('.api.md'))
    .sort()
    .map(path => ({ path, sha256: sha256Of(exactTextBlob(root, commit, path).text) }))
  const manifest = json(exactTextBlob(root, commit, `${member}/package.json`).text, member)
  return {
    commit,
    apiTree,
    packageName: text(record(manifest, `${member}/package.json`).name, `${member} package name`),
    snapshots,
  }
}
const sha256Of = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
