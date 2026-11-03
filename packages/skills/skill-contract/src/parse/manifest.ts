// Reads SKILL.md: strict UTF-8 without a byte order mark, a `---` frontmatter closed by the first
// line that is only `---`, and a YAML mapping whose keys are unique in the whole tree.
import { isMap, parseDocument } from 'yaml'
import { isBoundedText, isSkillName } from '../names.ts'
import type { ManifestValue, SkillManifest, SkillName } from '../values.ts'
import { DESCRIPTION_MAX } from './shape.ts'
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
  // The loop ends only by a return: a line without a line end is the last line.
  for (let start = open; ;) {
    const newline = text.indexOf('\n', start)
    const end = newline === -1 ? text.length : newline
    const line = text.slice(start, newline !== -1 && text[end - 1] === '\r' ? end - 1 : end)
    if (line === '---') return text.slice(open, start)
    if (newline === -1) return undefined
    start = newline + 1
  }
}

function malformed(detail: string, name?: unknown): ManifestRead {
  return typeof name === 'string'
    ? { kind: 'malformed', detail, name }
    : { kind: 'malformed', detail }
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

/** The checks of the interpreted fields, in order. It reads nothing that it did not check. */
function interpret(fields: FieldMap, rawName: unknown): ManifestRead {
  const fail = (detail: string) => malformed(detail, rawName)
  if (!isSkillName(rawName)) return fail('name is not a Skill name')
  const description = fields['description']
  if (!isBoundedText(description, DESCRIPTION_MAX))
    return fail('description is not text of 1 to 1024 characters')
  if (!isOptional(fields['license'], value => typeof value === 'string'))
    return fail('license is not text')
  if (!isOptional(fields['compatibility'], value => isBoundedText(value, COMPATIBILITY_MAX)))
    return fail('compatibility is not text of 1 to 500 characters')
  if (!isOptional(fields['metadata'], isTextMap)) return fail('metadata is not a text map')
  if (!isOptional(fields['allowed-tools'], value => typeof value === 'string'))
    return fail('allowed-tools is not text')
  return { kind: 'ok', manifest: manifestOf(rawName, description, fields) }
}

function isOptional(value: ManifestValue | undefined, check: (value: ManifestValue) => boolean) {
  return value === undefined || check(value)
}

const textField = (fields: FieldMap, key: string): string | undefined => {
  const value = fields[key]
  return typeof value === 'string' ? value : undefined
}

/** Builds the manifest from fields that `interpret` checked. */
function manifestOf(name: SkillName, description: string, fields: FieldMap): SkillManifest {
  const license = textField(fields, 'license')
  const compatibility = textField(fields, 'compatibility')
  const allowedTools = textField(fields, 'allowed-tools')
  const metadata = fields['metadata']
  const extra = Object.entries(fields).filter(([key]) => !INTERPRETED.has(key))
  return Object.freeze({
    name,
    description,
    ...(license === undefined ? {} : { license }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(isTextMap(metadata) ? { metadata } : {}),
    ...(allowedTools === undefined ? {} : { allowedTools }),
    extra: Object.freeze(Object.fromEntries(extra)),
  })
}
