import type { ContentBlock } from '@omne-harness/content-block'
import type { Failure, Reply } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { accessGuard } from './access.ts'
import { judgeOptions } from './configuration.ts'
import type {
  AgentConfiguration,
  AgentDependencies,
  AgentProvider,
  AgentRuntimeOptions,
} from './construction.ts'
import { createAgentMeasurer, type AgentRuntimeExtras } from './measure.ts'
import { createProvider } from './provider.ts'

const REQUIRED = [
  'journal',
  'access',
  'models',
  'adoptions',
  'conditions',
  'requests',
  'selection',
  'modelContext',
  'handoff',
  'clock',
  'random',
] as const satisfies readonly (keyof AgentDependencies<unknown, ContentBlock>)[]

function isPresent(value: unknown): boolean {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
}

function foreignRegistration<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  options: AgentRuntimeOptions,
): Failure | undefined {
  const { registration } = dependencies
  if (!isPresent(registration) || registration?.instance === options.binding.instance)
    return undefined
  return { kind: 'denied', action: 'createAgentRuntime' }
}

function absentDependency<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
): Failure | undefined {
  const absent = REQUIRED.find(name => !isPresent(dependencies[name]))
  if (absent === undefined) return undefined
  return {
    kind: 'unavailable',
    owner: '@omne-harness/agent',
    diagnostic: `required dependency ${absent} is absent`,
  }
}

function undeclaredCapability<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  configuration: AgentConfiguration,
): Failure | undefined {
  const { coordination, participants } = dependencies.journal.capabilities
  if (coordination !== configuration.coordination) return { kind: 'unsupported' }
  return configuration.jointCommits.every(kind => participants.has(kind))
    ? undefined
    : { kind: 'unsupported' }
}

export async function createAgentRuntime<P, B extends ContentBlock>(
  dependencies: AgentDependencies<P, B>,
  options: AgentRuntimeOptions,
  extras: AgentRuntimeExtras = {},
): Reply<AgentProvider<P>> {
  const refusal =
    judgeOptions(options) ??
    foreignRegistration(dependencies, options) ??
    absentDependency(dependencies) ??
    undeclaredCapability(dependencies, options.configuration)
  if (refusal !== undefined) return fail(refusal)
  const { binding } = options
  return succeed(
    createProvider({
      binding,
      configuration: options.configuration,
      guard: accessGuard(binding.tenant, dependencies.access),
      dependencies,
      measurer: createAgentMeasurer(extras.measure, binding.tenant),
      failed: extras.failed,
      endedFailed: extras.endedFailed,
      waiting: extras.waiting,
      modelRetrying: extras.modelRetrying,
    }),
  )
}
