import { parseDocument } from 'yaml'
import {
  digestBytes,
  readBodyText,
  type JsonValue,
  type PackageLayout,
  type PackageReader,
  type PackageRejection,
} from '@omne-harness/assets'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { instructionsProblem } from './judge-definition.ts'

export const AGENT_FILE = 'AGENT.md'

const AGENT_PACKAGE_LIMITS = Object.freeze({
  files: 16,
  fileBytes: 256 * 1024,
  totalBytes: 256 * 1024,
})

const FIELDS = ['name', 'summary', 'type', 'references', 'attributes', 'permissionBounds'] as const
const INSTRUCTIONS_ID = 'instructions'
const BODY_LIMITS = Object.freeze({
  maxBytes: 512 * 1024,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 65_536,
  maxNumberLength: 32,
})
const YAML_OPTIONS = {
  version: '1.2',
  schema: 'core',
  uniqueKeys: true,
  merge: false,
  strict: true,
  prettyErrors: false,
} as const

type Read<Value> = Outcome<Value, PackageRejection>
type Fields = Readonly<Record<string, unknown>>

const said = (reason: string): Read<never> => fail({ kind: 'invalid-package', reason })
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function textOf(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes)
  } catch {
    return undefined
  }
}

/** The frontmatter between two lines of three dashes, and the text after it. */
function split(text: string): Readonly<{ yaml: string; rest: string }> | undefined {
  const lines = text.split('\n')
  const dashes = (line: string | undefined) => line?.replace(/\r$/u, '') === '---'
  if (!dashes(lines[0])) return undefined
  const closing = lines.findIndex((line, index) => index > 0 && dashes(line))
  if (closing < 0) return undefined
  return { yaml: lines.slice(1, closing).join('\n'), rest: lines.slice(closing + 1).join('\n') }
}

function fieldsOf(yaml: string): Read<Fields> {
  const document = parseDocument(yaml, YAML_OPTIONS)
  if (document.errors.length > 0 || document.warnings.length > 0)
    return said(`${AGENT_FILE}: the frontmatter is not valid YAML`)
  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 0 })
  } catch {
    return said(`${AGENT_FILE}: the frontmatter is not valid YAML`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return said(`${AGENT_FILE}: the frontmatter is not a mapping of fields`)
  const unread = Object.keys(value).find(key => !FIELDS.some(field => field === key))
  return unread === undefined
    ? succeed(value as Fields)
    : said(
        `${AGENT_FILE}: the frontmatter has the field "${unread}", which is not read; the fields are ${FIELDS.join(', ')}`,
      )
}

function typeProblem(type: unknown): string | undefined {
  if (type === undefined || type === 'non-master') return undefined
  return type === 'master'
    ? `${AGENT_FILE}: type is master; a definition made here is non-master: leave type out`
    : `${AGENT_FILE}: type is ${JSON.stringify(type)}; leave type out, or write non-master`
}

const REFERENCE_KEYS = ['category', 'name', 'resident']

function referenceOf(value: unknown): object | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { category, name, resident } = value as Record<string, unknown>
  const known = Object.keys(value).every(key => REFERENCE_KEYS.includes(key))
  if (!known || typeof category !== 'string' || typeof name !== 'string') return undefined
  if (resident !== undefined && typeof resident !== 'boolean') return undefined
  const capability = { category, name }
  return resident === undefined ? { capability } : { capability, resident }
}

function referencesOf(value: unknown): Read<readonly object[]> {
  if (value === undefined) return succeed([])
  if (!Array.isArray(value)) return said(`${AGENT_FILE}: references is not a list`)
  const references: object[] = []
  for (const [index, item] of value.entries()) {
    const reference = referenceOf(item)
    if (reference === undefined)
      return said(
        `${AGENT_FILE}: references[${String(index)}] is not {category, name, resident?} with category and name as text and resident as true or false`,
      )
    references.push(reference)
  }
  return succeed(references)
}

function attributesOf(value: unknown): Read<readonly object[]> {
  if (value === undefined) return succeed([])
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'))
    return said(`${AGENT_FILE}: attributes is not a list of names`)
  return succeed(value.map(item => ({ item: item as string })))
}

function instructionsOf(rest: string): Read<readonly object[] | undefined> {
  const text = rest.trim()
  if (text === '') return succeed(undefined)
  const sections = [{ id: INSTRUCTIONS_ID, text }]
  const problem = instructionsProblem(sections)
  if (problem === undefined) return succeed(sections)
  const bytes = /text: (\d+) UTF-8 bytes exceed (\d+)$/u.exec(problem)
  const detail =
    bytes === null
      ? problem.replace(/^instructions\[0\]\.text: /u, '')
      : `is ${bytes[1]!} UTF-8 bytes, more than ${bytes[2]!}`
  return said(`${AGENT_FILE}: the text after the frontmatter ${detail}`)
}

/** The body every definition has, from the fields of the frontmatter and the text after it. */
function project(fields: Fields, rest: string): Read<JsonValue> {
  const { name, summary, type, permissionBounds } = fields
  if (typeof name !== 'string') return said(`${AGENT_FILE}: name is missing or is not text`)
  if (typeof summary !== 'string') return said(`${AGENT_FILE}: summary is missing or is not text`)
  const wrongType = typeProblem(type)
  if (wrongType !== undefined) return said(wrongType)
  const references = referencesOf(fields['references'])
  if (!('ok' in references)) return references
  const attributes = attributesOf(fields['attributes'])
  if (!('ok' in attributes)) return attributes
  const instructions = instructionsOf(rest)
  if (!('ok' in instructions)) return instructions
  const body = readBodyText(
    JSON.stringify({
      name,
      type: 'non-master',
      summary,
      references: references.ok,
      attributes: attributes.ok,
      ...(instructions.ok === undefined ? {} : { instructions: instructions.ok }),
      ...(permissionBounds === undefined ? {} : { permissionBounds }),
    }),
    BODY_LIMITS,
  )
  return body.kind === 'ok'
    ? succeed(body.value)
    : said(`${AGENT_FILE}: the frontmatter is too large or too deep to keep`)
}

async function inspect(pkg: PackageReader): Promise<Read<JsonValue>> {
  const manifest = await pkg.manifest()
  if (!('ok' in manifest)) return fail({ kind: 'source-failed', failure: manifest.failure })
  const entry = manifest.ok.entries.find(each => each.path === AGENT_FILE)
  if (entry === undefined) return said(`the directory has no ${AGENT_FILE} at its root`)
  const other = manifest.ok.entries.find(each => each.path !== AGENT_FILE)
  if (other !== undefined)
    return said(`a definition is the one file ${AGENT_FILE}; the directory also has ${other.path}`)
  const opened = await pkg.open(entry.path, entry.digest)
  if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
  if (digestBytes(opened.ok) !== entry.digest)
    return fail({ kind: 'source-failed', failure: 'material-unavailable' })
  const text = textOf(opened.ok)
  if (text === undefined) return said(`${AGENT_FILE} is not UTF-8`)
  const parts = split(text)
  if (parts === undefined)
    return said(
      `${AGENT_FILE} has no frontmatter: it starts with a line of three dashes, then the fields, then a line of three dashes`,
    )
  const fields = fieldsOf(parts.yaml)
  return 'ok' in fields ? project(fields.ok, parts.rest) : fields
}

export const agentDefinitionLayout: PackageLayout = Object.freeze({
  namespace: 'agents',
  limits: AGENT_PACKAGE_LIMITS,
  inspect,
})
