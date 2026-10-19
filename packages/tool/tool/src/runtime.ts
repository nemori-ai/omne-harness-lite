// The runtime factory (G8): `createToolRuntime(dependencies, configuration)` gives the ToolProvider
// whose `runtime` is the consumer-facing ToolRuntime. The runtime serves the managed path: admit,
// lookup, queryOperation, readResult, releaseDelivery and account go to the ledger ports, inspect
// goes to the Catalog, and the driver that carries an admitted call to its start is installed on
// the instance host. Every other operation answers a named `unsupported`.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolInstanceId,
  describedAdoption,
  type Adoption,
  type ToolFailure,
  type ToolProvider,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import { checkToolConfiguration, driverRetryDelayMs, driverStepsPerRun } from './configuration.ts'
import type { ToolConfiguration, ToolDependencies } from './construction.ts'
import { createToolDriver } from './driver.ts'

/** The identity of this runtime implementation, named in its `unsupported` answers. */
export const toolRuntimeAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-runtime',
  revision: '1',
})

const PORTS = [
  'commands',
  'admissions',
  'queues',
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
  if ('failure' in decodeToolInstanceId(dependencies.instance))
    throw new TypeError('dependencies.instance: not-an-instance-id')
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
 * Builds the provider and installs the driver on the instance host. The installation admits no
 * business: the host wakes the driver for a call when the runtime schedules it after an
 * admission, and the driver reads the ledger before it does anything.
 */
export function createToolRuntime<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  configuration: ToolConfiguration,
): ToolProvider<P, B> {
  checkToolConfiguration(configuration)
  checkDependencies(dependencies)
  const { commands, reads, admissions, instances, catalog } = dependencies
  const driver = createToolDriver(dependencies, {
    stepsPerRun: driverStepsPerRun(configuration),
    retryDelayMs: driverRetryDelayMs(configuration),
  })
  // The release of the installation belongs to the drain (`quiesce` and `handover`).
  instances.install(driver)
  const runtime: ToolRuntime<P, B> = {
    // The current availability is the Catalog's answer (P16: without a Catalog, inspect is
    // unavailable with dependency toolCatalog); the runtime adds nothing to it.
    inspect: input => catalog.inspect(input),
    // The ledger tells whether it recalled a committed admission (P01); the runtime does not
    // read the operation first, so an admission needs no query permission. An admission of a
    // real tool that still waits for its first step wakes the driver, a recalled one too: the
    // first answer may have been lost before its wake-up. The wake-up is a hint, so its failure
    // changes no answer.
    admit: async input => {
      const admitted = await admissions.admit(input)
      if ('ok' in admitted && admitted.ok.state.phase === 'accepted') {
        try {
          await instances.schedule({ tenant: input.tenant, call: input.call })
        } catch {
          // A lost wake-up is compensated by the recovery scan (`scanPending`).
        }
      }
      return admitted
    },
    lookup: input => reads.lookup(input),
    queryOperation: input => reads.operation(input),
    control: () => unsupported('control', 'controls'),
    acceptDecision: () => unsupported('acceptDecision', 'waits, decisions and resources'),
    acceptResource: () => unsupported('acceptResource', 'waits, decisions and resources'),
    readProcess: () => unsupported('readProcess', 'process observation and diagnostics'),
    readWait: () => unsupported('readWait', 'waits, decisions and resources'),
    readDiagnostics: () => unsupported('readDiagnostics', 'process observation and diagnostics'),
    readResult: input => reads.result(input),
    releaseDelivery: input => commands.releaseDelivery(input),
    account: input => reads.account(input),
    catalog,
    content: reads.content,
    instances: dependencies.instances.directory,
  }
  return Object.freeze({
    runtime: Object.freeze(runtime),
    recover: () => unsupported('recover', 'recovery scan'),
    quiesce: () => unsupported('quiesce', 'drain and handover'),
    inspectDrain: () => unsupported('inspectDrain', 'drain and handover'),
    handover: () => unsupported('handover', 'drain and handover'),
  })
}
