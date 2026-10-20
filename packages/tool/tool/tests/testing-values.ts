import {
  createTestToolDependencies,
  createTestInvocationSource,
  createTestToolIdentities,
  type TestToolDependenciesInput,
} from '@omne-harness/tool/testing'
import { defaultResultPolicy } from '@omne-harness/tool-contract'
import {
  configuration,
  guards,
  invokeAuthority,
  testHost,
  type Principal,
} from './runtime-values.ts'

/** Caller-owned ports for tests that do not resolve or execute real tool calls. */
export function testAssembly(overrides: Partial<TestToolDependenciesInput<Principal>> = {}) {
  const missing = (): never => {
    throw new Error('not on this path')
  }
  const identities = createTestToolIdentities()
  const source = createTestInvocationSource<Principal>({ authority: invokeAuthority() })
  const host = testHost({ calls: new Map() }, identities.instanceIdentities)
  const config = configuration()
  const input: TestToolDependenciesInput<Principal> = {
    configuration: config,
    guards: { ...guards(), sources: source.guard, policy: defaultResultPolicy },
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
    operationIdentities: identities.operationIdentities,
    sourceIssuer: source.issuer,
    bindingsFor: () => ({ inspect: missing, resolve: missing, recover: missing }),
    ...overrides,
  }
  return {
    ...createTestToolDependencies(input),
    host,
    configuration: config,
    input,
    identities,
    source,
  }
}
