import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  encodeToolOperationRef,
  type Adoption,
  type FixedToolRequest,
  type ToolDefiniteFailure,
  type ToolFailure,
  type ToolInvocationCommands,
  type ToolInvocationContentReader,
  type ToolInvocationQueries,
  type ToolCallId,
  type ToolInvokeOutcome,
  type ToolInvocationParts,
  type ToolInvocationRef,
  type ToolInvokeRequest,
  type ToolOperationId,
  type ToolOperationRef,
  type ToolRuntime,
  type Reply,
} from '@omne-harness/tool-contract'
import {
  describedAdoption,
  judgeToolCall,
  judgeToolInvokeRequest,
  type ToolInvocationSourceIssuer,
  type ToolInvocationSourceOutcome,
  type ToolProvider,
  type ToolOperationIdentities,
} from '@omne-harness/tool-contract/provider'
import { admitResolvedInvocation, scheduleAcceptedCallBestEffort } from './runtime-admission.ts'
import { callOffloadingRefusal } from './result-offloading.ts'
import { checkToolConfiguration, driverRetryDelayMs, driverStepsPerRun } from './configuration.ts'
import type { ToolConfiguration, ToolDependencies } from './construction.ts'
import { contactCall } from './contact.ts'
import { createToolDriver } from './driver.ts'
import { controlIntent } from './control-intent.ts'
import {
  invocationInput,
  operationInput,
  type ReferenceAction,
  type ResolvedAccess,
} from './invocation-access.ts'
import { createStreamFacade } from './stream-facade.ts'

export const toolRuntimeAdoption: Adoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'tool-runtime',
  revision: '1',
})

const PORTS = [
  'commands',
  'admissions',
  'queues',
  'rejections',
  'bindings',
  'environments',
  'decisions',
  'instances',
  'clock',
  'resultPolicy',
  'authority',
  'resources',
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

const RECOVER_PAGE = 100

async function recoverPending<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  input: Parameters<ToolProvider<P, B>['recover']>[0],
): Reply<Readonly<{ scheduled: string }>> {
  const { commands, instances } = dependencies
  let after: string | null = null
  let scheduled = 0n
  for (;;) {
    let page: Awaited<ReturnType<typeof commands.scanPending>>
    try {
      page = await commands.scanPending({
        principal: input.principal,
        tenant: input.tenant,
        after,
        limit: RECOVER_PAGE,
      })
    } catch {
      return fail({
        kind: 'unavailable',
        dependency: 'commands',
        diagnostic: redactedPortExceptionDiagnostic('commands'),
      })
    }
    if ('failure' in page) return page
    for (const call of page.ok.calls) {
      let queued: Awaited<ReturnType<typeof instances.schedule>>
      try {
        queued = await instances.schedule({ tenant: input.tenant, call })
      } catch {
        return fail({
          kind: 'unavailable',
          dependency: 'instances',
          diagnostic: redactedPortExceptionDiagnostic('instances'),
        })
      }
      if ('failure' in queued) return queued
      scheduled += 1n
    }
    if (page.ok.next === null) return succeed({ scheduled: String(scheduled) })
    after = page.ok.next
  }
}

function rejected(failure: ToolDefiniteFailure): ToolInvokeOutcome {
  return { kind: 'rejected', failure }
}

function admittedRequest(supplied: unknown): Outcome<ToolInvokeRequest, ToolDefiniteFailure> {
  const judged = judgeToolInvokeRequest(supplied)
  return 'failure' in judged
    ? fail({
        kind: 'invalid',
        field: `request.${judged.failure.field}`,
        reason: judged.failure.reason,
      })
    : judged
}

function callRefusal(
  request: Omit<FixedToolRequest, 'invocation'>,
  configuration: ToolConfiguration,
): ToolDefiniteFailure | null {
  const judged = judgeToolCall(request)
  if ('failure' in judged)
    return {
      kind: 'invalid',
      field: `request.${judged.failure.field}`,
      reason: judged.failure.reason,
    }
  const refusal = callOffloadingRefusal(judged.ok, configuration.offloading)
  return refusal === null
    ? null
    : { kind: 'invalid', field: 'request.returns.offloading', reason: refusal }
}

async function resolveSource<P>(
  issuer: ToolInvocationSourceIssuer<P>,
  configuration: ToolConfiguration,
  access: Omit<Parameters<ToolInvocationSourceIssuer<P>['resolve']>[0], 'request' | 'refusal'>,
  request: ToolInvokeRequest,
): Promise<ToolInvocationSourceOutcome> {
  const refusal = (fixed: Omit<FixedToolRequest, 'invocation'>) => callRefusal(fixed, configuration)
  try {
    return await issuer.resolve({ ...access, request, refusal })
  } catch {
    return { kind: 'association-unknown' }
  }
}

function resolvedIdentity(
  tenant: ToolInvocationParts['tenant'],
  bound: Readonly<{ call: string; admission: string }>,
): Readonly<{ call: ToolCallId; admission: ToolOperationId; reference: ToolInvocationRef }> | null {
  const call = decodeToolCallId(bound.call)
  const admission = decodeToolOperationId(bound.admission)
  if ('failure' in call || 'failure' in admission) return null
  const reference = encodeToolInvocationRef({ tenant, call: call.ok, admission: admission.ok })
  return 'failure' in reference
    ? null
    : { call: call.ok, admission: admission.ok, reference: reference.ok }
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

export function createToolRuntime<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  configuration: ToolConfiguration,
): ToolProvider<P, B> {
  const runtime = createToolRuntimeFacade(dependencies, configuration)
  const driver = createToolDriver(dependencies, {
    stepsPerRun: driverStepsPerRun(configuration),
    retryDelayMs: driverRetryDelayMs(configuration),
  })
  dependencies.instances.install(driver)
  const provider: ToolProvider<P, B> = {
    runtime,
    recover: input => recoverPending(dependencies, input),
    quiesce: () => unsupported('quiesce', 'drain and handover'),
    inspectDrain: () => unsupported('inspectDrain', 'drain and handover'),
    handover: () => unsupported('handover', 'drain and handover'),
  }
  return Object.freeze(provider)
}

/** A read by reference: the reference resolves to the call and its admission, or is refused. */
function byReference<P, T>(
  input: unknown,
  action: ReferenceAction,
  read: (resolved: ResolvedAccess<P>) => Reply<T>,
): Reply<T> {
  const resolved = invocationInput<P>(input, action)
  return 'failure' in resolved ? Promise.resolve(resolved) : read(resolved.ok)
}

export function createToolRuntimeFacade<P, B extends ContentBlock, E>(
  dependencies: ToolDependencies<P, B, E>,
  configuration: ToolConfiguration,
): ToolRuntime<P, B> {
  checkToolConfiguration(configuration)
  checkDependencies(dependencies)
  const { commands, reads, instances, catalog, operationIdentities, sourceIssuer } = dependencies
  const stream = createStreamFacade<P, B>({ directory: instances.directory, reads })

  const invoke: ToolRuntime<P, B>['invoke'] = async input => {
    if (typeof input !== 'object' || input === null || !('principal' in input))
      return rejected({ kind: 'denied', action: 'admit' })
    const request = admittedRequest(Reflect.get(input, 'request'))
    if ('failure' in request) return rejected(request.failure)
    const { principal, tenant } = input
    const bound = await resolveSource(
      sourceIssuer,
      configuration,
      { principal, tenant },
      request.ok,
    )
    if (bound.kind === 'association-unknown' || bound.kind === 'rejected') return bound
    const identity = resolvedIdentity(tenant, bound)
    if (identity === null) return { kind: 'association-unknown' }
    if (bound.kind === 'issuance-unknown')
      return { kind: 'commit-unknown', reference: identity.reference }
    return admitResolvedInvocation(dependencies, {
      principal,
      tenant,
      call: identity.call,
      admission: identity.admission,
      request: bound.request,
      recovered: bound.recovered,
    })
  }

  const runtime: ToolRuntime<P, B> = {
    invoke,
    inspect: input => catalog.inspect(input),
    queries: Object.freeze<ToolInvocationQueries<P, B>>({
      lookup: async input => {
        const resolved = invocationInput<P>(input, 'lookup')
        return 'failure' in resolved ? resolved : reads.lookup(resolved.ok)
      },
      contact: input => contactCall(dependencies, input),
      queryOperation: async input => {
        const resolved = operationInput<P>(input, 'query-operation')
        return 'failure' in resolved ? resolved : reads.operation(resolved.ok)
      },
      readProcess: async input => {
        const resolved = invocationInput<P>(input, 'read-process')
        return 'failure' in resolved ? resolved : reads.process({ ...resolved.ok, at: input.at })
      },
      readWait: input =>
        byReference(input, 'read-wait', (at: ResolvedAccess<P>) =>
          reads.wait({ ...at, wait: input.wait }),
        ),
      readDiagnostics: input =>
        byReference(input, 'read-diagnostics', (at: ResolvedAccess<P>) =>
          reads.diagnostics({ ...at, after: input.after }),
        ),
      readResult: input =>
        byReference(input, 'read-result', (at: ResolvedAccess<P>) =>
          reads.result({ ...at, result: input.result, after: input.after }),
        ),
      account: input => byReference(input, 'account', (at: ResolvedAccess<P>) => reads.account(at)),
      readOutput: input =>
        byReference(input, 'read-output', (at: ResolvedAccess<P>) =>
          reads.output({ ...at, after: input.after, maxBytes: input.maxBytes }),
        ),
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
        await scheduleAcceptedCallBestEffort(instances, resolved.ok.tenant, resolved.ok.call)
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
    instances: stream.instances,
    observation: stream.observation,
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
    }),
    catalog,
    body: Object.freeze<ToolRuntime<P, B>['body']>({
      read: async input => {
        const resolved = invocationInput<P>(input, 'read-content')
        return 'failure' in resolved
          ? resolved
          : reads.body.read({
              ...resolved.ok,
              result: input.result,
              bodyId: input.bodyId,
              after: input.after,
              maxBytes: input.maxBytes,
            })
      },
    }),
  }
  return Object.freeze(runtime)
}
