import { timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import {
  accountIdentityPlugin,
  LOGINS_SERVICE,
  type LoginsService,
} from '@omne-harness-lite/account-identity'
import {
  registrationPlugin,
  REGISTRATION_SERVICE,
  type RegistrationService,
  type TerminalOutcome,
} from '@omne-harness-lite/account-registration'
import { clockPlugin, clockPreflight } from '@omne-harness-lite/clock'
import {
  createModelReplicaCustodian,
  type ModelReplicaCustodian,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import { credentialsPlugin } from '@omne-harness-lite/credential-verification'
import { isOk, parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis'
import {
  type ModelCatalog,
  type CredentialLookup,
} from '@omne-harness-lite/model-profile-directory'
import {
  modelProfileDirectoryPlugin,
  localCredentialLookupPlugin,
  MODEL_CATALOG_SERVICE,
  CREDENTIAL_LOOKUP_SERVICE,
} from '@omne-harness-lite/model-profile-directory/plugin'
import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import {
  organizationGovernancePlugin,
  MEMBERSHIPS_SERVICE,
  type MembershipsService,
} from '@omne-harness-lite/organization-governance'
import {
  composeMigrations,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  ReferenceViolation,
} from '@omne-harness-lite/storage'
import {
  createUpgradeGuard,
  openStorage,
  StorageStartupFailure,
  type SqlStorage,
  type UpgradeConfirmation,
} from '@omne-harness-lite/storage-sql'
import { acceptanceMigrations, migrationPrefixCheck } from './migrations.ts'
import { prepare } from './prepare.ts'
import {
  BASE_FIBERS,
  STAGE_FIBERS,
  type AcceptanceConfig,
  type AcceptanceDiagnostics,
  type AcceptanceEvent,
  type AcceptanceHooks,
  type AuthenticatedActor,
  type CloseResult,
  type CredentialSource,
  type ScenarioResult,
  type StageFiber,
  type StartupPhase,
} from './types.ts'

type LoginFace = Pick<LoginsService, 'issue' | 'exchange' | 'verify'>
type MembershipFace = Pick<MembershipsService, 'currentTenant' | 'standing'>
type CatalogFace = Pick<ModelCatalog, 'bindCredential' | 'credentialPresent' | 'listProfiles'>
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function loginFace(value: unknown): value is LoginFace {
  return (
    object(value) &&
    typeof value.issue === 'function' &&
    typeof value.exchange === 'function' &&
    typeof value.verify === 'function'
  )
}
function membershipFace(value: unknown): value is MembershipFace {
  return (
    object(value) &&
    typeof value.currentTenant === 'function' &&
    typeof value.standing === 'function'
  )
}
function catalogFace(value: unknown): value is CatalogFace {
  return (
    object(value) &&
    typeof value.bindCredential === 'function' &&
    typeof value.credentialPresent === 'function' &&
    typeof value.listProfiles === 'function'
  )
}
function registrationFace(value: unknown): value is Pick<RegistrationService, 'register'> {
  return object(value) && typeof value.register === 'function'
}
function lookupFace(value: unknown): value is CredentialLookup {
  return object(value) && typeof value.value === 'function'
}
function clockFace(value: unknown): value is Clock {
  return object(value) && typeof value.now === 'function'
}

export class AcceptanceStartupFailure extends Error {
  override readonly name = 'AcceptanceStartupFailure'
  constructor(
    readonly phase: StartupPhase,
    readonly category:
      | 'configuration'
      | 'storage'
      | 'pending'
      | 'failed'
      | 'clockUnavailable'
      | 'confirmation'
      | 'closing',
    readonly cleanup: CloseResult,
  ) {
    super(`model-request-acceptance startup failed: ${phase}/${category}`)
  }
}
export class AcceptanceOperationDefect extends Error {
  override readonly name = 'AcceptanceOperationDefect'
  constructor(readonly step: string) {
    super(`model-request-acceptance operation defect: ${step}`)
  }
}
function operationError(error: unknown, step: string): Error {
  if (error instanceof StorageDefect) return new StorageDefect(`acceptance ${step} storage defect`)
  if (error instanceof StorageUnavailable)
    return new StorageUnavailable(`acceptance ${step} unavailable`)
  if (error instanceof UniqueViolation) return new UniqueViolation('unregistered')
  if (error instanceof ReferenceViolation) return new ReferenceViolation(error.kind)
  return new AcceptanceOperationDefect(step)
}

export interface AcceptanceApplication {
  readonly ready: Promise<{ readonly confirmation: UpgradeConfirmation }>
  register(
    identifier: unknown,
    password: unknown,
  ): Promise<TerminalOutcome | { readonly failure: 'stageClosed' }>
  authenticate(identifier: unknown, password: unknown): Promise<ScenarioResult<AuthenticatedActor>>
  publishCredential(
    actor: AuthenticatedActor,
    source: CredentialSource,
  ): Promise<ScenarioResult<{ readonly stored: boolean }>>
  verifyCredential(
    actor: AuthenticatedActor,
    expectedBody: Uint8Array,
  ): Promise<ScenarioResult<{ readonly matches: boolean }>>
  close(): Promise<CloseResult>
  status(): {
    readonly serving: boolean
    readonly closing: boolean
    readonly diagnosticFailures: number
    readonly inFlight: number
    readonly fibers: Readonly<Partial<Record<StageFiber, number>>>
  }
}

/** D092: only the real-authentication / directory / model replica stage is assembled. */
export function createAcceptanceApplication(
  config: AcceptanceConfig,
  options: { readonly diagnostics: AcceptanceDiagnostics; readonly hooks?: AcceptanceHooks },
): AcceptanceApplication {
  const context = new Context()
  const guard = createUpgradeGuard()
  const fibers = new Map<StageFiber, Fiber>()
  const admitted = new Set<Promise<unknown>>()
  const hooks = options.hooks
  let storage: SqlStorage | undefined
  let replica: ModelReplicaCustodian | undefined
  let logins: LoginFace | undefined,
    memberships: MembershipFace | undefined,
    catalog: CatalogFace | undefined,
    lookup: CredentialLookup | undefined,
    registration: Pick<RegistrationService, 'register'> | undefined
  let gateOpen = false,
    closing = false,
    diagnosticFailures = 0
  let cleanupPromise: Promise<CloseResult> | undefined,
    closingPromise: Promise<CloseResult> | undefined
  let phase: StartupPhase = 'prepare'
  let category: AcceptanceStartupFailure['category'] = 'configuration'

  function record(event: Omit<AcceptanceEvent, 'runId'>): void {
    try {
      const returned: unknown = options.diagnostics.record(
        Object.freeze({ runId: config.runId, ...event }),
      )
      if (object(returned) && typeof returned.then === 'function') {
        diagnosticFailures += 1
        // This is a synchronous port. Observe invalid asynchronous sinks without
        // letting their rejected promises escape into a business operation.
        Promise.resolve(returned).catch(() => undefined)
      }
    } catch {
      diagnosticFailures += 1
    }
  }
  // Provider diagnostics retain correlation and category, never dynamic arguments or causes.
  context.logger.exporter({
    levels: { default: 2 },
    export(message) {
      record({ event: 'provider', phase: 'provider', outcome: message.type })
    },
  })
  function assertNotClosing(): void {
    if (closing) {
      category = 'closing'
      throw new Error('acceptance closing')
    }
  }
  function allActive(names: readonly StageFiber[]): boolean {
    return names.every(name => fibers.get(name)?.state === FIBER_STATE.ACTIVE)
  }
  function admit(): boolean {
    return gateOpen && !closing && allActive(STAGE_FIBERS) && replica !== undefined
  }
  function track<T>(work: () => Promise<T>): Promise<T> {
    const job = Promise.resolve().then(work)
    admitted.add(job)
    job.then(
      () => admitted.delete(job),
      () => admitted.delete(job),
    )
    return job
  }
  async function load<C>(
    name: StageFiber,
    plugin: Plugin.Object<C>,
    pluginConfig: C,
  ): Promise<void> {
    phase = name
    assertNotClosing()
    const fiber = context.plugin(plugin, pluginConfig)
    fibers.set(name, fiber)
    fiber.then(
      () => undefined,
      () => undefined,
    )
    await hooks?.fiberCreated?.(name, fiber)
    if (fiber.state === FIBER_STATE.PENDING) {
      category = 'pending'
      throw new Error('required fiber pending')
    }
    category = 'failed'
    await fiber
    if (fiber.state !== FIBER_STATE.ACTIVE) throw new Error('required fiber not active')
    record({ event: 'fiber', phase: name, outcome: 'active', fiber: name, state: fiber.state })
    assertNotClosing()
  }
  async function closeResources(): Promise<CloseResult> {
    if (cleanupPromise !== undefined) return cleanupPromise
    closing = true
    gateOpen = false
    record({ event: 'gate', phase: 'scenario', outcome: 'closed' })
    cleanupPromise = (async () => {
      await Promise.allSettled([...admitted])
      const unfinished: string[] = []
      const order: readonly (StageFiber | 'replica')[] = [
        'lookup',
        'directory',
        'replica',
        'registration',
        'governance',
        'accountIdentity',
        'credentials',
        'clock',
        'storage',
      ]
      for (const [index, name] of order.entries()) {
        try {
          if (name === 'replica') await replica?.close()
          else await fibers.get(name)?.dispose()
          record({ event: 'close', phase: name, outcome: 'closed' })
        } catch {
          unfinished.push(...order.slice(index))
          record({ event: 'close', phase: name, outcome: 'failed' })
          break
        }
      }
      if (unfinished.length === 0) {
        try {
          await storage?.close()
          record({ event: 'close', phase: 'storageOwner', outcome: 'closed' })
        } catch {
          unfinished.push('storageOwner')
          record({ event: 'close', phase: 'storageOwner', outcome: 'failed' })
        }
      }
      if (unfinished.length === 0) {
        try {
          await context.fiber.dispose()
        } catch {
          unfinished.push('context')
        }
      }
      const pending = await guard.pending()
      const result = {
        complete: unfinished.length === 0,
        unfinished: Object.freeze(unfinished),
        pending,
      }
      record({
        event: 'close',
        phase: 'application',
        outcome: result.complete ? 'closed' : 'incomplete',
      })
      return result
    })()
    return cleanupPromise
  }
  async function start(): Promise<{ readonly confirmation: UpgradeConfirmation }> {
    try {
      const prepared = await prepare(config)
      assertNotClosing()
      record({ event: 'stage', phase: 'prepare', outcome: 'ready' })
      phase = 'storage'
      category = 'storage'
      const fragments = [...acceptanceMigrations, ...(hooks?.extraMigrations ?? [])]
      storage = await openStorage(
        {
          dialect: 'sqlite',
          file: config.databaseFile,
          migrations: composeMigrations(fragments),
          upgrade: { guard, checks: [migrationPrefixCheck(fragments), clockPreflight()] },
        },
        {
          logger: {
            info: () => record({ event: 'provider', phase: 'storage', outcome: 'info' }),
            warn: () => record({ event: 'provider', phase: 'storage', outcome: 'warn' }),
            error: () => record({ event: 'provider', phase: 'storage', outcome: 'error' }),
          },
        },
      )
      const database = await open(config.databaseFile, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const owner = await database.stat({ bigint: true })
        const uid = process.getuid?.()
        if (!owner.isFile() || uid === undefined || owner.uid !== BigInt(uid))
          throw new Error('acceptance database owner invalid')
        // The read-only precheck already refused unsafe preexisting files.
        // Only a genuinely new/replaced owned file is eligible for restriction.
        const replaced =
          prepared.databaseIdentity === undefined ||
          prepared.databaseIdentity.dev !== owner.dev ||
          prepared.databaseIdentity.ino !== owner.ino ||
          prepared.databaseIdentity.birthtimeNs !== owner.birthtimeNs
        if (replaced) await database.chmod(0o600)
        const info = await database.stat()
        if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600)
          throw new Error('acceptance database owner invalid')
        record({
          event: 'stage',
          phase: 'databaseOwner',
          outcome: replaced
            ? prepared.databaseIdentity === undefined
              ? 'created'
              : 'restored'
            : 'verified',
        })
      } finally {
        await database.close()
      }
      record({ event: 'stage', phase: 'migrations', outcome: 'complete' })
      await hooks?.storageOpened?.(storage, guard)
      assertNotClosing()
      const borrowedStorage = storage
      await load(
        'storage',
        {
          name: 'acceptance-storage',
          apply(ctx: Context) {
            if (ctx.get('storage') !== undefined) throw new Error('duplicate acceptance storage')
            ctx.provide('storage', borrowedStorage)
          },
        },
        undefined,
      )
      await load('clock', clockPlugin, {})
      await load('credentials', credentialsPlugin, prepared.credentials)
      await load('accountIdentity', accountIdentityPlugin, prepared.identity)
      await load('governance', organizationGovernancePlugin, prepared.governance)
      await load('registration', registrationPlugin, prepared.registration)
      phase = 'clockReady'
      category = 'clockUnavailable'
      const clock: unknown = context.get('clock')
      if (!clockFace(clock)) throw new Error('acceptance clock absent')
      const deadline = config.wait.monotonicNow() + config.wait.clockTimeoutMs
      let waiting = false
      while (clock.now() === 'unavailable') {
        if (!waiting) {
          waiting = true
          record({ event: 'stage', phase: 'clockReady', outcome: 'waiting' })
        }
        assertNotClosing()
        const remaining = deadline - config.wait.monotonicNow()
        if (remaining <= 0) throw new Error('acceptance clock deadline')
        await config.wait.sleep(Math.min(config.wait.pollMs, remaining))
      }
      record({ event: 'stage', phase: 'clockReady', outcome: 'ready' })
      if (!allActive(BASE_FIBERS)) {
        category = 'failed'
        throw new Error('acceptance base changed')
      }
      phase = 'confirm'
      category = 'confirmation'
      await hooks?.beforeConfirm?.(guard)
      assertNotClosing()
      if (!allActive(BASE_FIBERS) || clock.now() === 'unavailable')
        throw new Error('acceptance base no longer ready')
      record({ event: 'confirm', phase: 'upgrade', outcome: 'started' })
      const confirmation = await guard.confirm()
      if (confirmation.snapshotTaken && !confirmation.snapshotRemoved)
        throw new Error('acceptance snapshot not removed')
      record({ event: 'confirm', phase: 'upgrade', outcome: 'succeeded', confirmation })
      category = 'failed'
      assertNotClosing()
      await hooks?.afterConfirm?.()
      assertNotClosing()
      await load('directory', modelProfileDirectoryPlugin, {
        ...prepared.directory,
        diagnostics: {
          record(event) {
            record({
              event: 'directory',
              phase: event.operation,
              outcome: event.outcome ?? event.phase,
            })
          },
        },
      })
      phase = 'replica'
      category = 'failed'
      await hooks?.beforeReplica?.()
      assertNotClosing()
      const readCredentialBindingIn = createCredentialBindingReader(storage)
      replica = await createModelReplicaCustodian({
        storage,
        clock,
        keyFile: config.keys.modelReplica,
        readCredentialBindingIn,
        diagnostics: {
          record(event) {
            record({
              event: 'replica',
              phase: event.phase,
              outcome: event.outcome,
              ...(event.tenant === undefined ? {} : { tenant: event.tenant }),
              ...(event.sourceMatch === undefined ? {} : { sourceMatch: event.sourceMatch }),
            })
          },
          sinkFailure() {
            diagnosticFailures += 1
          },
        },
      })
      assertNotClosing()
      phase = 'lookup'
      await hooks?.beforeLookup?.()
      await load('lookup', localCredentialLookupPlugin, {
        mode: 'localCredentialOnly',
        readBoundReplicaIn: replica.readBoundReplicaIn,
        diagnostics: {
          record(event) {
            record({
              event: 'directory',
              phase: event.operation,
              outcome: event.outcome ?? event.phase,
            })
          },
        },
      })
      const loginValue: unknown = context.get(LOGINS_SERVICE),
        membershipValue: unknown = context.get(MEMBERSHIPS_SERVICE),
        catalogValue: unknown = context.get(MODEL_CATALOG_SERVICE),
        lookupValue: unknown = context.get(CREDENTIAL_LOOKUP_SERVICE),
        registrationValue: unknown = context.get(REGISTRATION_SERVICE)
      if (
        !loginFace(loginValue) ||
        !membershipFace(membershipValue) ||
        !catalogFace(catalogValue) ||
        !lookupFace(lookupValue) ||
        !registrationFace(registrationValue)
      )
        throw new Error('acceptance service mapping invalid')
      logins = loginValue
      memberships = membershipValue
      catalog = catalogValue
      lookup = lookupValue
      registration = registrationValue
      phase = 'admission'
      assertNotClosing()
      if (!allActive(STAGE_FIBERS)) throw new Error('acceptance required stage changed')
      gateOpen = true
      record({ event: 'gate', phase: 'scenario', outcome: 'open' })
      return { confirmation }
    } catch (error) {
      if (error instanceof StorageStartupFailure) category = 'storage'
      record({ event: 'stage', phase, outcome: category })
      const cleanup = await closeResources()
      throw new AcceptanceStartupFailure(phase, category, cleanup)
    }
  }
  const ready = start()
  ready.then(
    () => undefined,
    () => undefined,
  )

  async function checkActor(
    actor: AuthenticatedActor,
  ): Promise<ScenarioResult<AuthenticatedActor>> {
    if (logins === undefined || memberships === undefined)
      throw new AcceptanceOperationDefect('identity')
    const loginState = actor?.loginState,
      claimedAccount = actor?.account
    const claimedTenant = parseTenantId(actor?.tenant)
    const verified = await logins.verify(loginState)
    if ('failure' in verified) return { step: 'verify', result: verified }
    if (verified.ok !== claimedAccount) return { failure: 'identityMismatch' }
    const current = await memberships.currentTenant(loginState)
    if ('failure' in current) return { step: 'currentTenant', result: current }
    if (
      !isOk(claimedTenant) ||
      current.ok.account !== verified.ok ||
      !tenantIdEquals(current.ok, claimedTenant.ok)
    )
      return { failure: 'identityMismatch' }
    const standing = await memberships.standing(current.ok)
    if ('failure' in standing) return { step: 'standing', result: standing }
    if (standing.standing !== 'effective') return { failure: 'membershipNotEffective' }
    return Object.freeze({
      account: verified.ok,
      loginState,
      tenant: Object.freeze({ ...current.ok }),
    })
  }
  function authenticate(
    identifier: unknown,
    password: unknown,
  ): Promise<ScenarioResult<AuthenticatedActor>> {
    if (!admit()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        if (logins === undefined || memberships === undefined)
          throw new AcceptanceOperationDefect('identity')
        await hooks?.beforeIdentityStep?.('issue')
        const issued = await logins.issue(identifier, password)
        if ('failure' in issued) return { step: 'issue', result: issued }
        await hooks?.beforeIdentityStep?.('exchange')
        const exchanged = await logins.exchange(issued.ok.presentation)
        if ('failure' in exchanged) return { step: 'exchange', result: exchanged }
        if (exchanged.ok.loginStateId !== issued.ok.loginStateId)
          throw new AcceptanceOperationDefect('exchange')
        await hooks?.beforeIdentityStep?.('currentTenant')
        const tenant = await memberships.currentTenant(exchanged.ok.loginStateId)
        if ('failure' in tenant) return { step: 'currentTenant', result: tenant }
        const result = await checkActor({
          account: exchanged.ok.accountId,
          loginState: exchanged.ok.loginStateId,
          tenant: tenant.ok,
        })
        record({
          event: 'operation',
          phase: 'authenticate',
          outcome: 'account' in result ? 'authenticated' : 'rejected',
        })
        return result
      } catch (error) {
        throw operationError(error, 'authenticate')
      }
    })
  }
  function publishCredential(
    actor: AuthenticatedActor,
    source: CredentialSource,
  ): Promise<ScenarioResult<{ readonly stored: boolean }>> {
    if (!admit()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (catalog === undefined || replica === undefined)
          throw new AcceptanceOperationDefect('publish')
        const pair = await source(checked)
        const scoped = parseTenantId(pair?.tenant)
        if (
          !isOk(scoped) ||
          pair.account !== checked.account ||
          !tenantIdEquals(scoped.ok, checked.tenant)
        )
          return { failure: 'sourceScopeMismatch' }
        const sourceRef = pair.sourceRef
        const body = pair.body instanceof Uint8Array ? Buffer.from(pair.body) : new Uint8Array()
        try {
          await hooks?.beforeIdentityStep?.('bind')
          const bound = await catalog.bindCredential(checked.tenant, checked.tenant, sourceRef)
          if ('failure' in bound) return { step: 'bind', result: bound }
          await hooks?.beforeStore?.(checked)
          await hooks?.beforeIdentityStep?.('store')
          const stored = await replica.storeBoundReplica({
            loginState: checked.loginState,
            tenant: checked.tenant,
            sourceRef,
            body,
          })
          if ('failure' in stored) return { step: 'store', result: stored }
          record({
            event: 'operation',
            phase: 'publish',
            outcome: stored.stored ? 'stored' : 'sourceChanged',
            tenant: checked.tenant,
          })
          return { stored: stored.stored }
        } finally {
          body.fill(0)
        }
      } catch (error) {
        throw operationError(error, 'publish')
      }
    })
  }
  function verifyCredential(
    actor: AuthenticatedActor,
    expectedBody: Uint8Array,
  ): Promise<ScenarioResult<{ readonly matches: boolean }>> {
    if (!admit()) return Promise.resolve({ failure: 'stageClosed' })
    return track(async () => {
      try {
        const checked = await checkActor(actor)
        if (!('account' in checked)) return checked
        if (lookup === undefined) throw new AcceptanceOperationDefect('lookup')
        const selected = await lookup.value(checked.tenant, 'custom')
        if ('failure' in selected) return { step: 'lookup', result: selected }
        try {
          if (
            selected.scope.layer !== 'tenant' ||
            !tenantIdEquals(selected.scope.tenant, checked.tenant)
          )
            throw new AcceptanceOperationDefect('lookup')
          return {
            matches:
              expectedBody instanceof Uint8Array &&
              selected.value.length === expectedBody.length &&
              timingSafeEqual(selected.value, expectedBody),
          }
        } finally {
          selected.value.fill(0)
        }
      } catch (error) {
        throw operationError(error, 'lookup')
      }
    })
  }
  return {
    ready,
    register(identifier, password) {
      if (!admit()) return Promise.resolve({ failure: 'stageClosed' })
      return track(async () => {
        try {
          if (registration === undefined) throw new AcceptanceOperationDefect('register')
          const result = await registration.register(identifier, password)
          record({ event: 'operation', phase: 'register', outcome: result })
          return result
        } catch (error) {
          throw operationError(error, 'register')
        }
      })
    },
    authenticate,
    publishCredential,
    verifyCredential,
    close() {
      if (closingPromise !== undefined) return closingPromise
      closing = true
      gateOpen = false
      closingPromise = (async () => {
        await ready.then(
          () => undefined,
          () => undefined,
        )
        return closeResources()
      })()
      return closingPromise
    },
    status() {
      return {
        serving: admit(),
        closing,
        diagnosticFailures,
        inFlight: admitted.size,
        fibers: Object.fromEntries([...fibers].map(([name, fiber]) => [name, fiber.state])),
      }
    },
  }
}
