// turbo 承担成员选择（`--affected`）与构建的编排。类型检查不依赖构建，仍由 typecheck-member.ts 逐成员跑
// （它把成员里嵌套的归档目录排除在外）。这里固定它的运行条件，
// 落实 RFC-0002 的四条约束中归 turbo 的那几条：
// 1. 选择规则不能由 PR 改写：根配置用运行检查器仓库的 turbo.json（TURBO_ROOT_TURBO_JSON）；
//    成员目录下的 turbo.json 会盖过它，所以一律拒绝。
// 2. 基线显式传入：TURBO_SCM_BASE 由调用方给出（合并点），准入另给 TURBO_SCM_HEAD。
// 4. 准入不读 PR 能写入的缓存：准入模式只写不读本地缓存。
// 第 3 条「未识别文件按全量处理」turbo 不提供，由 scope.ts 判。
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

const RUNNER = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const TURBO_CONFIG = join(RUNNER, 'turbo.json')
const TURBO_BIN = join(RUNNER, 'node_modules', '.bin', 'turbo')

/** 环境变量 `OMNE_ADMISSION=1`：准入模式，本地缓存只写不读。 */
export function admissionRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env['OMNE_ADMISSION']
  if (value === undefined || value === '') return false
  if (value === '1') return true
  throw new Error(`环境变量 OMNE_ADMISSION 只能是 1 或不设，现在是 ${value}`)
}

/** 不上报遥测、不起常驻进程、不提示升级；根配置固定为运行检查器仓库的那份。 */
function turboEnv(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TURBO_ROOT_TURBO_JSON: TURBO_CONFIG,
    TURBO_TELEMETRY_DISABLED: '1',
    TURBO_DAEMON: 'false',
    TURBO_NO_UPDATE_NOTIFIER: '1',
    ...extra,
  }
}

/** 成员目录下的 turbo.json 会盖过根配置里的任务定义，被检查的检出就能改写选择与执行；有就拒绝。 */
export function rejectMemberTurboConfigs(root: string, members: readonly WorkspaceMember[]): void {
  const found = members
    .filter(member => existsSync(join(root, member.path, 'turbo.json')))
    .map(member => `${member.path}/turbo.json`)
  if (found.length > 0)
    throw new Error(
      `只允许仓库根目录有 turbo.json，成员目录下的会改写任务定义：${found.join('、')}`,
    )
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
  rejectMemberTurboConfigs(root, members)
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
