import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type Adoption,
  type ToolFailure,
} from '@omne-harness/tool-contract'
import { judgeFixedToolRequest, type CallAccess } from '@omne-harness/tool-contract/provider'
import type { EnvironmentPreparationInput, EnvironmentReleaseInput } from './environment-policy.ts'

export const environmentUnavailable = (diagnostic: string) =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'tool-environment-scheduler',
    diagnostic,
  })

export function matchingEnvironment(
  environment: { readonly adoption: Adoption },
  original: Adoption,
): boolean {
  try {
    const current = environment.adoption
    return Boolean(
      original &&
      current &&
      typeof original.digest === 'string' &&
      original.owner === current.owner &&
      original.name === current.name &&
      original.revision === current.revision &&
      original.digest === current.digest,
    )
  } catch {
    return false
  }
}

function recordAccess<P>(
  input: CallAccess<P>,
  record: EnvironmentPreparationInput<P>['preparation'] | EnvironmentReleaseInput<P>['release'],
): Outcome<void, ToolFailure> {
  if (!input || !tenantCodec.encode(input.tenant).ok || !('principal' in input))
    return fail({ kind: 'denied', action: 'environment' })
  if (
    !record ||
    'failure' in decodeToolCallId(input.call) ||
    'failure' in decodeToolOperationId(record.operation)
  )
    return fail({ kind: 'invalid', field: 'record', reason: 'invalid operation identity' })
  const tenant = tenantCodec.parse(
    JSON.stringify({
      organization: record.tenant?.organization?.text,
      account: record.tenant?.account?.text,
    }),
  )
  if (!tenant.ok || !tenantEquals(input.tenant, tenant.value) || input.call !== record.call)
    return fail({ kind: 'denied', action: 'environment' })
  return succeed(undefined)
}

function validPreparation(record: EnvironmentPreparationInput<unknown>['preparation']): boolean {
  return (
    (record.purpose === 'initial' || record.purpose === 'resume') &&
    typeof record.inputDigest === 'string' &&
    record.inputDigest.length > 0
  )
}

export function fixedPreparationInput<P>(
  input: EnvironmentPreparationInput<P>,
  environment: { readonly adoption: Adoption },
): Outcome<EnvironmentPreparationInput<P>, ToolFailure> {
  const allowed = recordAccess(input, input?.preparation)
  if ('failure' in allowed) return allowed
  const record = input.preparation
  if (!matchingEnvironment(environment, record.adoption))
    return environmentUnavailable('the original environment adapter is unavailable')
  const judged = judgeFixedToolRequest(record.request)
  if ('failure' in judged) return fail({ kind: 'invalid', ...judged.failure })
  if (!validPreparation(record))
    return fail({ kind: 'invalid', field: 'preparation', reason: 'invalid preparation input' })
  return succeed({
    principal: input.principal,
    tenant: input.tenant,
    call: input.call,
    preparation: Object.freeze({
      tenant: input.tenant,
      call: input.call,
      operation: record.operation,
      adoption: Object.freeze({ ...record.adoption }),
      inputDigest: record.inputDigest,
      purpose: record.purpose,
      request: judged.ok,
    }),
  })
}

export function fixedReleaseInput<P>(
  input: EnvironmentReleaseInput<P>,
  environment: { readonly adoption: Adoption },
): Outcome<EnvironmentReleaseInput<P>, ToolFailure> {
  const allowed = recordAccess(input, input?.release)
  if ('failure' in allowed) return allowed
  if (!matchingEnvironment(environment, input.release.adoption))
    return environmentUnavailable('the original environment adapter is unavailable')
  if ('failure' in decodeToolOperationId(input.release.preparation))
    return fail({
      kind: 'invalid',
      field: 'release.preparation',
      reason: 'invalid preparation identity',
    })
  const record = input.release
  return succeed(
    Object.freeze({
      principal: input.principal,
      tenant: input.tenant,
      call: input.call,
      release: Object.freeze({
        tenant: input.tenant,
        call: input.call,
        operation: record.operation,
        adoption: Object.freeze({ ...record.adoption }),
        inputDigest: record.inputDigest,
        preparation: record.preparation,
        resource: Object.freeze({ ...record.resource }),
        custody: Object.freeze({ ...record.custody }),
      }),
    }),
  )
}
