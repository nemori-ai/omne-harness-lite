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

export type SecretReadFailure =
  | SecretInputFailure
  | 'secret-empty'
  | 'secret-malformed'
  | 'secret-too-long'

export type SecretVaultInitFailure =
  | SecretReadFailure
  | 'path-invalid'
  | 'path-outside-home'
  | 'path-check-failed'
  | 'path-occupied'
  | 'lock-timeout'
  | 'write-failed'
  | 'write-unconfirmed'
  | 'permission-failed'

export type SecretVaultInitResult =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; reason: SecretVaultInitFailure }>

export type EntryKind = 'file' | 'directory'

export type PermissionGuard = Readonly<{
  confine<T>(create: () => T): T
  narrow(path: string, kind: EntryKind): void
  verify(path: string, kind: EntryKind): void
}>

export type SecretVaultInitDeps = Readonly<{
  readSecret: () => string | Promise<string>
  key: SecretBindingKey
  configuredAt?: Instant | null
  home?: () => string
  create?: (options: CreateSecretVaultOptions) => CreateSecretVaultResult
  guard?: PermissionGuard
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

const INHERITED_ACL_GUARD: PermissionGuard = {
  confine: create => create(),
  narrow: () => undefined,
  verify: () => undefined,
}

export function defaultGuard(): PermissionGuard {
  return process.platform === 'win32' ? INHERITED_ACL_GUARD : createPosixGuard()
}

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

export function holdsSecret(path: string, key: SecretBindingKey, secret: SecretText): boolean {
  const opened = openSecretVault({ path })
  if (opened.kind !== 'open') return false
  const taken = opened.vault.use(key)
  return typeof taken !== 'string' && taken.value === secret
}

function removeOwn(path: string, key: SecretBindingKey, secret: SecretText): void {
  try {
    if (holdsSecret(path, key, secret)) unlinkSync(path)
  } catch {}
}

function removeDirectories(directories: readonly string[]): void {
  for (const directory of directories.toReversed()) {
    try {
      rmdirSync(directory)
    } catch {}
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
