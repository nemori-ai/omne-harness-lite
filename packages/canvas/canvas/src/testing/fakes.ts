import {
  instantSchema,
  tenantIdSchema,
  type AuthorityAnswer,
  type CallContext,
  type CanvasAuthority,
  type CanvasKinds,
  type CanvasMovers,
  type KindDeclaration,
  type KindListing,
  type KindsRead,
  type Mover,
  type TenantId,
} from '@omne-harness/canvas-contract'
import type { Clock } from '../canvas.ts'

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
    /** Declares a kind as `by` would put it on the registry; the returned function withdraws it. */
    declare(declaration: KindDeclaration, by?: string): () => void
    /** How the registry fails from now on; null: it reads. */
    fail(next: 'unavailable' | 'throw' | null): void
    /** How many entries `place` holds now. */
    held(): number
  }>

/** A registry with no kind until one is declared. */
export function fakeKinds(): FakeKinds {
  let declared: { declaration: KindDeclaration; by: string }[] = []
  let failing: 'unavailable' | 'throw' | null = null
  let held = 0
  const named = (name: string) => declared.filter(({ declaration }) => declaration.name === name)
  const failed = (): boolean => {
    if (failing === 'throw') throw new Error('the registry is down')
    return failing === 'unavailable'
  }
  return {
    declare(declaration, by = `${declaration.name}-row`) {
      const mine = { declaration, by }
      declared = [...declared, mine]
      return () => {
        declared = declared.filter(entry => entry !== mine)
      }
    },
    fail(next) {
      failing = next
    },
    held: () => held,
    read(): KindsRead {
      if (failed()) return { kind: 'unavailable' }
      const names = [...new Set(declared.map(({ declaration }) => declaration.name))].sort()
      const kinds = names.map((name): KindListing => {
        const all = named(name)
        if (all.length > 1) return { kind: 'conflict', name, by: all.map(({ by }) => by).sort() }
        const { label, summary, reference } = all[0]!.declaration
        return { kind: 'declared', name, label, summary, reference }
      })
      return { kind: 'read', kinds }
    },
    enter(name) {
      if (failed()) return { kind: 'unavailable' }
      const all = named(name)
      if (all.length === 0) return { kind: 'undeclared' }
      if (all.length > 1) return { kind: 'conflict', by: all.map(({ by }) => by).sort() }
      const mine = all[0]!
      held += 1
      let left = false
      return {
        kind: 'declared',
        ...(mine.declaration.admit === undefined ? {} : { admit: mine.declaration.admit }),
        declared: () => named(name).length === 1 && named(name)[0] === mine,
        leave() {
          if (!left) held -= 1
          left = true
        },
      }
    },
  }
}

export type FakeClock = Clock & Readonly<{ set(instant: string): void }>

export function fakeClock(start = '2026-11-24T06:00:00.000Z'): FakeClock {
  let now = start
  return {
    set(next) {
      now = next
    },
    now: () => instantSchema.parse(now),
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
