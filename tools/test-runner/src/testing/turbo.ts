// turbo 承担成员选择（`--affected`）、构建、类型检查与成员测试的编排。类型检查不依赖构建、不缓存，嵌套归档目录的排除
// 由 typecheck-scope.ts 在运行前核对；测试不缓存，命令在这里拼，运行与拆日志在 run.ts。这里固定它的运行条件，
// 落实 RFC-0002 的四条约束中归 turbo 的那几条：
// 1. 选择规则不能由 PR 改写：根配置用运行检查器仓库的 turbo.json（TURBO_ROOT_TURBO_JSON）；
//    成员目录下的 turbo.json 会盖过它，`apps/*` 之外的一律拒绝，`apps/*` 的按 member-turbo.ts 的规则核对。
// 2. 基线显式传入：TURBO_SCM_BASE 由调用方给出（合并点），准入另给 TURBO_SCM_HEAD。
// 4. 准入不读 PR 能写入的缓存：准入模式只写不读本地缓存。
// 第 3 条「未识别文件按全量处理」turbo 不提供，由 scope.ts 判。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'
import { VITEST_MAX_WORKERS_ENV, type Parallelism, type RunTier } from './config.ts'
import {
  MEMBER_TURBO_ROOT,
  rawProblems,
  resolvedProblems,
  type ResolvedTask,
  type RootTask,
} from './member-turbo.ts'

const RUNNER = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const TURBO_CONFIG = join(RUNNER, 'turbo.json')
export const TURBO_BIN = join(RUNNER, 'node_modules', '.bin', 'turbo')

/** 环境变量 `OMNE_ADMISSION=1`：准入模式，本地缓存只写不读。 */
export function admissionRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['OMNE_ADMISSION']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 OMNE_ADMISSION 只能是 1 或不设，现在是 ${value}`)
}

/** 不上报遥测、不提示升级；根配置固定为运行检查器仓库的那份。 */
export function turboEnv(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TURBO_ROOT_TURBO_JSON: TURBO_CONFIG,
    TURBO_TELEMETRY_DISABLED: '1',
    TURBO_NO_UPDATE_NOTIFIER: '1',
    ...extra,
  }
}

/** 根 turbo.json（运行检查器仓库的那份）里的任务定义。 */
function rootTasks(): Record<string, RootTask> {
  const parsed = JSON.parse(readFileSync(TURBO_CONFIG, 'utf8')) as {
    tasks?: Record<string, RootTask>
  }
  return parsed.tasks ?? {}
}

/** `turbo run … --dry=json` 里一个任务的合成定义；读不出就报错，不当作没有问题。 */
function resolvedTasks(root: string, names: readonly string[], tasks: readonly string[]) {
  const run = spawnSync(
    TURBO_BIN,
    ['run', ...tasks, ...names.map(name => `--filter=${name}`), '--dry=json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: turboEnv({}) },
  )
  if (run.error !== undefined) throw run.error
  try {
    const parsed = JSON.parse(run.stdout) as {
      tasks: { package: string; task: string; resolvedTaskDefinition: ResolvedTask }[]
    }
    return parsed.tasks
  } catch {
    throw new Error(`turbo 没有给出合成后的任务定义（退出码 ${run.status}）：${run.stderr.trim()}`)
  }
}

/**
 * 成员目录下的 turbo.json 会改写根配置里的任务定义。`apps/*` 之外的一律拒绝；`apps/*` 的按 member-turbo.ts 的
 * 七条规则核对原文与 turbo 合成后的定义（与准入相同的根配置，在被检查的检出上运行）。有问题就一次报出全部。
 */
export function checkMemberTurboConfigs(
  root: string,
  members: readonly { readonly path: string; readonly name: string }[],
): void {
  const found = members.filter(member => existsSync(join(root, member.path, 'turbo.json')))
  if (found.length === 0) return
  const problems = found
    .filter(member => !member.path.startsWith(MEMBER_TURBO_ROOT))
    .map(
      member => `${member.path}/turbo.json：只有 ${MEMBER_TURBO_ROOT}* 下的成员可以有 turbo.json`,
    )
  const apps = found.filter(member => member.path.startsWith(MEMBER_TURBO_ROOT))
  if (apps.length > 0) {
    const tasks = rootTasks()
    for (const member of apps) {
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(join(root, member.path, 'turbo.json'), 'utf8'))
      } catch {
        raw = undefined
      }
      problems.push(
        ...rawProblems(raw, tasks).map(problem => `${member.path}/turbo.json：${problem}`),
      )
    }
    if (problems.length === 0) {
      const byName = new Map(apps.map(member => [member.name, member.path]))
      const testTasks = Object.values(TIER_TASKS)
      for (const entry of resolvedTasks(root, [...byName.keys()], Object.keys(tasks))) {
        const path = byName.get(entry.package)
        const definition = tasks[entry.task]
        if (path === undefined || definition === undefined) continue
        problems.push(
          ...resolvedProblems(entry.task, entry.resolvedTaskDefinition, definition, testTasks).map(
            problem => `${path}/turbo.json：${problem}`,
          ),
        )
      }
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'))
}

/**
 * turbo 判为受影响的成员：基线以来改了文件的成员，连同依赖它们的全部成员。`head` 缺省时比到工作树
 * （含未提交与未跟踪的改动）。返回成员目录；turbo 报出的包不在成员清单里就报错。
 */
export function affectedMembers(
  root: string,
  members: readonly WorkspaceMember[],
  base: string,
  head?: string,
): Set<string> {
  checkMemberTurboConfigs(root, members)
  const run = spawnSync(TURBO_BIN, ['ls', '--affected', '--output=json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: turboEnv({
      TURBO_SCM_BASE: base,
      ...(head === undefined ? {} : { TURBO_SCM_HEAD: head }),
    }),
  })
  if (run.error !== undefined) throw run.error
  let names: string[]
  try {
    const parsed = JSON.parse(run.stdout) as { packages: { items: { name: string }[] } }
    names = parsed.packages.items.map(item => item.name)
  } catch {
    throw new Error(`turbo 没有给出受影响的成员（退出码 ${run.status}）：${run.stderr.trim()}`)
  }
  const byName = new Map(members.map(member => [member.name, member.path]))
  return new Set(
    names.map(name => {
      const path = byName.get(name)
      if (path === undefined) throw new Error(`turbo 报出的包 ${name} 不在 workspace 成员清单里`)
      return path
    }),
  )
}

function buildArgs(names: readonly string[], admission: boolean): string[] {
  return [
    'run',
    'build',
    ...names.map(name => `--filter=${name}`),
    `--cache=${admission ? 'local:w' : 'local:rw'}`,
    '--output-logs=errors-only',
  ]
}

/**
 * 用 turbo 构建一批成员；turbo 按依赖先构建上游。准入模式本地缓存只写不读。
 * 返回退出码；没有成员时不跑、返回 0。
 */
export function turboBuild(root: string, names: readonly string[], admission: boolean): number {
  if (names.length === 0) return 0
  const args = buildArgs(names, admission)
  console.log(`$ turbo ${args.join(' ')}`)
  const run = spawnSync(TURBO_BIN, args, { cwd: root, stdio: 'inherit', env: turboEnv({}) })
  if (run.error !== undefined) throw run.error
  return run.status ?? 1
}

/** 同 turboBuild，但把输出收下来交给调用方写日志。 */
export function turboBuildCaptured(
  root: string,
  names: readonly string[],
  admission: boolean,
): { readonly status: number; readonly output: string } {
  if (names.length === 0) return { status: 0, output: '' }
  const run = spawnSync(TURBO_BIN, buildArgs(names, admission), {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: turboEnv({}),
  })
  if (run.error !== undefined) throw run.error
  return { status: run.status ?? 1, output: `${run.stdout}${run.stderr}` }
}

/** 类型检查同时运行的成员数，与改由 turbo 调度之前 `pnpm -r` 的缺省并发相同。 */
const TYPECHECK_CONCURRENCY = 4

/** 用 turbo 跑一批成员的 `typecheck` 脚本；不先构建，不缓存（见 turbo.json）。没有成员时不跑、返回 0。 */
export function turboTypecheck(root: string, names: readonly string[]): number {
  if (names.length === 0) return 0
  const args = [
    'run',
    'typecheck',
    ...names.map(name => `--filter=${name}`),
    `--concurrency=${TYPECHECK_CONCURRENCY}`,
    '--output-logs=errors-only',
  ]
  console.log(`$ turbo ${args.join(' ')}`)
  const run = spawnSync(TURBO_BIN, args, { cwd: root, stdio: 'inherit', env: turboEnv({}) })
  if (run.error !== undefined) throw run.error
  return run.status ?? 1
}

/** 每一层对应的 turbo 任务，也是成员脚本的名字；层由脚本给 vitest 的 `--mode` 选（见仓库根 `vitest.tiers.mts`）。 */
export const TIER_TASKS = {
  fast: 'test:fast',
  slow: 'test:slow',
  all: 'test',
} as const satisfies Record<RunTier, string>

/** 环境变量：成员的 vitest 把 JSON 报告与计时报告写进这个目录（见仓库根 `vitest.tiers.mts`）。 */
export const TEST_REPORT_DIR_ENV = 'OMNE_TEST_REPORT_DIR'

/** 测试前要不要由 turbo 构建：`build` 为 false 时调用方已经构建过，只跑测试任务本身（`--only`）。 */
export interface TestBuild {
  readonly build: boolean
  /** 准入模式：构建的本地缓存只写不读。 */
  readonly admission: boolean
}

/**
 * 用 turbo 跑一批成员某一层测试的命令；一个成员失败不拦其余的。要构建时 turbo 按任务的 `dependsOn` 先构建成员及其上游，
 * 不构建时带 `--only`（准入检查里构建一步已经按计划构建，准入模式下缓存只写不读，不带它就会再构建一遍）。
 * 输出按成员成组、每行带 `<包名>:<任务>: ` 前缀，供拆成各成员的日志；运行摘要给出各成员的退出码与起止时间。
 */
export function turboTestCommand(
  names: readonly string[],
  tier: RunTier,
  parallel: Parallelism,
  reportDirectory: string,
  build: TestBuild,
): { readonly args: string[]; readonly env: NodeJS.ProcessEnv } {
  return {
    args: [
      'run',
      TIER_TASKS[tier],
      ...names.map(name => `--filter=${name}`),
      ...(build.build ? [`--cache=${build.admission ? 'local:w' : 'local:rw'}`] : ['--only']),
      '--continue=dependencies-successful',
      `--concurrency=${parallel.memberConcurrency}`,
      '--summarize',
      '--log-order=grouped',
      '--log-prefix=task',
      '--output-logs=full',
      '--no-color',
    ],
    env: turboEnv({
      [TEST_REPORT_DIR_ENV]: reportDirectory,
      [VITEST_MAX_WORKERS_ENV]: String(parallel.vitestMaxWorkers),
    }),
  }
}
