// Building a vault on a host: the path rule (below the real user directory, nothing on the path),
// the secret read through an injected reader, the permission guard that keeps what is created
// private to the user, and the read-back that confirms the file holds the secret under the key.
// The result carries a closed set of reason codes and nothing else: no message, no cause, no path
// of a failed step. The secret is only ever a local value between the reader and the file.
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseSecretText, type SecretBindingKey, type SecretText } from '@omne-harness/settings'
import type { Instant } from '@omne-harness/utc-instant'
import { SecretInputError, type SecretInputFailure } from './input.ts'
import {
  createSecretVault,
  openSecretVault,
  type CreateSecretVaultOptions,
  type CreateSecretVaultResult,
} from './store.ts'

/** Why a read secret was refused: the reader gave up, or the text does not pass `parseSecretText`. */
export type SecretReadFailure =
  | SecretInputFailure
  /** The secret is empty once the whitespace around it is removed. */
  | 'secret-empty'
  /** The secret holds a control character. */
  | 'secret-malformed'
  /** The secret is longer than `SECRET_TEXT_MAX_LENGTH`. */
  | 'secret-too-long'

export type SecretVaultInitFailure =
  | SecretReadFailure
  /** The path is empty or holds a NUL character. */
  | 'path-invalid'
  /** The path does not lie below the real user directory. */
  | 'path-outside-home'
  /** The path or one of its parents cannot be examined, or a parent is not a directory. */
  | 'path-check-failed'
  /** Anything at all is on the path: a vault, a damaged or empty file, a directory, a link. */
  | 'path-occupied'
  /** The file lock was not free within the lock wait. */
  | 'lock-timeout'
  /** The vault or a new directory could not be written. */
  | 'write-failed'
  /** The vault returned, but the file does not hold this secret under the key. Nothing is deleted. */
  | 'write-unconfirmed'
  /** The modes could not be narrowed or read back. What was built is removed. */
  | 'permission-failed'

export type SecretVaultInitResult =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; reason: SecretVaultInitFailure }>

export type EntryKind = 'file' | 'directory'

/**
 * How what is created is made private to the current user. `confine` runs the creation so that
 * nothing is born wider than needed, `narrow` closes an entry, and `verify` throws unless the entry
 * reads back as private.
 */
export type PermissionGuard = Readonly<{
  confine<T>(create: () => T): T
  narrow(path: string, kind: EntryKind): void
  verify(path: string, kind: EntryKind): void
}>

export type SecretVaultInitDeps = Readonly<{
  /** Supplies the secret. It is called once, only after the path is known to be free. */
  readSecret: () => string | Promise<string>
  /** The binding the new vault starts with. */
  key: SecretBindingKey
  /** The time of that binding. Default: none. */
  configuredAt?: Instant | null
  /** The user directory; the path must lie below its real path. Default: `os.homedir()`. */
  home?: () => string
  /** Builds the vault. Default: `createSecretVault`, so the file lock and the atomic publish apply. */
  create?: (options: CreateSecretVaultOptions) => CreateSecretVaultResult
  /** Default: mode bits on POSIX, the inherited access control of the user directory on Windows. */
  guard?: PermissionGuard
  /** The lock wait of the vault. Default: the vault default. */
  lockWaitMs?: number
}>

type PosixOps = Readonly<{
  chmod(path: string, mode: number): void
  modeOf(path: string): number
  umask(mask: number): number
}>

const PRIVATE_MODE = { file: 0o600, directory: 0o700 } as const

const POSIX_OPS: PosixOps = {
  chmod: chmodSync,
  modeOf: path => statSync(path).mode,
  umask: mask => process.umask(mask),
}

/**
 * POSIX: files `0600` and directories `0700`. Creation runs under the mask `077`, so nothing exists
 * wider than that for a moment; `narrow` then sets the exact mode, and `verify` reads it back.
 */
export function createPosixGuard(ops: PosixOps = POSIX_OPS): PermissionGuard {
  return {
    confine(create) {
      const previous = ops.umask(0o077)
      try {
        return create()
      } finally {
        ops.umask(previous)
      }
    },
    narrow(path, kind) {
      ops.chmod(path, PRIVATE_MODE[kind])
    },
    verify(path, kind) {
      if ((ops.modeOf(path) & 0o777) !== PRIVATE_MODE[kind]) {
        throw new Error(`${kind} mode is not ${PRIVATE_MODE[kind].toString(8)}`)
      }
    },
  }
}

/**
 * Windows has no mode bits, and nothing here edits access control lists. Protection comes from the
 * access control that a new entry inherits below the user directory, which the path rule
 * guarantees. `verify` cannot read that back, so it checks nothing; the documents say so.
 */
const INHERITED_ACL_GUARD: PermissionGuard = {
  confine: create => create(),
  narrow: () => undefined,
  verify: () => undefined,
}

export function defaultGuard(): PermissionGuard {
  return process.platform === 'win32' ? INHERITED_ACL_GUARD : createPosixGuard()
}

/** Marks a failure of the guard, so that it is not reported as a failed write. */
class PermissionRefused extends Error {}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined
}

function refuse(reason: SecretVaultInitFailure): SecretVaultInitResult {
  return { ok: false, reason }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}

type Located =
  | Readonly<{ ok: true; target: string; missing: readonly string[] }>
  | Readonly<{ ok: false; reason: 'path-outside-home' | 'path-check-failed' }>

// The nearest parent that exists decides where the path really lies: its real path, plus the names
// that do not exist yet (they cannot be links). A link that leaves the user directory therefore
// moves the real path out, and the path is refused.
function locate(path: string, home: string): Located {
  let realHome: string
  let existing = dirname(resolve(path))
  const absent: string[] = []
  const last = basename(resolve(path))
  try {
    realHome = realpathSync.native(home)
    for (;;) {
      try {
        lstatSync(existing)
        break
      } catch (error: unknown) {
        const above = dirname(existing)
        if (errorCode(error) !== 'ENOENT' || above === existing) throw error
        absent.unshift(basename(existing))
        existing = above
      }
    }
    const real = realpathSync.native(existing)
    if (!statSync(real).isDirectory()) return { ok: false, reason: 'path-check-failed' }
    const parent = join(real, ...absent)
    if (last === '' || !isInside(realHome, parent))
      return { ok: false, reason: 'path-outside-home' }
    const missing = absent.map((_name, index) => join(real, ...absent.slice(0, index + 1)))
    return { ok: true, target: join(parent, last), missing }
  } catch {
    return { ok: false, reason: 'path-check-failed' }
  }
}

function occupied(target: string): 'path-occupied' | 'path-check-failed' | undefined {
  try {
    lstatSync(target)
    return 'path-occupied'
  } catch (error: unknown) {
    return errorCode(error) === 'ENOENT' ? undefined : 'path-check-failed'
  }
}

export type TypedSecret =
  | Readonly<{ ok: true; secret: SecretText }>
  | Readonly<{ ok: false; reason: SecretReadFailure }>

/**
 * Calls the reader once and turns what it gives into a secret text, or into the reason it was
 * refused. A reader that throws a `SecretInputError` passes its reason on; any other throw is
 * `input-failed`. The thrown error is dropped: it could hold the secret.
 */
export async function readTypedSecret(
  readSecret: SecretVaultInitDeps['readSecret'],
): Promise<TypedSecret> {
  let raw: unknown
  try {
    raw = await readSecret()
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof SecretInputError ? error.reason : 'input-failed' }
  }
  if (typeof raw !== 'string') return { ok: false, reason: 'input-failed' }
  const parsed = parseSecretText(raw)
  if (parsed.ok) return { ok: true, secret: parsed.value }
  switch (parsed.reason) {
    case 'empty':
      return { ok: false, reason: 'secret-empty' }
    case 'control-character':
      return { ok: false, reason: 'secret-malformed' }
    case 'too-long':
      return { ok: false, reason: 'secret-too-long' }
    default: {
      const unhandled: never = parsed.reason
      throw new Error(`unhandled secret text rejection ${String(unhandled)}`)
    }
  }
}

/**
 * The read-back: opens the file and takes the secret under the key through the use face. It
 * confirms that the file is a readable vault that holds this secret there, which an adopted file
 * or a file another process wrote does not.
 */
export function holdsSecret(path: string, key: SecretBindingKey, secret: SecretText): boolean {
  const opened = openSecretVault({ path })
  if (opened.kind !== 'open') return false
  const taken = opened.vault.use(key)
  return typeof taken !== 'string' && taken.value === secret
}

// Only a file that holds this secret is removed, so a file that someone else wrote on the path survives.
function removeOwn(path: string, key: SecretBindingKey, secret: SecretText): void {
  try {
    if (holdsSecret(path, key, secret)) unlinkSync(path)
  } catch {
    // Removing a half-built result is best-effort; the failure reason is already decided.
  }
}

function removeDirectories(directories: readonly string[]): void {
  for (const directory of directories.toReversed()) {
    try {
      rmdirSync(directory)
    } catch {
      // A directory that is not empty or not ours stays.
    }
  }
}

function buildFailure(result: CreateSecretVaultResult): SecretVaultInitFailure | undefined {
  switch (result.kind) {
    case 'open':
      return undefined
    case 'locked':
      return 'lock-timeout'
    case 'unavailable':
    case 'not-written':
    case 'unconfirmed':
      return 'write-failed'
    default: {
      const unhandled: never = result
      throw new Error(`unhandled creation result ${String(unhandled)}`)
    }
  }
}

/**
 * Builds a vault at `path`, which must lie below the user directory and hold nothing, with one
 * binding. Order: path rule, nothing on the path, read the secret, nothing on the path again (the
 * person may type for a while), then create under the guard, confirm the secret in the file, and
 * narrow the modes.
 *
 * The window between the last check and the vault's lock is a known limit: a process that writes
 * the path in between makes the vault adopt that file. The read-back then does not find the secret
 * and the command reports `write-unconfirmed` without touching the file.
 *
 * Its cyclomatic complexity is kept above the alert line on purpose. The function is a flat
 * sequence of guard clauses, one per step of the specified order, and each clause returns its own
 * reason code. Splitting them would only move the order from one place to a helper chain, and the
 * order is the contract (the secret is read after the first check and before the second).
 */
export async function initSecretVault(
  path: string,
  deps: SecretVaultInitDeps,
): Promise<SecretVaultInitResult> {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) {
    return refuse('path-invalid')
  }
  const located = locate(path, (deps.home ?? homedir)())
  if (!located.ok) return refuse(located.reason)
  const { target, missing } = located
  const taken = occupied(target)
  if (taken) return refuse(taken)

  const typed = await readTypedSecret(deps.readSecret)
  if (!typed.ok) return refuse(typed.reason)
  const { secret } = typed
  const takenNow = occupied(target)
  if (takenNow) return refuse(takenNow)

  const guard = deps.guard ?? defaultGuard()
  const create = deps.create ?? createSecretVault
  const created: string[] = []
  let failure: SecretVaultInitFailure | undefined
  try {
    guard.confine(() => {
      for (const directory of missing) {
        mkdirSync(directory, { mode: 0o700 })
        created.push(directory)
        narrowAndVerify(guard, directory, 'directory')
      }
      const seed = { key: deps.key, secret, configuredAt: deps.configuredAt ?? null }
      const options: CreateSecretVaultOptions =
        deps.lockWaitMs === undefined
          ? { path: target, seed: [seed] }
          : { path: target, seed: [seed], lockWaitMs: deps.lockWaitMs }
      const result = create(options)
      if (result.kind === 'open') result.vault.close()
      failure = buildFailure(result)
    })
  } catch (error: unknown) {
    removeOwn(target, deps.key, secret)
    removeDirectories(created)
    if (error instanceof PermissionRefused) return refuse('permission-failed')
    return refuse(errorCode(error) === 'ELOCKED' ? 'lock-timeout' : 'write-failed')
  }
  if (failure !== undefined) {
    removeOwn(target, deps.key, secret)
    removeDirectories(created)
    return refuse(failure)
  }

  if (!holdsSecret(target, deps.key, secret)) {
    removeDirectories(created)
    return refuse('write-unconfirmed')
  }
  try {
    narrowAndVerify(guard, target, 'file')
  } catch {
    removeOwn(target, deps.key, secret)
    removeDirectories(created)
    return refuse('permission-failed')
  }
  return { ok: true, path: target }
}

export function narrowAndVerify(guard: PermissionGuard, path: string, kind: EntryKind): void {
  try {
    guard.narrow(path, kind)
    guard.verify(path, kind)
  } catch {
    throw new PermissionRefused('permission refused')
  }
}
