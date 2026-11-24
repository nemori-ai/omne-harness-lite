import { FILE_SUFFIXES, IMAGE_SUFFIXES, insidePackage } from '@omne-harness/plugin-protocol'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import { createClient, type Transport } from '@omne-harness/sdk/core'
import { PLUGIN_FILES } from '../shared/plugin-path.ts'

/** `shut` is true for a file that could run as a page of its own: its answer carries a policy that lets nothing in it run. */
export type PluginFileAt = Readonly<{
  name: string
  version: string
  path: string
  type: string
  shut: boolean
}>

/** A file that was found: its size, and its parts in order, each read when it is asked for. */
export type PluginFileAnswer =
  | Readonly<{ kind: 'file'; bytes: number; parts: AsyncIterableIterator<Uint8Array> }>
  | Readonly<{ kind: 'not-found' | 'denied' | 'unavailable' }>

const SUFFIXES = [...FILE_SUFFIXES, ...IMAGE_SUFFIXES] as const
const TYPES: Readonly<Record<(typeof SUFFIXES)[number], string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
}
const NAME = /^[a-z][a-z0-9-]{0,63}$/u
const VERSION = /^[A-Za-z0-9._-]{1,128}$/u
/** How much of a file is asked for at once: what the server gives in one answer at the most. */
const PART_BYTES = 720_000

/** Where a request path points, as written and not decoded: none when it is no file a plugin may carry. */
export function pluginFileAt(pathname: string): PluginFileAt | undefined {
  if (!pathname.startsWith(PLUGIN_FILES)) return
  const [name, version, ...rest] = pathname.slice(PLUGIN_FILES.length).split('/')
  if (name === undefined || version === undefined) return
  const path = rest.join('/')
  const suffix = SUFFIXES.find(each => path.endsWith(each))
  if (!NAME.test(name) || !VERSION.test(version) || suffix === undefined) return
  if (!insidePackage(path)) return
  return { name, version, path, type: TYPES[suffix], shut: suffix === '.svg' }
}

type Part = Readonly<{ part: Uint8Array; next: number | null; bytes: number }>

/** The parts after the first, each asked for when the one before it was passed on. A file that does not hold together throws. */
async function* partsOf(
  first: Part,
  more: (offset: number) => Promise<Part | undefined>,
): AsyncIterableIterator<Uint8Array> {
  const total = first.bytes
  let part = first
  let offset = 0
  for (;;) {
    yield part.part
    const end = offset + part.part.byteLength
    if (part.next === null) {
      if (end !== total) throw new Error('the file ended before the size it said')
      return
    }
    if (part.next <= offset || part.next > total) throw new Error('the file does not advance')
    offset = part.next
    const next = await more(offset)
    if (next === undefined || next.bytes !== total) throw new Error('the file broke off')
    part = next
  }
}

/** Opens one file of a plugin through `plugin/v1`, over a transport that carries the login. Whether it is there is known from its first part. */
export async function openPluginFile(
  transport: Transport,
  tenant: TenantId,
  at: PluginFileAt,
): Promise<PluginFileAnswer> {
  const client = createClient(pluginProtocol, transport)
  const { name, version, path } = at
  const ask = (offset: number) =>
    client['read-file']({ tenant, name, version, path, offset, limit: PART_BYTES })
  const first = await ask(0)
  if (first.outcome === 'not-found' || first.outcome === 'denied') return { kind: first.outcome }
  if (first.outcome !== 'succeeded') return { kind: 'unavailable' }
  const more = async (offset: number): Promise<Part | undefined> => {
    const answer = await ask(offset)
    return answer.outcome === 'succeeded' ? answer.body : undefined
  }
  return { kind: 'file', bytes: first.body.bytes, parts: partsOf(first.body, more) }
}
