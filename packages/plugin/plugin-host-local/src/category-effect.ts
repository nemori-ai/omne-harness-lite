import type { CategoryEffect, PublishContent } from '@omne-harness/assets'
import {
  IMAGE_SUFFIXES,
  MANIFEST_FILE,
  lacksText,
  readManifest,
  type Kept,
  type PluginManifest,
} from '@omne-harness/plugin-protocol'
import { pluginImpact, type KnownPoint } from './effect.ts'
import { pluginPlacement, type ServerTold } from './placement.ts'
import type { ListedPlugins } from './held.ts'

/** What one connected client last told: the points it has, and how each plugin it was to load came out. */
export type ToldByClient = Readonly<{
  client: string
  points: readonly Readonly<{
    name: string
    contract?: Readonly<{ item: Readonly<{ kind: string }>; binding: string }>
    dataKeys?: readonly Readonly<{ name: string }>[]
  }>[]
  plugins: readonly Readonly<{
    name: string
    version: string
    state: 'loaded' | 'failed' | 'held'
    reason: string | null
    waiting?: readonly string[]
  }>[]
}>

export type PluginEffectPorts = Readonly<{
  listed(tenant: string): Promise<ListedPlugins>
  serverPoints(): readonly KnownPoint[]
  /** The connected clients of one tenant; undefined when they cannot be read now. */
  clients(tenant: string): readonly ToldByClient[] | undefined
  /** How the server stands with each plugin of one tenant, by name; null when this tree loads no plugin on the server. */
  server(tenant: string): ReadonlyMap<string, Kept> | null
  lockedBy?(tenant: string, point: string, key: string, id: string): string | undefined
}>

function serverTold(kept: Kept | undefined, held: string): ServerTold {
  if (kept === undefined || `sha256:${kept.version}` !== held) return { state: null, reason: null }
  if (kept.kind === 'waiting') return { state: 'waiting', reason: lacksText(kept.lacks) }
  return { state: kept.kind, reason: kept.kind === 'failed' ? kept.reason : null }
}

const unreadAdvice = (unread: readonly string[]): string | null =>
  unread.length === 0
    ? null
    : `${MANIFEST_FILE} has fields that are not read: ${unread.join(', ')}. A manifest reads schema, name, summary, kind, client and server; members go under client or server.`

const UNREAD = Object.freeze({
  kind: 'unavailable' as const,
  reason: 'what the tenant holds cannot be read now',
})
const notHeld = (name: string) =>
  ({ kind: 'unavailable', reason: `the tenant holds no plugin named ${name}` }) as const

const WORN =
  'This is a skin: its members count while it is the skin worn. With one skin enabled the interface wears it; with more, the one a person chose on the assets page.'
const wornAdvice = (manifest: PluginManifest): string | null =>
  manifest.kind === 'skin' ? WORN : null
const joined = (advice: readonly (string | null)[]): string | null =>
  advice.filter(each => each !== null).join(' ') || null

type Sized = Readonly<{ path: string; bytes: number }>

const MIB = 1024 * 1024
const LARGE_IMAGE_BYTES = 2 * MIB
const largeAdvice = (large: readonly Sized[]): string | null =>
  large.length === 0
    ? null
    : `Images over 2 MiB: ${large.map(({ path, bytes }) => `${path} (${(bytes / MIB).toFixed(1)} MiB)`).join(', ')}. The interface decodes an image each time it loads it, so these make it slower to show: make them smaller (compress them, or scale them to the size they are shown) before you publish.`

const largeImages = (entries: readonly Sized[]): readonly Sized[] =>
  entries.filter(
    ({ path, bytes }) =>
      bytes > LARGE_IMAGE_BYTES && IMAGE_SUFFIXES.some(suffix => path.endsWith(suffix)),
  )

type Written = Readonly<{
  manifest: PluginManifest
  unread: readonly string[]
  large: readonly Sized[]
}>
type Listed = Extract<ListedPlugins, { kind: 'read' }>['plugins']

function sameLayer(manifest: PluginManifest, name: string, held: Listed): Listed {
  return held.filter(
    other => other.name === name || (manifest.kind !== 'skin' && other.manifest.kind !== 'skin'),
  )
}

async function manifestIn(content: PublishContent): Promise<Written | string> {
  if (content.kind !== 'directory') return 'a plugin is published from a directory'
  const files = await content.from.manifest()
  if (!('ok' in files)) return `the directory cannot be read: ${files.failure}`
  const entry = files.ok.entries.find(found => found.path === MANIFEST_FILE)
  if (entry === undefined) return `the directory has no ${MANIFEST_FILE}`
  const opened = await content.from.open(entry.path, entry.digest)
  if (!('ok' in opened)) return `${MANIFEST_FILE} cannot be read: ${opened.failure}`
  const read = readManifest(new TextDecoder().decode(opened.ok))
  if (read.kind !== 'read') return `${MANIFEST_FILE}: ${read.reason}`
  return { manifest: read.manifest, unread: read.unread, large: largeImages(files.ok.entries) }
}

/** The points of the clients, each as the first client that tells of it tells it; one told by name alone takes anything. */
function clientPoints(clients: readonly ToldByClient[]): readonly KnownPoint[] {
  const known = new Map<string, KnownPoint>()
  for (const { points } of clients)
    for (const { name, contract, dataKeys } of points) {
      if (known.has(name)) continue
      const takes = contract === undefined ? null : contract.item.kind === 'data' ? 'data' : 'code'
      const when = contract === undefined ? null : contract.binding === 'run' ? 'running' : 'build'
      const names = dataKeys === undefined ? {} : { dataKeys: dataKeys.map(each => each.name) }
      known.set(name, { name, side: 'client', takes, when, ...names })
    }
  return [...known.values()]
}

/** What the Plugin category tells of its own: from what the tenant holds, the points that are there, and what the clients told. */
/** A client tells of the version it loaded: only the version the tenant holds now counts. */
function toldOf(clients: readonly ToldByClient[], name: string, version: string) {
  return clients.map(({ client, plugins }) => {
    const one = plugins.find(each => each.name === name && `sha256:${each.version}` === version)
    if (one?.waiting !== undefined)
      return { client, state: 'waiting' as const, reason: one.waiting.join(', ') }
    return { client, state: one?.state ?? null, reason: one?.reason ?? null }
  })
}

export function pluginEffect(ports: PluginEffectPorts): CategoryEffect {
  return {
    impact: {
      async of({ tenant, capability, change, content }) {
        const holding = await ports.listed(tenant)
        if (holding.kind !== 'read') return UNREAD
        const mine = holding.plugins.find(
          each => each.name === capability.name && each.category === capability.category,
        )
        const written =
          content === undefined
            ? mine && { manifest: mine.manifest, unread: [], large: [] }
            : await manifestIn(content)
        if (written === undefined) return notHeld(capability.name)
        if (typeof written === 'string') return { kind: 'unavailable', reason: written }
        const { manifest, unread, large } = written
        const clients = ports.clients(tenant) ?? []
        const told = pluginImpact({
          name: capability.name,
          change,
          manifest,
          held: sameLayer(manifest, capability.name, holding.plugins),
          points: [...ports.serverPoints(), ...clientPoints(clients)],
          unknownSides: clients.length === 0 ? ['client'] : [],
          serverLoads: ports.server(tenant) !== null,
          ...(ports.lockedBy === undefined
            ? {}
            : { lockedBy: (point, key, id) => ports.lockedBy?.(tenant, point, key, id) }),
        })
        const advice = joined([
          unreadAdvice(unread),
          told.advice,
          wornAdvice(manifest),
          largeAdvice(large),
        ])
        return { kind: 'changes', ...told, advice }
      },
    },
    placement: {
      async of({ tenant, capability }) {
        const holding = await ports.listed(tenant)
        if (holding.kind !== 'read') return UNREAD
        const mine = holding.plugins.find(
          each => each.name === capability.name && each.category === capability.category,
        )
        if (mine === undefined) return notHeld(capability.name)
        const clients = ports.clients(tenant)
        const server = ports.server(tenant)
        const told = pluginPlacement({
          name: mine.name,
          manifest: mine.manifest,
          enabled: mine.enabled,
          held: sameLayer(mine.manifest, mine.name, holding.plugins),
          clients: clients === undefined ? null : toldOf(clients, mine.name, mine.held.version),
          server: server === null ? null : serverTold(server.get(mine.name), mine.held.version),
        })
        return { kind: 'placed', ...told, advice: joined([told.advice, wornAdvice(mine.manifest)]) }
      },
    },
  }
}
