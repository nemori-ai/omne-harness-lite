import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parseTenantId, isOk, tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  AccessDecision,
  AccessIdentity,
  AccessOperation,
  SessionAccess,
  SessionAccessIssuer,
} from '@omne-harness-lite/session-tenancy'
import type { LocalSessionAccess, LocalSessionAccessOptions } from './session-access-types.ts'
import {
  accessRequest,
  accessScope,
  sameScope,
  sameIdentity,
  subjectShape,
  consumers,
  operations,
} from './session-access-values.ts'

type Rejection = Exclude<AccessDecision, { kind: 'authorized' }>
const rejected = (reason: Rejection['reason']): Rejection =>
  Object.freeze({ kind: 'rejected', reason })
const rejectionShape = z.strictObject({
  kind: z.literal('rejected'),
  reason: z.enum(['invalidInput', 'notAuthorized', 'unavailable', 'ownerStopped']),
})
interface Binding {
  readonly identity: AccessIdentity
  readonly operations: ReadonlySet<AccessOperation>
}
/** Live tokens and issuer remain owned by this trusted construction. Current authority is checked on every use. */
export function createLocalSessionAccess(requested: LocalSessionAccessOptions): LocalSessionAccess {
  const tenant = parseTenantId(requested.tenant),
    principal = subjectShape.safeParse(requested.principal)
  const selectedConsumers = z.array(z.enum(consumers)).safeParse(requested.consumers)
  const selectedOperations = z.array(z.enum(operations)).safeParse(requested.operations)
  const policy = z
    .strictObject({
      maxBindings: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      maxContextKeys: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .safeParse(requested.policy)
  if (
    !isOk(tenant) ||
    !principal.success ||
    !selectedConsumers.success ||
    !selectedOperations.success ||
    !policy.success ||
    typeof requested.authority?.check !== 'function'
  )
    throw new TypeError('Invalid live SessionAccess construction')
  const fixedTenant = Object.freeze(tenant.ok),
    subject = Object.freeze(principal.data)
  const allowedConsumers = new Set(selectedConsumers.data),
    allowedOperations = new Set(selectedOperations.data)
  const limits = Object.freeze(policy.data),
    check = requested.authority.check.bind(requested.authority)
  let bindings = new WeakMap<SessionAccess, Binding>(),
    live = 0,
    reserved = 0,
    stopped = false
  const jobs = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  function owned<T>(work: () => Promise<T>, stoppedResult: T): Promise<T> {
    if (stopped) return Promise.resolve(stoppedResult)
    const job = Promise.resolve().then(work)
    jobs.add(job)
    return job.finally(() => {
      jobs.delete(job)
    })
  }
  async function current(
    identity: AccessIdentity,
    operation: AccessOperation,
  ): Promise<AccessDecision> {
    const result = await check(identity, operation)
    if (result.kind === 'authorized') {
      if (!sameIdentity(identity, result.identity))
        throw new TypeError('SessionAccess authority substituted the original identity')
      return { kind: 'authorized', identity }
    }
    const parsed = rejectionShape.safeParse(result)
    if (!parsed.success) throw new TypeError('Invalid current SessionAccess decision')
    return parsed.data
  }
  function permitted(request: NonNullable<ReturnType<typeof accessRequest>>) {
    return (
      tenantIdEquals(request.scope.tenant, fixedTenant) &&
      request.principal === subject.principal &&
      request.principalKind === subject.principalKind &&
      allowedConsumers.has(request.consumer) &&
      request.operations.every(operation => allowedOperations.has(operation))
    )
  }
  const issue: SessionAccessIssuer['issue'] = async value => {
    if (stopped) return rejected('ownerStopped')
    const request = accessRequest(value, limits.maxContextKeys)
    if (!request) return rejected('invalidInput')
    if (!permitted(request)) return rejected('notAuthorized')
    if (live + reserved >= limits.maxBindings) return rejected('unavailable')
    reserved++
    try {
      return await owned(async () => {
        const identity: AccessIdentity = Object.freeze({
          binding: randomUUID(),
          principal: request.principal,
          principalKind: request.principalKind,
          scope: request.scope,
          consumer: request.consumer,
          contextKeys: request.contextKeys,
        })
        for (const operation of request.operations) {
          const decision = await current(identity, operation)
          if (decision.kind === 'rejected') return decision
          if (stopped) return rejected('ownerStopped')
        }
        const access = Object.freeze(Object.create(null)) as SessionAccess
        bindings.set(access, { identity, operations: new Set(request.operations) })
        live++
        return { kind: 'issued', access } as const
      }, rejected('ownerStopped'))
    } finally {
      reserved--
    }
  }
  const authorize: LocalSessionAccess['operations']['authorize'] = async (
    access,
    requestedScope,
    operation,
  ) => {
    if (stopped) return rejected('ownerStopped')
    const scope = accessScope(requestedScope)
    if (!scope || !operations.includes(operation)) return rejected('invalidInput')
    const binding = bindings.get(access)
    if (!binding || !sameScope(binding.identity.scope, scope) || !binding.operations.has(operation))
      return rejected('notAuthorized')
    return owned(async () => {
      const result = await current(binding.identity, operation)
      if (stopped) return rejected('ownerStopped')
      if (bindings.get(access) !== binding) return rejected('notAuthorized')
      return result
    }, rejected('ownerStopped'))
  }
  return Object.freeze({
    operations: Object.freeze({ authorize }),
    issuer: Object.freeze({
      issue,
      revoke(access: SessionAccess) {
        if (bindings.delete(access)) live--
      },
    }),
    close() {
      stopped = true
      return (closing ??= Promise.allSettled([...jobs]).then(() => {
        bindings = new WeakMap()
        live = 0
      }))
    },
  })
}
export type { LocalSessionAccess, LocalSessionAccessOptions } from './session-access-types.ts'
