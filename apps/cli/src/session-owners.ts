import { randomBytes } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTenantText } from '@omne-harness/sdk'

/**
 * The content of `sessions.json` in the state directory: for each session this CLI created, the
 * tenant that owns it. The owner of a session is fixed when it is created, and the session id is a
 * hash that does not show it, so the client keeps the pair. Nothing else is stored.
 */
export interface SessionOwners {
  readonly version: 1
  readonly sessions: Readonly<Record<string, string>>
}

export type SessionOwnersRead =
  | { readonly kind: 'owners'; readonly owners: ReadonlyMap<string, string> }
  | { readonly kind: 'failure'; readonly message: string }

export type SessionOwnersWrite =
  | { readonly kind: 'written'; readonly path: string }
  | { readonly kind: 'failed'; readonly path: string; readonly code: string | undefined }

const fileName = 'sessions.json'

export function sessionOwnersPath(directory: string): string {
  return join(directory, fileName)
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function shapeOf(value: unknown): Map<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2 || record['version'] !== 1) return undefined
  const sessions = record['sessions']
  if (typeof sessions !== 'object' || sessions === null || Array.isArray(sessions)) return undefined
  const owners = new Map<string, string>()
  for (const [session, tenant] of Object.entries(sessions)) {
    if (session === '' || typeof tenant !== 'string' || parseTenantText(tenant) === undefined)
      return undefined
    owners.set(session, tenant)
  }
  return owners
}

/**
 * Reads the records. A missing file is an empty record: no session has been created yet. A file
 * that cannot be read or has an unexpected shape is a failure, never an empty record, so a damaged
 * file cannot make a known session look unknown.
 */
export function readSessionOwners(directory: string): SessionOwnersRead {
  const path = sessionOwnersPath(directory)
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch (error) {
    const code = errorCode(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'owners', owners: new Map() }
    const reason = code === undefined ? '' : `: ${code}`
    return { kind: 'failure', message: `omne: cannot read session records ${path}${reason}\n` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { kind: 'failure', message: `omne: session records ${path} are invalid\n` }
  }
  const owners = shapeOf(parsed)
  return owners === undefined
    ? { kind: 'failure', message: `omne: session records ${path} are invalid\n` }
    : { kind: 'owners', owners }
}

/**
 * Writes the records through a temporary file in the same directory and a rename, so a failure
 * leaves the old file as it was. The file is created with mode 0600. On Windows the mode has no
 * effect and the file keeps the access rules of its directory.
 */
export function writeSessionOwners(
  directory: string,
  owners: ReadonlyMap<string, string>,
): SessionOwnersWrite {
  const path = sessionOwnersPath(directory)
  const temporary = join(directory, `${fileName}.${randomBytes(6).toString('hex')}.tmp`)
  const content: SessionOwners = { version: 1, sessions: Object.fromEntries(owners) }
  try {
    writeFileSync(temporary, `${JSON.stringify(content)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
    return { kind: 'written', path }
  } catch (error) {
    rmSync(temporary, { force: true })
    return { kind: 'failed', path, code: errorCode(error) }
  }
}
