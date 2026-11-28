import type { JsonValue } from '@omne-harness/json-text'
import type { CatalogRevision } from './brands.ts'
import type { AdoptionBasis, Freshness } from './catalog.ts'
import { SKILLS_EXTENSION } from './envelope.ts'
import { isObject, itemsOf, member, textOf } from './json.ts'
import { isModernProtocolVersion } from './revisions.ts'
import type { PeerIdentity, Untrusted } from './values.ts'

export const SKILL_FILE_LIMIT = 512
export const SKILL_BYTE_LIMIT = 16 * 1024 * 1024

/** One file a skill lists: its address, its path inside the skill, and the size and SHA-256 of its raw bytes. */
export type SkillFileEntry = Readonly<{ uri: string; path: string; digest: string; size: number }>

/** A skill a peer offers, as listed: its frontmatter verbatim, and every file. */
export type McpSkill = Readonly<{
  name: string
  description: Untrusted<string>
  uri: string
  frontmatter: JsonValue
  files: readonly SkillFileEntry[]
}>

export type SkillRefusal = 'malformed' | 'dynamic' | 'too-large' | 'same-name'

export type RefusedSkill = Readonly<{ name: string; uri: string; reason: SkillRefusal }>

export type SkillCatalogRecord = Readonly<{
  revision: CatalogRevision
  basis: AdoptionBasis
  freshness: Freshness
  declared: boolean
  skills: readonly McpSkill[]
  refused: readonly RefusedSkill[]
}>

export type SkillListingPage = Readonly<{ skills: readonly JsonValue[]; nextCursor?: string }>

export type ResourceContent = Readonly<{ uri: string; mimeType?: string }> &
  (Readonly<{ text: string }> | Readonly<{ blob: string }>)

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const ENTRY_FILE = 'SKILL.md'

/** Whether a peer offers skills: resources and the extension on its capabilities, on the 2026-07-28 revision or later. */
export function declaresSkills(
  peer: Pick<PeerIdentity, 'protocolVersion' | 'capabilities'>,
): boolean {
  const { capabilities } = peer
  if (!isModernProtocolVersion(peer.protocolVersion) || !isObject(capabilities)) return false
  const extensions = member(capabilities, 'extensions')
  return (
    isObject(member(capabilities, 'resources')) &&
    isObject(extensions) &&
    isObject(member(extensions, SKILLS_EXTENSION))
  )
}

const rootOf = (uri: string): string => uri.slice(0, uri.length - ENTRY_FILE.length)

function fileOf(json: JsonValue, root: string): SkillFileEntry | undefined {
  if (!isObject(json)) return undefined
  const uri = textOf(member(json, 'uri'))
  const digest = textOf(member(json, 'digest'))
  const size = member(json, 'size')
  const bytes = size?.kind === 'number' ? Number(size.lexeme) : Number.NaN
  if (uri === undefined || digest === undefined || !DIGEST.test(digest)) return undefined
  if (!Number.isSafeInteger(bytes) || bytes < 0) return undefined
  const path = uri.startsWith(root) && uri.length > root.length ? uri.slice(root.length) : uri
  return { uri, path, digest, size: bytes }
}

type Read = Readonly<{ ok: McpSkill }> | Readonly<{ refused: RefusedSkill }>

/** One listed skill, or why it is not taken: unreadable, dynamic, or over the bounds. */
export function readSkillEntry(json: JsonValue): Read {
  const uri = isObject(json) ? (textOf(member(json, 'uri')) ?? '') : ''
  const frontmatter = isObject(json) ? member(json, 'frontmatter') : undefined
  const name = isObject(frontmatter) ? (textOf(member(frontmatter, 'name')) ?? '') : ''
  const refused = (reason: SkillRefusal): Read => ({ refused: { name, uri, reason } })
  const description = isObject(frontmatter) ? textOf(member(frontmatter, 'description')) : undefined
  if (!isObject(json) || !isObject(frontmatter) || description === undefined)
    return refused('malformed')
  if (!SKILL_NAME.test(name) || name.length > 64 || !uri.endsWith(`/${ENTRY_FILE}`))
    return refused('malformed')
  const resources = member(json, 'resources')
  if (textOf(resources) === 'dynamic') return refused('dynamic')
  const items = itemsOf(resources)
  if (items === undefined) return refused('malformed')
  if (items.length > SKILL_FILE_LIMIT) return refused('too-large')
  const files = items.map(item => fileOf(item, rootOf(uri)))
  if (!files.every(file => file !== undefined)) return refused('malformed')
  if (new Set(files.map(file => file.uri)).size !== files.length) return refused('malformed')
  if (!files.some(file => file.uri === uri)) return refused('malformed')
  if (files.reduce((total, file) => total + file.size, 0) > SKILL_BYTE_LIMIT)
    return refused('too-large')
  return { ok: { name, description: { untrusted: description }, uri, frontmatter, files } }
}

/** The skills of one listing: two that share a name are both refused, so neither stands in for the other. */
export function judgeSkills(
  entries: readonly JsonValue[],
): Readonly<{ skills: readonly McpSkill[]; refused: readonly RefusedSkill[] }> {
  const read = entries.map(readSkillEntry)
  const named = new Map<string, number>()
  for (const one of read) {
    const name = 'ok' in one ? one.ok.name : one.refused.name
    if (name !== '') named.set(name, (named.get(name) ?? 0) + 1)
  }
  const skills: McpSkill[] = []
  const refused: RefusedSkill[] = []
  for (const one of read) {
    const { name, uri } = 'ok' in one ? one.ok : one.refused
    if ((named.get(name) ?? 0) > 1) refused.push({ name, uri, reason: 'same-name' })
    else if ('ok' in one) skills.push(one.ok)
    else refused.push(one.refused)
  }
  return { skills, refused }
}

/** The content a `resources/read` answer gives for the asked address. */
export function readResourceContent(
  result: JsonValue,
  uri: string,
): Readonly<{ ok: ResourceContent }> | Readonly<{ failure: 'content-missing' }> {
  const contents = isObject(result) ? itemsOf(member(result, 'contents')) : undefined
  const found = contents?.find(item => isObject(item) && textOf(member(item, 'uri')) === uri)
  if (found === undefined || !isObject(found)) return { failure: 'content-missing' }
  const mimeType = textOf(member(found, 'mimeType'))
  const text = textOf(member(found, 'text'))
  const blob = textOf(member(found, 'blob'))
  const typed = mimeType === undefined ? {} : { mimeType }
  if (text !== undefined) return { ok: { uri, ...typed, text } }
  if (blob !== undefined) return { ok: { uri, ...typed, blob } }
  return { failure: 'content-missing' }
}
