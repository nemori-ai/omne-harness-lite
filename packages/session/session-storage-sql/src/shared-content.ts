import { blobDigest, canonicalText } from './codec.ts'

export type ContentBlob = Readonly<{ digest: string; media: string; payload: string }>
export type SharedContent = Readonly<{
  media: string
  payload: string
  children: readonly ContentBlob[]
}>
export const SHARED_MEDIA = 'application/vnd.omne.shared-json'
type Path = readonly (string | number)[]
type Link = Readonly<{ path: Path; digest: string }>
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const compaction = (value: unknown): boolean =>
  record(value) && value['role'] === 'compaction' && Array.isArray(value['blocks'])

export function splitContent(payload: string, media: string): SharedContent {
  if (media === SHARED_MEDIA) throw new TypeError('shared content is a private storage encoding')
  const unchanged = { payload, media, children: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return unchanged
  }
  if (canonicalText(parsed) !== payload || compaction(parsed)) return unchanged
  const children = new Map<string, ContentBlob>()
  const links: Link[] = []
  function visit(value: unknown, path: Path): unknown {
    if (compaction(value)) {
      const payload = canonicalText(value)
      const digest = blobDigest(payload)
      children.set(digest, { digest, payload, media: 'application/json' })
      links.push({ path, digest })
      return null
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...path, index]))
    if (record(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, visit(item, [...path, key])]),
      )
    return value
  }
  const template = visit(parsed, [])
  return children.size === 0
    ? unchanged
    : {
        media: SHARED_MEDIA,
        payload: canonicalText({ format: 'shared-json/1', media, template, links }),
        children: [...children.values()],
      }
}

export function expandContent(
  payload: string,
  media: string,
  read: (digest: string) => string,
): Readonly<{ payload: string; media: string }> {
  if (media !== SHARED_MEDIA) return { payload, media }
  const saved: unknown = JSON.parse(payload)
  if (
    !record(saved) ||
    saved['format'] !== 'shared-json/1' ||
    typeof saved['media'] !== 'string' ||
    saved['media'] === SHARED_MEDIA ||
    !Array.isArray(saved['links'])
  )
    throw new TypeError('invalid shared content')
  const template = saved['template']
  const cache = new Map<string, unknown>()
  for (const link of saved['links'] as unknown[]) {
    if (
      !record(link) ||
      typeof link['digest'] !== 'string' ||
      !Array.isArray(link['path']) ||
      link['path'].length === 0
    )
      throw new TypeError('invalid shared content link')
    const path: unknown[] = link['path']
    let parent = template
    for (let index = 0; index < path.length; index++) {
      const key = path[index]
      if (
        (typeof key !== 'string' && typeof key !== 'number') ||
        (!record(parent) && !Array.isArray(parent)) ||
        !Object.hasOwn(parent, key)
      )
        throw new TypeError('invalid shared content path')
      const members = parent as Record<string | number, unknown>
      if (index < path.length - 1) {
        parent = members[key]
        continue
      }
      if (members[key] !== null) throw new TypeError('shared content has no placeholder')
      const digest = link['digest']
      if (!cache.has(digest)) {
        const body = read(digest)
        if (blobDigest(body) !== digest) throw new TypeError('shared content digest differs')
        const value: unknown = JSON.parse(body)
        if (!compaction(value)) throw new TypeError('shared body is not a compaction message')
        cache.set(digest, value)
      }
      Object.defineProperty(members, key, {
        value: cache.get(digest),
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
  }
  return { payload: canonicalText(template), media: saved['media'] }
}
