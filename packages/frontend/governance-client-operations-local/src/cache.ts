import type { CachedRead, LocalRecord } from '@omne-harness-lite/client-local-state'
import { AI16, AI37, ENTRY50, og, READ_OPERATIONS } from './routes.ts'
import { canonical, object } from './validation.ts'

type Tenant = NonNullable<CachedRead['tenant']>
type Rule = (copy: CachedRead) => boolean
export function tenant(value: unknown): Tenant | undefined {
  return object(value) &&
    typeof value['organization'] === 'string' &&
    typeof value['account'] === 'string'
    ? { organization: value['organization'], account: value['account'] }
    : undefined
}
export function cacheContext(
  operation: string,
  payload: Readonly<Record<string, unknown>>,
  account: string,
): Tenant | undefined {
  const expected = tenant(payload['expectedTenant'])
  if (expected !== undefined) return expected
  if (operation === og(22) && typeof payload['organization'] === 'string')
    return { organization: payload['organization'], account }
  if (operation === og(26) || operation === og(35)) {
    const queried = tenant(payload['tenant'])
    if (queried !== undefined) return { organization: queried.organization, account }
  }
  return undefined
}
function key(
  copy: Pick<CachedRead, 'centerId' | 'accountId' | 'tenant' | 'operation' | 'payload'>,
): string {
  return canonical([
    copy.centerId,
    copy.accountId,
    copy.tenant ?? null,
    copy.operation,
    copy.payload,
  ])
}
function dependencies(copy: CachedRead): readonly string[] {
  if (copy.tenant !== undefined) return [copy.tenant.organization]
  const context = cacheContext(copy.operation, copy.payload, copy.accountId)
  if (context !== undefined) return [context.organization]
  if (copy.operation === og(34) && Array.isArray(copy.payload['organizations']))
    return copy.payload['organizations'].filter((x): x is string => typeof x === 'string')
  return []
}
function administratorRead(copy: CachedRead): boolean {
  return (
    (copy.operation === og(55) && copy.payload['callerIdentityKind'] === 'tenant') ||
    [og(56), og(58), og(60)].includes(copy.operation) ||
    (copy.operation === og(59) && copy.payload['includeIneffective'] === true)
  )
}

/** Per-use knowledge; never a server authorization gate. */
export class CacheKnowledge {
  readonly #rules = new Map<string, Rule>()
  readonly #installedExceptions = new Map<string, string>()

  #invalidate(id: string, rule: Rule, current: readonly CachedRead[]): void {
    this.#rules.set(id, rule)
    for (const copy of current) if (rule(copy)) this.#installedExceptions.delete(key(copy))
    // Exceptions may have disappeared from disk through another process's CAS.
    // Retaining them would allow a later stale write to reintroduce the exception.
    for (const [k, encoded] of this.#installedExceptions) {
      const copy: CachedRead = JSON.parse(encoded)
      if (rule(copy)) this.#installedExceptions.delete(k)
    }
  }

  applicable(copy: CachedRead): boolean {
    return (
      ![...this.#rules.values()].some(rule => rule(copy)) ||
      this.#installedExceptions.get(key(copy)) === canonical(copy)
    )
  }

  find(
    record: LocalRecord,
    operation: string,
    payload: Readonly<Record<string, unknown>>,
    account: string,
  ): CachedRead | undefined {
    const context = cacheContext(operation, payload, account)
    if (context !== undefined && context.account !== account) return undefined
    const query = {
      centerId: record.center.centerId,
      accountId: account,
      operation,
      payload,
      ...(context === undefined ? {} : { tenant: context }),
    }
    return record.cache.find(copy => key(copy) === key(query) && this.applicable(copy))
  }

  /** Apply authoritative observations even when a timestamp or persistence later fails. */
  observe(
    record: LocalRecord,
    operation: string,
    payload: Readonly<Record<string, unknown>>,
    reply: { readonly result: unknown } | { readonly failure: string },
    account: string,
  ): void {
    const group = (operations: readonly string[]) =>
      this.#invalidate(
        canonical(['group', operations]),
        c => operations.includes(c.operation),
        record.cache,
      )
    const organization = (id: string, onlyAdministrator = false) =>
      this.#invalidate(
        canonical(['organization', id, onlyAdministrator]),
        c => dependencies(c).includes(id) && (!onlyAdministrator || administratorRead(c)),
        record.cache,
      )
    if ('failure' in reply) {
      // Write payloads cannot name a cached reading and may carry credentials.
      // Never retain them as query rules beyond their action's lifetime.
      if (READ_OPERATIONS.has(operation)) {
        const query = canonical(payload)
        this.#invalidate(
          canonical(['query', operation, query]),
          c => c.operation === operation && canonical(c.payload) === query,
          record.cache,
        )
      }
      if (reply.failure === 'expectedTenantMismatch') group([og(36)])
      if (reply.failure === 'membershipNotEffective') {
        const target = tenant(payload['targetTenant'])
        if (target?.account === account) organization(target.organization)
      }
      if (reply.failure === 'notAuthorized') {
        const context = cacheContext(operation, payload, account)
        if (context !== undefined) organization(context.organization)
        else if (operation === og(34) && Array.isArray(payload['organizations'])) {
          for (const id of payload['organizations']) if (typeof id === 'string') organization(id)
        }
      }
      return
    }
    if (operation === og(26)) {
      const queried = tenant(payload['tenant'])
      if (
        queried?.account === account &&
        object(reply.result) &&
        reply.result['standing'] === 'effective' &&
        reply.result['role'] === 'member'
      )
        organization(queried.organization, true)
    }
    if (READ_OPERATIONS.has(operation)) return
    if (operation === og(21)) group([og(27)])
    if ([og(23), og(24), og(25), og(61), ENTRY50].includes(operation))
      group([og(55), og(57), og(58)])
    if ([og(25), og(28), og(29)].includes(operation)) group([og(26), og(27), og(59)])
    if (operation === og(28) || operation === og(29)) {
      const target = tenant(payload['targetTenant'])
      if (target?.account === account)
        organization(target.organization, operation === og(28) && payload['role'] === 'member')
    }
    if ([og(30), og(31), og(32), og(33), og(62)].includes(operation))
      group([og(34), og(56), og(58), og(60)])
    if (operation === og(32) || operation === og(33)) group([og(22)])
    if (operation === og(37)) group([og(36)])
    if (operation === AI16) group([AI37])
  }

  prepare(record: LocalRecord, additions: readonly CachedRead[]): LocalRecord {
    const replacementKeys = new Set(additions.map(key))
    return {
      ...record,
      cache: [
        ...record.cache.filter(c => this.applicable(c) && !replacementKeys.has(key(c))),
        ...additions,
      ],
    }
  }
  installed(additions: readonly CachedRead[]): void {
    for (const copy of additions) this.#installedExceptions.set(key(copy), canonical(copy))
  }
  clear(): void {
    this.#rules.clear()
    this.#installedExceptions.clear()
  }
}
