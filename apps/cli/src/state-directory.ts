import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface StateDirectoryInput {
  readonly flag: string | undefined
  readonly environment: string | undefined
  readonly home: string | undefined
}

export type StateDirectorySource = 'flag' | 'environment' | 'default'

export type StateDirectoryResolution =
  | { readonly kind: 'resolved'; readonly path: string; readonly source: StateDirectorySource }
  | { readonly kind: 'error'; readonly message: string }

export type StateDirectoryReadiness =
  | { readonly kind: 'ready'; readonly path: string }
  | { readonly kind: 'error'; readonly message: string }

export function resolveStateDirectory(input: StateDirectoryInput): StateDirectoryResolution {
  const flag = input.flag?.trim()
  if (flag) return { kind: 'resolved', path: flag, source: 'flag' }
  if (input.environment !== undefined) {
    const environment = input.environment.trim()
    if (environment === '') return { kind: 'error', message: 'omne: OMNE_HOME is empty\n' }
    return { kind: 'resolved', path: environment, source: 'environment' }
  }
  if (input.home) return { kind: 'resolved', path: join(input.home, '.omne'), source: 'default' }
  return { kind: 'error', message: 'omne: no home directory for the default state path\n' }
}

export function ensureStateDirectory(path: string): StateDirectoryReadiness {
  try {
    mkdirSync(path, { recursive: true })
    return { kind: 'ready', path }
  } catch (error) {
    const code = errorCode(error)
    if (code === 'EEXIST')
      return { kind: 'error', message: `omne: state directory ${path} is not a directory\n` }
    const reason = code === undefined ? '' : `: ${code}`
    return { kind: 'error', message: `omne: cannot create state directory ${path}${reason}\n` }
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}
