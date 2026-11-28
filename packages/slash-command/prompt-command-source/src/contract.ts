import { parseDocument } from 'yaml'
import {
  type BodyContract,
  type CategoryDisplay,
  digestBytes,
  heldPoint,
  type JsonValue,
  type JudgeContext,
  type Judgment,
  type PackageLayout,
  type PackageReader,
  type PackageRejection,
  readBodyText,
  refusal,
} from '@omne-harness/assets'
import { writeJsonText } from '@omne-harness/json-text'
import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import { isName, RESERVED_SPACE } from '@omne-harness/slash-command-contract'

export const PROMPT_CATEGORY = 'prompt'
export const PROMPT_FILE = 'PROMPT.md'
const DESCRIPTION_LIMIT = 200
const PROMPT_LIMIT = 64 * 1024

/** What a prompt command is: its name, the line a person reads, an optional hint for its arguments, and the prompt. */
export type PromptBody = Readonly<{
  name: string
  description: string
  argumentHint?: string
  prompt: string
}>

export const promptCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '提示词命令',
  summary: '一段常用的提示词，起个名字，在输入框开头写 /名字 加参数来用。',
  creation: `一个目录，根下只有一个 ${PROMPT_FILE}：头部写名字、说明与参数提示，正文是提示词。`,
  authoring: [
    `A prompt command is a directory with one file, ${PROMPT_FILE}: a frontmatter, then the prompt. Whole and minimal:`,
    '---',
    'name: commit',
    'description: Writes a commit message for the staged change.',
    'argument-hint: <scope> [note]',
    '---',
    'Write a commit message for the staged change in $1. Keep this in mind: $ARGUMENTS',
    'name is the name it is published under: lower-case words joined by -, no space and no colon. description is the line a person reads in the menu. argument-hint is optional.',
    'In the prompt, $1 to $n take the arguments in order (a quoted one is one argument), $ARGUMENTS takes them all. A prompt with neither gets the arguments after a blank line.',
    'It is used at the head of what a person writes, /commit core "fix the login", and what it becomes follows their words in the same message. A /name in the arguments is not a reference.',
  ].join('\n'),
})

/** The point of the category: each layer's held prompt commands are its items. */
export const promptCommandsPoint = heldPoint({
  name: 'slash-command.prompts',
  key: 'the prompt command name',
  summary: 'The prompt commands each layer holds, by name.',
})

type Read<Value> = Outcome<Value, PackageRejection>
const said = (reason: string): Read<never> => fail({ kind: 'invalid-package', reason })
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const FIELDS = ['name', 'description', 'argument-hint'] as const

function nameProblem(name: unknown): string | undefined {
  if (typeof name !== 'string' || name === '') return 'name is missing'
  if (name.includes(':'))
    return name.startsWith(`${RESERVED_SPACE}:`)
      ? `name ${name}: the space ${RESERVED_SPACE} is the release's own; a prompt command is always in the space prompt, so write the name alone`
      : `name ${name}: write the name alone, without a space and a colon`
  if (!isName(name))
    return `name ${name}: lower-case letters, digits and - between words, at most 64 characters`
  return undefined
}

function descriptionProblem(description: unknown): string | undefined {
  if (typeof description !== 'string' || description.trim() === '')
    return 'description is missing: write the line a person reads in the menu'
  if (description.length > DESCRIPTION_LIMIT || description.includes('\n'))
    return `description: one line of at most ${String(DESCRIPTION_LIMIT)} characters`
  return undefined
}

function promptTextProblem(prompt: unknown): string | undefined {
  if (typeof prompt !== 'string' || prompt.trim() === '')
    return `the prompt is missing: write it after the frontmatter of ${PROMPT_FILE}`
  if (new TextEncoder().encode(prompt).length > PROMPT_LIMIT)
    return `the prompt is more than ${String(PROMPT_LIMIT)} UTF-8 bytes`
  return undefined
}

function placeholderProblem(prompt: string, argumentHint: unknown): string | undefined {
  if (argumentHint === undefined) return undefined
  const highest = Math.max(
    0,
    ...[...prompt.matchAll(/\$([1-9][0-9]*)/gu)].map(hit => Number(hit[1])),
  )
  const named =
    typeof argumentHint === 'string' ? argumentHint.split(/\s+/u).filter(Boolean).length : 0
  return highest > named
    ? `the prompt uses $${String(highest)}; argument-hint names ${String(named)}`
    : undefined
}

/** The first thing wrong with a prompt command, said for whoever wrote it; undefined when it is whole. */
export function promptProblem(
  body: Partial<Record<keyof PromptBody, unknown>>,
): string | undefined {
  const { name, description, argumentHint, prompt } = body
  const hintBad =
    argumentHint !== undefined && (typeof argumentHint !== 'string' || argumentHint.includes('\n'))
  return (
    nameProblem(name) ??
    descriptionProblem(description) ??
    (hintBad ? 'argument-hint: one line of text' : undefined) ??
    promptTextProblem(prompt) ??
    placeholderProblem(prompt as string, argumentHint)
  )
}

function split(text: string): Readonly<{ yaml: string; rest: string }> | undefined {
  const lines = text.split('\n')
  const dashes = (line: string | undefined) => line?.replace(/\r$/u, '') === '---'
  if (!dashes(lines[0])) return undefined
  const closing = lines.findIndex((line, index) => index > 0 && dashes(line))
  if (closing < 0) return undefined
  return { yaml: lines.slice(1, closing).join('\n'), rest: lines.slice(closing + 1).join('\n') }
}

function fieldsOf(yaml: string): Read<Readonly<Record<string, unknown>>> {
  const document = parseDocument(yaml, { version: '1.2', schema: 'core', uniqueKeys: true })
  if (document.errors.length > 0) return said(`${PROMPT_FILE}: the frontmatter is not valid YAML`)
  const value: unknown = document.toJS({ maxAliasCount: 0 })
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return said(`${PROMPT_FILE}: the frontmatter is not a mapping of fields`)
  const unread = Object.keys(value).find(key => !FIELDS.some(field => field === key))
  return unread === undefined
    ? succeed(value as Record<string, unknown>)
    : said(
        `${PROMPT_FILE}: the frontmatter has the field "${unread}", which is not read; the fields are ${FIELDS.join(', ')}`,
      )
}

async function fileOf(pkg: PackageReader): Promise<Read<Uint8Array>> {
  const manifest = await pkg.manifest()
  if (!('ok' in manifest)) return fail({ kind: 'source-failed', failure: manifest.failure })
  const entry = manifest.ok.entries.find(each => each.path === PROMPT_FILE)
  if (entry === undefined) return said(`the directory has no ${PROMPT_FILE} at its root`)
  const other = manifest.ok.entries.find(each => each.path !== PROMPT_FILE)
  if (other !== undefined)
    return said(
      `a prompt command is the one file ${PROMPT_FILE}; the directory also has ${other.path}`,
    )
  const opened = await pkg.open(entry.path, entry.digest)
  if (!('ok' in opened)) return fail({ kind: 'source-failed', failure: opened.failure })
  if (digestBytes(opened.ok) !== entry.digest)
    return fail({ kind: 'source-failed', failure: 'material-unavailable' })
  return succeed(opened.ok)
}

function bodyOf(bytes: Uint8Array): Read<Readonly<Record<string, unknown>>> {
  let text: string
  try {
    text = utf8.decode(bytes)
  } catch {
    return said(`${PROMPT_FILE} is not UTF-8`)
  }
  const parts = split(text)
  if (parts === undefined)
    return said(
      `${PROMPT_FILE} has no frontmatter: it starts with a line of three dashes, then the fields, then a line of three dashes`,
    )
  const fields = fieldsOf(parts.yaml)
  if (!('ok' in fields)) return fields
  const hint = fields.ok['argument-hint']
  return succeed({
    name: fields.ok['name'],
    description: fields.ok['description'],
    ...(hint === undefined ? {} : { argumentHint: hint }),
    prompt: parts.rest.trim(),
  })
}

async function inspect(pkg: PackageReader): Promise<Read<JsonValue>> {
  const file = await fileOf(pkg)
  if (!('ok' in file)) return file
  const body = bodyOf(file.ok)
  if (!('ok' in body)) return body
  const problem = promptProblem(body.ok)
  if (problem !== undefined) return said(`${PROMPT_FILE}: ${problem}`)
  const read = readBodyText(JSON.stringify(body.ok), {
    maxBytes: PROMPT_LIMIT + 4096,
    maxDepth: 4,
    maxItems: 16,
    maxMembers: 16,
    maxStringLength: PROMPT_LIMIT,
    maxNumberLength: 20,
  })
  return read.kind === 'ok' ? succeed(read.value) : said(`${PROMPT_FILE} is too large to keep`)
}

export const promptLayout: PackageLayout = Object.freeze({
  namespace: 'prompts',
  limits: Object.freeze({
    files: 1,
    fileBytes: PROMPT_LIMIT + 4096,
    totalBytes: PROMPT_LIMIT + 4096,
  }),
  inspect,
})

/** The body as a prompt command, or undefined when it is not one. */
export function promptOf(body: unknown): PromptBody | undefined {
  let plain: unknown
  try {
    plain = JSON.parse(writeJsonText(body as JsonValue))
  } catch {
    return undefined
  }
  if (typeof plain !== 'object' || plain === null || Array.isArray(plain)) return undefined
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(plain)) {
    if (key === 'manifest') continue
    if (
      !['name', 'description', 'argumentHint', 'prompt'].includes(key) ||
      typeof value !== 'string'
    )
      return undefined
    fields[key] = value
  }
  return promptProblem(fields) === undefined ? (fields as PromptBody) : undefined
}

function judge(body: unknown, context?: JudgeContext): Judgment {
  const prompt = promptOf(body)
  if (prompt === undefined) return refusal('invalid-prompt-command')
  if (context?.capabilityName !== undefined && context.capabilityName !== prompt.name)
    return refusal('name-mismatch')
  return { ok: true }
}

const schemaRead = readBodyText(
  '{"kind":"prompt-command-body","properties":{"name":"string","description":"string","argumentHint?":"string","prompt":"string"}}',
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('prompt command schema text is not a document')
const schema: JsonValue = schemaRead.value

export function promptBodyContract(): BodyContract {
  const decided = (body: unknown, context?: JudgeContext) => {
    const verdict = judge(body, context)
    if (!verdict.ok) throw new TypeError(`prompt command body failed judgment: ${verdict.rejected}`)
  }
  return {
    category: PROMPT_CATEGORY,
    schema,
    judge,
    deriveDeclarations(body, context) {
      decided(body, context)
      return { entries: [] }
    },
    references(body, context) {
      decided(body, context)
      return []
    },
    summarize(body, context) {
      decided(body, context)
      const prompt = promptOf(body) as PromptBody
      return {
        title: prompt.name,
        description: prompt.description,
        facts: [{ name: '参数', text: prompt.argumentHint ?? '无' }],
      }
    },
    layout: promptLayout,
  }
}
