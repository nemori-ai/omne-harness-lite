import { instantToRfc3339 } from '@omne-harness-lite/offer-expiry'
import {
  createAssemblyManifestStore,
  type AssemblyManifestStore,
} from '@omne-harness-lite/assembly-manifest-store'
import { openSqlSessionLog, type SqlSessionLog } from '@omne-harness-lite/session-log-sql'
import {
  createLocalAdmission,
  createLocalSessionIngress,
  createLocalSessionAccess,
  type LocalAdmission,
  type LocalSessionAccess,
  type LocalSessionIngress,
  type SessionDriverWorkOwner,
} from '@omne-harness-lite/session-runtime-local'
import { checkedTenantBinding } from './state-layout-values.ts'
import { parseRunLoginBinding, readCurrentLogin } from './session-preparation.ts'
import { usingGovernanceUse } from './governance-use-work.ts'
import { createSessionAdmissionProbe } from './session-admission-probe.ts'
import { createSessionBootstrap } from './session-bootstrap.ts'
import {
  deployOfficialSessionDefinition,
  officialSessionDefinition,
  officialSessionManifest,
} from './session-factory-assets.ts'
import { createSessionOriginalModelOwner } from './session-model-owner.ts'
import { createSessionModelResultSource } from '@omne-harness-lite/session-runtime-local'
import { createSessionDriverWorkOwner } from '@omne-harness-lite/session-runtime-local'
import { startSessionDriverHost, type SessionDriverHost } from './session-driver-host.ts'
import type {
  SessionRuntimeRoot,
  SessionRuntimeRootOptions,
  SessionRuntimeRootOwners,
  SessionDriverRuntimeRootOptions,
} from './session-runtime-root-types.ts'

export async function startSessionDriverRuntimeRoot(
  requested: SessionDriverRuntimeRootOptions,
): Promise<SessionRuntimeRoot> {
  return startRoot(requested, async root => {
    const o = root.options
    const configured = await requested.configure(root.owners!, root.work!)
    return startSessionDriverHost({
      home: o.home,
      binding: o.binding,
      ...(o.creation === undefined ? {} : { creation: o.creation }),
      ...(o.initialRouteName === undefined ? {} : { initialRouteName: o.initialRouteName }),
      transport: o.transport,
      ...(o.presentation ? { presentation: o.presentation } : {}),
      driver: {
        ...configured,
        tenant: o.binding.tenant,
        ingress: root.ingress!,
        work: root.work!,
        clock: o.clock,
        diagnostic: o.diagnostic,
        model: {
          ...configured.model,
          original: root.modelOwner!.native(),
          executionSource: o.model.executionSource,
          results: root.results!,
        },
      },
    })
  })
}

/** Retain the actual partial root when startup or cleanup fails. This never enters the wire protocol. */
export class SessionRuntimeRootFailure extends AggregateError {
  constructor(
    errors: readonly unknown[],
    readonly closeRetained: SessionRuntimeRoot['close'],
  ) {
    super(errors, 'Session runtime root could not start; original cleanup responsibility retained')
  }
}
type RootInputs = Omit<SessionDriverRuntimeRootOptions, 'configure'>
async function startRoot(
  requested: RootInputs,
  startHost: (root: RuntimeRoot) => Promise<SessionDriverHost>,
): Promise<SessionRuntimeRoot> {
  const binding = Object.freeze(checkedTenantBinding(requested.binding)),
    source = parseRunLoginBinding(requested.source)
  if (
    !source ||
    source.centerId !== binding.centerId ||
    source.accountId !== binding.tenant.account
  )
    throw new TypeError('actual Session runtime identity required')
  const options = Object.freeze({ ...requested, binding, source: Object.freeze(source) })
  await confirmSessionRuntimeLogin(options)
  const root = new RuntimeRoot(options)
  try {
    await root.initialize()
    root.host = await startHost(root)
    return await root.listen()
  } catch (error) {
    try {
      const closed = await root.close()
      if ('pending' in closed) throw new SessionRuntimeRootFailure([error], root.close)
    } catch (closeError) {
      if (closeError instanceof SessionRuntimeRootFailure) throw closeError
      throw new SessionRuntimeRootFailure([error, closeError], root.close)
    }
    throw error
  }
}
export async function confirmSessionRuntimeLogin(
  options: Pick<SessionRuntimeRootOptions, 'governance' | 'source'>,
) {
  const opened = await options.governance.openUse()
  if (opened.kind !== 'use') throw new Error('current login unavailable')
  await usingGovernanceUse(opened.use, async use => {
    if (
      opened.origin.centerId !== options.source.centerId ||
      opened.origin.accountId !== options.source.accountId ||
      opened.origin.loginStateHandle !== options.source.loginStateHandle
    )
      throw new Error('opened governance use does not match the fixed Session source')
    const result = await readCurrentLogin(use)
    if (
      result.kind !== 'observed' ||
      result.login.centerId !== options.source.centerId ||
      result.login.accountId !== options.source.accountId ||
      result.login.loginStateHandle !== options.source.loginStateHandle
    )
      throw new Error('current login does not match the fixed Session source')
  })
}
class RuntimeRoot {
  manifest?: AssemblyManifestStore
  admission?: LocalAdmission
  log?: SqlSessionLog
  ingress?: LocalSessionIngress
  access?: LocalSessionAccess
  owners?: SessionRuntimeRootOwners
  host?: SessionDriverHost
  modelOwner?: SessionRuntimeRootOwners['originalModel']
  results?: SessionRuntimeRootOwners['modelResults']
  work?: SessionDriverWorkOwner
  bootstrap?: SessionRuntimeRootOwners['bootstrap']
  closing?: ReturnType<SessionRuntimeRoot['close']>
  constructor(readonly options: RootInputs) {}
  async initialize() {
    const o = this.options
    const probe = createSessionAdmissionProbe(o.governance, o.source, o.binding.tenant)
    this.admission = await createLocalAdmission(o.rootStorage, probe, o.admissionPolicy)
    this.manifest = createAssemblyManifestStore(o.storage)
    this.modelOwner = createSessionOriginalModelOwner({
      storage: o.storage,
      maxRecords: o.model.maxRecords,
      maxInFlight: o.model.maxInFlight,
    })
    this.results = createSessionModelResultSource({
      storage: o.storage,
      tenant: o.binding.tenant,
      executionSource: o.model.executionSource,
      maxCaptures: o.model.maxCaptures,
      retainReferencesIn: o.model.retainReferencesIn,
    })
    const work = createSessionDriverWorkOwner({
      storage: o.storage,
      tenant: o.binding.tenant,
      maxRecords: o.maxHeld,
    })
    this.work = work
    this.ingress = createLocalSessionIngress({
      ...o.tools,
      storage: o.storage,
      admission: this.admission,
      source: o.source,
      tenant: o.binding.tenant,
      principal: o.source.accountId,
      readAdmissionSource: probe.currentSource,
      policy: o.runtimePolicy,
      now: async () => {
        const instant = await o.clock.now()
        return instant === 'unavailable' ? instant : instantToRfc3339(instant)
      },
      log: authority => {
        this.log = openSqlSessionLog({
          storage: o.storage,
          authority,
          operationLimit: o.logOperationLimit,
        })
        return this.log.participant
      },
      bootstrap: {
        initialize: (...args) => {
          if (!this.bootstrap) throw new Error('actual bootstrap not ready')
          return this.bootstrap.initialize(...args)
        },
      },
      workSettledIn: work.readIn,
      modelIssue: this.modelOwner.modelIssue,
      modelResults: { maxRecords: o.model.maxRecords, source: this.results.source },
    })
    this.access = createLocalSessionAccess({
      ...o.contextAccess(this.ingress),
      tenant: o.binding.tenant,
    })
    let inputSource = o.inputSource
    if (o.creation?.definition.name === officialSessionDefinition.name) {
      inputSource = {
        ...inputSource,
        deployedOfficial: officialSessionManifest(inputSource.deployedOfficial),
      }
      await deployOfficialSessionDefinition(
        {
          ...inputSource,
          storage: o.storage,
          sessionTenancy: this.ingress.tenancy,
        },
        o.binding.tenant,
        o.clock,
      )
    }
    this.bootstrap = createSessionBootstrap({
      storage: o.storage,
      admission: this.admission,
      source: o.source,
      tenant: o.binding.tenant,
      inputSource,
      tenancy: this.ingress.tenancy,
      logBacking: this.log!.backing,
      access: this.access.operations,
      clock: o.clock,
      contextSeed: o.contextSeed,
    })
    this.owners = Object.freeze({
      manifest: this.manifest,
      log: this.log!,
      ingress: this.ingress,
      bootstrap: this.bootstrap,
      originalModel: this.modelOwner,
      modelResults: this.results,
      contextAccess: this.access,
    })
  }
  async listen(): Promise<SessionRuntimeRoot> {
    if (!this.host || !this.owners) throw new Error('actual Session runtime root not ready')
    return Object.freeze({
      socketPath: this.host.socketPath,
      owners: this.owners,
      close: this.close,
    })
  }
  close = (): ReturnType<SessionRuntimeRoot['close']> => {
    if (!this.closing)
      this.closing = this.finishClose().then(result => {
        // A known pending observation can be explicitly returned after this attempt ends.
        // Keep shared in-flight/closed results and failures; do not cache pending forever.
        if ('pending' in result) delete this.closing
        return result
      })
    return this.closing
  }
  async finishClose(): ReturnType<SessionRuntimeRoot['close']> {
    if (this.host) {
      const stopped = await this.host.close()
      if ('pending' in stopped) return { pending: true }
    }
    if (this.modelOwner) {
      const stopped = await this.modelOwner.close()
      if (stopped.kind === 'pending') return { pending: true }
    }
    if (this.results && 'pending' in this.results.close()) return { pending: true }
    await this.options.tools?.close?.()
    await this.bootstrap?.close()
    await this.manifest?.close()
    await this.access?.close()
    await this.ingress?.close()
    await this.log?.close()
    await this.admission?.close()
    this.options.presentation?.close()
    return { closed: true }
  }
}
