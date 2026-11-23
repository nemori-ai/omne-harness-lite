import type { CategoryEffect, PublishContent } from '@omne-harness/assets'
import { MANIFEST_FILE, readManifest, type PluginManifest } from '@omne-harness/plugin-protocol'
import { pluginImpact, pluginPlacement, type KnownPoint } from './effect.ts'
import type { ListedPlugins } from './held.ts'

/** What one connected client last told: the points it has, and how each plugin it was to load came out. */
export type ToldByClient = Readonly<{
  client: string
  points: readonly Readonly<{ name: string }>[]
  plugins: readonly Readonly<{
    name: string
    version: string
    state: 'loaded' | 'failed' | 'held'
    reason: string | null
  }>[]
}>

export type PluginEffectPorts = Readonly<{
  listed(tenant: string): Promise<ListedPlugins>
  serverPoints(): readonly KnownPoint[]
  /** The connected clients of one tenant; undefined when they cannot be read now. */
  clients(tenant: string): readonly ToldByClient[] | undefined
  serverLoads: boolean
}>

const UNREAD = Object.freeze({
  kind: 'unavailable' as const,
  reason: 'what the tenant holds cannot be read now',
})
const notHeld = (name: string) =>
  ({ kind: 'unavailable', reason: `the tenant holds no plugin named ${name}` }) as const

/** The manifest of a directory not yet published, or why it cannot be had. */
async function manifestIn(content: PublishContent): Promise<PluginManifest | string> {
  if (content.kind !== 'directory') return 'a plugin is published from a directory'
  const files = await content.from.manifest()
  if (!('ok' in files)) return `the directory cannot be read: ${files.failure}`
  const entry = files.ok.entries.find(found => found.path === MANIFEST_FILE)
  if (entry === undefined) return `the directory has no ${MANIFEST_FILE}`
  const opened = await content.from.open(entry.path, entry.digest)
  if (!('ok' in opened)) return `${MANIFEST_FILE} cannot be read: ${opened.failure}`
  const read = readManifest(new TextDecoder().decode(opened.ok))
  return read.kind === 'read' ? read.manifest : `${MANIFEST_FILE}: ${read.reason}`
}

function clientPoints(clients: readonly ToldByClient[]): readonly KnownPoint[] {
  const names = new Set(clients.flatMap(({ points }) => points.map(({ name }) => name)))
  return [...names].map(name => ({ name, side: 'client', takes: null, when: null }))
}

/** What the Plugin category tells of its own: from what the tenant holds, the points that are there, and what the clients told. */
export function pluginEffect(ports: PluginEffectPorts): CategoryEffect {
  return {
    impact: {
      async of({ tenant, capability, change, content }) {
        const holding = await ports.listed(tenant)
        if (holding.kind !== 'read') return UNREAD
        const mine = holding.plugins.find(each => each.name === capability.name)
        const manifest = content === undefined ? mine?.manifest : await manifestIn(content)
        if (manifest === undefined) return notHeld(capability.name)
        if (typeof manifest === 'string') return { kind: 'unavailable', reason: manifest }
        const clients = ports.clients(tenant) ?? []
        const told = pluginImpact({
          name: capability.name,
          change,
          manifest,
          held: holding.plugins,
          points: [...ports.serverPoints(), ...clientPoints(clients)],
          unknownSides: clients.length === 0 ? ['client'] : [],
          serverLoads: ports.serverLoads,
        })
        return { kind: 'changes', ...told }
      },
    },
    placement: {
      async of({ tenant, capability }) {
        const holding = await ports.listed(tenant)
        if (holding.kind !== 'read') return UNREAD
        const mine = holding.plugins.find(each => each.name === capability.name)
        if (mine === undefined) return notHeld(capability.name)
        // A client tells of the version it loaded: only the version the tenant holds now counts.
        const clients = ports.clients(tenant)?.map(({ client, plugins }) => {
          const one = plugins.find(
            each => each.name === mine.name && `sha256:${each.version}` === mine.held.version,
          )
          return { client, state: one?.state ?? null, reason: one?.reason ?? null }
        })
        const told = pluginPlacement({
          name: mine.name,
          manifest: mine.manifest,
          enabled: mine.enabled,
          held: holding.plugins,
          clients: clients ?? null,
        })
        return { kind: 'placed', ...told }
      },
    },
  }
}
