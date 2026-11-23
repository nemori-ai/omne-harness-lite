import type { HeldPlugin } from '@omne-harness/plugin-host-local'

export type FollowingPorts = Readonly<{
  /** What a tenant holds now; undefined when it cannot be read, which is not holding nothing. */
  read(tenant: string): Promise<readonly HeldPlugin[] | undefined>
  converge(tenant: string, plugins: readonly HeldPlugin[]): void
  subscribe(tenant: string, changed: () => void): () => unknown
  warn(message: string): void
}>

export type Following = Readonly<{
  /** Takes a tenant up once: it is read now and again each time its assets change. */
  follow(tenant: string): Promise<void>
  close(): void
}>

type Followed = { reading: Promise<void> | undefined; again: boolean; stop: () => unknown }

/** Keeps what the server is to load of each tenant up with what it holds. A read already running is not run twice. */
export function followTenants(ports: FollowingPorts): Following {
  const followed = new Map<string, Followed>()
  let closed = false
  const once = async (tenant: string): Promise<void> => {
    const plugins = await ports.read(tenant).catch(() => undefined)
    if (closed) return
    if (plugins !== undefined) return ports.converge(tenant, plugins)
    ports.warn(`tenant ${tenant}: its plugins cannot be read now; the server keeps what it loaded`)
  }
  const reread = (tenant: string, state: Followed): Promise<void> => {
    if (state.reading !== undefined) {
      state.again = true
      return state.reading
    }
    const reading = (async () => {
      do {
        state.again = false
        await once(tenant)
      } while (state.again && !closed)
    })().finally(() => void (state.reading = undefined))
    state.reading = reading
    return reading
  }
  return {
    follow(tenant) {
      const known = followed.get(tenant)
      if (closed || known !== undefined) return known?.reading ?? Promise.resolve()
      const state: Followed = { reading: undefined, again: false, stop: () => undefined }
      followed.set(tenant, state)
      state.stop = ports.subscribe(tenant, () => void reread(tenant, state))
      return reread(tenant, state)
    },
    close() {
      closed = true
      for (const state of followed.values()) state.stop()
      followed.clear()
    },
  }
}
