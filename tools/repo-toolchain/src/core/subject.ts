import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { git } from './git.ts'

type Env = Readonly<Record<string, string | undefined>>

export function subjectRoot(env: Env = process.env, cwd: string = process.cwd()): string {
  const given = env['OMNE_SUBJECT_ROOT']
  if (given !== undefined && given !== '') return resolve(given)
  return realpathSync(git(cwd, ['rev-parse', '--show-toplevel']))
}

export function runnerRoot(env: Env = process.env, cwd: string = process.cwd()): string {
  const given = env['OMNE_RUNNER_ROOT']
  return given !== undefined && given !== '' ? resolve(given) : subjectRoot(env, cwd)
}

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
