import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  describedAdoption,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  judgeToolInvokeRequest,
  type Adoption,
  type ToolCallId,
  type ToolInstanceHost,
  type CallAccess,
  type ToolDefiniteFailure,
  type ToolFailure,
  type ToolInvocationCommands,
  type ToolInvocationContentReader,
  type ToolInvocationDirectory,
  type ToolInvocationQueries,
  type ToolInvokeOutcome,
  type ToolProvider,
  type ToolOperationIdentities,
  type ToolInvocationParts,
  type ToolOperationId,
  type ToolOperationRef,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import { checkToolConfiguration, driverRetryDelayMs, driverStepsPerRun } from './configuration.ts'
import type { ToolConfiguration, ToolDependencies } from './construction.ts'
import { createToolDriver } from './driver.ts'
import { controlIntent } from './control-intent.ts'
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

const IDENTITIES = 'toolIdentities'

function redactedPortExceptionDiagnostic(dependency: string): string {
  return `${dependency} threw an exception; its message is not reported`
}

async function scheduleAcceptedCallBestEffort<P>(
  host: ToolInstanceHost<P>,
  tenant: CallAccess<P>['tenant'],
  call: ToolCallId,
): Promise<void> {
  try {
    await host.schedule({ tenant, call })
  } catch {}
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

async function commandReference(
  identities: ToolOperationIdentities,
  invocation: ToolInvocationParts,
): Promise<
  Outcome<
    Readonly<{ operation: ToolOperationId; reference: ToolOperationRef }>,
    ToolDefiniteFailure
  >
> {
  let minted: Awaited<ReturnType<typeof identities.newOperation>>
  try {
    minted = await identities.newOperation()
  } catch {
    return fail({
      kind: 'unavailable',
      dependency: IDENTITIES,
      diagnostic: redactedPortExceptionDiagnostic(IDENTITIES),
    })
  }
  if ('failure' in minted) return fail(identityFailure(minted.failure))
  const operation = decodeToolOperationId(minted.ok)
  if ('failure' in operation)
    return fail({
      kind: 'unavailable',
      dependency: IDENTITIES,
      diagnostic: 'the identity port minted an identity that does not decode',
    })
  const reference = encodeToolOperationRef({ ...invocation, operation: operation.ok })
  if ('failure' in reference)
    return fail({
      kind: 'unavailable',
      dependency: IDENTITIES,
      diagnostic: 'the operation reference of the minted operation does not encode',
    })
  return succeed({ operation: operation.ok, reference: reference.ok })
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
  const { operationIdentities, sourceIssuer } = dependencies
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
    let bound: Awaited<ReturnType<typeof sourceIssuer.resolve>>
    try {
      bound = await sourceIssuer.resolve({ principal, tenant, request })
    } catch {
      return { kind: 'association-unknown' }
    }
    if (bound.kind === 'association-unknown' || bound.kind === 'rejected') return bound
    const call = decodeToolCallId(bound.call)
    const admission = decodeToolOperationId(bound.admission)
    if ('failure' in call || 'failure' in admission) return { kind: 'association-unknown' }
    const reference = encodeToolInvocationRef({ tenant, call: call.ok, admission: admission.ok })
    if ('failure' in reference) return { kind: 'association-unknown' }
    if (bound.kind === 'issuance-unknown')
      return { kind: 'commit-unknown', reference: reference.ok }
    const fixed = { ...request, invocation: bound.invocation }
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
    if (admitted.ok.state.phase === 'accepted') {
      let needsWake = true
      if (admitted.ok.recovered) {
        try {
          const current = await reads.lookup({
            principal,
            tenant,
            call: call.ok,
            admission: admission.ok,
          })
          if ('ok' in current && current.ok.kind === 'found')
            needsWake = ['accepted', 'preparing', 'queued'].includes(current.ok.state.phase)
        } catch {}
      }
      if (needsWake) await scheduleAcceptedCallBestEffort(instances, tenant, call.ok)
    }
    return {
      kind: 'accepted',
      reference: reference.ok,
      state: admitted.ok.state,
      recovered: bound.recovered || admitted.ok.recovered,
    }
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
      control: async input => {
        const resolved = invocationInput<P>(input, 'control')
        if ('failure' in resolved) return { kind: 'rejected', failure: resolved.failure }
        const intent = controlIntent(input)
        if ('failure' in intent) return { kind: 'rejected', failure: intent.failure }
        const command = await commandReference(operationIdentities, resolved.ok)
        if ('failure' in command) return { kind: 'rejected', failure: command.failure }
        let controlled: Awaited<ReturnType<typeof commands.control>>
        try {
          controlled = await commands.control({
            ...resolved.ok,
            operation: command.ok.operation,
            intent: intent.ok,
          })
        } catch {
          return { kind: 'commit-unknown', operation: command.ok.reference }
        }
        if ('failure' in controlled)
          return controlled.failure.kind === 'commit-unknown'
            ? { kind: 'commit-unknown', operation: command.ok.reference }
            : { kind: 'rejected', failure: controlled.failure }
        return { kind: 'committed', operation: command.ok.reference, receipt: controlled.ok }
      },
      releaseDelivery: async input => {
        const resolved = invocationInput<P>(input, 'release-delivery')
        if ('failure' in resolved) return { kind: 'rejected', failure: resolved.failure }
        const command = await commandReference(operationIdentities, resolved.ok)
        if ('failure' in command) return { kind: 'rejected', failure: command.failure }
        let released: Awaited<ReturnType<typeof commands.releaseDelivery>>
        try {
          released = await commands.releaseDelivery({
            ...resolved.ok,
            operation: command.ok.operation,
            result: input.result,
            delivery: input.delivery,
            consumer: input.consumer,
            evidence: input.evidence,
          })
        } catch {
          return { kind: 'commit-unknown', operation: command.ok.reference }
        }
        if ('failure' in released)
          return released.failure.kind === 'commit-unknown'
            ? { kind: 'commit-unknown', operation: command.ok.reference }
            : { kind: 'rejected', failure: released.failure }
        return { kind: 'released', receipt: released.ok }
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
