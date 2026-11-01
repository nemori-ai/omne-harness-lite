// The table double of the Tool access guard (RD-TOOLHEAD) and the provider suite every access guard
// must pass. The double stands in for the application adapter of the authorization decision until
// that adapter exists. It answers from an explicit allow table and has no default allow: no rule,
// a forged tenant or a tenant other than the rule's tenant is denied. It declares
// `durability: 'none'` and must not be assembled into production.
import assert from 'node:assert/strict'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type { AccessVerdict, ToolAccessGuard, ToolLedgerAction } from './ledger-guards.ts'
import type { TenantId } from './ledger-store.ts'

/** What the entry passes in: the minted-tenant text and the not-applicable signal of tool-contract. */
export type AccessDependencies = Readonly<{
  tenantText(value: unknown): string | null
  missing(handle: string): never
}>

/** One case, in the shape of `ConformanceCase` of tool-contract/testing. */
export type AccessGuardCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

/**
 * One allowed qualification. `principal` is the value of `principalKey` for the principal. An
 * omitted `call` allows every call of the tenant. `call: null` matches only a request without a
 * call, which only `invalidate` makes.
 */
export type ToolAccessRule = Readonly<{
  principal: string
  tenant: TenantId
  action: ToolLedgerAction | 'start' | 'invalidate'
  call?: ToolCallId | null
}>

/** The qualification input of the start coordinator, structurally its `StartCoordinatorAccess`. */
export type TableStartAccess<P> = Readonly<{
  qualify(
    input: Readonly<{
      principal: P
      tenant: TenantId
      call: ToolCallId | null
      action: 'start' | 'invalidate'
    }>,
  ): Promise<AccessVerdict>
}>

export type TableToolAccess<P> = Readonly<{
  durability: 'none'
  guard: ToolAccessGuard<P>
  /** The view for the start coordinator. It shares the table and the failure state with `guard`. */
  start: TableStartAccess<P>
  /** Every later verdict answers unavailable until `restore`. */
  fail(diagnostic: string): void
  restore(): void
}>

/**
 * Builds the table double (the entry exports it as `createTableToolAccess`). A verdict is, in order: `unavailable` while failed; `denied`
 * (`forged-tenant`) when the tenant is not a value that legal-identity minted; `allowed` when a
 * rule matches the principal key, the tenant text, the action and the call; else `denied`
 * (`no-rule`). One lookup is one decision point, so `read-raw-content` needs its own rule.
 */
export function tableToolAccess<P>(
  input: Readonly<{ principalKey(principal: P): string; allow: readonly ToolAccessRule[] }>,
  deps: Pick<AccessDependencies, 'tenantText'>,
): TableToolAccess<P> {
  const rules = input.allow.map(rule => {
    const tenant = deps.tenantText(rule.tenant)
    if (tenant === null) throw new TypeError('an allow rule needs a minted tenant')
    return { ...rule, tenant }
  })
  let failed: string | null = null

  const decide = async (request: {
    principal: P
    tenant: unknown
    call: ToolCallId | null
    action: ToolAccessRule['action']
  }): Promise<AccessVerdict> => {
    if (failed !== null) return { kind: 'unavailable', diagnostic: failed }
    const tenant = deps.tenantText(request.tenant)
    if (tenant === null) return { kind: 'denied', reason: 'forged-tenant' }
    let principal: string
    try {
      principal = input.principalKey(request.principal)
    } catch (error) {
      return { kind: 'unavailable', diagnostic: `principal: ${String(error)}` }
    }
    const found = rules.some(
      rule =>
        rule.principal === principal &&
        rule.tenant === tenant &&
        rule.action === request.action &&
        (rule.call === undefined || rule.call === request.call),
    )
    return found ? { kind: 'allowed' } : { kind: 'denied', reason: 'no-rule' }
  }

  return Object.freeze({
    durability: 'none',
    guard: { qualify: decide },
    start: { qualify: decide },
    fail(diagnostic: string) {
      failed = diagnostic
    },
    restore() {
      failed = null
    },
  } satisfies TableToolAccess<P>)
}

type GuardInput<P> = Parameters<ToolAccessGuard<P>['qualify']>[0]

/** The inputs of one guard under test. `otherTenant` differs from `allowed` only in the tenant. */
export interface ToolAccessGuardFixture<P> {
  readonly guard: ToolAccessGuard<P>
  readonly allowed: GuardInput<P>
  readonly unlisted: GuardInput<P>
  readonly otherTenant: GuardInput<P>
  readonly forgedTenant: Readonly<{
    principal: P
    tenant: unknown
    call: ToolCallId
    action: ToolLedgerAction
  }>
  /** Makes the next verdict's dependency fail. Without it, that case is not applicable. */
  breakDependency?(): void
}

/** The five cases every Tool access guard must pass (exported as `toolAccessGuardConformance`). */
export function accessGuardCases<P>(
  deps: Pick<AccessDependencies, 'missing'>,
): readonly AccessGuardCase<ToolAccessGuardFixture<P>>[] {
  return [
    {
      name: 'a qualified principal is allowed',
      clause: 'ToolAccessGuard',
      async run({ guard, allowed }) {
        assert.equal((await guard.qualify(allowed)).kind, 'allowed')
      },
    },
    {
      name: 'a principal without a rule is denied, not allowed by default',
      clause: 'ToolAccessGuard',
      async run({ guard, unlisted }) {
        assert.equal((await guard.qualify(unlisted)).kind, 'denied')
      },
    },
    {
      name: 'the same request for another tenant is denied',
      clause: 'ToolAccessGuard',
      async run({ guard, allowed, otherTenant }) {
        assert.notDeepEqual(
          otherTenant.tenant,
          allowed.tenant,
          'the fixture must change the tenant',
        )
        assert.equal((await guard.qualify(otherTenant)).kind, 'denied')
      },
    },
    {
      name: 'a tenant that legal-identity did not mint is denied',
      clause: 'ToolAccessGuard',
      async run({ guard, forgedTenant }) {
        const verdict = await guard.qualify(forgedTenant as unknown as GuardInput<P>)
        assert.equal(verdict.kind, 'denied')
      },
    },
    {
      name: 'a failed dependency is unavailable, never allowed',
      clause: 'ToolAccessGuard',
      async run({ guard, allowed, breakDependency }) {
        if (breakDependency === undefined) deps.missing('breakDependency')
        breakDependency()
        assert.equal((await guard.qualify(allowed)).kind, 'unavailable')
      },
    },
  ]
}
