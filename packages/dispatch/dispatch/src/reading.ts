import type {
  Dispatch,
  DispatchEvent,
  DispatchReconciling,
  Dispatching,
  TenantId,
} from '@omne-harness/dispatch-contract'
import { UNAVAILABLE, done, type Environment } from './answers.ts'
import type { StoreRead } from './store.ts'

export function createReading(env: Environment): Pick<Dispatching, 'show' | 'list'> {
  const { store } = env
  return {
    async show(ctx, id) {
      const blocked = await env.permit(ctx, 'read')
      if (blocked !== null) return blocked
      const known = await store.dispatch(ctx.tenant, id)
      if (known.kind !== 'read') return UNAVAILABLE
      return known.value === null
        ? { kind: 'refused', reason: 'no-such-dispatch' }
        : done(known.value)
    },
    async list(ctx, query) {
      const blocked = await env.permit(ctx, 'read')
      if (blocked !== null) return blocked
      const read = await store.list(ctx.tenant, query)
      return read.kind === 'read' ? done(read.value) : UNAVAILABLE
    },
  }
}

async function each(
  found: StoreRead<readonly Dispatch[]>,
  step: (dispatch: Dispatch) => Promise<unknown>,
): Promise<'done' | 'unavailable'> {
  if (found.kind !== 'read') return 'unavailable'
  for (const item of found.value) await step(item).catch(() => undefined)
  return 'done'
}

const ARCHIVED: DispatchEvent = { kind: 'dispatcher-archived' }

export function createReconciling(env: Environment): DispatchReconciling {
  const { store, clock, advance } = env
  const withdrawOpen = async (tenant: TenantId, item: Dispatch) => {
    await store.apply(tenant, { of: { id: item.id }, event: ARCHIVED, at: clock.now() })
    await advance(tenant, item.id)
  }
  return {
    advance,
    reconcile: async tenant =>
      each(await store.unfinished(tenant), item => advance(tenant, item.id)),
    dispatcherArchived: async (tenant, dispatcher) => {
      const states = ['accepted', 'started', 'reported'] as const
      const found = await store.list(tenant, { by: { dispatcher }, states })
      return each(found, item => withdrawOpen(tenant, item))
    },
  }
}
