import { z } from 'zod'
import { instantToRfc3339, type Clock } from '@omne-harness-lite/offer-expiry'
import { copyJsonValue, isNonNegativeJsonInteger } from '@omne-harness-lite/content-blocks'
import { isOk, parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import { checkKey, checkSession, compareInteger } from '@omne-harness-lite/session-log'
import { judgeMessage, type UserMessage, type SessionRef } from '@omne-harness-lite/messages'
import {
  checkOperationRef,
  type CreateSessionInput,
  type OperationRef,
} from '@omne-harness-lite/session-runtime'
import type { LocalSessionIngress } from '@omne-harness-lite/session-runtime-local'
import { checkedTenantBinding, type TenantBinding } from './state-layout-values.ts'
import { createSessionTextReader, type SessionTextReading } from './session-reading.ts'
import { readSessionSubmission, type SessionSubmissionReading } from './session-submission.ts'

const key = z.string().refine(checkKey)
const tenant = z.unknown().transform((value, ctx) => {
  const checked = parseTenantId(value)
  if (isOk(checked)) return Object.freeze(checked.ok)
  ctx.addIssue({ code: 'custom', message: 'invalid tenant' })
  return z.NEVER
})
const binding = z
  .strictObject({
    formatVersion: z
      .unknown()
      .refine(value => isNonNegativeJsonInteger(value) && compareInteger(value, 1) === 0)
      .transform(() => 1 as const),
    centerId: z.string().refine(isGovernanceCenterId),
    tenant,
  })
  .transform(value => Object.freeze(checkedTenantBinding(value)))
const session = z.unknown().transform((value, ctx) => {
  const checked = checkSession(value)
  if ('ok' in checked) return checked.ok
  ctx.addIssue({ code: 'custom', message: 'invalid session' })
  return z.NEVER
})
const operation = z.unknown().transform((value, ctx) => {
  const checked = checkOperationRef(value)
  if ('operation' in checked) return checked.operation
  ctx.addIssue({ code: 'custom', message: 'invalid operation' })
  return z.NEVER
})
const message = z.unknown().transform((value, ctx) => {
  const checked = judgeMessage(value)
  if ('ok' in checked && checked.ok.type === 'user') return checked.ok
  ctx.addIssue({ code: 'custom', message: 'invalid user message' })
  return z.NEVER
})
const inputShape = z.strictObject({
  operationKey: key,
  definition: z.strictObject({ category: z.literal('agent_definition'), name: key }).readonly(),
  executionType: key,
  mode: z.enum(['never', 'auto_permission', 'bypass-permissions']),
  collaboration: z.enum(['co-work', 'auto-drive']),
  workspace: z.string().optional(),
})
const input = inputShape.transform(({ workspace, ...fields }) =>
  Object.freeze(workspace === undefined ? fields : { ...fields, workspace }),
)
const common = { format: z.literal('omne-session-host/1'), binding }
export type SessionCreationDefaults = Pick<
  CreateSessionInput,
  'definition' | 'executionType' | 'mode' | 'collaboration'
>
const creationDefaults = inputShape.omit({ operationKey: true, workspace: true }).readonly()
export function parseSessionCreationDefaults(value: unknown): SessionCreationDefaults | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return undefined
  const checked = creationDefaults.safeParse(copied.ok)
  return checked.success ? checked.data : undefined
}
export type SessionCreationDefaultsReading =
  | { readonly kind: 'creationDefaults'; readonly defaults: SessionCreationDefaults }
  | { readonly kind: 'creationNotReady' }
/** Data only. Neither requests nor replies carry live access, coordination, or attempt handles. */
export type SessionHostRequest = {
  readonly format: 'omne-session-host/1'
  readonly binding: TenantBinding
} & (
  | { readonly command: 'readCreationDefaults' }
  | { readonly command: 'readClock' }
  | { readonly command: 'readInitialModel' }
  | { readonly command: 'createSession'; readonly input: CreateSessionInput }
  | {
      readonly command: 'submitInput'
      readonly session: SessionRef
      readonly operationKey: string
      readonly message: UserMessage
    }
  | {
      readonly command: 'readSession' | 'readProgress' | 'readMessages'
      readonly session: SessionRef
    }
  | { readonly command: 'readReceipt' | 'readSubmission'; readonly operation: OperationRef }
)
const requests: z.ZodType<SessionHostRequest> = z
  .discriminatedUnion('command', [
    z.strictObject({ ...common, command: z.literal('readCreationDefaults') }),
    z.strictObject({ ...common, command: z.literal('readClock') }),
    z.strictObject({ ...common, command: z.literal('readInitialModel') }),
    z.strictObject({ ...common, command: z.literal('createSession'), input }),
    z.strictObject({
      ...common,
      command: z.literal('submitInput'),
      session,
      operationKey: key,
      message,
    }),
    z.strictObject({ ...common, command: z.literal('readSession'), session }),
    z.strictObject({ ...common, command: z.literal('readProgress'), session }),
    z.strictObject({ ...common, command: z.literal('readReceipt'), operation }),
    z.strictObject({ ...common, command: z.literal('readSubmission'), operation }),
    z.strictObject({ ...common, command: z.literal('readMessages'), session }),
  ])
  .readonly()

export function parseSessionHostRequest(value: unknown): SessionHostRequest | undefined {
  const copied = copyJsonValue(value)
  if ('failed' in copied) return undefined
  const parsed = requests.safeParse(copied.ok)
  return parsed.success ? parsed.data : undefined
}
export type SessionHostResult =
  | Awaited<ReturnType<LocalSessionIngress['operations'][keyof LocalSessionIngress['operations']]>>
  | SessionTextReading
  | SessionSubmissionReading
  | SessionCreationDefaultsReading
  | { readonly kind: 'clock'; readonly timestamp: string }
  | { readonly kind: 'initialModel'; readonly routeName: string }
  | { readonly kind: 'initialModelUnavailable' }

export interface SessionHostEndpoint {
  readonly execute: (request: SessionHostRequest) => Promise<SessionHostResult>
}
/** Trusted assembly must supply the real matching center/tenant and its original ingress. No wire field grants Access. */
export function createSessionHostEndpoint(options: {
  readonly binding: TenantBinding
  readonly ingress: LocalSessionIngress
  readonly creation?: SessionCreationDefaults
  readonly clock?: Clock
  readonly initialRouteName?: string
}): SessionHostEndpoint {
  const bound = Object.freeze(checkedTenantBinding(options.binding))
  const { ingress } = options
  const defaults =
    options.creation === undefined ? undefined : parseSessionCreationDefaults(options.creation)
  if (options.creation !== undefined && !defaults)
    throw new TypeError('invalid actual Session creation configuration')
  const text = createSessionTextReader({ tenant: bound.tenant, ingress })
  return Object.freeze<SessionHostEndpoint>({
    execute: async request => {
      if (
        request.binding.centerId !== bound.centerId ||
        !tenantIdEquals(request.binding.tenant, bound.tenant)
      )
        return { failure: 'denied' }
      if (request.command === 'readInitialModel')
        return options.initialRouteName === undefined
          ? { kind: 'initialModelUnavailable' }
          : { kind: 'initialModel', routeName: options.initialRouteName }
      if (request.command === 'readClock') {
        const now = await options.clock?.now()
        return now === undefined || now === 'unavailable'
          ? { failure: 'unavailable' }
          : { kind: 'clock', timestamp: instantToRfc3339(now) }
      }
      if (request.command === 'readCreationDefaults')
        return defaults ? { kind: 'creationDefaults', defaults } : { kind: 'creationNotReady' }
      return dispatch(ingress, text, request)
    },
  })
}
function dispatch(
  ingress: LocalSessionIngress,
  text: ReturnType<typeof createSessionTextReader>,
  request: Exclude<
    SessionHostRequest,
    { command: 'readCreationDefaults' | 'readClock' | 'readInitialModel' }
  >,
): Promise<SessionHostResult> {
  const operations = ingress.operations,
    access = ingress.access
  switch (request.command) {
    case 'createSession':
      return operations.createSession(access, request.input)
    case 'submitInput':
      return operations.submitInput(access, request.session, request.operationKey, request.message)
    case 'readSession':
      return operations.readSession(access, request.session)
    case 'readProgress':
      return operations.readProgress(access, request.session)
    case 'readReceipt':
      return operations.readReceipt(access, request.operation)
    case 'readSubmission':
      return readSessionSubmission(ingress, request.operation)
    case 'readMessages':
      return text.read({ tenant: request.binding.tenant, session: request.session })
  }
}
