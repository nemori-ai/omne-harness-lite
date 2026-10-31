// 被检查的仓库与运行检查器的仓库。两者不同时（OMNE_RUNNER_ROOT），规则与配置只从运行检查器的仓库读，
// 被检查的检出改不了它们；两者相同时，规则与配置的可信由仓库工具链变更闸门保证。
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { git } from './git.ts'

type Env = Readonly<Record<string, string | undefined>>

/** OMNE_SUBJECT_ROOT，没有就取 `cwd` 所在 Git 仓库的根。 */
export function subjectRoot(env: Env = process.env, cwd: string = process.cwd()): string {
  const given = env['OMNE_SUBJECT_ROOT']
  if (given !== undefined && given !== '') return resolve(given)
  return realpathSync(git(cwd, ['rev-parse', '--show-toplevel']))
}

/** OMNE_RUNNER_ROOT，没有就与被检查的仓库相同。 */
export function runnerRoot(env: Env = process.env, cwd: string = process.cwd()): string {
  const given = env['OMNE_RUNNER_ROOT']
  return given !== undefined && given !== '' ? resolve(given) : subjectRoot(env, cwd)
}

/** 两个根解析符号链接后是不是同一个目录；其中一个不存在时按绝对路径比。 */
export function sameTree(first: string, second: string): boolean {
  const real = (path: string) => {
    try {
      return realpathSync(path)
    } catch {
      return resolve(path)
    }
  }
  return real(first) === real(second)
}

/** 被检查的仓库就是运行检查器的仓库自己。runner 登记的东西是否过期，只有这时才能对照被检树判断。 */
export function subjectIsRunner(subject: string, env: Env = process.env): boolean {
  return sameTree(subject, runnerRoot(env))
}
