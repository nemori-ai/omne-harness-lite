import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
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
function turboBinary(): string {
  if (process.platform !== 'win32') return join(RUNNER, 'node_modules', '.bin', 'turbo')
  const require = createRequire(import.meta.url)
  const arch = process.arch === 'x64' ? '64' : process.arch
  return require.resolve(`@turbo/windows-${arch}/bin/turbo.exe`, {
    paths: [dirname(require.resolve('turbo/package.json', { paths: [RUNNER] }))],
  })
}
export const TURBO_BIN = turboBinary()

export function admissionRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['OMNE_ADMISSION']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 OMNE_ADMISSION 只能是 1 或不设，现在是 ${value}`)
}

export function turboEnv(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TURBO_ROOT_TURBO_JSON: TURBO_CONFIG,
    TURBO_TELEMETRY_DISABLED: '1',
    TURBO_NO_UPDATE_NOTIFIER: '1',
    ...extra,
  }
}

function rootTasks(): Record<string, RootTask> {
  const parsed = JSON.parse(readFileSync(TURBO_CONFIG, 'utf8')) as {
    tasks?: Record<string, RootTask>
  }
  return parsed.tasks ?? {}
}

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
  return listedMembers(run, members, '受影响的成员')
}

export function dependentMembers(
  root: string,
  members: readonly WorkspaceMember[],
  paths: readonly string[],
): Set<string> {
  if (paths.length === 0) return new Set()
  const byPath = new Map(members.map(member => [member.path, member.name]))
  const filters = paths.map(path => {
    const name = byPath.get(path)
    if (name === undefined)
      throw new Error(`成员 ${path} 不在 workspace 成员清单里，求不出它的下游`)
    return `--filter=...${name}`
  })
  const run = spawnSync(TURBO_BIN, ['ls', ...filters, '--output=json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: turboEnv({}),
  })
  if (run.error !== undefined) throw run.error
  return listedMembers(run, members, `${paths.join('、')} 的下游`)
}

export interface GraphPackage {
  readonly path: string
  readonly dependencies: readonly string[]
}

export type PackageGraph = ReadonlyMap<string, GraphPackage>

const GRAPH_QUERY = '{ packages { items { name path directDependencies { items { name } } } } }'

export function packageGraph(root: string): PackageGraph {
  const run = spawnSync(TURBO_BIN, ['query', GRAPH_QUERY], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: turboEnv({}),
  })
  if (run.error !== undefined) throw run.error
  const graph = run.status === 0 ? parsePackageGraph(run.stdout) : undefined
  if (graph === undefined)
    throw new Error(`turbo 没有给出包依赖图（退出码 ${run.status}）：${run.stderr.trim()}`)
  return graph
}

export function parsePackageGraph(stdout: string): PackageGraph | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || !isRecord(parsed['data']) || !isRecord(parsed['data']['packages']))
    return undefined
  const items = parsed['data']['packages']['items']
  if (!Array.isArray(items)) return undefined
  const graph = new Map<string, GraphPackage>()
  for (const item of items as unknown[]) {
    if (!isRecord(item) || typeof item['name'] !== 'string' || typeof item['path'] !== 'string')
      return undefined
    const direct = isRecord(item['directDependencies']) ? item['directDependencies']['items'] : []
    if (!Array.isArray(direct)) return undefined
    const dependencies: string[] = []
    for (const dependency of direct as unknown[]) {
      if (!isRecord(dependency) || typeof dependency['name'] !== 'string') return undefined
      if (dependency['name'] !== '//') dependencies.push(dependency['name'])
    }
    if (item['name'] !== '//')
      graph.set(item['name'], { path: item['path'].replaceAll('\\', '/'), dependencies })
  }
  return graph
}

export function listedMembers(
  run: { readonly status: number | null; readonly stdout: string; readonly stderr: string },
  members: readonly WorkspaceMember[],
  what: string,
): Set<string> {
  const names = run.status === 0 ? packageNames(run.stdout) : undefined
  if (names === undefined)
    throw new Error(`turbo 没有给出${what}（退出码 ${run.status}）：${run.stderr.trim()}`)
  const byName = new Map(members.map(member => [member.name, member.path]))
  return new Set(
    names.map(name => {
      const path = byName.get(name)
      if (path === undefined) throw new Error(`turbo 报出的包 ${name} 不在 workspace 成员清单里`)
      return path
    }),
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function packageNames(stdout: string): string[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || !isRecord(parsed['packages'])) return undefined
  const items = parsed['packages']['items']
  if (!Array.isArray(items)) return undefined
  const names: string[] = []
  for (const item of items as unknown[]) {
    if (!isRecord(item) || typeof item['name'] !== 'string') return undefined
    names.push(item['name'])
  }
  return names
}

export function buildArgs(
  names: readonly string[],
  admission: boolean,
  concurrency: number,
): string[] {
  return [
    'run',
    'build',
    ...names.map(name => `--filter=${name}`),
    `--concurrency=${concurrency}`,
    `--cache=${admission ? 'local:w' : 'local:rw'}`,
    '--output-logs=errors-only',
  ]
}

export function turboBuild(
  root: string,
  names: readonly string[],
  admission: boolean,
  concurrency: number,
): number {
  if (names.length === 0) return 0
  const args = buildArgs(names, admission, concurrency)
  console.log(`$ turbo ${args.join(' ')}`)
  const run = spawnSync(TURBO_BIN, args, { cwd: root, stdio: 'inherit', env: turboEnv({}) })
  if (run.error !== undefined) throw run.error
  return run.status ?? 1
}

export function turboBuildCaptured(
  root: string,
  names: readonly string[],
  admission: boolean,
  concurrency: number,
): { readonly status: number; readonly output: string } {
  if (names.length === 0) return { status: 0, output: '' }
  const run = spawnSync(TURBO_BIN, buildArgs(names, admission, concurrency), {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: turboEnv({}),
  })
  if (run.error !== undefined) throw run.error
  return { status: run.status ?? 1, output: `${run.stdout}${run.stderr}` }
}

export function typecheckArgs(
  names: readonly string[],
  admission: boolean,
  concurrency: number,
): string[] {
  return [
    'run',
    'typecheck',
    ...names.map(name => `--filter=${name}`),
    `--concurrency=${concurrency}`,
    `--cache=${admission ? 'local:w' : 'local:rw'}`,
    '--output-logs=errors-only',
  ]
}

export function turboTypecheck(
  root: string,
  names: readonly string[],
  admission: boolean,
  concurrency: number,
): number {
  if (names.length === 0) return 0
  const args = typecheckArgs(names, admission, concurrency)
  console.log(`$ turbo ${args.join(' ')}`)
  const run = spawnSync(TURBO_BIN, args, { cwd: root, stdio: 'inherit', env: turboEnv({}) })
  if (run.error !== undefined) throw run.error
  return run.status ?? 1
}

export const TIER_TASKS = {
  fast: 'test:fast',
  slow: 'test:slow',
  all: 'test',
} as const satisfies Record<RunTier, string>

export const TEST_REPORT_DIR_ENV = 'OMNE_TEST_REPORT_DIR'

export interface TestBuild {
  readonly build: boolean
  readonly admission: boolean
}

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
