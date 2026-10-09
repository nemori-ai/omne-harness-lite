import { instantToRfc3339 } from '@omne-harness-lite/offer-expiry'
import { openSqlSessionLog, type SqlSessionLog } from '@omne-harness-lite/session-log-sql'
import {
  createLocalAdmission,
  createLocalSessionIngress,
  createLocalSessionAccess,
  type LocalAdmission,
  type LocalSessionAccess,
  type LocalSessionIngress,
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
import { createSessionModelResultSource } from './session-model-results.ts'
import { createSessionModelWorkOwner } from './session-work-owner.ts'
import { startRunningSessionHost, type RunningSessionHost } from './session-execution-host.ts'
import type {
  SessionRuntimeRoot,
  SessionRuntimeRootOptions,
  SessionRuntimeRootOwners,
} from './session-runtime-root-types.ts'

/** Retain the actual partial root when startup or cleanup fails. This never enters the wire protocol. */
export class SessionRuntimeRootFailure extends AggregateError {
  constructor(
    errors: readonly unknown[],
    readonly closeRetained: SessionRuntimeRoot['close'],
  ) {
    super(errors, 'Session runtime root could not start; original cleanup responsibility retained')
  }
}
/** Assemble existing owners. Storage/asset deployment and physical execution pools remain borrowed. */
export async function startSessionRuntimeRoot(
  requested: SessionRuntimeRootOptions,
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
  await confirmLogin(options)
  const root = new RuntimeRoot(options)
  try {
    await root.initialize()
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
async function confirmLogin(options: SessionRuntimeRootOptions) {
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
  admission?: LocalAdmission
  log?: SqlSessionLog
  ingress?: LocalSessionIngress
  access?: LocalSessionAccess
  owners?: SessionRuntimeRootOwners
  host?: RunningSessionHost
  modelOwner?: SessionRuntimeRootOwners['originalModel']
  results?: SessionRuntimeRootOwners['modelResults']
  bootstrap?: SessionRuntimeRootOwners['bootstrap']
  closing?: ReturnType<SessionRuntimeRoot['close']>
  constructor(readonly options: SessionRuntimeRootOptions) {}
  async initialize() {
    const o = this.options
    this.admission = await createLocalAdmission(
      o.rootStorage,
      createSessionAdmissionProbe(o.governance, o.source, o.binding.tenant),
      o.admissionPolicy,
    )
    this.modelOwner = createSessionOriginalModelOwner({
      storage: o.storage,
      current: o.model.current,
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
    const work = createSessionModelWorkOwner({
      storage: o.storage,
      tenant: o.binding.tenant,
      maxRecords: o.execution.maxHeld,
    })
    this.ingress = createLocalSessionIngress({
      storage: o.storage,
      admission: this.admission,
      source: o.source,
      tenant: o.binding.tenant,
      principal: o.source.accountId,
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
      ingress: this.ingress,
      bootstrap: this.bootstrap,
      originalModel: this.modelOwner,
      modelResults: this.results,
      contextAccess: this.access,
    })
    this.host = await startRunningSessionHost({
      home: o.home,
      binding: o.binding,
      ingress: this.ingress,
      work,
      ...(o.creation === undefined ? {} : { creation: o.creation }),
      transport: o.transport,
      execution: o.execution,
      identities: o.identities,
      model: o.model.configure(this.owners),
      diagnostic: o.diagnostic,
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
    await this.bootstrap?.close()
    await this.access?.close()
    await this.ingress?.close()
    await this.log?.close()
    await this.admission?.close()
    return { closed: true }
  }
}
