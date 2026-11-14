import {
  createAgentRuntime,
  type AgentConfiguration,
  type AgentDependencies,
  type AgentProvider,
  type AgentRuntimeOptions,
} from '@omne-harness/agent'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import type {
  AgentInstanceId,
  AgentObservation,
  AgentRegistrationHandle,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import { adoption, evidence, instance, ok, tenantA, type Principal } from './journal-support.ts'

export type Dependencies = AgentDependencies<Principal, ContentBlock>

export function options(configuration: Partial<AgentConfiguration> = {}): AgentRuntimeOptions {
  return {
    binding: {
      instance: instance(),
      tenant: tenantA,
      scope: evidence('scope'),
      definition: adoption('definition'),
    },
    configuration: {
      observerBufferBytes: 1024,
      reconciliationDelaysMs: [0],
      reconciliationBatchLimit: 8,
      denialBackoffMs: 0,
      toolConcurrency: 1,
      jointCommits: [],
      coordination: 'standalone',
      loopGuardPolicy: adoption('loop-guard'),
      modelRetry: { maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 0 },
      ...configuration,
    },
  }
}

function recorded<T extends object>(target: T, path: string, calls: string[]): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver)
      const name = `${path}.${String(property)}`
      const own = Object.getOwnPropertyDescriptor(object, property)
      if (own !== undefined && !own.configurable && own.writable === false) return value
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(name)
          return Reflect.apply(value, object, args)
        }
      }
      if (typeof value === 'object' && value !== null) return recorded(value, name, calls)
      return value
    },
  })
}

export function watched(dependencies: Dependencies): Readonly<{
  dependencies: Dependencies
  calls: string[]
}> {
  const calls: string[] = []
  const proxied = Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => [
      key,
      typeof value === 'object' && value !== null ? recorded(value, key, calls) : value,
    ]),
  ) as Dependencies
  return { dependencies: proxied, calls }
}

export function registrationHandle(
  of: AgentInstanceId,
  calls: string[],
): AgentRegistrationHandle<Principal> {
  return {
    instance: of,
    report: () => {
      calls.push('registration.report')
    },
    withdraw: () => {
      calls.push('registration.withdraw')
      return Promise.resolve(succeed(null))
    },
  }
}

export async function createdProvider(
  dependencies: Dependencies = createTestAgentDependencies<Principal>().dependencies,
): Promise<AgentProvider<Principal>> {
  return ok(await createAgentRuntime(dependencies, options()))
}

export async function take(
  sequence: AsyncIterable<AgentObservation>,
  count: number,
): Promise<AgentObservation[]> {
  const seen: AgentObservation[] = []
  if (count <= 0) return seen
  for await (const observation of sequence) {
    seen.push(observation)
    if (seen.length >= count) break
  }
  return seen
}
