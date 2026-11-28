import type { ImpactLine } from '@omne-harness/assets'
import {
  membersOf,
  reasonText,
  type Member,
  type PluginManifest,
  type SideName,
} from '@omne-harness/plugin-protocol'

export type PluginHeld = Readonly<{ name: string; manifest: PluginManifest; enabled: boolean }>

export type KnownPoint = Readonly<{
  name: string
  side: SideName
  takes: 'data' | 'directory' | 'code' | null
  when: 'running' | 'build' | null
  /** The names the data of a member may use, where the point lists them; absent when any name may be used. */
  dataKeys?: readonly string[]
  closed?: Readonly<{ why: string; note: string }>
}>

export type PluginImpactInput = Readonly<{
  name: string
  change: 'publish' | 'enable' | 'disable' | 'remove'
  manifest: PluginManifest
  held: readonly PluginHeld[]
  points: readonly KnownPoint[]
  /** The sides whose points cannot be told now: a client tree is known only while a client is connected. */
  unknownSides?: readonly SideName[]
  serverLoads?: boolean
  lockedBy?: (point: string, key: string, id: string) => string | undefined
}>

export type PluginImpact = Readonly<{
  lines: readonly ImpactLine[]
  loads: string | null
  advice: string | null
}>

type Placed = Readonly<{ side: SideName; member: Member }>

const WAYS = { data: 'data', directory: 'a directory', module: 'code' } as const
const wayOf = (member: Member): 'data' | 'directory' | 'code' =>
  'module' in member ? 'code' : 'directory' in member ? 'directory' : 'data'
const said = (way: 'data' | 'directory' | 'code'): string =>
  way === 'directory' ? WAYS.directory : way

export const placedOf = (manifest: PluginManifest): readonly Placed[] =>
  membersOf(manifest).map(({ side, member }) => ({ side, member }))

const same = (left: Placed, right: Placed): boolean =>
  left.side === right.side &&
  left.member.point === right.member.point &&
  left.member.key === right.member.key &&
  left.member.id === right.member.id

export function rivals(
  name: string,
  placed: Placed,
  held: readonly PluginHeld[],
): readonly string[] {
  return held
    .filter(other => other.enabled && other.name !== name)
    .filter(other => placedOf(other.manifest).some(theirs => same(theirs, placed)))
    .map(other => other.name)
}

function distance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let before = row[0]!
    row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const kept = row[j]!
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        before + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
      before = kept
    }
  }
  return row[right.length]!
}

/** The names that are there and near enough to be what was meant: a slip of a letter or two, three at the most. */
function nearest(name: string, known: readonly string[]): readonly string[] {
  const near = Math.max(2, Math.floor(name.length / 4))
  // A name written without the beginning the listed ones share is the listed one that ends with it.
  const tail = `-${name.replace(/^[^a-z0-9]+/iu, '')}`
  return known
    .map(each => ({ each, away: each.endsWith(tail) ? 0 : distance(name, each) }))
    .filter(({ away }) => away <= near)
    .sort((a, b) => a.away - b.away || (a.each < b.each ? -1 : 1))
    .slice(0, 3)
    .map(({ each }) => each)
}

/** The first name the data of a member uses that its point does not list, said with the nearest it does list. */
function strayName(member: Member, point: KnownPoint): string | null {
  const data: unknown = 'data' in member ? member.data : undefined
  if (point.dataKeys === undefined || typeof data !== 'object' || data === null) return null
  const listed = point.dataKeys
  const stray = Array.isArray(data)
    ? undefined
    : Object.keys(data).find(key => !listed.includes(key))
  if (stray === undefined) return null
  const near = nearest(stray, listed)
  const hint = near.length === 0 ? '' : ` Nearest: ${near.join(', ')}.`
  return `→ ${stray} is not a name this point takes.${hint} OmneExtensionPoints show ${point.name} lists them. It would not be in effect.`
}

const line = (mark: ImpactLine['mark'], placed: Placed, says: string, of: string | null = null) => {
  const { point, key, id } = placed.member
  return { mark, of, point, key, ...(id !== undefined && { id }), says } satisfies ImpactLine
}

type Told = Readonly<{ lines: readonly ImpactLine[]; advice: string | null }>

const FIND = 'OmneExtensionPoints find and tree list the points that are there now.'

function arriving(input: PluginImpactInput, placed: Placed): Told {
  const { member, side } = placed
  const one = (mark: ImpactLine['mark'], says: string, advice: string | null = null): Told => ({
    lines: [line(mark, placed, says)],
    advice,
  })
  if (side === 'server' && input.serverLoads === false)
    return one('!', '→ not loaded: the server side does not load plugins in this build')
  const on = input.points.filter(point => point.side === side)
  const point = on.find(each => each.name === member.point)
  if (point === undefined) {
    if (input.unknownSides?.includes(side) === true)
      return one(
        '+',
        `→ placed when a ${side} loads it; no ${side} is connected now to say whether this point is there`,
      )
    const near = nearest(
      member.point,
      on.map(each => each.name),
    )
    const hint = near.length === 0 ? '' : ` Nearest: ${near.join(', ')}.`
    return one('!', `→ ${member.point} is not a point now.${hint} It would not be placed.`, FIND)
  }
  if (point.closed !== undefined)
    return one(
      '!',
      `→ ${reasonText({ kind: 'closed', ...point.closed }).replace(/\.$/u, '')}. It would not be in effect.`,
    )
  const way = wayOf(member)
  if (point.takes !== null && point.takes !== way)
    return one(
      '!',
      `→ ${point.name} takes ${said(point.takes)}; this member gives ${said(way)}. OmneExtensionPoints show ${point.name} says what a member must give.`,
    )
  if (point.when === 'build')
    return one('!', '→ late: this point is fixed when the app is built. It would not show.')
  const stray = strayName(member, point)
  if (stray !== null) return one('!', stray)
  const lock =
    side === 'server' ? input.lockedBy?.(member.point, member.key, member.id ?? '') : undefined
  if (lock !== undefined)
    return one(
      '!',
      `→ locked by ${lock}: the deployment holds this key and a tenant's member does not replace it. The plugin would not load.`,
      'Leave this member out, or give it another key.',
    )
  const [rival] = rivals(input.name, placed, input.held)
  if (rival === undefined) return one('+', '→ in effect')
  return {
    lines: [
      line(
        '!',
        placed,
        `→ conflict with plugin ${rival} (same tenant). Neither would be in effect; the built-in would show.`,
      ),
      line('~', placed, 'in effect → conflict', rival),
    ],
    advice: `Disable ${rival} first, or leave this member out.`,
  }
}

function leaving(input: PluginImpactInput, placed: Placed): Told {
  const [rival] = rivals(input.name, placed, input.held)
  if (rival === undefined)
    return {
      lines: [line('-', placed, '→ no longer in effect; what it had replaced is back')],
      advice: null,
    }
  return {
    lines: [
      line('-', placed, '→ no longer in effect'),
      line('~', placed, 'conflict → in effect', rival),
    ],
    advice: null,
  }
}

function loadsOf(manifest: PluginManifest): string {
  const sides = (['client', 'server'] as const).filter(
    side => (manifest[side]?.members.length ?? 0) > 0,
  )
  if (sides.length === 0) return 'nothing to load: the manifest writes no member.'
  return `loads on: ${sides.join(', ')}.${sides.includes('server') ? '' : ' Server: nothing to load.'}`
}

/** What a change of one plugin would do to the points, told from its manifest alone: nothing of it is run. */
export function pluginImpact(input: PluginImpactInput): PluginImpact {
  const { manifest, change } = input
  const now = placedOf(manifest)
  const going = change === 'disable' || change === 'remove'
  const told = now.map(placed => (going ? leaving(input, placed) : arriving(input, placed)))
  const before = input.held.find(other => other.name === input.name && other.enabled)
  const dropped =
    change !== 'publish' || before === undefined
      ? []
      : placedOf(before.manifest)
          .filter(old => !now.some(placed => same(placed, old)))
          .map(old => line('-', old, '→ goes away: the new version does not write it'))
  return {
    lines: [...told.flatMap(each => each.lines), ...dropped],
    loads: loadsOf(manifest),
    advice: told.find(each => each.advice !== null)?.advice ?? null,
  }
}
