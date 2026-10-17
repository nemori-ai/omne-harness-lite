// The runtime factory (G8): `createToolRuntime(dependencies, configuration)` gives the ToolProvider
// whose `runtime` is the consumer-facing ToolRuntime. In this increment the runtime serves the
// managed path of logical results: admit, lookup, queryOperation, readResult, releaseDelivery and
// account go to the ledger ports; every other operation answers a named `unsupported`.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  describedAdoption,
  type Adoption,
  type ToolFailure,
  type ToolProvider,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import { checkToolConfiguration } from './configuration.ts'
import type { ToolConfiguration, ToolDependencies } from './construction.ts'

/** The identity of this runtime implementation, named in its `unsupported` answers. */
export const toolRuntimeAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-runtime',
  revision: '1',
})

const PORTS = [
  'commands',
  'admissions',
  'bindings',
  'environments',
  'decisions',
  'instances',
  'clock',
  'resultPolicy',
  'authority',
  'resources',
  'custody',
  'catalog',
  'reads',
  'children',
] as const satisfies readonly (keyof ToolDependencies<unknown, ContentBlock, unknown>)[]

function checkDependencies<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
): void {
  for (const port of PORTS) {
    const value: unknown = dependencies[port]
    if (typeof value !== 'object' || value === null)
      throw new TypeError(`dependencies.${port}: missing`)
  }
}

function unsupported(name: string, increment: string): Promise<Outcome<never, ToolFailure>> {
  return Promise.resolve(
    fail({
      kind: 'unsupported',
      adoption: toolRuntimeAdoption,
      reason: `${name} is not implemented in this increment (${increment})`,
    }),
  )
}

/**
 * Builds the provider. Nothing starts here: no driver is installed on the instance host, because
 * the logical-result path of this increment needs no coroutine. Later tickets add the driver.
 */
export function createToolRuntime<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  configuration: ToolConfiguration,
): ToolProvider<P, B> {
  checkToolConfiguration(configuration)
  checkDependencies(dependencies)
  const { commands, reads, admissions } = dependencies
  const runtime: ToolRuntime<P, B> = {
    inspect: () => unsupported('inspect', 'ticket 06'),
    // The ledger tells whether it recalled a committed admission (P01); the runtime does not
    // read the operation first, so an admission needs no query permission.
    admit: input => admissions.admit(input),
    lookup: input => reads.lookup(input),
    queryOperation: input => reads.operation(input),
    control: () => unsupported('control', 'ticket 08'),
    acceptDecision: () => unsupported('acceptDecision', 'ticket 12'),
    acceptResource: () => unsupported('acceptResource', 'ticket 12'),
    readProcess: () => unsupported('readProcess', 'ticket 09'),
    readWait: () => unsupported('readWait', 'ticket 12'),
    readDiagnostics: () => unsupported('readDiagnostics', 'ticket 09'),
    readResult: input => reads.result(input),
    releaseDelivery: input => commands.releaseDelivery(input),
    account: input => reads.account(input),
    catalog: dependencies.catalog,
    content: reads.content,
    instances: dependencies.instances.directory,
  }
  return Object.freeze({
    runtime: Object.freeze(runtime),
    recover: () => unsupported('recover', 'ticket 10'),
    quiesce: () => unsupported('quiesce', 'ticket 11'),
    inspectDrain: () => unsupported('inspectDrain', 'ticket 11'),
    handover: () => unsupported('handover', 'ticket 11'),
  })
}
