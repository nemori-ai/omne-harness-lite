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
