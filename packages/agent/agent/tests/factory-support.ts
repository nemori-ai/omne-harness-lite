// Values and helpers that the factory and access tests share: valid options, a dependency record
// that logs every method call made anywhere inside it, and a registration handle double.
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
      reconciliationDelayMs: 0,
      reconciliationBatchLimit: 8,
      denialBackoffMs: 0,
      toolConcurrency: 1,
      jointCommits: [],
      loopGuardPolicy: adoption('loop-guard'),
      ...configuration,
    },
  }
}

/**
 * Wraps a dependency so that every method call anywhere inside it is logged by its path. A frozen
 * member is returned as it is, because a proxy may not change what a frozen property reads.
 */
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

/** Every dependency of the record behind a call log: `calls` lists `journal.load` and the like. */
export function watched(dependencies: Dependencies): Readonly<{
  dependencies: Dependencies
  calls: string[]
}> {
  const calls: string[] = []
  // Each value keeps its shape behind the proxy, so the record keeps the type of `dependencies`.
  const proxied = Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => [
      key,
      typeof value === 'object' && value !== null ? recorded(value, key, calls) : value,
    ]),
  ) as Dependencies
  return { dependencies: proxied, calls }
}

/** A registration handle for `instance` whose methods only log that they were called. */
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

/** A provider built from the test assembly; a creation failure fails the test. */
export async function createdProvider(
  dependencies: Dependencies = createTestAgentDependencies<Principal>().dependencies,
): Promise<AgentProvider<Principal>> {
  return ok(await createAgentRuntime(dependencies, options()))
}

/** Reads observations until the sequence ends or `count` have been read. */
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
