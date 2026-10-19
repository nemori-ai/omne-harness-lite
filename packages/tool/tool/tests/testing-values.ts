import {
  createTestToolDependencies,
  type TestToolDependenciesInput,
} from '@omne-harness/tool/testing'
import { defaultResultPolicy } from '@omne-harness/tool-contract'
import { configuration, guards, instanceId, testHost, type Principal } from './runtime-values.ts'

/** Caller-owned ports for tests that do not resolve or execute real tool calls. */
export function testAssembly(overrides: Partial<TestToolDependenciesInput<Principal>> = {}) {
  const missing = (): never => {
    throw new Error('not on this path')
  }
  const host = testHost({ calls: new Map() })
  const config = configuration()
  const input: TestToolDependenciesInput<Principal> = {
    instance: instanceId,
    configuration: config,
    guards: { ...guards(), policy: defaultResultPolicy },
    instances: host,
    catalog: { inspect: missing, usage: missing, search: missing },
    children: {
      reserve: missing,
      admitted: missing,
      retain: missing,
      list: missing,
      close: missing,
      closure: missing,
      confirmBarrier: missing,
      finish: missing,
    },
    bindingsFor: () => ({ inspect: missing, resolve: missing, recover: missing }),
    ...overrides,
  }
  return { ...createTestToolDependencies(input), host, configuration: config, input }
}
