import { randomUUID } from 'node:crypto'
import type { ModelInstanceHost, ModelHandle, Publication } from '@omne-harness/model-contract'
import { MemoryState } from './state.ts'
import { positiveLimit, tenantKey, unavailable } from './value.ts'

export function createMemoryInstanceHost<P>(store: MemoryState<P>, maxQueued: number) {
  positiveLimit(maxQueued, 'maxQueued')
  const queue = new Map<string, Parameters<ModelInstanceHost<P>['schedule']>[0]>()
  const routes = new Map<string, { publication: Publication; handle: ModelHandle<P> }>()
  let available = true
  function key(input: Parameters<ModelInstanceHost<P>['schedule']>[0]) {
    const tenant = store.identity(input)
    return typeof tenant === 'string' ? `${tenant}/${input.call}` : tenant
  }
  const host: ModelInstanceHost<P> = {
    schedule: input =>
      store.run(() => {
        const id = key(input)
        if (typeof id !== 'string') return { failure: id }
        if (!available || (!queue.has(id) && queue.size >= maxQueued))
          return { failure: unavailable('model-instance-host', 'queue-unavailable') }
        queue.set(id, { ...input })
        return { ok: { queued: true } }
      }),
    publish: (input, handle) =>
      store.run(() => {
        const id = key(input)
        if (typeof id !== 'string') return { failure: id }
        const tenant = tenantKey(input.tenant)
        if (typeof tenant !== 'string') return { failure: tenant }
        const failure = store.execution(input, store.root(tenant).calls.get(input.call))
        if (failure) return { failure }
        if (!available) return { failure: unavailable('model-instance-host', 'offline') }
        if (handle.instance !== input.instance)
          return { failure: { kind: 'invalid', field: 'handle', reason: 'instance' } }
        const old = routes.get(id)
        if (
          old?.handle === handle &&
          old.publication.execution.instance === input.instance &&
          old.publication.execution.generation === input.generation
        )
          return { ok: { ...old.publication, execution: { ...old.publication.execution } } }
        const publication = { execution: { ...input }, registration: randomUUID() }
        routes.set(id, { publication, handle })
        return { ok: { ...publication, execution: { ...input } } }
      }),
    withdraw: input =>
      store.run(() => {
        const id = key(input.execution)
        if (typeof id !== 'string') return { failure: id }
        if (!available) return { failure: unavailable('model-instance-host', 'offline') }
        const old = routes.get(id)
        const removed =
          old?.publication.registration === input.registration &&
          old.publication.execution.instance === input.execution.instance &&
          old.publication.execution.generation === input.execution.generation
        if (removed) routes.delete(id)
        return { ok: { removed } }
      }),
    directory: {
      connect: input =>
        store.run(() =>
          store.read(input, 'observe', () => {
            if (!available) return { failure: unavailable('model-instance-host', 'offline') }
            const id = key(input)
            if (typeof id !== 'string') return { failure: id }
            const route = routes.get(id)
            return {
              ok: route ? { kind: 'live', handle: route.handle } : { kind: 'no-live-route' },
            }
          }),
        ),
    },
  }
  const control = {
    queued: () => [...queue.values()].map(value => ({ ...value })),
    take: () => {
      const result = [...queue.values()].map(value => ({ ...value }))
      queue.clear()
      return result
    },
    setAvailable: (value: boolean) => {
      available = value
    },
  }
  return { host, control }
}
