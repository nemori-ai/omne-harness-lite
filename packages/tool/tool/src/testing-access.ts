import assert from 'node:assert/strict'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type { AccessVerdict, ToolAccessGuard, ToolLedgerAction } from './ledger-guards.ts'
import type { TenantId } from './ledger-store.ts'

export type AccessDependencies = Readonly<{
  tenantText(value: unknown): string | null
  missing(handle: string): never
}>

export type AccessGuardCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

export type ToolAccessRule = Readonly<{
  principal: string
  tenant: TenantId
  action: ToolLedgerAction | 'start' | 'invalidate'
  call?: ToolCallId | null
}>

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
  start: TableStartAccess<P>
  fail(diagnostic: string): void
  restore(): void
}>

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
  breakDependency?(): void
}

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
