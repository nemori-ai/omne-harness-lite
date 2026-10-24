import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { git, lines } from './git.ts'
import { array, choice, IntegrationError, json, object, sha, string } from './parse.ts'
import type { ContractDiff, DiffContracts, SnapshotChange } from './ri-notes.ts'

/** The repo-toolchain configuration file that `omne-contract-api` reads at the checkout root. */
const TOOLCHAIN_CONFIG = 'repo-toolchain.config.json'
const TOOLCHAIN_PACKAGE = '@omne-harness/repo-toolchain'
const CONTRACT_API_BIN = 'omne-contract-api'
const CHANGES = ['none', 'additive', 'review'] as const satisfies readonly SnapshotChange[]
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

type Difference = {
  scope: (typeof DIFFERENCE_SCOPES)[number]
  kind: (typeof DIFFERENCE_KINDS)[number]
}
/** One member of the CLI's diff result, reduced to the fields this provider reads. */
type DiffMember =
  | {
      status: 'compared'
      directory: string
      before: string | undefined
      after: string | undefined
      change: SnapshotChange
      differences: Difference[]
    }
  | { status: 'invalid'; directory: string; message: string }
type DiffRun = { commit: string; members: DiffMember[] }

/** Where the CLI reads its inputs in the checkout: the configuration, the line table, the snapshots. */
type SnapshotInputs = { members: string; snapshot: string }

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
        change: choice(v.change, CHANGES, `${path}.change`),
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
 * Why a member's classification is unknown, or undefined when it is known. A snapshot missing on
 * either side is unknown: the CLI counts a missing base snapshot as additive, which says nothing
 * about the change. A member that left the line table keeps the CLI's `review`.
 */
function unknownReason(member: DiffMember): string | undefined {
  if (member.status === 'invalid') return `快照读不出：${member.message}`
  const whole = new Set(
    member.differences.filter(item => item.scope === 'snapshot').map(item => item.kind),
  )
  if (whole.has('missing')) return '基线与工作树都没有快照文件'
  if (whole.has('added'))
    return member.before === undefined
      ? '基线上不是契约成员，没有快照'
      : `基线上没有快照文件 ${member.before}`
  if (whole.has('removed') && member.after !== undefined)
    return `工作树没有快照文件 ${member.after}`
  return undefined
}
/** Every member's change, or `unavailable` listing each member whose change is unknown. */
export function contractDiffOf(range: { base: string; head: string }, run: DiffRun): ContractDiff {
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

/** The configured line table and snapshot template of the checkout, as the CLI reads them. */
function snapshotInputs(root: string): SnapshotInputs {
  const path = join(root, TOOLCHAIN_CONFIG)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new IntegrationError(
      'input-error',
      `${TOOLCHAIN_CONFIG} 读不到：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const section = object(
    object(json(text, TOOLCHAIN_CONFIG), TOOLCHAIN_CONFIG).contractApi,
    'contractApi',
  )
  return {
    members: string(section.members, 'contractApi.members'),
    snapshot: string(section.snapshot, 'contractApi.snapshot'),
  }
}
/** The snapshot template as a Git pathspec: a member directory may span several path parts. */
function snapshotPathspec(template: string): string {
  return `:(top,glob)${template.replaceAll('{member}', '**').replaceAll('{package}', '*')}`
}
/** Uncommitted or untracked files among the CLI's inputs, as `git status` short lines. */
function dirtyInputs(root: string, inputs: SnapshotInputs): string[] {
  return lines(
    git(root, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      `:(top,literal)${TOOLCHAIN_CONFIG}`,
      `:(top,literal)${inputs.members}`,
      snapshotPathspec(inputs.snapshot),
    ]),
  )
}

/** The pinned `omne-contract-api` script, resolved from this member's dependency. */
function contractApiBin(): string {
  let manifest: string | undefined, text: string
  try {
    manifest = findPackageJSON(TOOLCHAIN_PACKAGE, import.meta.url)
    text = manifest === undefined ? '' : readFileSync(manifest, 'utf8')
  } catch (error) {
    throw new IntegrationError('unknown', error instanceof Error ? error.message : String(error))
  }
  if (manifest === undefined)
    throw new IntegrationError('unknown', `${TOOLCHAIN_PACKAGE} is not installed for dev-flow`)
  const bin = object(object(json(text, manifest), manifest).bin, 'bin')
  return join(dirname(manifest), string(bin[CONTRACT_API_BIN], `bin.${CONTRACT_API_BIN}`))
}

/** Runs the CLI; each failure has its own reason: timeout, process error, exit code, output. */
function runDiff(
  root: string,
  base: string,
  timeoutMs: number,
): { kind: 'ran'; stdout: string } | { kind: 'failed'; reason: string } {
  let bin: string
  try {
    bin = contractApiBin()
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
    return { kind: 'failed', reason: `找不到 ${CONTRACT_API_BIN}：${error.message}` }
  }
  const result = spawnSync(process.execPath, [bin, '--diff', base, '--json', '--root', root], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    // The configuration and the subject both come from the checkout under report.
    env: { ...repositoryEnv(process.env), OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: root },
  })
  const stderr = result.stderr.trim()
  if (result.error !== undefined) {
    const code = 'code' in result.error ? result.error.code : undefined
    return code === 'ETIMEDOUT'
      ? { kind: 'failed', reason: `${CONTRACT_API_BIN} 在 ${timeoutMs} 毫秒内没有结束，已终止。` }
      : { kind: 'failed', reason: `${CONTRACT_API_BIN} 进程出错：${result.error.message}` }
  }
  if (result.status !== 0)
    return {
      kind: 'failed',
      reason: `${CONTRACT_API_BIN} 退出码 ${result.status ?? `null（信号 ${result.signal ?? '未知'}）`}${stderr === '' ? '' : `：${stderr}`}`,
    }
  return { kind: 'ran', stdout: result.stdout }
}

/**
 * The contract snapshot difference from the pinned `omne-contract-api --diff`. The CLI compares
 * the base commit with the working tree, so it runs only when the checkout's HEAD is the range
 * head and none of its inputs has uncommitted changes. Anything it cannot establish is
 * `unavailable` with the reason; an unknown member is never reported as no change.
 */
export function snapshotContractDiff({
  root,
  timeoutMs,
}: {
  root: string
  timeoutMs: number
}): DiffContracts {
  return range => {
    const head = sha(git(root, ['rev-parse', 'HEAD']), 'HEAD')
    if (head !== range.head)
      return {
        kind: 'unavailable',
        reason: `检出 ${root} 的 HEAD 为 ${head}，不是范围头 ${range.head}；快照差异读工作树，未运行。`,
      }
    let inputs: SnapshotInputs
    try {
      inputs = snapshotInputs(root)
    } catch (error) {
      if (!(error instanceof IntegrationError)) throw error
      return { kind: 'unavailable', reason: `读不出契约快照配置：${error.message}` }
    }
    const dirty = dirtyInputs(root, inputs)
    if (dirty.length > 0)
      return {
        kind: 'unavailable',
        reason: `快照差异的输入有未提交改动，未运行：${dirty.join('；')}`,
      }
    const ran = runDiff(root, range.base, timeoutMs)
    if (ran.kind === 'failed') return { kind: 'unavailable', reason: ran.reason }
    try {
      return contractDiffOf(range, parseDiffRun(ran.stdout))
    } catch (error) {
      if (!(error instanceof IntegrationError)) throw error
      return {
        kind: 'unavailable',
        reason: `${CONTRACT_API_BIN} 的输出解析失败：${error.message}`,
      }
    }
  }
}
