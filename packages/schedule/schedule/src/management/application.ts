import {
  ScheduleCallContextSchema,
  ScheduleCommandSchema,
  ScheduleCreateRequestSchema,
  ScheduleOperationLocatorSchema,
  ScheduleOperationViewSchema,
  type ScheduleCallContext,
  type ScheduleCommands,
  type ScheduleDomainError,
  type ScheduleManagementResult,
  type ScheduleOperationLocator,
  type ScheduleOperationResult,
  type ScheduleOperationView,
} from '@omne-harness/schedule-contract'
import type {
  ManagementDecisionInput,
  ManagementRequest,
  OperationIdentity,
  ReadResult,
  RecoveryScope,
  ScheduleManagementDependencies,
  ScheduleRecord,
} from './types.ts'
import { createScheduleManagementIdentity, recoveryScopeMatchesContext } from './identity.ts'
import { createScheduleManagementOperationRef, managementValueEqual } from './references.ts'
import { managementError } from './errors.ts'
import { decideScheduleManagement } from './decision.ts'
import { requestedDefinition } from './definition.ts'

function unknown(operationRef: OperationIdentity['operationRef']): ScheduleManagementResult {
  return { kind: 'unknown', operationRef, retryAfterMs: 0 }
}

function rejection(error: ScheduleDomainError): ScheduleManagementResult {
  return { kind: 'rejected', error }
}

function readError<T>(
  result: Exclude<ReadResult<T>, { kind: 'ok' }>,
  requestId: string,
  absent: ScheduleDomainError['code'],
): ScheduleDomainError {
  switch (result.kind) {
    case 'unavailable':
      return result.error
    case 'absent':
      return managementError(requestId, absent, 'Required observation was not found')
    case 'changed':
      return managementError(requestId, 'stale_basis', 'Observation changed', true)
  }
}

function replay(view: ScheduleOperationView): ScheduleManagementResult | null {
  switch (view.kind) {
    case 'committed':
    case 'noChange':
      return {
        kind: view.kind,
        operationRef: view.operationRef,
        value: view.result,
        replayed: true,
      }
    case 'rejected':
      return rejection(view.error)
    case 'pending':
    case 'unknown':
      return unknown(view.operationRef)
    case 'notCommitted':
      return null
  }
}

function operationViewValid(
  view: ScheduleOperationView,
  scope: RecoveryScope,
  expectedRef: OperationIdentity['operationRef'],
): boolean {
  if (!ScheduleOperationViewSchema.safeParse(view).success || view.operationRef !== expectedRef)
    return false
  return (
    (view.kind !== 'committed' && view.kind !== 'noChange') ||
    managementValueEqual(view.result.owner, scope.owner)
  )
}

async function recover(
  dependencies: ScheduleManagementDependencies,
  context: ScheduleCallContext,
  request: ManagementRequest,
): Promise<
  | Readonly<{ kind: 'continue'; operation: OperationIdentity }>
  | Readonly<{ kind: 'return'; result: ScheduleManagementResult }>
> {
  // The provisional scope is only an address proposal. Recovery authorization must verify it.
  const proposal = createScheduleManagementIdentity(
    {
      owner: context.owner,
      principalRef: context.principalRef,
      actor: context.actor,
      originatingSessionRef: context.originatingSessionRef,
    },
    request,
  )
  const locator: ScheduleOperationLocator = {
    kind: 'identity',
    identity: proposal.address,
    expectedFingerprint: proposal.fingerprint,
  }
  const authorized = await dependencies.authorizer.authorizeRecovery({ context, locator })
  if (authorized.kind !== 'ok')
    return {
      kind: 'return',
      result: rejection(readError(authorized, context.requestId, 'forbidden')),
    }
  if (!recoveryScopeMatchesContext(authorized.value, context))
    return {
      kind: 'return',
      result: rejection(
        managementError(context.requestId, 'forbidden', 'Recovery scope does not match context'),
      ),
    }
  const operation = createScheduleManagementIdentity(authorized.value, request)
  let observed: ReadResult<ScheduleOperationView>
  try {
    observed = await dependencies.persistence.query({ scope: operation.scope, locator })
  } catch {
    return { kind: 'return', result: unknown(operation.operationRef) }
  }
  if (observed.kind !== 'ok')
    return {
      kind: 'return',
      result:
        observed.kind === 'unavailable'
          ? rejection(observed.error)
          : unknown(operation.operationRef),
    }
  if (!operationViewValid(observed.value, operation.scope, operation.operationRef))
    return { kind: 'return', result: unknown(operation.operationRef) }
  const result = replay(observed.value)
  return result === null ? { kind: 'continue', operation } : { kind: 'return', result }
}

async function prepare(
  dependencies: ScheduleManagementDependencies,
  context: ScheduleCallContext,
  request: ManagementRequest,
  operation: OperationIdentity,
): Promise<ManagementDecisionInput | ScheduleDomainError> {
  let current: ScheduleRecord | null = null
  if (request.kind === 'execute') {
    const read = await dependencies.store.readSchedule({
      owner: context.owner,
      scheduleId: request.input.scheduleId,
    })
    if (read.kind !== 'ok') return readError(read, context.requestId, 'not_found')
    current = read.value.value
    if (
      !managementValueEqual(current.view.owner, context.owner) ||
      current.view.scheduleId !== request.input.scheduleId
    )
      return managementError(context.requestId, 'not_found', 'Schedule was not found in this scope')
  }
  const authorized = await dependencies.authorizer.authorize({
    context,
    request,
    current,
    fingerprint: operation.fingerprint,
  })
  if (authorized.kind !== 'ok') return readError(authorized, context.requestId, 'forbidden')
  if (!recoveryScopeMatchesContext(authorized.value.authority.scope, context))
    return managementError(
      context.requestId,
      'forbidden',
      'Management authority does not match context',
    )
  const input: ManagementDecisionInput = {
    requestId: context.requestId,
    request,
    operation,
    current,
    access: authorized.value,
    definition: { kind: 'notNeeded' },
    now: dependencies.clock.now(),
    allocatedId: null,
    quotaObservation: { guardRef: '', resultingHolding: null },
  }
  const preliminary = decideScheduleManagement(input)
  if (preliminary.kind === 'rejected' && preliminary.error.code !== 'dependency_blocked')
    return preliminary.error
  const definition = requestedDefinition(request, current)
  let resolved = input.definition
  if (definition !== null) {
    const definitionRevision =
      request.kind === 'create' || request.input.action === 'replace'
        ? 1
        : current === null
          ? 1
          : current.view.definitionRevision +
            Number(!managementValueEqual(definition, current.view.definition))
    const observation = await dependencies.definitions.resolve({
      context,
      definition,
      definitionRevision,
      referenceExclusive: input.now,
      activationExclusive:
        request.kind === 'create'
          ? request.input.initial.kind === 'active'
            ? input.now
            : null
          : request.input.action === 'promote' || request.input.action === 'replace'
            ? input.now
            : (current?.activationExclusive ?? null),
      eligibleConsumed:
        request.kind === 'execute' && request.input.action === 'replace'
          ? 0
          : (current?.view.eligibleConsumed ?? 0),
      acceptedJobCount:
        request.kind === 'execute' && request.input.action === 'replace'
          ? 0
          : (current?.view.acceptedJobCount ?? 0),
    })
    if (observation.kind !== 'ok')
      return readError(observation, context.requestId, 'dependency_blocked')
    resolved = observation.value
  }
  const allocatedId =
    request.kind === 'create' || request.input.action === 'replace'
      ? dependencies.ids.schedule()
      : null
  const quota = await dependencies.quota.inspect({
    operation,
    request,
    current,
    author:
      request.kind === 'create' || request.input.action === 'replace'
        ? authorized.value.authority.authorOnCreate
        : (current?.view.author ?? authorized.value.authority.authorOnCreate),
    allocatedId,
  })
  if (quota.kind !== 'ok') return readError(quota, context.requestId, 'dependency_blocked')
  return { ...input, definition: resolved, allocatedId, quotaObservation: quota.value }
}

async function submit(
  dependencies: ScheduleManagementDependencies,
  context: ScheduleCallContext,
  request: ManagementRequest,
): Promise<ScheduleManagementResult> {
  let recovered: Awaited<ReturnType<typeof recover>>
  try {
    recovered = await recover(dependencies, context, request)
  } catch {
    return rejection(
      managementError(
        context.requestId,
        'authority_unavailable',
        'Recovery authorization failed',
        true,
      ),
    )
  }
  if (recovered.kind === 'return') return recovered.result
  const operation = recovered.operation
  let input: Awaited<ReturnType<typeof prepare>>
  try {
    input = await prepare(dependencies, context, request, operation)
  } catch {
    return rejection(
      managementError(context.requestId, 'provider_failure', 'Management preparation failed', true),
    )
  }
  if ('code' in input) return rejection(input)
  const decision = decideScheduleManagement(input)
  if (decision.kind === 'rejected') return decision
  try {
    const result = await dependencies.persistence.commit({
      kind:
        request.kind === 'execute' && request.input.action === 'replace'
          ? 'replaceDefinition'
          : 'saveDefinition',
      input,
    })
    if (result.kind === 'rejected') return result
    if (result.kind === 'unknown') return { ...result, operationRef: operation.operationRef }
    if (!operationViewValid(result.view, operation.scope, operation.operationRef))
      return unknown(operation.operationRef)
    return {
      kind: result.view.kind,
      operationRef: result.view.operationRef,
      value: result.view.result,
      replayed: result.replayed,
    }
  } catch {
    return unknown(operation.operationRef)
  }
}

async function queryOperation(
  dependencies: ScheduleManagementDependencies,
  context: ScheduleCallContext,
  locator: ScheduleOperationLocator,
): Promise<ScheduleOperationResult> {
  const access = await dependencies.authorizer.authorizeRecovery({ context, locator })
  if (access.kind !== 'ok')
    return { kind: 'error', error: readError(access, context.requestId, 'forbidden') }
  if (!recoveryScopeMatchesContext(access.value, context))
    return {
      kind: 'error',
      error: managementError(
        context.requestId,
        'forbidden',
        'Recovery scope does not match context',
      ),
    }
  const operationRef =
    locator.kind === 'ref'
      ? locator.operationRef
      : createScheduleManagementOperationRef(access.value, locator.identity)
  const observed = await dependencies.persistence.query({ scope: access.value, locator })
  if (observed.kind === 'unavailable') return { kind: 'error', error: observed.error }
  if (observed.kind === 'ok' && operationViewValid(observed.value, access.value, operationRef))
    return { kind: 'ok', value: observed.value }
  return {
    kind: 'ok',
    value: {
      kind: 'unknown',
      operationRef,
      observedAt: dependencies.clock.now(),
      result: null,
      error: null,
      notCommittedProofs: null,
    },
  }
}

export function createScheduleManagementApplication(
  dependencies: ScheduleManagementDependencies,
): Readonly<{ commands: ScheduleCommands }> {
  function command(
    context: ScheduleCallContext,
    request: ManagementRequest,
  ): Promise<ScheduleManagementResult> {
    const parsedContext = ScheduleCallContextSchema.safeParse(context)
    const parsedRequest =
      request.kind === 'create'
        ? ScheduleCreateRequestSchema.safeParse(request.input)
        : ScheduleCommandSchema.safeParse(request.input)
    if (!parsedContext.success || !parsedRequest.success)
      return Promise.resolve(
        rejection(
          managementError(
            context?.requestId ?? 'schedule.management.invalid-context',
            'invalid_input',
            'Invalid management request or context',
          ),
        ),
      )
    // Parsing the discriminated wrapper separately preserves the public command branch.
    const validated: ManagementRequest =
      request.kind === 'create'
        ? { kind: 'create', input: ScheduleCreateRequestSchema.parse(request.input) }
        : { kind: 'execute', input: ScheduleCommandSchema.parse(request.input) }
    return submit(dependencies, parsedContext.data, validated)
  }
  return {
    commands: {
      create: (context, input) => command(context, { kind: 'create', input }),
      execute: (context, input) => command(context, { kind: 'execute', input }),
      async queryOperation(context, locator) {
        const parsedContext = ScheduleCallContextSchema.safeParse(context)
        const parsedLocator = ScheduleOperationLocatorSchema.safeParse(locator)
        if (!parsedContext.success || !parsedLocator.success)
          return {
            kind: 'error',
            error: managementError(
              context?.requestId ?? 'schedule.management.invalid-context',
              'invalid_input',
              'Invalid operation query',
            ),
          }
        try {
          return await queryOperation(dependencies, parsedContext.data, parsedLocator.data)
        } catch {
          return {
            kind: 'error',
            error: managementError(
              context.requestId,
              'provider_failure',
              'Operation observation failed',
              true,
            ),
          }
        }
      },
    },
  }
}
