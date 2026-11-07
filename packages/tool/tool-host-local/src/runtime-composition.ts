import type { Context } from '@deepseek-ai/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  canonicalDigest,
  isTenantShape,
  type ToolConfiguration,
  type ToolControlSubjects,
  type ToolDependencies,
  type ToolGrantVerifier,
  type ToolLedgerPorts,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import type { ToolCatalog } from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  type ToolBindings,
  type ToolEnvironment,
  type ToolInstanceHost,
  type ToolMessageContentBlock,
  type ToolClock,
  type ToolOutputCustody,
  type ToolForwardSource,
  type ToolForwardBinding,
  type CallAccess,
} from '@omne-harness/tool-contract/provider'
import type { ToolEnvironmentValue } from './author-environment.ts'
import type {
  LocalExecutionEnvironmentInput,
  LocalEnvironmentPlanInput,
} from './execution-environment.ts'
import type { EnvironmentGuardedHostCommit } from './environment-state.ts'
import type { LocalInstanceInput } from './instance-host.ts'
import { createLocalOperationIdentities, type LocalInvocationSource } from './invocation-source.ts'
import type { ToolHostAccess } from './ledger-guards.ts'
import type { LocalStartCoordinatorInput } from './start-coordinator.ts'
import type { RuntimeRecords } from './runtime-records.ts'
import { createAbsentToolPorts } from './absent-ports.ts'
import type { LocalToolControlSubjectsInput } from './control-subject-adapter.ts'

type Bindings = ToolBindings<unknown, ToolEnvironmentValue>
export type RuntimeEnvironment = ToolEnvironment<unknown, ToolEnvironmentValue>
export type LocalToolRuntimeInput = Readonly<{
  store: ToolLedgerStore<ToolMessageContentBlock>
  custody: ToolOutputCustody<unknown>
  materials: NonNullable<ToolLedgerPorts<unknown>['materials']>
  content: ToolLedgerPorts<unknown>['content']
  sources: LocalInvocationSource<unknown, ToolMessageContentBlock>
  access: ToolHostAccess<unknown>
  subjects: RuntimeSourceRecovery
  grants: ReadonlyMap<string, ToolGrantVerifier<unknown>>
  guardsOf: LocalStartCoordinatorInput<unknown>['guardsOf']
  permitRequirements: NonNullable<LocalStartCoordinatorInput<unknown>['permitRequirements']>
  clock: ToolClock
  configuration: ToolConfiguration
  bindings(): Bindings | undefined
  catalog(): ToolCatalog<unknown> | undefined
  environment: Readonly<{
    adoption: LocalExecutionEnvironmentInput<unknown>['adoption']
    plan: Omit<LocalEnvironmentPlanInput<unknown>, 'execution' | 'access'>
    naming: LocalExecutionEnvironmentInput<unknown>['naming']
    cleanup: LocalExecutionEnvironmentInput<unknown>['cleanup']
    guarded: EnvironmentGuardedHostCommit
  }>
  capacity: number
  observersPerCall: number
  observerQueueFrames: number
  observerResidenceMs: number
}>

export type RuntimeCompositionInput = LocalToolRuntimeInput &
  Readonly<{
    controlSubjects: ToolControlSubjects<unknown>
    resolveAccess: LocalInstanceInput<unknown>['resolveAccess']
  }>

export const runtimeUnavailable = (dependency: string) =>
  Promise.resolve(
    fail({
      kind: 'unavailable' as const,
      dependency,
      diagnostic: 'The current stage provider is absent or retired.',
    }),
  )

/** Cancels only this wait; the original operation may still finish after retirement. */
export function waitRuntime<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const stop = () => resolve(null)
    const finish = () => signal.removeEventListener('abort', stop)
    signal.addEventListener('abort', stop, { once: true })
    let pending: Promise<T>
    try {
      pending = work()
    } catch (error) {
      finish()
      reject(error)
      return
    }
    void pending.then(
      value => {
        finish()
        resolve(value)
      },
      error => {
        finish()
        reject(error)
      },
    )
    if (signal.aborted) stop()
  })
}

export type RuntimeStages = Readonly<{
  bindings: Bindings
  environments: RuntimeEnvironment
  catalog: ToolCatalog<unknown>
}>

export function createRuntimeStages(
  input: LocalToolRuntimeInput,
  environment: () => RuntimeEnvironment | null,
): RuntimeStages {
  return {
    bindings: {
      inspect: request => input.bindings()?.inspect(request) ?? runtimeUnavailable('toolBindings'),
      resolve: request => input.bindings()?.resolve(request) ?? runtimeUnavailable('toolBindings'),
      recover: request => input.bindings()?.recover(request) ?? runtimeUnavailable('toolBindings'),
    },
    environments: {
      adoption: input.environment.adoption,
      prepare: request => environment()?.prepare(request) ?? runtimeUnavailable('toolEnvironments'),
      inspectPreparation: request =>
        environment()?.inspectPreparation(request) ?? runtimeUnavailable('toolEnvironments'),
      release: request => environment()?.release(request) ?? runtimeUnavailable('toolEnvironments'),
      inspectRelease: request =>
        environment()?.inspectRelease(request) ?? runtimeUnavailable('toolEnvironments'),
    },
    catalog: {
      inspect: request => input.catalog()?.inspect(request) ?? runtimeUnavailable('toolCatalog'),
      usage: request => input.catalog()?.usage(request) ?? runtimeUnavailable('toolCatalog'),
      search: request => input.catalog()?.search(request) ?? runtimeUnavailable('toolCatalog'),
    },
  }
}

export function createRuntimeDependencies(
  ctx: Context,
  input: LocalToolRuntimeInput,
  stages: RuntimeStages,
  records: RuntimeRecords,
  host: () => ToolInstanceHost<unknown> | null,
  admit: (wake: Parameters<ToolInstanceHost<unknown>['schedule']>[0] | null) => boolean,
  rejectAdmission: (wake: Parameters<ToolInstanceHost<unknown>['schedule']>[0]) => void,
  knows: (wake: Parameters<ToolInstanceHost<unknown>['schedule']>[0]) => boolean,
): ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue> & {
  forwardSource: ToolForwardSource<unknown>
} {
  const rejectedCapacity = () => ({
    kind: 'rejected' as const,
    failure: {
      kind: 'unavailable' as const,
      dependency: 'tool-executor',
      diagnostic: 'The executor is absent, retired or its known-call capacity is full.',
    },
  })
  const reserveKnownCall = async <T extends Pick<ToolForwardBinding, 'call' | 'recovered'>>(
    tenant: CallAccess<unknown>['tenant'],
    bound: T,
  ): Promise<T | ReturnType<typeof rejectedCapacity>> => {
    const wake = { tenant: tenant, call: bound.call }
    if (bound.recovered && !knows(wake)) {
      const prior = await input.store.read({ kind: 'call', ...wake })
      if (prior.kind !== 'complete')
        return {
          kind: 'rejected',
          failure: {
            kind: 'unavailable',
            dependency: 'tool-executor',
            diagnostic: 'The original admission cannot be assigned to this executor.',
          },
        }
      if (prior.records.some(row => row.kind === 'call')) return bound
    }
    if (!admit(wake))
      return {
        kind: 'rejected',
        failure: {
          kind: 'unavailable',
          dependency: 'tool-executor',
          diagnostic: 'The executor is retired or its known-call capacity is full.',
        },
      }
    return bound
  }
  const absent = createAbsentToolPorts<unknown>()
  return {
    ...records.ledger,
    admissions: {
      async admit(request) {
        const answer = await records.ledger.admissions.admit(request)
        if ('failure' in answer && answer.failure.kind !== 'commit-unknown')
          rejectAdmission(request)
        return answer
      },
    },
    ...stages,
    authority: records.authority,
    clock: input.clock,
    resultPolicy: defaultResultPolicy,
    custody: input.custody,
    decisions: absent.toolDecisions,
    resources: absent.toolResourceResponses,
    children: absent.toolChildren,
    operationIdentities: createLocalOperationIdentities(),
    sourceIssuer: {
      async resolve(request) {
        if (!admit(null)) return rejectedCapacity()
        const bound = await input.sources.issuer.resolve(request)
        return bound.kind === 'bound' ? reserveKnownCall(request.tenant, bound) : bound
      },
    },
    forwardSource: {
      async resolve(request) {
        if (!admit(null)) return rejectedCapacity()
        const bound = await input.sources.forwarding.resolve(request)
        return bound.kind === 'bound' ? reserveKnownCall(request.tenant, bound) : bound
      },
      async lookup(request) {
        if (!admit(null)) return fail(rejectedCapacity().failure)
        const found = await input.sources.forwarding.lookup(request)
        if ('failure' in found || found.ok.kind !== 'bound') return found
        const reserved = await reserveKnownCall(request.tenant, found.ok.binding)
        return 'kind' in reserved && reserved.kind === 'rejected' ? fail(reserved.failure) : found
      },
    },
    instances: {
      install: driver => {
        const current = host()
        if (current === null) throw new Error('The instance host is absent.')
        return current.install(driver)
      },
      schedule: wake => host()?.schedule(wake) ?? runtimeUnavailable('toolInstanceHost'),
      publish: (execution, handle) =>
        host()?.publish(execution, handle) ?? runtimeUnavailable('toolInstanceHost'),
      withdraw: receipt => host()?.withdraw(receipt) ?? runtimeUnavailable('toolInstanceHost'),
      directory: {
        connect: request =>
          ctx.get('toolInstances')?.connect(request) ?? runtimeUnavailable('toolInstances'),
      },
    },
  }
}

export type RuntimeSourceRecovery = Pick<
  LocalToolControlSubjectsInput<unknown, ToolMessageContentBlock>,
  'project' | 'resolveSessionWork'
>

function sourceSession(value: unknown, tenant: CallAccess<unknown>['tenant']): string | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('kind' in value) ||
    value.kind !== 'acting-for-tenant' ||
    !('tenant' in value) ||
    !isTenantShape(value.tenant) ||
    canonicalDigest(value.tenant) !== canonicalDigest(tenant) ||
    !('actor' in value) ||
    typeof value.actor !== 'object' ||
    value.actor === null ||
    !('component' in value.actor) ||
    value.actor.component !== 'sessionWorkPrincipals' ||
    ('kind' in value.actor && value.actor.kind !== 'system') ||
    !('work' in value) ||
    typeof value.work !== 'object' ||
    value.work === null ||
    !('owner' in value.work) ||
    value.work.owner !== 'session' ||
    !('work' in value.work) ||
    typeof value.work.work !== 'string' ||
    value.work.work.length === 0
  )
    return null
  return value.work.work
}

export function createRuntimeSourceAccess(
  input: Readonly<{
    store: LocalToolRuntimeInput['store']
    sources: LocalToolRuntimeInput['sources']
    access: LocalToolRuntimeInput['access']
    recovery: RuntimeSourceRecovery
  }>,
): LocalInstanceInput<unknown>['resolveAccess'] {
  return async wake => {
    try {
      if (!tenantCodec.encode(wake.tenant).ok) return fail({ kind: 'denied', action: 'recover' })
      const read = await input.store.read({ kind: 'call', ...wake })
      if (read.kind !== 'complete') return runtimeUnavailable('invocation-source')
      const row = read.records.find(record => record.kind === 'call')
      if (
        row?.kind !== 'call' ||
        row.call.call !== wake.call ||
        canonicalDigest(row.call.tenant) !== canonicalDigest(wake.tenant)
      )
        return runtimeUnavailable('invocation-source')
      const call = row.call
      const binding = await input.sources.recoverBinding({
        tenant: wake.tenant,
        call: call.call,
        admission: call.admission,
        request: call.request,
      })
      if ('failure' in binding) return runtimeUnavailable('invocation-source')
      const session = sourceSession(binding.ok.principal, wake.tenant)
      if (session === null) return runtimeUnavailable('invocation-source-principal')
      const resolved = await input.recovery.resolveSessionWork({ tenant: wake.tenant, session })
      if ('failure' in resolved)
        return resolved.failure.kind === 'denied'
          ? fail({ kind: 'denied', action: 'recover' })
          : runtimeUnavailable('sessionWorkPrincipals')
      const projected = await input.recovery.project(resolved.ok)
      if ('failure' in projected)
        return projected.failure.kind === 'denied'
          ? fail({ kind: 'denied', action: 'recover' })
          : runtimeUnavailable('sessionWorkPrincipals')
      if (
        !tenantCodec.encode(projected.ok.tenant).ok ||
        sourceSession(projected.ok, wake.tenant) !== session
      )
        return fail({ kind: 'denied', action: 'recover' })
      const access = { ...wake, principal: resolved.ok }
      const verified = await input.sources.guard.verify({
        ...access,
        operation: call.admission,
        request: call.request,
      })
      if (verified.kind === 'forged' || verified.kind === 'denied')
        return fail({ kind: 'denied', action: 'recover' })
      if (verified.kind !== 'trusted') return runtimeUnavailable('invocation-source')
      for (const action of ['recover', 'write'] as const) {
        const verdict = await input.access.guard.qualify({ ...access, action })
        if (verdict.kind === 'denied') return fail({ kind: 'denied', action })
        if (verdict.kind !== 'allowed') return runtimeUnavailable('tool-access')
      }
      return succeed(access)
    } catch {
      return runtimeUnavailable('invocation-source')
    }
  }
}
