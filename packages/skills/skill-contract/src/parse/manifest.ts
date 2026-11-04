// Reads SKILL.md: strict UTF-8 without a byte order mark, a `---` frontmatter closed by the first
// line that is only `---`, and a YAML mapping whose keys are unique in the whole tree. What the
// community Skills do beyond that and the main hosts accept is accepted too, with a compatibility
// hint: a description over the 1024 characters of the Agent Skills specification, metadata that is not a text map, and a frontmatter
// that strict YAML does not read but whose name and description can be read line by line.
import { isMap, parseDocument } from 'yaml'
import type { CompatibilityHint } from '../hints.ts'
import { isBoundedText, isSkillName } from '../names.ts'
import type { ManifestValue, SkillManifest, SkillName } from '../values.ts'
import { readByLine } from './by-line.ts'
import { isSkillDescription, SPECIFICATION_DESCRIPTION_LIMIT } from './shape.ts'
import { plainValue } from './yaml-value.ts'

/** What the manifest gives to the package rules. `name` is present when it could be read. */
export type ManifestRead =
  | Readonly<{ kind: 'ok'; manifest: SkillManifest; hints: readonly CompatibilityHint[] }>
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

const DASH = 0x2d
const CR = 0x0d
const LF = 0x0a

/** One line of `bytes` from `start`: where its text ends, and where the next line starts. A line
 * ends with LF or CRLF; `next` is `undefined` for the last line, which has no line end. */
function lineAt(bytes: Uint8Array, start: number): Readonly<{ end: number; next?: number }> {
  const newline = bytes.indexOf(LF, start)
  if (newline === -1) return { end: bytes.length }
  // The byte before the line end is the CR of a CRLF, or a byte of the line, or the LF of the
  // line before (`start` is never inside a line end), so no lower bound is needed.
  const end = bytes[newline - 1] === CR ? newline - 1 : newline
  return { end, next: newline + 1 }
}

/** Whether the line text `[start, end)` is exactly `---`. */
function isDelimiter(bytes: Uint8Array, start: number, end: number): boolean {
  return end - start === 3 && bytes.subarray(start, end).every(byte => byte === DASH)
}

type Frontmatter = Readonly<{ yamlStart: number; yamlEnd: number; bodyStart: number }>

/**
 * The byte bounds of the frontmatter: the opening `---` line, then the YAML up to the first line
 * that is only `---`. The body starts after the line end of that closing line, or at the end of
 * the bytes when the closing line is the last line. No legal frontmatter gives `undefined`.
 */
function frontmatterBounds(bytes: Uint8Array): Frontmatter | undefined {
  const opening = lineAt(bytes, 0)
  if (opening.next === undefined || !isDelimiter(bytes, 0, opening.end)) return undefined
  // The loop ends only by a return: a line without a line end is the last line.
  for (let start = opening.next; ;) {
    const line = lineAt(bytes, start)
    if (isDelimiter(bytes, start, line.end))
      return { yamlStart: opening.next, yamlEnd: start, bodyStart: line.next ?? bytes.length }
    if (line.next === undefined) return undefined
    start = line.next
  }
}

/**
 * Where the body of a SKILL.md starts, in bytes: after the line end of the closing `---` line.
 * `undefined` when the bytes have no legal frontmatter delimiters. It does not decode the bytes.
 */
export function bodyOffsetOf(bytes: Uint8Array): number | undefined {
  return frontmatterBounds(bytes)?.bodyStart
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
  const bounds = frontmatterBounds(bytes)
  if (bounds === undefined) return malformed('SKILL.md has no closed frontmatter')
  const yaml = utf8.decode(bytes.subarray(bounds.yamlStart, bounds.yamlEnd))
  const document = parseDocument(yaml, YAML_OPTIONS)
  if (document.errors.length > 0 || document.warnings.length > 0) return lineRead(yaml)
  if (!isMap(document.contents)) return malformed('the frontmatter is not a mapping')
  const rawName: unknown = document.contents.get('name')
  const fields = plainValue(document, document.contents)
  if (!isFieldMap(fields))
    return malformed('the frontmatter has a value that Skill cannot keep', rawName)
  return interpret(fields, rawName)
}

/** A description over the limit of the Agent Skills specification gets a hint. */
function descriptionHints(description: string): CompatibilityHint[] {
  return isBoundedText(description, SPECIFICATION_DESCRIPTION_LIMIT)
    ? []
    : ['description-over-limit']
}

/** A frontmatter that strict YAML does not read: its name and description, read line by line. */
function lineRead(yaml: string): ManifestRead {
  const { name, description } = readByLine(yaml)
  const fail = (detail: string) =>
    malformed(`the frontmatter is not valid YAML, and line by line ${detail}`, name)
  if (!isSkillName(name)) return fail('its name is not a Skill name')
  if (!isSkillDescription(description))
    return fail('its description is not text of 1 to DESCRIPTION_LIMIT characters')
  return {
    kind: 'ok',
    manifest: Object.freeze({ name, description, extra: Object.freeze({}) }),
    hints: ['frontmatter-read-by-line', ...descriptionHints(description)],
  }
}

/** The checks of the interpreted fields, in order. It reads nothing that it did not check. */
function interpret(fields: FieldMap, rawName: unknown): ManifestRead {
  const fail = (detail: string) => malformed(detail, rawName)
  if (!isSkillName(rawName)) return fail('name is not a Skill name')
  const description = fields['description']
  if (!isSkillDescription(description))
    return fail('description is not text of 1 to DESCRIPTION_LIMIT characters')
  if (!isOptional(fields['license'], value => typeof value === 'string'))
    return fail('license is not text')
  if (!isOptional(fields['compatibility'], value => isBoundedText(value, COMPATIBILITY_MAX)))
    return fail('compatibility is not text of 1 to 500 characters')
  if (!isOptional(fields['allowed-tools'], value => typeof value === 'string'))
    return fail('allowed-tools is not text')
  const hints = descriptionHints(description)
  if (!isOptional(fields['metadata'], isTextMap)) hints.push('metadata-not-text-map')
  return { kind: 'ok', manifest: manifestOf(rawName, description, fields), hints }
}

/** The text values of `value`: all of it for a text map, the text entries of another map, and
 * `undefined` for a value that is no map. */
function textEntriesOf(
  value: ManifestValue | undefined,
): Readonly<Record<string, string>> | undefined {
  if (isTextMap(value)) return value
  if (!isFieldMap(value)) return undefined
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        typeof item === 'string' ? [[key, item] as const] : [],
      ),
    ),
  )
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
  const metadata = textEntriesOf(fields['metadata'])
  const extra = Object.entries(fields).filter(([key]) => !INTERPRETED.has(key))
  return Object.freeze({
    name,
    description,
    ...(license === undefined ? {} : { license }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(allowedTools === undefined ? {} : { allowedTools }),
    extra: Object.freeze(Object.fromEntries(extra)),
  })
}
