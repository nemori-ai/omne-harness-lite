import {
  createLoader,
  fiberOf,
  heldOf,
  standingOf,
  type FloorPort,
  type Kept,
  type Loader,
  type Outcome,
  type Wanted,
} from '@omne-harness/plugin-protocol'

export type ServerSidePorts = Readonly<{
  floor: FloorPort
  /** Loads one plugin of one tenant: the outcome takes it back when it is loaded. */
  install(tenant: string, wanted: Wanted): Promise<Outcome>
}>

export type ServerSide = Readonly<{
  /** What one tenant is to load now. Each tenant is brought there on its own. */
  converge(tenant: string, wanted: readonly Wanted[]): void
  /** How each plugin of a tenant stands; undefined for a tenant nothing was ever asked of. */
  states(tenant: string): ReadonlyMap<string, Kept> | undefined
  tenants(): readonly string[]
  watch(listener: (tenant: string) => void): () => void
  idle(): Promise<void>
  stop(): Promise<void>
}>

type Tenant = Readonly<{ loader: Loader; latest: Map<string, Wanted>; known: Set<string> }>

/** Brings the server to what every tenant is to load, by the same table and the same floor as a client. */
export function createServerSide(ports: ServerSidePorts): ServerSide {
  const { floor } = ports
  const tenants = new Map<string, Tenant>()
  const listeners = new Set<(tenant: string) => void>()
  let stopped = false

  /** Brings the floor to what the loader of one tenant holds now. */
  function settle(name: string, tenant: Tenant): void {
    const standing = standingOf(tenant.loader.states())
    for (const fiber of tenant.known) {
      if (standing.wanted.has(fiber)) continue
      tenant.known.delete(fiber)
      floor.unwant(name, fiber)
    }
    if (!standing.loading) floor.settle(name)
    for (const listener of listeners) listener(name)
  }

  function open(name: string): Tenant {
    const risen = floor.rise(name)
    const latest = new Map<string, Wanted>()
    const known = new Set(risen.want)
    const loader = createLoader({
      held: risen.held ? heldOf(risen.want) : new Map(),
      install(listed) {
        const wanted = latest.get(listed.name)
        if (wanted === undefined || wanted.version !== listed.version)
          return Promise.resolve({ kind: 'failed', reason: 'it is no longer listed' })
        const fiber = fiberOf(listed.name, listed.version)
        floor.want(name, fiber)
        known.add(fiber)
        return ports.install(name, wanted)
      },
    })
    const tenant = { loader, latest, known }
    loader.watch(() => settle(name, tenant))
    tenants.set(name, tenant)
    return tenant
  }

  return {
    converge(name, wanted) {
      if (stopped) return
      const tenant = tenants.get(name) ?? open(name)
      tenant.latest.clear()
      for (const each of wanted) tenant.latest.set(each.name, each)
      tenant.loader.converge(
        wanted.map(({ name: plugin, version, members }) => ({ name: plugin, version, members })),
      )
      settle(name, tenant)
    },
    states: name => tenants.get(name)?.loader.states(),
    tenants: () => [...tenants.keys()].sort(),
    watch(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    async idle() {
      await Promise.all(Array.from(tenants.values(), tenant => tenant.loader.idle()))
    },
    async stop() {
      stopped = true
      await Promise.all(
        Array.from(tenants, async ([name, tenant]) => {
          await tenant.loader.stop()
          floor.settle(name)
        }),
      )
    },
  }
}
