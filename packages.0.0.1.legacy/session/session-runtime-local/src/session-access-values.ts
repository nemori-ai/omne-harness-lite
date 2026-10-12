import { z } from 'zod'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseTenantId, isOk, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate } from '@omne-harness-lite/messages'
import type {
  AccessIdentity,
  AccessOperation,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'

export const operations = [
  'context.read',
  'context.configure',
  'context.publish',
  'tool.submit',
  'tool.read',
  'tool.stop',
  'tool.answer',
  'environment.describe',
  'environment.acquire',
  'result.read',
  'run.advance',
  'session.log.coordinate',
] as const satisfies readonly AccessOperation[]
export const consumers = ['model', 'tool', 'extension', 'coordinator', 'source'] as const
export const principalKinds = ['human', 'system', 'agent'] as const
export const subjectShape = z.strictObject({
  principal: z.string().min(1),
  principalKind: z.enum(principalKinds),
})
const scopeShape = z.strictObject({ tenant: z.unknown(), session: z.string().min(1) })
const requestShape = subjectShape.extend({
  scope: scopeShape,
  consumer: z.enum(consumers),
  contextKeys: z.array(z.string().min(1)),
  operations: z.array(z.enum(operations)).min(1),
})
const identityShape = subjectShape.extend({
  binding: z.string().min(1),
  scope: scopeShape,
  consumer: z.enum(consumers),
  contextKeys: z.array(z.string().min(1)),
})
function copied(value: unknown) {
  const result = copyJsonValue(value)
  return 'ok' in result ? result.ok : undefined
}
export function accessScope(value: unknown): SessionScope | undefined {
  const parsed = scopeShape.safeParse(copied(value))
  if (!parsed.success || !validate('SessionRef', parsed.data.session).valid) return undefined
  const tenant = parseTenantId(parsed.data.tenant)
  if (!isOk(tenant)) return undefined
  return Object.freeze({
    tenant: Object.freeze(tenant.ok),
    session: parsed.data.session as SessionScope['session'],
  })
}
export function sameScope(left: SessionScope, right: SessionScope) {
  return left.session === right.session && tenantIdEquals(left.tenant, right.tenant)
}
export function accessRequest(value: unknown, maxKeys: number) {
  const parsed = requestShape.safeParse(copied(value))
  if (!parsed.success) return undefined
  const request = parsed.data
  const scope = accessScope(request.scope)
  if (
    !scope ||
    request.contextKeys.length > maxKeys ||
    new Set(request.contextKeys).size !== request.contextKeys.length ||
    new Set(request.operations).size !== request.operations.length
  )
    return undefined
  return Object.freeze({
    ...request,
    scope,
    contextKeys: Object.freeze([...request.contextKeys]),
    operations: Object.freeze([...request.operations]),
  })
}
export function sameIdentity(left: AccessIdentity, right: AccessIdentity): boolean {
  const parsed = identityShape.safeParse(copied(right))
  if (!parsed.success) return false
  const scope = accessScope(parsed.data.scope)
  return (
    scope !== undefined &&
    sameScope(left.scope, scope) &&
    left.binding === parsed.data.binding &&
    left.principal === parsed.data.principal &&
    left.principalKind === parsed.data.principalKind &&
    left.consumer === parsed.data.consumer &&
    left.contextKeys.length === parsed.data.contextKeys.length &&
    left.contextKeys.every((key, index) => key === parsed.data.contextKeys[index])
  )
}
