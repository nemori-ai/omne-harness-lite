import type { ClientLine, PlacedLine } from '@omne-harness/assets'
import type { PluginManifest, SideName } from '@omne-harness/plugin-protocol'
import { placedOf, rivals, type PluginHeld } from './effect.ts'

/** What one connected client last told of this plugin; `state` is null when it told nothing of it. */
export type ClientTold = Readonly<{
  client: string
  state: 'loaded' | 'failed' | 'held' | 'waiting' | null
  reason: string | null
}>

/** How the server stands with the version the tenant holds; `state` is null when it has not taken it up yet. */
export type ServerTold = Readonly<{
  state: 'loading' | 'loaded' | 'failed' | 'waiting' | 'held' | null
  reason: string | null
}>

export type PluginPlacementInput = Readonly<{
  name: string
  manifest: PluginManifest
  enabled: boolean
  held: readonly PluginHeld[]
  /** The connected clients; null when they cannot be read now. */
  clients: readonly ClientTold[] | null
  /** The server; null when this tree loads no plugin on the server. */
  server: ServerTold | null
}>

export type PluginPlacement = Readonly<{
  places: readonly PlacedLine[]
  clients: readonly ClientLine[] | null
  advice: string | null
}>

const STOPPED =
  'stopped: the app did not come up twice in a row with this one wanted. It runs without it. Publish a new version, or disable it.'

function toldBy({ client, state, reason }: ClientTold): ClientLine {
  const says =
    state === null
      ? 'not loaded yet'
      : state === 'loaded'
        ? `loaded${reason === null ? '' : `: ${reason}`}`
        : state === 'held'
          ? STOPPED
          : state === 'waiting'
            ? `waits for ${reason ?? 'what it lacks'}: it loads by itself when that is there`
            : `failed: ${reason ?? 'no reason was told'}`
  return { label: `${client}, connected`, says }
}

type Standing = Readonly<{ standing: string; says: string }>

const IN_EFFECT: Standing = { standing: 'in effect', says: '' }

function clientStanding(clients: readonly ClientTold[] | null): Standing {
  if (clients === null) return { standing: 'not known', says: 'the clients cannot be read now' }
  if (clients.length === 0) return { standing: 'not known', says: 'no client is connected to say' }
  if (clients.some(client => client.state === 'failed'))
    return { standing: 'not in effect', says: 'the client could not load it' }
  if (clients.some(client => client.state === 'held'))
    return { standing: 'not in effect', says: 'the app stopped loading it' }
  if (clients.some(client => client.state === 'waiting'))
    return { standing: 'not in effect', says: 'the client waits for what it lacks' }
  if (clients.some(client => client.state === null))
    return { standing: 'not known', says: 'a client has not loaded it yet' }
  return IN_EFFECT
}

function serverStanding(server: ServerTold | null): Standing {
  if (server === null)
    return {
      standing: 'not in effect',
      says: 'the server side does not load plugins in this build',
    }
  switch (server.state) {
    case null:
      return { standing: 'not known', says: 'the server has not loaded it yet' }
    case 'loading':
      return { standing: 'not known', says: 'the server is loading it' }
    case 'loaded':
      return IN_EFFECT
    case 'failed':
      return {
        standing: 'not in effect',
        says: `the server could not load it: ${server.reason ?? 'no reason was told'}`,
      }
    case 'waiting':
      return {
        standing: 'not in effect',
        says: `the server waits for ${server.reason ?? 'what it lacks'}: it loads by itself when that is there`,
      }
    case 'held':
      return {
        standing: 'not in effect',
        says: 'the server stopped loading it: it went down twice in a row while loading it or in calls of it. Publish a new version, or disable it and enable it again.',
      }
  }
}

function standingOf(input: PluginPlacementInput, side: SideName): Standing {
  if (!input.enabled) return { standing: 'not in effect', says: 'it is disabled' }
  return side === 'server' ? serverStanding(input.server) : clientStanding(input.clients)
}

/** Where a held plugin is placed and whether each place is in effect, from its manifest and what each side told. */
export function pluginPlacement(input: PluginPlacementInput): PluginPlacement {
  const places = placedOf(input.manifest).map((placed): PlacedLine => {
    const { point, key, id } = placed.member
    const { side } = placed
    const named = { point, key, ...(id !== undefined && { id }), side }
    const [rival] = input.enabled ? rivals(input.name, placed, input.held) : []
    return rival === undefined
      ? { ...named, ...standingOf(input, side) }
      : {
          ...named,
          standing: 'conflict',
          says: `with plugin ${rival}; neither is in effect, the built-in shows`,
        }
  })
  const failed =
    input.clients?.some(client => client.state === 'failed') === true ||
    (input.manifest.server !== undefined && input.server?.state === 'failed')
  return {
    places,
    clients: input.clients === null ? null : input.clients.map(toldBy),
    advice: failed ? 'Fix the file and publish again, or disable it.' : null,
  }
}
