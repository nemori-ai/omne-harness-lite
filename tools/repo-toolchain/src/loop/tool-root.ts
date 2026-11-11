// 收工钩子入口的一个判断：这份脚本所在的检出是不是被检查的那一棵。入口只装配，判断放在这里，进程内可测。
import { git } from '../core/git.ts'

/**
 * 脚本所在目录 `scriptDirectory` 所属检出的根；给了 `OMNE_RUNNER_ROOT`（有意分开检查器与被检仓库）时不比，
 * 取不到时也不比，两种情形都返回 undefined。
 */
export function toolRoot(env: NodeJS.ProcessEnv, scriptDirectory: string): string | undefined {
  const runner = env['OMNE_RUNNER_ROOT']
  if (runner !== undefined && runner !== '') return undefined
  try {
    return git(scriptDirectory, ['rev-parse', '--show-toplevel'])
  } catch {
    return undefined
  }
}
