import {
  tenantIdSchema,
  type AuthorityAnswer,
  type CallContext,
  type CanvasAuthority,
  type CanvasKinds,
  type CanvasMovers,
  type KindListing,
  type KindsRead,
  type Mover,
  type TenantId,
} from '@omne-harness/canvas-contract'

export const tenantOf = (text: string): TenantId => tenantIdSchema.parse(text)

/** The context of the person a tenant is, as the access row builds it. */
export const context = (tenant = 'tenant-1'): CallContext => ({
  tenant: tenantOf(tenant),
  subject: { principal: tenant },
})

export type FakeAuthority = CanvasAuthority &
  Readonly<{
    /** Decides how the authority answers from now on. The default allows everything. */
    answer(rule: AuthorityAnswer | 'throw'): void
    asked(): readonly Readonly<{ tenant: TenantId; action: 'read' | 'change' }>[]
  }>

export function fakeAuthority(): FakeAuthority {
  let rule: AuthorityAnswer | 'throw' = 'allowed'
  const asked: { tenant: TenantId; action: 'read' | 'change' }[] = []
  return {
    answer(next) {
      rule = next
    },
    asked: () => asked,
    async decide(ctx, action) {
      asked.push({ tenant: ctx.tenant, action })
      if (rule === 'throw') throw new Error('authority is down')
      return rule
    },
  }
}

export type FakeKinds = CanvasKinds &
  Readonly<{
    /** What the registry answers from now on. The default is no kind at all. */
    set(next: readonly KindListing[] | 'unavailable' | 'throw'): void
  }>

export function fakeKinds(): FakeKinds {
  let now: readonly KindListing[] | 'unavailable' | 'throw' = []
  return {
    set(next) {
      now = next
    },
    read(): KindsRead {
      if (now === 'throw') throw new Error('the registry is down')
      return now === 'unavailable' ? { kind: 'unavailable' } : { kind: 'read', kinds: now }
    },
  }
}

export type FakeMovers = CanvasMovers &
  Readonly<{
    /** Who every call is from now on; null when it cannot be told. The default is the person. */
    set(next: Mover | null): void
    asked(): number
  }>

export function fakeMovers(): FakeMovers {
  let now: Mover | null = { kind: 'human' }
  let asked = 0
  return {
    set(next) {
      now = next
    },
    asked: () => asked,
    async moverOf() {
      asked += 1
      return now
    },
  }
}
