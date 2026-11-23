import { FILE_SUFFIXES, insidePackage } from '@omne-harness/plugin'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import { createClient, type Transport } from '@omne-harness/sdk/core'
import { PLUGIN_FILES } from '../shared/plugin-path.ts'

export type PluginFileAt = Readonly<{ name: string; version: string; path: string; type: string }>

export type PluginFileAnswer =
  | Readonly<{ kind: 'file'; bytes: Uint8Array }>
  | Readonly<{ kind: 'not-found' | 'denied' | 'unavailable' | 'too-large' }>

const TYPES: Readonly<Record<(typeof FILE_SUFFIXES)[number], string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}
const NAME = /^[a-z][a-z0-9-]{0,63}$/u
const VERSION = /^[A-Za-z0-9._-]{1,128}$/u
const PART_BYTES = 262_144
const MOST_PARTS = 64

/** Where a request path points, as written and not decoded: none when it is no file a plugin may carry. */
export function pluginFileAt(pathname: string): PluginFileAt | undefined {
  if (!pathname.startsWith(PLUGIN_FILES)) return
  const [name, version, ...rest] = pathname.slice(PLUGIN_FILES.length).split('/')
  if (name === undefined || version === undefined) return
  const path = rest.join('/')
  const suffix = FILE_SUFFIXES.find(each => path.endsWith(each))
  if (!NAME.test(name) || !VERSION.test(version) || suffix === undefined) return
  return insidePackage(path) ? { name, version, path, type: TYPES[suffix] } : undefined
}

/** Reads one file of a plugin whole through `plugin/v1`, a part at a time, over a transport that carries the login. */
export async function readPluginFile(
  transport: Transport,
  tenant: TenantId,
  at: PluginFileAt,
): Promise<PluginFileAnswer> {
  const client = createClient(pluginProtocol, transport)
  const { name, version, path } = at
  const parts: Uint8Array[] = []
  let offset = 0
  for (let asked = 0; asked < MOST_PARTS; asked += 1) {
    const answer = await client['read-file']({
      tenant,
      name,
      version,
      path,
      offset,
      limit: PART_BYTES,
    })
    if (answer.outcome === 'not-found' || answer.outcome === 'denied')
      return { kind: answer.outcome }
    if (answer.outcome !== 'succeeded') return { kind: 'unavailable' }
    parts.push(answer.body.part)
    const { next } = answer.body
    if (next === null) return { kind: 'file', bytes: joined(parts) }
    if (next <= offset) return { kind: 'unavailable' }
    offset = next
  }
  return { kind: 'too-large' }
}

function joined(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let at = 0
  for (const part of parts) {
    whole.set(part, at)
    at += part.byteLength
  }
  return whole
}
