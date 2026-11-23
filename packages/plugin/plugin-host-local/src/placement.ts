import type { ClientLine, PlacedLine } from '@omne-harness/assets'
import type { PluginManifest } from '@omne-harness/plugin-protocol'
import { placedOf, rivals, type PluginHeld } from './effect.ts'

/** What one connected client last told of this plugin; `state` is null when it told nothing of it. */
export type ClientTold = Readonly<{
  client: string
  state: 'loaded' | 'failed' | 'held' | null
  reason: string | null
}>

export type PluginPlacementInput = Readonly<{
  name: string
  manifest: PluginManifest
  enabled: boolean
  held: readonly PluginHeld[]
  /** The connected clients; null when they cannot be read now. */
  clients: readonly ClientTold[] | null
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
          : `failed: ${reason ?? 'no reason was told'}`
  return { label: `${client}, connected`, says }
}

type Standing = Readonly<{ standing: string; says: string }>

function standingOf(input: PluginPlacementInput): Standing {
  if (!input.enabled) return { standing: 'not in effect', says: 'it is disabled' }
  const { clients } = input
  if (clients === null) return { standing: 'not known', says: 'the clients cannot be read now' }
  if (clients.length === 0) return { standing: 'not known', says: 'no client is connected to say' }
  if (clients.some(client => client.state === 'failed'))
    return { standing: 'not in effect', says: 'the client could not load it' }
  if (clients.some(client => client.state === 'held'))
    return { standing: 'not in effect', says: 'the app stopped loading it' }
  if (clients.some(client => client.state === null))
    return { standing: 'not known', says: 'a client has not loaded it yet' }
  return { standing: 'in effect', says: '' }
}

/** Where a held plugin is placed and whether each place is in effect, from its manifest and what the clients told. */
export function pluginPlacement(input: PluginPlacementInput): PluginPlacement {
  const whole = standingOf(input)
  const places = placedOf(input.manifest).map((placed): PlacedLine => {
    const { point, key } = placed.member
    const [rival] = input.enabled ? rivals(input.name, placed, input.held) : []
    return rival === undefined
      ? { point, key, ...whole }
      : {
          point,
          key,
          standing: 'conflict',
          says: `with plugin ${rival}; neither is in effect, the built-in shows`,
        }
  })
  const failed = input.clients?.some(client => client.state === 'failed') === true
  return {
    places,
    clients: input.clients === null ? null : input.clients.map(toldBy),
    advice: failed ? 'Fix the file and publish again, or disable it.' : null,
  }
}
