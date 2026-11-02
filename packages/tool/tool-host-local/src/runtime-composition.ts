import type { Context } from '@deepseek-ai/cordis'
import { fail } from '@omne-harness/operation-result'
import type {
  ToolConfiguration,
  ToolControlSubjects,
  ToolDependencies,
  ToolGrantVerifier,
  ToolLedgerPorts,
  ToolLedgerStore,
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

type Bindings = ToolBindings<unknown, ToolMessageContentBlock, ToolEnvironmentValue>
export type RuntimeEnvironment = ToolEnvironment<unknown, ToolEnvironmentValue>
export type LocalToolRuntimeInput = Readonly<{
  store: ToolLedgerStore<ToolMessageContentBlock>
  custody: ToolOutputCustody<unknown>
  content: ToolLedgerPorts<unknown>['content']
  sources: LocalInvocationSource<unknown>
  access: ToolHostAccess<unknown>
  controlSubjects: ToolControlSubjects<unknown>
  grants: ReadonlyMap<string, ToolGrantVerifier<unknown>>
  guardsOf: LocalStartCoordinatorInput<unknown>['guardsOf']
  permitRequirements: NonNullable<LocalStartCoordinatorInput<unknown>['permitRequirements']>
  resolveAccess: LocalInstanceInput<unknown>['resolveAccess']
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

export const runtimeUnavailable = (dependency: string) =>
  Promise.resolve(
    fail({
      kind: 'unavailable' as const,
      dependency,
      diagnostic: 'The current stage provider is absent or retired.',
    }),
  )

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
): ToolDependencies<unknown, ToolMessageContentBlock, ToolEnvironmentValue> {
  const absent = createAbsentToolPorts<unknown>()
  return {
    ...records.ledger,
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
        if (!admit(null))
          return {
            kind: 'rejected',
            failure: {
              kind: 'unavailable',
              dependency: 'tool-executor',
              diagnostic: 'The executor is absent or retired.',
            },
          }
        const bound = await input.sources.issuer.resolve(request)
        if (bound.kind === 'rejected' || bound.kind === 'association-unknown') return bound
        if (!admit({ tenant: request.tenant, call: bound.call }))
          return {
            kind: 'rejected',
            failure: {
              kind: 'unavailable',
              dependency: 'tool-executor',
              diagnostic: 'The executor is retired or its known-call capacity is full.',
            },
          }
        return bound
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
