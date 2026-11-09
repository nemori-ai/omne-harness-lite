// The Model credential custody over the secret vault of settings-local. The vault keeps the file,
// the lock and the atomic publish; this adapter keeps the Model meaning: which bindings are Model's,
// how the official factory secret and the tenant credentials map onto binding keys, and the
// judgment of presence and resolution, which stays in model and reads a whole snapshot.
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  judgeGate,
  judgePresence,
  judgeQualifiedPresence,
  judgeQualifiedResolution,
  judgeResolution,
  type BindingLife,
  type CustodianState,
} from '@omne-harness/model'
import {
  MODEL_SEND,
  decodeCredentialId,
  sameCredentialHolder,
  type CredentialPort,
  type CredentialReference,
  type CredentialResolution,
} from '@omne-harness/model-contract/provider'
import { parseSecretText, type SecretBindingKey, type SecretText } from '@omne-harness/settings'
import {
  createSecretVault,
  openSecretVault,
  type SecretRecord,
  type SecretVault,
  type UnavailableCause as VaultUnavailableCause,
} from '@omne-harness/settings-local/secrets'
import { encodeInstant, parseInstant } from '@omne-harness/utc-instant'
import { isIntegerAtLeast, isRecord } from './fields.ts'

/** Why a vault file cannot be read: absent, not a valid vault, or a file-system error. */
export type UnavailableCause = VaultUnavailableCause

export type Diagnostic =
  | Readonly<{ stage: 'resolve'; outcome: CredentialResolution['kind']; tenantMatch: boolean }>
  | Readonly<{ stage: 'refresh'; cause: UnavailableCause }>

export type LockOptions = Readonly<{
  /** How long a writer waits for the file lock before it gives up. */
  waitMs?: number
  /** The pause between two attempts to take the lock. */
  backoffMs?: number
}>

export type CustodianOptions = Readonly<{
  path: string
  lock?: LockOptions
  /** How many of the most recent diagnostics a handle keeps. */
  diagnosticsCapacity?: number
}>

export type CreateOptions = CustodianOptions & Readonly<{ factorySecret: string }>

/**
 * The result of a binding write. `written`: the new snapshot is published. `not-written`: the old
 * snapshot is still the one on disk. `unconfirmed`: the new snapshot may be published, but the write
 * could not confirm it; read the binding again before a retry. `denied`: the reference names a
 * tenant that was never minted, or a credential id that another tenant holds, or the custodian is
 * closed, or the secret is not a secret text (`parseSecretText`); nothing was written.
 */
export type BindingWrite =
  | Readonly<{ kind: 'written' }>
  | Readonly<{ kind: 'not-written' }>
  | Readonly<{ kind: 'unconfirmed' }>
  | Readonly<{ kind: 'denied' }>

/** The result of an unbind: as `BindingWrite`, and `absent` when there was no binding to remove. */
export type BindingRemoval = BindingWrite | Readonly<{ kind: 'absent' }>

/**
 * What the custody shows of one binding. It never shows the secret. `life` is the state of the
 * binding, and `configuredAt` is the instant text of its last bind when the vault records it.
 */
export type BindingView =
  | Readonly<{ kind: 'unbound' }>
  | Readonly<{ kind: 'bound'; life: BindingLife; configuredAt?: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export type OpenResult =
  | Readonly<{ kind: 'open'; custodian: LocalCustodian }>
  | Readonly<{ kind: 'unavailable'; cause: UnavailableCause }>

/** The owner of every Model binding in the vault. */
export const MODEL_SECRET_OWNER = 'model'

/**
 * The key of the official factory secret: the deployment default of Model. Its target key holds a
 * space, which `decodeCredentialId` never accepts, so no tenant credential id can collide with it.
 * It is the target the pre-version vault file maps its `factorySecret` to.
 */
export const MODEL_FACTORY_SECRET_KEY: SecretBindingKey = Object.freeze({
  scope: Object.freeze({ layer: 'official' as const }),
  target: Object.freeze({ owner: MODEL_SECRET_OWNER, key: 'factory default' }),
  purpose: MODEL_SEND,
})

/** The binding key of a tenant credential: the tenant scope, the Model target named by the id. */
export function modelCredentialBindingKey(reference: CredentialReference): SecretBindingKey {
  return {
    scope: { layer: 'tenant', tenant: reference.tenant },
    target: { owner: MODEL_SECRET_OWNER, key: reference.id },
    purpose: reference.purpose,
  }
}

type Settings = Readonly<{
  path: string
  lock: Required<LockOptions>
  diagnosticsCapacity: number
}>

const DEFAULT_LOCK: Required<LockOptions> = { waitMs: 30_000, backoffMs: 50 }
const DEFAULT_DIAGNOSTICS_CAPACITY = 256

// Only an absent option takes its default. A caller outside the type system can hand in `null`,
// `NaN` or a string; `NaN` would make the lock wait endless and the diagnostics ring unbounded, so
// every settled value is checked before the lock is taken or the disk is read.
function settle(options: CustodianOptions): Settings {
  const lock = settleLock(options.lock)
  const diagnosticsCapacity = requireIntegerAtLeast(
    orDefault(options.diagnosticsCapacity, DEFAULT_DIAGNOSTICS_CAPACITY),
    'diagnosticsCapacity',
    1,
  )
  return { path: options.path, lock, diagnosticsCapacity }
}

function settleLock(given: LockOptions | undefined): Required<LockOptions> {
  if (given === undefined) return DEFAULT_LOCK
  if (!isRecord(given)) throw new TypeError(`lock must be an object, got ${String(given)}`)
  return {
    waitMs: requireIntegerAtLeast(orDefault(given.waitMs, DEFAULT_LOCK.waitMs), 'lock.waitMs', 0),
    backoffMs: requireIntegerAtLeast(
      orDefault(given.backoffMs, DEFAULT_LOCK.backoffMs),
      'lock.backoffMs',
      0,
    ),
  }
}

function orDefault(value: unknown, fallback: number): unknown {
  return value === undefined ? fallback : value
}

function requireIntegerAtLeast(value: unknown, name: string, minimum: number): number {
  if (!isIntegerAtLeast(value, minimum)) {
    throw new TypeError(`${name} must be an integer of at least ${minimum}, got ${String(value)}`)
  }
  return value
}

function vaultOptions(settings: Settings) {
  return {
    path: settings.path,
    lockWaitMs: settings.lock.waitMs,
    lockBackoffMs: settings.lock.backoffMs,
  }
}

export type LocalCustodian = CredentialPort & {
  presentFor: NonNullable<CredentialPort['presentFor']>
  resolveFor: NonNullable<CredentialPort['resolveFor']>
  readonly path: string
  diagnostics(): readonly Diagnostic[]
  put(reference: CredentialReference, secret: string): void
  rotate(reference: CredentialReference, secret: string): void
  /** Replaces the factory secret. Bindings, their secrets and their lives stay as they are. */
  replaceFactorySecret(secret: string): void
  revoke(reference: CredentialReference): void
  /**
   * Binds the secret to the reference, or replaces the secret and the time of the existing binding.
   * The binding is active afterwards. A vault failure is a result, not a throw; so is a text that
   * is not a secret text (`denied`).
   */
  bind(
    input: Readonly<{ reference: CredentialReference; secret: string; configuredAt: string }>,
  ): BindingWrite
  /** Removes the binding. Afterwards the tenant has no such binding, as if it never had one. */
  unbind(input: Readonly<{ reference: CredentialReference }>): BindingRemoval
  /** Shows the binding without its secret, read from disk now. */
  describe(input: Readonly<{ reference: CredentialReference }>): BindingView
  markUnreadable(reference: CredentialReference): void
  close(): void
}

/** A Model binding as this custody reads it: the Model binding plus its time text, when known. */
type LocalBinding = CustodianState['bindings'][number] & { readonly configuredAt?: string }

type LocalState = Omit<CustodianState, 'bindings'> & { readonly bindings: readonly LocalBinding[] }

/** Whether a vault record is a Model binding: the Model owner and the sending purpose. */
function isModelRecord(record: SecretRecord): boolean {
  return record.key.target.owner === MODEL_SECRET_OWNER && record.key.purpose === MODEL_SEND
}

/**
 * The Model view of the vault: the official factory binding becomes the factory secret (an empty
 * one when there is none), each tenant Model binding becomes a Model binding. A tenant binding
 * whose target key is not a credential id makes the snapshot unreadable: it is not a Model binding
 * this custody can judge. Records of other owners and purposes are not Model's and are skipped.
 */
function modelState(records: readonly SecretRecord[], closed: boolean): LocalState | undefined {
  let factorySecret = ''
  const bindings: LocalBinding[] = []
  for (const record of records) {
    if (!isModelRecord(record)) continue
    if (record.key.scope.layer === 'official') {
      if (record.key.target.key === MODEL_FACTORY_SECRET_KEY.target.key)
        factorySecret = record.secret
      continue
    }
    const id = decodeCredentialId(record.key.target.key)
    if (!('ok' in id)) return undefined
    bindings.push({
      id: id.ok,
      tenant: record.key.scope.tenant,
      purpose: MODEL_SEND,
      secret: record.secret,
      life: record.life,
      ...(record.configuredAt === null ? {} : { configuredAt: encodeInstant(record.configuredAt) }),
    })
  }
  return { closed, factorySecret, bindings }
}

function secretText(secret: string): SecretText {
  const parsed = parseSecretText(secret)
  if (!parsed.ok || parsed.value !== secret)
    throw new TypeError(
      `the secret is not a secret text (${parsed.ok ? 'whitespace' : parsed.reason})`,
    )
  return parsed.value
}

function timeOf(text: string | undefined) {
  if (text === undefined) return null
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new TypeError('configuredAt is not an instant text')
  return parsed.value
}

const isModelRecordOf = (reference: CredentialReference) => (record: SecretRecord) =>
  isModelRecord(record) &&
  record.key.scope.layer === 'tenant' &&
  record.key.target.key === reference.id &&
  tenantEquals(record.key.scope.tenant, reference.tenant)

/** Replaces or adds the record of the reference; a binding keeps the given life. */
function withRecord(
  records: readonly SecretRecord[],
  reference: CredentialReference,
  record: Omit<SecretRecord, 'key'>,
): readonly SecretRecord[] {
  return [
    ...records.filter(item => !isModelRecordOf(reference)(item)),
    { key: modelCredentialBindingKey(reference), ...record },
  ]
}

function live(settings: Settings, vault: SecretVault): LocalCustodian {
  const { path } = settings
  const holder = { state: { closed: false, factorySecret: '', bindings: [] } as LocalState }
  const notes: Diagnostic[] = []
  const note = (entry: Diagnostic) => {
    notes.push(entry)
    if (notes.length > settings.diagnosticsCapacity) notes.shift()
  }
  // The gate denials come from the judgment and need no snapshot, so they are answered before
  // the disk is read; an unreadable vault still denies what it would never have served.
  const current = (): LocalState | undefined => {
    const snapshot = vault.snapshot()
    const state =
      snapshot === 'unavailable' ? undefined : modelState(snapshot.bindings, holder.state.closed)
    if (state === undefined) {
      note({ stage: 'refresh', cause: snapshot === 'unavailable' ? unavailableCause() : 'corrupt' })
      return undefined
    }
    holder.state = state
    return state
  }
  // The snapshot says only that the file is unreadable; the cause of the diagnostic comes from one
  // more classification read, on this failure path only.
  const unavailableCause = (): UnavailableCause => {
    const opened = openSecretVault(vaultOptions(settings))
    return opened.kind === 'unavailable' ? opened.cause : 'io'
  }
  // The one entry of every judgment: the gate first, then the snapshot from disk, and only then
  // the judgment over it. An unreadable vault answers `unavailable` after the gate passed.
  const judged = <R>(
    reference: Parameters<typeof judgeGate>[1],
    judge: (state: LocalState) => R,
    face?: Parameters<typeof judgeGate>[2],
  ) => {
    const gate = judgeGate(holder.state, reference, face)
    if (gate) return gate
    const state = current()
    return state ? judge(state) : ({ kind: 'unavailable' } as const)
  }
  const noteResolve = (
    state: LocalState,
    reference: Parameters<typeof sameCredentialHolder>[1],
    decision: CredentialResolution,
  ) => {
    const binding = state.bindings.find(item => sameCredentialHolder(item, reference))
    const answer = withoutEmptyFactory(decision)
    note({ stage: 'resolve', outcome: answer.kind, tenantMatch: binding !== undefined })
    return answer
  }
  // A management operation must never serve a reference whose id another tenant holds.
  const heldElsewhere = (
    records: readonly SecretRecord[],
    reference: CredentialReference,
  ): boolean =>
    records.some(
      record =>
        isModelRecord(record) &&
        record.key.scope.layer === 'tenant' &&
        record.key.target.key === reference.id &&
        !tenantEquals(record.key.scope.tenant, reference.tenant),
    )
  const ownRecord = (records: readonly SecretRecord[], reference: CredentialReference) =>
    records.find(isModelRecordOf(reference))
  // The throwing management operations: a vault failure is an exception with the result kind.
  const mutate = (
    change: (records: readonly SecretRecord[]) => readonly SecretRecord[] | undefined,
  ): void => {
    const written = vault.revise(change)
    if (written === 'written') return
    if (written === 'unconfirmed')
      throw new Error(
        `credential store update at ${path} confirmation incomplete; verify state before retry`,
      )
    throw new Error(`credential store update at ${path} was ${written}`)
  }
  return {
    path,
    present: reference => judged(reference, state => judgePresence(state, reference)),
    resolve: (reference, face) =>
      judged(
        reference,
        state => noteResolve(state, reference, judgeResolution(state, reference, face)),
        face,
      ),
    presentFor(input) {
      const reference = { id: input.id, tenant: input.access.tenant, purpose: input.purpose }
      return judged(reference, state => judgeQualifiedPresence(state, input))
    },
    resolveFor(input) {
      const reference = { id: input.id, tenant: input.access.tenant, purpose: input.purpose }
      return judged(reference, state =>
        noteResolve(state, reference, judgeQualifiedResolution(state, input)),
      )
    },
    diagnostics: () => notes.slice(),
    put(reference, secret) {
      requireMintedTenant(reference)
      const value = secretText(secret)
      mutate(records =>
        withRecord(records, reference, { secret: value, life: 'active', configuredAt: null }),
      )
    },
    rotate(reference, secret) {
      requireMintedTenant(reference)
      const value = secretText(secret)
      mutate(records => {
        const own = ownRecord(records, reference)
        return own === undefined
          ? undefined
          : withRecord(records, reference, { ...own, secret: value })
      })
    },
    replaceFactorySecret(secret) {
      const factory = MODEL_FACTORY_SECRET_KEY
      const isFactory = (record: SecretRecord) =>
        isModelRecord(record) &&
        record.key.scope.layer === 'official' &&
        record.key.target.key === factory.target.key
      // An empty factory secret is no deployment default: no official binding.
      const value = secret === '' ? undefined : secretText(secret)
      mutate(records => [
        ...records.filter(record => !isFactory(record)),
        ...(value === undefined
          ? []
          : [{ key: factory, secret: value, life: 'active' as const, configuredAt: null }]),
      ])
    },
    revoke(reference) {
      requireMintedTenant(reference)
      mutate(records => {
        const own = ownRecord(records, reference)
        return own === undefined
          ? undefined
          : withRecord(records, reference, { ...own, life: 'revoked' })
      })
    },
    markUnreadable(reference) {
      requireMintedTenant(reference)
      mutate(records => {
        const own = ownRecord(records, reference)
        return own === undefined || own.life !== 'active'
          ? undefined
          : withRecord(records, reference, { ...own, life: 'unreadable' })
      })
    },
    bind({ reference, secret, configuredAt }) {
      if (!isMinted(reference) || holder.state.closed) return { kind: 'denied' }
      // The text is checked at this boundary: a text that is not a secret text is a result, not a
      // throw, and nothing is written. The whitespace around a secret text is not part of it.
      const parsed = parseSecretText(secret)
      if (!parsed.ok) return { kind: 'denied' }
      const value = parsed.value
      const time = timeOf(configuredAt)
      let refused = false
      const written = vault.revise(records => {
        if (heldElsewhere(records, reference)) {
          refused = true
          return undefined
        }
        return withRecord(records, reference, { secret: value, life: 'active', configuredAt: time })
      })
      return refused ? { kind: 'denied' } : { kind: written }
    },
    unbind({ reference }) {
      if (!isMinted(reference) || holder.state.closed) return { kind: 'denied' }
      let found: 'denied' | 'absent' | undefined
      const written = vault.revise(records => {
        if (heldElsewhere(records, reference)) found = 'denied'
        else if (ownRecord(records, reference) === undefined) found = 'absent'
        if (found !== undefined) return undefined
        return records.filter(record => !isModelRecordOf(reference)(record))
      })
      if (found !== undefined && written === 'written') return { kind: found }
      return { kind: written }
    },
    describe({ reference }) {
      if (!isMinted(reference) || holder.state.closed) return { kind: 'denied' }
      const snapshot = vault.snapshot()
      if (snapshot === 'unavailable') return { kind: 'unavailable' }
      if (modelState(snapshot.bindings, holder.state.closed) === undefined)
        return { kind: 'unavailable' }
      if (heldElsewhere(snapshot.bindings, reference)) return { kind: 'denied' }
      const own = ownRecord(snapshot.bindings, reference)
      if (own === undefined) return { kind: 'unbound' }
      return {
        kind: 'bound',
        life: own.life,
        ...(own.configuredAt === null ? {} : { configuredAt: encodeInstant(own.configuredAt) }),
      }
    },
    // Close is the Model gate of this process only: the judgment denies afterwards, while the
    // management operations still persist and the next process reads the file as it is.
    close() {
      holder.state = { ...holder.state, closed: true }
    },
  }
}

/**
 * The deployment default applies only where the deployment really provides one. An empty factory
 * secret is no credential: the custody answers `absent`, so no send starts with it.
 */
function withoutEmptyFactory(decision: CredentialResolution): CredentialResolution {
  return decision.kind === 'value' && decision.scope === 'factory' && decision.value === ''
    ? { kind: 'absent' }
    : decision
}

function isMinted(reference: CredentialReference): boolean {
  return tenantEquals(reference.tenant, reference.tenant)
}

// Equality with itself holds only for a minted tenant. A copied tenant matches no stored row, so a
// management operation on it would either do nothing or, for `put`, write a row under the real
// tenant's name on the next read, which re-mints it from text. Every management operation refuses
// it before it takes the lock or reads the file.
function requireMintedTenant(reference: CredentialReference): void {
  if (!tenantEquals(reference.tenant, reference.tenant)) {
    throw new Error('credential binding tenant was never minted; nothing was written')
  }
}

/** The first read of a vault that was just opened: a vault that is not a Model vault is corrupt. */
function adopt(settings: Settings, vault: SecretVault): LocalCustodian | 'corrupt' | 'unavailable' {
  const snapshot = vault.snapshot()
  if (snapshot === 'unavailable') return 'unavailable'
  if (modelState(snapshot.bindings, false) === undefined) return 'corrupt'
  return live(settings, vault)
}

/**
 * Creates the vault when the path is empty, with the factory secret as the official Model binding
 * (none when it is empty), and adopts the vault that is already there otherwise. The decision is
 * made under the lock, so two processes that start on the same empty path cannot each write an
 * empty snapshot over the other's bindings. A file that cannot be read as a vault is not replaced.
 */
export function createLocalCustodian(options: CreateOptions): LocalCustodian {
  const settings = settle(options)
  const { path } = settings
  const seed =
    options.factorySecret === ''
      ? []
      : [
          {
            key: MODEL_FACTORY_SECRET_KEY,
            secret: secretText(options.factorySecret),
            configuredAt: null,
          },
        ]
  const built = createSecretVault({ ...vaultOptions(settings), seed })
  switch (built.kind) {
    case 'open': {
      const custodian = adopt(settings, built.vault)
      if (typeof custodian === 'string')
        throw new Error(`credential store at ${path} exists but is ${custodian}; not replaced`)
      return custodian
    }
    case 'unavailable':
      throw new Error(`credential store at ${path} exists but is ${built.cause}; not replaced`)
    case 'locked':
      throw Object.assign(new Error(`timed out waiting for credential store lock at ${path}`), {
        code: 'ELOCKED',
      })
    case 'not-written':
      throw new Error(`failed to create credential store at ${path}`)
    case 'unconfirmed':
      throw new Error(
        `credential store creation at ${path} confirmation incomplete; verify state before retry`,
      )
    default: {
      const unhandled: never = built
      throw new Error(`unhandled creation result ${String(unhandled)}`)
    }
  }
}

export function openLocalCustodian(options: CustodianOptions): OpenResult {
  const settings = settle(options)
  const opened = openSecretVault(vaultOptions(settings))
  if (opened.kind === 'unavailable') return { kind: 'unavailable', cause: opened.cause }
  const custodian = adopt(settings, opened.vault)
  if (custodian === 'corrupt') return { kind: 'unavailable', cause: 'corrupt' }
  if (custodian === 'unavailable') return { kind: 'unavailable', cause: 'io' }
  return { kind: 'open', custodian }
}
