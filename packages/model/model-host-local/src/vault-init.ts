// The core of the vault initialization command: build a new vault on a path that holds nothing, with
// the factory secret that an injected reader supplies. It is not a plugin and not part of the root
// entry. A person runs it once on the host (see `vault-init-cli.ts`); no agent reads or holds the key.
//
// The result carries a closed set of reason codes and nothing else: no message, no cause, no path of
// a failed step. The key is only ever a local value between the reader and the store.
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
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
} from '@omne-harness/model-contract/provider'
import {
  createLocalCustodian,
  openLocalCustodian,
  type CreateOptions,
  type LocalCustodian,
  type LockOptions,
} from './store.ts'

/** Why a reader gave up: it is not a terminal, the person cancelled, or the read itself failed. */
export type SecretInputFailure = 'input-not-terminal' | 'input-cancelled' | 'input-failed'

export type VaultInitFailure =
  | SecretInputFailure
  /** The path is empty or holds a NUL character. */
  | 'path-invalid'
  /** The path does not lie below the real user directory. */
  | 'path-outside-home'
  /** The path or one of its parents cannot be examined, or a parent is not a directory. */
  | 'path-check-failed'
  /** Anything at all is on the path: a vault, a damaged or empty file, a directory, a link. */
  | 'path-occupied'
  /** The key is empty once the whitespace around it is removed. */
  | 'secret-empty'
  /** The key holds a control character. */
  | 'secret-malformed'
  /** The file lock was not free within the lock wait. */
  | 'lock-timeout'
  /** The store or a new directory could not be written. */
  | 'write-failed'
  /** The store returned, but the file does not hold this key as its factory secret. Nothing is deleted. */
  | 'write-unconfirmed'
  /** The modes could not be narrowed or read back. What was built is removed. */
  | 'permission-failed'

export type VaultInitResult =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; reason: VaultInitFailure }>

/** What a secret reader throws to give up. Its message is the reason code and it carries no key. */
export class SecretInputError extends Error {
  readonly reason: SecretInputFailure

  constructor(reason: SecretInputFailure, options?: ErrorOptions) {
    super(reason, options)
    this.name = 'SecretInputError'
    this.reason = reason
  }
}

export type EntryKind = 'file' | 'directory'

/**
 * How the command makes what it creates private to the current user. `confine` runs the creation so
 * that nothing is born wider than needed, `narrow` closes an entry, and `verify` throws unless the
 * entry reads back as private.
 */
export type PermissionGuard = Readonly<{
  confine<T>(create: () => T): T
  narrow(path: string, kind: EntryKind): void
  verify(path: string, kind: EntryKind): void
}>

export type VaultInitDeps = Readonly<{
  /** Supplies the key. It is called once, only after the path is known to be free. */
  readSecret: () => string | Promise<string>
  /** The user directory; the path must lie below its real path. Default: `os.homedir()`. */
  home?: () => string
  /** Creates the store. Default: `createLocalCustodian`, so the file lock and the atomic publish apply. */
  createStore?: (options: CreateOptions) => LocalCustodian
  /** Default: mode bits on POSIX, the inherited access control of the user directory on Windows. */
  guard?: PermissionGuard
  /** The lock wait of the store. Default: the library default. */
  lock?: LockOptions
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
 * Windows has no mode bits, and the command does not edit access control lists. Protection comes from
 * the access control that a new entry inherits below the user directory, which the path rule
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

function refuse(reason: VaultInitFailure): VaultInitResult {
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

type Typed =
  | Readonly<{ ok: true; secret: string }>
  | Readonly<{ ok: false; reason: VaultInitFailure }>

async function typedSecret(readSecret: VaultInitDeps['readSecret']): Promise<Typed> {
  let raw: unknown
  try {
    raw = await readSecret()
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof SecretInputError ? error.reason : 'input-failed' }
  }
  if (typeof raw !== 'string') return { ok: false, reason: 'input-failed' }
  const secret = raw.trim()
  if (secret === '') return { ok: false, reason: 'secret-empty' }
  for (let index = 0; index < secret.length; index++) {
    const code = secret.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return { ok: false, reason: 'secret-malformed' }
  }
  return { ok: true, secret }
}

function referenceForReadBack(): CredentialReference {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const id = decodeCredentialId('vault-init-readback')
  if (!account.ok || !organization.ok || !('ok' in id)) {
    throw new Error('the read-back identity is not valid')
  }
  return { id: id.ok, tenant: tenant(organization.value, account.value), purpose: MODEL_SEND }
}

// The read-back the plugin does: open the file and resolve the factory credential. It confirms that
// the file is a readable vault whose factory secret is this key, which an adopted file is not.
function holdsSecret(path: string, secret: string): boolean {
  const opened = openLocalCustodian({ path })
  if (opened.kind !== 'open') return false
  const decision = opened.custodian.resolve(referenceForReadBack(), {
    authorized: true,
    official: true,
  })
  return decision.kind === 'value' && decision.scope === 'factory' && decision.value === secret
}

// Only a file that holds this key is removed, so a file that someone else wrote on the path survives.
function removeOwn(path: string, secret: string): void {
  try {
    if (holdsSecret(path, secret)) unlinkSync(path)
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

/**
 * Builds a vault at `path`, which must lie below the user directory and hold nothing. Order:
 * path rule, nothing on the path, read the key, nothing on the path again (the person may type for a
 * while), then create under the guard, confirm the key in the file, and narrow the modes.
 *
 * The window between the last check and the store's lock is a known limit: a process that writes the
 * path in between makes the store adopt that file. The read-back then finds another factory secret
 * and the command reports `write-unconfirmed` without touching the file.
 */
export async function initVault(path: string, deps: VaultInitDeps): Promise<VaultInitResult> {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) {
    return refuse('path-invalid')
  }
  const located = locate(path, (deps.home ?? homedir)())
  if (!located.ok) return refuse(located.reason)
  const { target, missing } = located
  const taken = occupied(target)
  if (taken) return refuse(taken)

  const typed = await typedSecret(deps.readSecret)
  if (!typed.ok) return refuse(typed.reason)
  const { secret } = typed
  const takenNow = occupied(target)
  if (takenNow) return refuse(takenNow)

  const guard = deps.guard ?? defaultGuard()
  const createStore = deps.createStore ?? createLocalCustodian
  const created: string[] = []
  try {
    guard.confine(() => {
      for (const directory of missing) {
        mkdirSync(directory, { mode: 0o700 })
        created.push(directory)
        narrowAndVerify(guard, directory, 'directory')
      }
      const options: CreateOptions =
        deps.lock === undefined
          ? { path: target, factorySecret: secret }
          : { path: target, factorySecret: secret, lock: deps.lock }
      createStore(options).close()
    })
  } catch (error: unknown) {
    removeOwn(target, secret)
    removeDirectories(created)
    if (error instanceof PermissionRefused) return refuse('permission-failed')
    return refuse(errorCode(error) === 'ELOCKED' ? 'lock-timeout' : 'write-failed')
  }

  if (!holdsSecret(target, secret)) {
    removeDirectories(created)
    return refuse('write-unconfirmed')
  }
  try {
    narrowAndVerify(guard, target, 'file')
  } catch {
    removeOwn(target, secret)
    removeDirectories(created)
    return refuse('permission-failed')
  }
  return { ok: true, path: target }
}

function narrowAndVerify(guard: PermissionGuard, path: string, kind: EntryKind): void {
  try {
    guard.narrow(path, kind)
    guard.verify(path, kind)
  } catch {
    throw new PermissionRefused('permission refused')
  }
}
