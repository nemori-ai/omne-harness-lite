// The runtime factory (G8): `createToolRuntime(dependencies, configuration)` gives the ToolProvider
// whose `runtime` is the consumer-facing ToolRuntime. In this increment the runtime serves the
// managed path of logical results: admit, lookup, queryOperation, readResult, releaseDelivery and
// account go to the ledger ports; every other operation answers a named `unsupported`.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import {
  describedAdoption,
  type Adoption,
  type ToolFailure,
  type ToolProvider,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import type { ToolConfiguration, ToolDependencies } from './construction.ts'
import { isPositiveSafeInteger, judgeAuthorLimits } from './limits.ts'

/** The identity of this runtime implementation, named in its `unsupported` answers. */
export const toolRuntimeAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-runtime',
  revision: '1',
})

const PORTS = [
  'commands',
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

const CAPACITIES = ['processBatchBytes', 'observerBufferBytes', 'resultPageBytes'] as const
const DELAYS = ['processBatchDelayMs', 'reconciliationDelayMs'] as const

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * The construction-time check of the configuration (342: capacities positive, delays
 * non-negative and finite, all verified at load). A bad configuration is an assembly defect, so
 * it throws instead of building a runtime that would misbehave later.
 */
function checkConfiguration(configuration: ToolConfiguration): void {
  const limits = judgeAuthorLimits(
    Object.fromEntries(Object.entries(configuration).filter(([key]) => !isRuntimeBudget(key))),
    'configuration',
  )
  if ('failure' in limits) throw new TypeError(`${limits.failure.field}: ${limits.failure.reason}`)
  for (const key of CAPACITIES)
    if (!isPositiveSafeInteger(configuration[key]))
      throw new TypeError(`configuration.${key}: range`)
  for (const key of DELAYS)
    if (!isNonNegativeSafeInteger(configuration[key]))
      throw new TypeError(`configuration.${key}: range`)
}

function isRuntimeBudget(key: string): boolean {
  return (
    (CAPACITIES as readonly string[]).includes(key) || (DELAYS as readonly string[]).includes(key)
  )
}

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
  checkConfiguration(configuration)
  checkDependencies(dependencies)
  const { commands, reads } = dependencies
  const runtime: ToolRuntime<P, B> = {
    inspect: () => unsupported('inspect', 'ticket 06'),
    admit: async input => {
      // The recall question is answered by the operation record, not by the admit reply, which
      // is the original receipt in both cases (P01). A duplicate that races the first commit
      // reports `recovered: false`; both callers still hold the same original state.
      const known = await reads.operation(input)
      if ('failure' in known)
        // The read is internal to the admission, so its denial is the admission's denial.
        return known.failure.kind === 'denied' ? fail({ kind: 'denied', action: 'admit' }) : known
      const admitted = await commands.admit(input)
      if ('failure' in admitted) return admitted
      return succeed({ state: admitted.ok, recovered: known.ok.kind === 'committed' })
    },
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
