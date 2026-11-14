import { git } from '../core/git.ts'

export function toolRoot(env: NodeJS.ProcessEnv, scriptDirectory: string): string | undefined {
  const runner = env['OMNE_RUNNER_ROOT']
  if (runner !== undefined && runner !== '') return undefined
  try {
    return git(scriptDirectory, ['rev-parse', '--show-toplevel'])
  } catch {
    return undefined
  }
}
