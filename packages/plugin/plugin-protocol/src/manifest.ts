export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>

export const MANIFEST_FILE = 'plugin.json'
export const MANIFEST_SCHEMA = 1

/** Where a member goes: one item on one point, under one key. */
export type MemberPlace = Readonly<{ point: string; key: string; id?: string; rank?: number }>
export type DataMember = MemberPlace & Readonly<{ data: JsonValue }>
export type DirectoryMember = MemberPlace & Readonly<{ directory: string }>
export type ModuleMember = MemberPlace & Readonly<{ module: string; export: string }>
export type Member = DataMember | DirectoryMember | ModuleMember

export type SideName = 'client' | 'server'
export type Side = Readonly<{ needs?: readonly string[]; members: readonly Member[] }>

/** What a plugin puts where, as data: nothing of it has to run to know what it puts. */
export type PluginManifest = Readonly<{
  schema: typeof MANIFEST_SCHEMA
  name: string
  summary: string
  client?: Side
  server?: Side
}>

export type ManifestRead =
  /** `unread` names the top-level fields the manifest wrote that a manifest does not have, in order. */
  | Readonly<{ kind: 'read'; manifest: PluginManifest; unread: readonly string[] }>
  | Readonly<{ kind: 'refused'; reason: string }>

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const NAME = /^[a-z][a-z0-9-]{0,63}$/u
const SEGMENT = /^[A-Za-z0-9._-]+$/u
const WAYS = ['data', 'directory', 'module'] as const
const READ: readonly string[] = ['schema', 'name', 'summary', 'client', 'server']

/** A path that stays inside the package: its segments are plain names, none of them a step up or in place. */
export function insidePackage(path: string): boolean {
  const segments = path.split('/')
  return segments.every(each => SEGMENT.test(each) && each !== '.' && each !== '..')
}

export function memberKind(member: Member): (typeof WAYS)[number] {
  if ('module' in member) return 'module'
  return 'directory' in member ? 'directory' : 'data'
}

class Refused extends Error {}

function placeOf(fields: Fields, at: string): MemberPlace {
  const { point, key, id, rank } = fields
  if (typeof point !== 'string' || point.trim() === '') throw new Refused(`${at} names no point`)
  if (typeof key !== 'string') throw new Refused(`${at} has no key`)
  if (id !== undefined && typeof id !== 'string')
    throw new Refused(`${at} has an id that is not text`)
  if (rank !== undefined && (typeof rank !== 'number' || !Number.isFinite(rank)))
    throw new Refused(`${at} has a rank that is not a number`)
  return { point, key, ...(id !== undefined && { id }), ...(rank !== undefined && { rank }) }
}

function pathOf(value: unknown, at: string): string {
  if (typeof value !== 'string' || !insidePackage(value))
    throw new Refused(`${at}: ${String(value)} is not a path inside the package`)
  return value
}

function memberOf(value: unknown, at: string): Member {
  if (!isFields(value)) throw new Refused(`${at} is not an object`)
  const place = placeOf(value, at)
  const written = WAYS.filter(way => way in value)
  if (written.length === 0) throw new Refused(`${at} writes none of data, directory and module`)
  if (written.length > 1)
    throw new Refused(`${at} writes ${written.join(' and ')}; a member writes one`)
  if ('data' in value) return { ...place, data: value['data'] as JsonValue }
  if ('directory' in value) return { ...place, directory: pathOf(value['directory'], at) }
  const module = pathOf(value['module'], at)
  if (!module.endsWith('.js')) throw new Refused(`${at}: the module ${module} is not a .js file`)
  const named = value['export']
  if (typeof named !== 'string' || named === '')
    throw new Refused(`${at} writes a module without the name of its export`)
  return { ...place, module, export: named }
}

function sideOf(value: unknown, side: SideName): Side {
  if (!isFields(value)) throw new Refused(`${side} is not an object`)
  const { needs, members } = value
  if (!Array.isArray(members)) throw new Refused(`${side}.members is not a list`)
  const named = needs === undefined || (Array.isArray(needs) && needs.every(isName))
  if (!named) throw new Refused(`${side}.needs is not a list of names`)
  return {
    ...(needs !== undefined && { needs: needs as readonly string[] }),
    members: members.map((member, index) => memberOf(member, `${side}.members[${index}]`)),
  }
}

const isName = (value: unknown): boolean => typeof value === 'string' && value !== ''

function manifestOf(value: unknown): PluginManifest {
  if (!isFields(value)) throw new Refused('the manifest is not an object')
  const { schema, name, summary, client, server } = value
  if (schema !== MANIFEST_SCHEMA)
    throw new Refused(
      `the manifest is of schema ${String(schema)}; this reader knows schema ${MANIFEST_SCHEMA}`,
    )
  if (typeof name !== 'string' || !NAME.test(name))
    throw new Refused(
      `the name ${JSON.stringify(name)} is not lower-case letters, digits and hyphens`,
    )
  if (typeof summary !== 'string' || summary.trim() === '')
    throw new Refused('the summary is empty')
  return {
    schema: MANIFEST_SCHEMA,
    name,
    summary,
    ...(client !== undefined && { client: sideOf(client, 'client') }),
    ...(server !== undefined && { server: sideOf(server, 'server') }),
  }
}

/** Reads the text of a `plugin.json`: the manifest as written, or the first thing that is wrong with it. */
export function readManifest(text: string): ManifestRead {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { kind: 'refused', reason: 'the manifest is not JSON' }
  }
  try {
    const manifest = manifestOf(value)
    const unread = Object.keys(value as Fields).filter(field => !READ.includes(field))
    return { kind: 'read', manifest, unread: unread.sort() }
  } catch (error) {
    if (error instanceof Refused) return { kind: 'refused', reason: error.message }
    throw error
  }
}
