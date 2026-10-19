// 差分变异入口：只变异基线以来改动碰到的产品源码行（或点名成员的全部产品源码），逐成员跑 Stryker 的快层，
// 列出存活与无覆盖的变异体，读数写进主检出的 `tmp/mutation-ledger/`。
// 只报告（负责人 2026-10-02 定）：变异体存活不影响退出码；Stryker 起不来、初跑失败、没写出报告才退出非零。
import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { changedLines, coordinates, type Coordinates } from '@omne-harness/repo-toolchain/core/git'
import { listTestMembers } from '@omne-harness/repo-toolchain/core/workspace'
import { effectiveParallelism, readTestRunsConfig } from '../testing/config.ts'
import { buildTargets, parseFlags, timestamp } from '../testing/support.ts'
import { memberLines, summarizeMember, type MemberMutation, type MutationReport } from './report.ts'
import {
  changedTargets,
  memberTargets,
  mutateEntries,
  MUTATION_ROOTS,
  type MutationTarget,
} from './scope.ts'
import { runStryker } from './stryker.ts'

const USAGE = [
  '用法：',
  '  run (--base <ref> | --members <成员目录,…>) [--plan-only] [--root <检出根>] [--out <目录>]',
  '      --base 变异基线合并点到工作树（含未提交、未跟踪）改动碰到的 workspace 产品成员 src/ 下的源码行',
  '      --members 变异点名成员 src/ 下的全部源码（逗号分隔的仓库相对目录）',
].join('\n')

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const LEDGER_HOME_ENV = 'OMNE_MUTATION_LEDGER_HOME'

interface MutationRequest {
  readonly root: string
  readonly base: string | undefined
  readonly members: readonly string[] | undefined
  readonly planOnly: boolean
  readonly out: string | undefined
}

function parseRun(argv: readonly string[]): MutationRequest {
  const flags = parseFlags(
    argv,
    ['--base', '--members', '--root', '--out'],
    ['--plan-only', '--default-base'],
    USAGE,
  )
  const root = resolve(
    flags.values.get('--root') ?? process.env['OMNE_SUBJECT_ROOT'] ?? DEFAULT_ROOT,
  )
  const resolved = baselines(root, flags.values.get('--base'))
  const members = flags.values.get('--members')
  const base =
    members === undefined
      ? (resolved.targetBase ?? (flags.switches.has('--default-base') ? 'main' : undefined))
      : undefined
  if (base === undefined && members === undefined)
    throw new Error(`--base 与 --members 二选一\n${USAGE}`)
  if (flags.values.has('--base') && members !== undefined)
    throw new Error(`--base 与 --members 二选一\n${USAGE}`)
  return {
    root,
    base,
    members: members
      ?.split(',')
      .map(path => path.trim().replace(/\/+$/u, ''))
      .filter(path => path !== ''),
    planOnly: flags.switches.has('--plan-only'),
    out: flags.values.get('--out'),
  }
}

function targetsOf(request: MutationRequest, at: Coordinates): MutationTarget[] {
  const config = readTestRunsConfig()
  const members = listTestMembers(request.root, config.affected.excludeRoots)
  if (request.members === undefined)
    return changedTargets(changedLines(request.root, at.base?.mergeBase ?? 'HEAD'), members)
  const named = request.members.map(path => {
    const member = members.find(candidate => candidate.path === path)
    if (member === undefined) throw new Error(`${path} 不是带测试的 workspace 成员\n${USAGE}`)
    if (!MUTATION_ROOTS.some(root => path.startsWith(`${root}/`)))
      throw new Error(`${path} 不在 ${MUTATION_ROOTS.join('、')} 下：只变异产品源码\n${USAGE}`)
    return member
  })
  return memberTargets(request.root, named)
}

function ledgerDir(request: MutationRequest, at: Coordinates): string {
  if (request.out !== undefined) return resolve(request.out)
  const home = process.env[LEDGER_HOME_ENV]
  const base =
    home === undefined || home === '' ? join(at.mainRoot, 'tmp', 'mutation-ledger') : home
  return join(base, `${at.shortHead}${at.dirty ? '-dirty' : ''}`, timestamp(new Date()))
}

function readMutationReport(path: string): MutationReport | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MutationReport
  } catch {
    return undefined
  }
}

async function run(request: MutationRequest): Promise<number> {
  const at = coordinates(request.root, request.base)
  const targets = targetsOf(request, at)
  if (targets.length === 0) {
    console.log(
      request.base === undefined
        ? '没有可变异的改动：点名成员的 src/ 下没有源码'
        : `没有可变异的改动：基线 ${request.base} 以来，${MUTATION_ROOTS.join('、')} 下成员的 src/ 里没有改动的源码`,
    )
    return 0
  }
  const scope =
    request.base === undefined
      ? `点名成员的全部产品源码`
      : `基线 ${request.base}（合并点 ${at.base?.mergeBase.slice(0, 9)}）以来改动碰到的产品源码行`
  console.log(`变异范围：${scope}；只跑快层（vitest 的 mode 为 fast）`)
  for (const target of targets)
    console.log(
      `  ${target.member.path}：${target.lines.size} 个文件，${mutateEntries(target).length} 段`,
    )
  if (request.planOnly) return 0

  const runDir = ledgerDir(request, at)
  mkdirSync(runDir, { recursive: true })
  if (
    !buildTargets(
      request.root,
      targets.map(target => target.member),
      runDir,
    )
  )
    return 1
  const config = readTestRunsConfig()
  const strykerRun = {
    root: request.root,
    runDir,
    concurrency: effectiveParallelism(config, process.env).vitestMaxWorkers,
    testTimeoutSeconds: config.mutation.testTimeoutSeconds,
    nonce: `${process.pid}`,
  }
  const results: MemberMutation[] = []
  const errors: string[] = []
  for (const [index, target] of targets.entries()) {
    const ran = await runStryker(target, strykerRun)
    const report = readMutationReport(ran.reportPath)
    const label = `[${index + 1}/${targets.length}] ${target.member.path} ${Math.round(ran.wallSeconds)} 秒`
    if (ran.exitCode !== 0 || report === undefined) {
      errors.push(
        `${target.member.path}：Stryker 退出码 ${ran.exitCode}${report === undefined ? '，没有写出报告' : ''}，日志 ${ran.logPath}`,
      )
      console.log(`${label}，出错`)
      continue
    }
    const result = summarizeMember(target, report)
    results.push(result)
    console.log(`${label}，存活 ${result.counts.Survived}、无覆盖 ${result.counts.NoCoverage}`)
  }

  const summary = [
    `变异范围：${scope}；只跑快层（vitest 的 mode 为 fast）；提交 ${at.shortHead}${at.dirty ? '（工作树有未提交改动）' : ''}`,
    ...results.flatMap(result => memberLines(result, true)),
    ...errors.map(error => `出错 ${error}`),
    '存活、无覆盖只是线索：判定会抖，要复跑确认；static 变异体只能跑全部测试；没改的代码不在范围内。',
    `账本与各成员日志：${runDir}`,
  ]
  writeFileSync(
    join(runDir, 'summary.json'),
    `${JSON.stringify({ head: at.head, dirty: at.dirty, base: at.base ?? null, members: results, errors }, null, 1)}\n`,
  )
  writeFileSync(join(runDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return errors.length === 0 ? 0 : 1
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv
  if (command !== 'run') throw new Error(USAGE)
  return run(parseRun(rest))
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
