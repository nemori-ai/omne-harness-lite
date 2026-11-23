import type {
  CategoryListing,
  CategoryView,
  ImpactLine,
  ManagedAsset,
  Placement,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { columns } from './results.ts'

export const HOW: Readonly<Record<CategoryListing['creation'], string>> = {
  directory: 'from a directory',
  data: 'from a body',
  none: 'not through here',
}

/** Why a category is not there, with the categories that are there now. */
export function noCategory(categories: CategoryView, asked: string): string {
  const now = categories.list().map(listing => listing.category)
  return `there is no category "${asked}" now. ${
    now.length === 0 ? 'No category exists now.' : `Categories now: ${now.join(', ')}.`
  }`
}

export const notHeld = (category: string, name: string) =>
  `${category} ${name} is not held by this tenant. list ${category} shows what is held.`

export const reused = (id: string) =>
  `the id "${id}" was used for another input; use a new id. result ${id} says what it did.`

export const CANNOT_READ = 'cannot be read now'

/** One line of an impact: what would happen at one place, and to whom when it is another holding. */
export const impactLine = ({ mark, of, point, key, says }: ImpactLine): string =>
  `  ${mark} ${of === null ? '' : `${of}: `}${point} / ${key}   ${says}`

/** The impact lines, then nothing else changes when no line changes a state or fails to take effect. */
export function impactBody(
  lines: readonly ImpactLine[],
  loads: string | null,
  advice: string | null,
): string[] {
  const shown = lines.map(impactLine)
  const quiet = lines.every(line => line.mark === '+' || line.mark === '-')
  if (quiet) shown.push(lines.length === 0 ? 'nothing changes.' : 'nothing else changes.')
  return [...shown, ...(loads === null ? [] : [loads]), ...(advice === null ? [] : [advice])]
}

type Asset = Extract<ManagedAsset, Readonly<{ kind: 'asset' }>>
type Placed = Awaited<ReturnType<Placement['of']>>

/** The head of one held extension: name, version, enabled, origin; its summary under it. */
export function assetHead(asset: Asset): string[] {
  const { capability, version, enabled, origin, summary } = asset.row
  const head = [
    `${capability.category} ${capability.name}`,
    version,
    enabled ? 'enabled' : 'disabled',
    origin === 'customized' ? 'held by this tenant' : 'installed with the deployment',
  ].join('   ')
  const said = summary === null ? '' : summary.description || summary.title
  return said === '' ? [head] : [head, said]
}

/** Where it is placed and how each client loaded it; a port that cannot answer says so, and the rest still shows. */
export function placedLines(placed: Placed): string[] {
  if (placed.kind === 'unavailable') return [`places: ${CANNOT_READ}: ${placed.reason}`]
  const lines =
    placed.places.length === 0
      ? ['places: none']
      : [
          'places:',
          ...columns(
            placed.places.map(({ point, key, standing, says }) => [
              `  ${point} / ${key}`,
              `[${standing}]`,
              says,
            ]),
          ),
        ]
  if (placed.clients !== null)
    lines.push(
      'clients:',
      ...(placed.clients.length === 0
        ? ['  none connected']
        : columns(placed.clients.map(({ label, says }) => [`  ${label}`, says]))),
    )
  if (placed.advice !== null) lines.push(placed.advice)
  return lines
}

const NAMED = 20
const PRINTED = 4096
const encoder = new TextEncoder()
const byteLength = (text: string) => encoder.encode(text).byteLength

export function namedPaths(paths: readonly string[]): string {
  const named = paths.slice(0, NAMED).join(', ')
  return paths.length > NAMED ? `${named}, and ${paths.length - NAMED} more` : named
}

export const fileCount = (count: number) => `${count} ${count === 1 ? 'file' : 'files'}`

const CLOSED = 'this category is not made through here: it cannot be changed with this tool.'

const FROM_DIRECTORY =
  'one made here is a directory: help with name publish and this category says how it is written.'

export function sourceLines(asset: Asset, creation: 'none' | 'data' | 'directory'): string[] {
  const closed = creation === 'none'
  const fixed =
    asset.row.origin === 'customized'
      ? []
      : ['it is installed with the deployment and cannot be changed in place.']
  const { content } = asset
  if (content.kind === 'directory') {
    const bytes = content.entries.reduce((sum, entry) => sum + entry.bytes, 0)
    const paths = namedPaths(content.entries.map(entry => entry.path))
    return [
      `source: this held version, ${fileCount(content.entries.length)} (${bytes} bytes): ${paths}`,
      ...fixed,
      closed
        ? CLOSED
        : 'to change it: export it to a directory, edit there, publish from that directory.',
    ]
  }
  const text = writeJsonText(content.body)
  const bytes = byteLength(text)
  if (bytes > PRINTED)
    return [
      `source: this held version, a body of ${bytes} bytes, too long to print here.`,
      ...fixed,
      closed
        ? `to read it: export it to a directory. ${CLOSED}`
        : 'to read or change it: export it to a directory.',
    ]
  return [
    `source: this held version, a body of ${bytes} bytes:`,
    text,
    ...fixed,
    closed
      ? CLOSED
      : creation === 'directory'
        ? FROM_DIRECTORY
        : 'to change it: publish a new body as data.',
  ]
}

/** The second line of a publish: what the data says about it now, nothing more. */
export function publishedLine(enabled: boolean | undefined, placed: Placed | undefined): string[] {
  const parts: string[] = []
  const places = placed?.kind === 'placed' ? placed.places : []
  const out = places.find(place => place.standing === 'not in effect')
  const stands = places.some(place => ['selected', 'in effect'].includes(place.standing))
  if (enabled === true)
    parts.push(
      out !== undefined && !stands
        ? `held, and not in effect: ${out.says}.`
        : 'in effect from now.',
    )
  if (enabled === false) parts.push('held disabled: not in effect.')
  if (placed?.kind === 'placed' && placed.clients !== null)
    parts.push(
      placed.clients.length === 0
        ? 'Clients: none connected.'
        : `Clients: ${placed.clients.length} connected. OmneExtensions show says whether it loaded.`,
    )
  return parts.length === 0 ? [] : [parts.join(' ')]
}
