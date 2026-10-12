import { z } from 'zod'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  checkOperationRef,
  type OperationRef,
  type Receipt,
  type SessionRuntime,
} from '@omne-harness-lite/session-runtime'
import { checkSession, compareInteger } from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionRef } from '@omne-harness-lite/messages'
import {
  parseSessionCreationDefaults,
  type SessionCreationDefaults,
} from './session-host-protocol.ts'
import { readSessionReceiptValue } from './session-message-replies.ts'
import type { SessionCreateRequest } from './session-creation-client.ts'

const receipt = z.unknown().transform((value, ctx) => {
  const checked = readSessionReceiptValue(value)
  if (checked) return checked
  ctx.addIssue({ code: 'custom', message: 'invalid creation receipt' })
  return z.NEVER
})
const session = z.unknown().transform((value, ctx) => {
  const checked = checkSession(value)
  if ('ok' in checked) return checked.ok
  ctx.addIssue({ code: 'custom', message: 'invalid created Session' })
  return z.NEVER
})
const operation = z.unknown().transform((value, ctx) => {
  const checked = checkOperationRef(value)
  if ('operation' in checked) return checked.operation
  ctx.addIssue({ code: 'custom', message: 'invalid creation operation' })
  return z.NEVER
})
const created: z.ZodType<Awaited<ReturnType<SessionRuntime['createSession']>>> = z.union([
  z.strictObject({ kind: z.literal('created'), session, receipt }),
  z.strictObject({ kind: z.literal('unknownCommit'), operation }),
  z.strictObject({
    failure: z.enum(['invalidInput', 'denied', 'unavailable', 'definitionUnavailable', 'conflict']),
  }),
])
const defaults = z.strictObject({ kind: z.literal('creationDefaults'), defaults: z.unknown() })
export function readCreationDefaultsReply(value: unknown): SessionCreationDefaults | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return undefined
  const checked = defaults.safeParse(copied.ok)
  return checked.success ? parseSessionCreationDefaults(checked.data.defaults) : undefined
}
export function matchesCreationOperation(
  operation: OperationRef,
  request: SessionCreateRequest,
): boolean {
  return (
    operation.operation === 'createSession' &&
    operation.session === null &&
    operation.operationKey === request.input.operationKey &&
    operation.principal === request.binding.tenant.account &&
    tenantIdEquals(operation.tenant, request.binding.tenant)
  )
}
function matchesReceipt(value: Receipt, session: SessionRef, request: SessionCreateRequest) {
  return (
    matchesCreationOperation(value.operation, request) &&
    value.source.session === session &&
    tenantIdEquals(value.source.tenant, request.binding.tenant) &&
    compareInteger(value.position, value.source.tail) <= 0
  )
}
export function readCreatedReply(
  value: unknown,
  request: SessionCreateRequest,
): Awaited<ReturnType<SessionRuntime['createSession']>> | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return undefined
  const checked = created.safeParse(copied.ok)
  if (!checked.success) return undefined
  const result = checked.data
  if ('failure' in result) return result
  if (result.kind === 'unknownCommit')
    return matchesCreationOperation(result.operation, request) ? result : undefined
  return matchesReceipt(result.receipt, result.session, request) ? result : undefined
}
