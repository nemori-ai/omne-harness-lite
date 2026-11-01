import { randomBytes } from 'node:crypto'
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTenantText } from '@omne-harness/sdk'

/** The content of `login.json` in the state directory. `loginProof` exists nowhere else. */
export interface LoginState {
  readonly version: 1
  readonly server: string
  readonly loginIdentifier: string
  readonly issuedAt: string
  readonly tenantId: string
  readonly loginProof: string
}

export type LoginStateRead =
  | { readonly kind: 'state'; readonly state: LoginState }
  | { readonly kind: 'failure'; readonly message: string }

export type LoginStateWrite =
  | { readonly kind: 'written'; readonly path: string }
  | { readonly kind: 'failed'; readonly path: string; readonly code: string | undefined }

const fileName = 'login.json'
const keys = ['version', 'server', 'loginIdentifier', 'issuedAt', 'tenantId', 'loginProof'] as const

export function loginStatePath(directory: string): string {
  return join(directory, fileName)
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/** True when the mode lets the group or any other user read, write, or run the file. */
export function otherUsersCanRead(mode: number): boolean {
  return (mode & 0o077) !== 0
}

/**
 * Writes the file through a temporary file in the same directory and a rename, so a failure
 * leaves the old file as it was. The file is created with mode 0600. On Windows the mode has no
 * effect and the file keeps the access rules of its directory.
 */
export function writeLoginState(directory: string, state: LoginState): LoginStateWrite {
  const path = loginStatePath(directory)
  const temporary = join(directory, `${fileName}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
    return { kind: 'written', path }
  } catch (error) {
    rmSync(temporary, { force: true })
    return { kind: 'failed', path, code: errorCode(error) }
  }
}

function shapeOf(value: unknown): LoginState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || !keys.every(key => key in record))
    return undefined
  if (record['version'] !== 1) return undefined
  const texts = keys.slice(1).map(key => record[key])
  if (!texts.every(text => typeof text === 'string' && text !== '')) return undefined
  if (parseTenantText(record['tenantId'] as string) === undefined) return undefined
  return record as unknown as LoginState
}

export interface LoginStateReadOptions {
  /** Refuse a file that other users can read. The default is on for every platform except Windows. */
  readonly checkPermissions?: boolean
}

/**
 * Reads the login file. A missing file or directory is "not logged in". On POSIX the file must not
 * be readable by group or others. On Windows no permission is checked, because the mode bits there
 * say nothing about the access control list.
 */
export function readLoginState(
  directory: string,
  options: LoginStateReadOptions = {},
): LoginStateRead {
  const path = loginStatePath(directory)
  const check = options.checkPermissions ?? process.platform !== 'win32'
  let content: string
  try {
    if (check && otherUsersCanRead(statSync(path).mode))
      return { kind: 'failure', message: 'omne: login state is readable by other users\n' }
    content = readFileSync(path, 'utf8')
  } catch (error) {
    const code = errorCode(error)
    if (code === 'ENOENT' || code === 'ENOTDIR')
      return { kind: 'failure', message: 'omne: not logged in\nRun omne login first.\n' }
    const reason = code === undefined ? '' : `: ${code}`
    return { kind: 'failure', message: `omne: cannot read login state ${path}${reason}\n` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { kind: 'failure', message: 'omne: login state is invalid\n' }
  }
  const state = shapeOf(parsed)
  return state === undefined
    ? { kind: 'failure', message: 'omne: login state is invalid\n' }
    : { kind: 'state', state }
}
