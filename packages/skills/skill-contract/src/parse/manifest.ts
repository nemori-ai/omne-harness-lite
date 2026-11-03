// Reads SKILL.md: strict UTF-8 without a byte order mark, a `---` frontmatter closed by the first
// line that is only `---`, and a YAML mapping whose keys are unique in the whole tree.
import { isMap, parseDocument } from 'yaml'
import { toSkillName } from '../names.ts'
import type { ManifestValue, SkillManifest } from '../values.ts'
import { plainValue } from './yaml-value.ts'

/** What the manifest gives to the package rules. `name` is present when the YAML could be read. */
export type ManifestRead =
  | Readonly<{ kind: 'ok'; manifest: SkillManifest }>
  | Readonly<{ kind: 'malformed'; detail: string; name?: string }>

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const YAML_OPTIONS = {
  version: '1.2',
  schema: 'core',
  uniqueKeys: true,
  merge: false,
  strict: true,
  prettyErrors: false,
} as const
const DESCRIPTION_MAX = 1024
const COMPATIBILITY_MAX = 500
const INTERPRETED = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
])

function decode(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}

/**
 * The YAML text between the opening `---` line and the first line that is only `---`. A line ends
 * with LF or CRLF; the closing line can also end the file.
 */
export function frontmatterOf(text: string): string | undefined {
  const open = text.startsWith('---\n') ? 4 : text.startsWith('---\r\n') ? 5 : -1
  if (open === -1) return undefined
  for (let start = open; start <= text.length;) {
    const newline = text.indexOf('\n', start)
    const end = newline === -1 ? text.length : newline
    const line = text.slice(start, newline !== -1 && text[end - 1] === '\r' ? end - 1 : end)
    if (line === '---') return text.slice(open, start)
    if (newline === -1) return undefined
    start = newline + 1
  }
  return undefined
}

function malformed(detail: string, name?: unknown): ManifestRead {
  return typeof name === 'string'
    ? { kind: 'malformed', detail, name }
    : { kind: 'malformed', detail }
}

function characters(text: string): number {
  return [...text].length
}

type FieldMap = Readonly<Record<string, ManifestValue>>

function isFieldMap(value: ManifestValue | undefined): value is FieldMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextMap(value: ManifestValue | undefined): value is Readonly<Record<string, string>> {
  return isFieldMap(value) && Object.values(value).every(item => typeof item === 'string')
}

export function readManifest(bytes: Uint8Array): ManifestRead {
  const text = decode(bytes)
  if (text === undefined) return malformed('SKILL.md is not UTF-8')
  if (text.startsWith('﻿')) return malformed('SKILL.md starts with a byte order mark')
  const yaml = frontmatterOf(text)
  if (yaml === undefined) return malformed('SKILL.md has no closed frontmatter')
  const document = parseDocument(yaml, YAML_OPTIONS)
  if (document.errors.length > 0 || document.warnings.length > 0)
    return malformed('the frontmatter is not valid YAML')
  if (!isMap(document.contents)) return malformed('the frontmatter is not a mapping')
  const rawName: unknown = document.contents.get('name')
  const fields = plainValue(document, document.contents)
  if (!isFieldMap(fields))
    return malformed('the frontmatter has a value that Skill cannot keep', rawName)
  return interpret(fields, rawName)
}

function interpret(fields: FieldMap, rawName: unknown): ManifestRead {
  const fail = (detail: string) => malformed(detail, rawName)
  const name = typeof rawName === 'string' ? toSkillName(rawName) : undefined
  if (name === undefined || !('ok' in name)) return fail('name is not a Skill name')
  const { description, license, compatibility, metadata } = fields
  const allowedTools = fields['allowed-tools']
  if (typeof description !== 'string') return fail('description is not text')
  if (characters(description) < 1 || characters(description) > DESCRIPTION_MAX)
    return fail('description length is out of range')
  if (license !== undefined && typeof license !== 'string') return fail('license is not text')
  if (compatibility !== undefined) {
    if (typeof compatibility !== 'string') return fail('compatibility is not text')
    const length = characters(compatibility)
    if (length < 1 || length > COMPATIBILITY_MAX)
      return fail('compatibility length is out of range')
  }
  if (metadata !== undefined && !isTextMap(metadata)) return fail('metadata is not a text map')
  if (allowedTools !== undefined && typeof allowedTools !== 'string')
    return fail('allowed-tools is not text')
  const extra = Object.entries(fields).filter(([key]) => !INTERPRETED.has(key))
  return {
    kind: 'ok',
    manifest: Object.freeze({
      name: name.ok,
      description,
      ...(license === undefined ? {} : { license }),
      ...(compatibility === undefined ? {} : { compatibility }),
      ...(metadata === undefined ? {} : { metadata }),
      ...(allowedTools === undefined ? {} : { allowedTools }),
      extra: Object.freeze(Object.fromEntries(extra)),
    }),
  }
}
