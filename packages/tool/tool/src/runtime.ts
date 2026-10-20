// Ordinary calls mint identities and bind their trusted source before entering the ledger.
// Saved references route each access to the original port; the host owns live instances.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  describedAdoption,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  judgeToolInvokeRequest,
  type Adoption,
  type ToolDefiniteFailure,
  type ToolFailure,
  type ToolInvocationCommands,
  type ToolInvocationContentReader,
  type ToolInvocationDirectory,
  type ToolInvocationQueries,
  type ToolInvokeOutcome,
  type ToolProvider,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import { checkToolConfiguration, driverRetryDelayMs, driverStepsPerRun } from './configuration.ts'
import type { ToolConfiguration, ToolDependencies } from './construction.ts'
import { createToolDriver } from './driver.ts'
import { invocationInput, operationInput } from './invocation-access.ts'

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
  'invocationIdentities',
  'operationIdentities',
  'sourceIssuer',
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

/** The dependency names of the trusted construction ports, named in their `unavailable` answers. */
const IDENTITIES = 'toolIdentities'
const SOURCE = 'toolInvocationSource'

/**
 * The diagnostic of a port that threw. A thrown message can carry a connection string or other
 * secret text (P05: diagnostics carry no secret), so the answer names the dependency only.
 */
function thrown(dependency: string): string {
  return `${dependency} threw an exception; its message is not reported`
}

function rejected(failure: ToolDefiniteFailure): ToolInvokeOutcome {
  return { kind: 'rejected', failure }
}

function identityFailure(failure: ToolFailure): ToolDefiniteFailure {
  if (failure.kind === 'denied' || failure.kind === 'invalid') return failure
  return {
    kind: 'unavailable',
    dependency: IDENTITIES,
    diagnostic:
      failure.kind === 'unavailable'
        ? failure.diagnostic
        : 'the identity port answered without a usable identity; no Tool admission was sent',
  }
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
  const { invocationIdentities, operationIdentities, sourceIssuer } = dependencies
  const driver = createToolDriver(dependencies, {
    stepsPerRun: driverStepsPerRun(configuration),
    retryDelayMs: driverRetryDelayMs(configuration),
  })
  // The release of the installation belongs to the drain (`quiesce` and `handover`).
  instances.install(driver)

  const invoke: ToolRuntime<P, B>['invoke'] = async input => {
    if (typeof input !== 'object' || input === null || !('principal' in input))
      return rejected({ kind: 'denied', action: 'admit' })
    const judged = judgeToolInvokeRequest(Reflect.get(input, 'request'))
    if ('failure' in judged)
      return rejected({
        kind: 'invalid',
        field: `request.${judged.failure.field}`,
        reason: judged.failure.reason,
      })
    const request = judged.ok
    const { principal, tenant } = input
    let minted: Awaited<ReturnType<typeof invocationIdentities.newInvocation>>
    try {
      minted = await invocationIdentities.newInvocation()
    } catch {
      return rejected({
        kind: 'unavailable',
        dependency: IDENTITIES,
        diagnostic: thrown(IDENTITIES),
      })
    }
    if ('failure' in minted) return rejected(identityFailure(minted.failure))
    const call = decodeToolCallId(minted.ok.call)
    const admission = decodeToolOperationId(minted.ok.admission)
    if ('failure' in call || 'failure' in admission)
      return rejected({
        kind: 'unavailable',
        dependency: IDENTITIES,
        diagnostic: 'the identity port minted an identity that does not decode',
      })
    const reference = encodeToolInvocationRef({ tenant, call: call.ok, admission: admission.ok })
    if ('failure' in reference)
      // The tenant the caller presented is not a legal-identity tenant: denied, as a malformed
      // tenant is at the ledger boundary.
      return rejected({ kind: 'denied', action: 'admit' })
    let bound: Awaited<ReturnType<typeof sourceIssuer.bind>>
    try {
      bound = await sourceIssuer.bind({
        principal,
        tenant,
        call: call.ok,
        operation: admission.ok,
        request,
      })
    } catch {
      return rejected({ kind: 'unavailable', dependency: SOURCE, diagnostic: thrown(SOURCE) })
    }
    if ('failure' in bound) {
      if (bound.failure.kind === 'commit-unknown')
        return rejected({
          kind: 'unavailable',
          dependency: SOURCE,
          diagnostic: 'the invocation source issuance is unknown; the Tool admission was not sent',
        })
      return rejected(bound.failure)
    }
    const fixed = { ...request, invocation: bound.ok }
    let admitted: Awaited<ReturnType<typeof admissions.admit>>
    try {
      admitted = await admissions.admit({
        principal,
        tenant,
        call: call.ok,
        operation: admission.ok,
        request: fixed,
      })
    } catch {
      return { kind: 'commit-unknown', reference: reference.ok }
    }
    if ('failure' in admitted)
      return admitted.failure.kind === 'commit-unknown'
        ? { kind: 'commit-unknown', reference: reference.ok }
        : rejected(admitted.failure)
    if (admitted.ok.recovered)
      return rejected({
        kind: 'unavailable',
        dependency: IDENTITIES,
        diagnostic:
          'the identity port returned an admission identity the ledger already holds; nothing was scheduled',
      })
    // Scheduling is a hint; its failure cannot undo an accepted admission. Recovery scanning
    // remains unsupported, so a lost wake-up currently needs an explicit host wake-up.
    if (admitted.ok.state.phase === 'accepted') {
      try {
        await instances.schedule({ tenant, call: call.ok })
      } catch {
        // The admission is already committed; a failed wake-up does not change its receipt.
      }
    }
    return { kind: 'accepted', reference: reference.ok, state: admitted.ok.state }
  }

  const runtime: ToolRuntime<P, B> = {
    invoke,
    // The current availability is the Catalog's answer (P16: without a Catalog, inspect is
    // unavailable with dependency toolCatalog); the runtime adds nothing to it.
    inspect: input => catalog.inspect(input),
    queries: Object.freeze<ToolInvocationQueries<P, B>>({
      lookup: async input => {
        const resolved = invocationInput<P>(input, 'lookup')
        return 'failure' in resolved ? resolved : reads.lookup(resolved.ok)
      },
      queryOperation: async input => {
        const resolved = operationInput<P>(input, 'query-operation')
        return 'failure' in resolved ? resolved : reads.operation(resolved.ok)
      },
      readProcess: async input => {
        const resolved = invocationInput<P>(input, 'read-process')
        return 'failure' in resolved ? resolved : reads.process({ ...resolved.ok, at: input.at })
      },
      readWait: async input => {
        const resolved = invocationInput<P>(input, 'read-wait')
        return 'failure' in resolved ? resolved : reads.wait({ ...resolved.ok, wait: input.wait })
      },
      readDiagnostics: async input => {
        const resolved = invocationInput<P>(input, 'read-diagnostics')
        return 'failure' in resolved
          ? resolved
          : reads.diagnostics({ ...resolved.ok, after: input.after })
      },
      readResult: async input => {
        const resolved = invocationInput<P>(input, 'read-result')
        return 'failure' in resolved
          ? resolved
          : reads.result({ ...resolved.ok, result: input.result, after: input.after })
      },
      account: async input => {
        const resolved = invocationInput<P>(input, 'account')
        return 'failure' in resolved ? resolved : reads.account(resolved.ok)
      },
    }),
    commands: Object.freeze<ToolInvocationCommands<P>>({
      // A control does not mint an operation until the controls increment lands: the named
      // unsupported is definite, so nothing is allocated for it.
      control: async input => {
        const resolved = invocationInput<P>(input, 'control')
        if ('failure' in resolved) return { kind: 'rejected', failure: resolved.failure }
        return {
          kind: 'rejected',
          failure: {
            kind: 'unsupported',
            adoption: toolRuntimeAdoption,
            reason: 'control is not implemented in this increment (controls)',
          },
        }
      },
      releaseDelivery: async input => {
        const resolved = invocationInput<P>(input, 'release-delivery')
        if ('failure' in resolved) return { kind: 'rejected', failure: resolved.failure }
        let minted: Awaited<ReturnType<typeof operationIdentities.newOperation>>
        try {
          minted = await operationIdentities.newOperation()
        } catch {
          return {
            kind: 'rejected',
            failure: {
              kind: 'unavailable',
              dependency: IDENTITIES,
              diagnostic: thrown(IDENTITIES),
            },
          }
        }
        if ('failure' in minted)
          return { kind: 'rejected', failure: identityFailure(minted.failure) }
        const operation = decodeToolOperationId(minted.ok)
        if ('failure' in operation)
          return {
            kind: 'rejected',
            failure: {
              kind: 'unavailable',
              dependency: IDENTITIES,
              diagnostic: 'the identity port minted an identity that does not decode',
            },
          }
        const operationRef = encodeToolOperationRef({
          tenant: resolved.ok.tenant,
          call: resolved.ok.call,
          admission: resolved.ok.admission,
          operation: operation.ok,
        })
        if ('failure' in operationRef)
          return {
            kind: 'rejected',
            failure: {
              kind: 'unavailable',
              dependency: IDENTITIES,
              diagnostic: 'the operation reference of the minted operation does not encode',
            },
          }
        let released: Awaited<ReturnType<typeof commands.releaseDelivery>>
        try {
          released = await commands.releaseDelivery({
            ...resolved.ok,
            operation: operation.ok,
            result: input.result,
            delivery: input.delivery,
            consumer: input.consumer,
            evidence: input.evidence,
          })
        } catch {
          return { kind: 'commit-unknown', operation: operationRef.ok }
        }
        if ('failure' in released)
          return released.failure.kind === 'commit-unknown'
            ? { kind: 'commit-unknown', operation: operationRef.ok }
            : { kind: 'rejected', failure: released.failure }
        return { kind: 'committed', operation: operationRef.ok, receipt: released.ok }
      },
    }),
    instances: Object.freeze<ToolInvocationDirectory<P>>({
      connect: input => {
        const resolved = invocationInput<P>(input, 'connect')
        return 'failure' in resolved
          ? Promise.resolve(resolved)
          : instances.directory.connect(resolved.ok)
      },
    }),
    content: Object.freeze<ToolInvocationContentReader<P>>({
      read: async input => {
        const resolved = invocationInput<P>(input, 'read-content')
        return 'failure' in resolved
          ? resolved
          : reads.content.read({
              ...resolved.ok,
              result: input.result,
              attachment: input.attachment,
              after: input.after,
              maxBytes: input.maxBytes,
            })
      },
      raw: async input => {
        const resolved = invocationInput<P>(input, 'read-content')
        return 'failure' in resolved
          ? resolved
          : reads.content.raw({ ...resolved.ok, result: input.result })
      },
    }),
    catalog,
  }
  return Object.freeze({
    runtime: Object.freeze(runtime),
    recover: () => unsupported('recover', 'recovery scan'),
    quiesce: () => unsupported('quiesce', 'drain and handover'),
    inspectDrain: () => unsupported('inspectDrain', 'drain and handover'),
    handover: () => unsupported('handover', 'drain and handover'),
  })
}
