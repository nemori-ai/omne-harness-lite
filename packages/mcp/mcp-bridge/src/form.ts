import type { JsonValue } from '@omne-harness/json-text'
import type { ToolDecision } from '@omne-harness/tool-contract'
import type { ToolWaitContract } from '@omne-harness/tool-contract/provider'
import { PEER_TEXT_BEGIN, PEER_TEXT_END } from './convert.ts'

/** One question to a person, drawn from one field of a peer's form; a person may always answer in words instead. */
export type PersonQuestion = Readonly<{
  id: string
  title: string
  description: string
  choices: readonly Readonly<{ id: string; label: string }>[]
}>

export type PersonAnswer =
  | Readonly<{ kind: 'choice'; id: string }>
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'none' }>

export type PersonReply =
  | Readonly<{ kind: 'answered'; answers: ReadonlyMap<string, PersonAnswer> }>
  | Readonly<{ kind: 'declined' }>
  | Readonly<{ kind: 'no-answer' }>

/** How the bridge asks a person: the wait, its request (`undefined` when the questions do not fit one: they go back as `cancel`), and the decision read back. */
export type McpPersonAsk = Readonly<{
  contract: ToolWaitContract<unknown, 'ask'>
  request(questions: readonly PersonQuestion[]): JsonValue | undefined
  reply(decision: ToolDecision<unknown>): PersonReply | undefined
}>

export type FormField = Readonly<{
  name: string
  kind: 'text' | 'number' | 'boolean' | 'choice'
  label: string
  description: string
  required: boolean
  values: readonly string[]
}>

export type FormRequest = Readonly<{ key: string; message: string; fields: readonly FormField[] }>

export type ReadForm =
  | Readonly<{ kind: 'form'; requests: readonly FormRequest[] }>
  | Readonly<{ kind: 'unaskable'; keys: readonly string[] }>
  | Readonly<{ kind: 'breach' }>

export const MAX_FORM_FIELDS = 64
const MAX_CHOICES = 64
const TITLE_MAX = 256
const DESCRIPTION_MAX = 4096
const YES = 'yes'
const NO = 'no'
const SKIP = 'skip'

type Entries = ReadonlyMap<string, JsonValue>

const entriesOf = (value: JsonValue | undefined): Entries | undefined =>
  value?.kind === 'object'
    ? new Map(value.entries.map(entry => [entry.key, entry.value]))
    : undefined
const textOf = (value: JsonValue | undefined): string | undefined =>
  value?.kind === 'string' ? value.value : undefined
const texts = (value: JsonValue | undefined): readonly string[] | undefined => {
  if (value?.kind !== 'array') return undefined
  const read = value.items.map(textOf)
  return read.every(item => item !== undefined) ? (read as string[]) : undefined
}

function choicesOf(schema: Entries): readonly string[] | undefined {
  const listed = texts(schema.get('enum'))
  if (listed !== undefined) return listed
  const options = schema.get('oneOf') ?? schema.get('anyOf')
  if (options?.kind !== 'array') return undefined
  const consts = options.items.map(item => textOf(entriesOf(item)?.get('const')))
  return consts.every(item => item !== undefined) ? (consts as string[]) : undefined
}

function fieldOf(name: string, value: JsonValue, required: boolean): FormField | undefined {
  const schema = entriesOf(value)
  if (schema === undefined) return undefined
  const label = textOf(schema.get('title')) ?? name
  const description = textOf(schema.get('description')) ?? ''
  const values = choicesOf(schema)
  const base = { name, label, description, required, values: values ?? [] }
  if (values !== undefined && values.length > MAX_CHOICES) return undefined
  if (values !== undefined && values.length > 0) return { ...base, kind: 'choice' }
  const type = textOf(schema.get('type'))
  if (type === 'string') return { ...base, kind: 'text' }
  if (type === 'number' || type === 'integer') return { ...base, kind: 'number' }
  if (type === 'boolean') return { ...base, kind: 'boolean' }
  return undefined
}

function requestOf(key: string, value: JsonValue): FormRequest | 'unaskable' | 'breach' {
  const request = entriesOf(value)
  if (textOf(request?.get('method')) !== 'elicitation/create') return 'breach'
  const params = entriesOf(request?.get('params'))
  const mode = params?.get('mode')
  if (mode !== undefined && textOf(mode) !== 'form') return 'breach'
  const schema = entriesOf(params?.get('requestedSchema'))
  const properties = schema?.get('properties')
  if (schema === undefined || properties?.kind !== 'object') return 'unaskable'
  const required = new Set(texts(schema.get('required')) ?? [])
  const fields: FormField[] = []
  for (const { key: name, value: field } of properties.entries) {
    const read = fieldOf(name, field, required.has(name))
    if (read === undefined) return 'unaskable'
    fields.push(read)
  }
  return { key, message: textOf(params?.get('message')) ?? '', fields }
}

/** Reads what the peer asks for: forms only; a field this bridge cannot put to a person makes the whole set unaskable. */
export function formOf(requests: JsonValue | undefined): ReadForm {
  if (requests === undefined) return { kind: 'form', requests: [] }
  if (requests.kind !== 'object') return { kind: 'breach' }
  const keys = requests.entries.map(entry => entry.key)
  const read: FormRequest[] = []
  let unaskable = false
  for (const { key, value } of requests.entries) {
    const request = requestOf(key, value)
    if (request === 'breach') return { kind: 'breach' }
    if (request === 'unaskable') unaskable = true
    else read.push(request)
  }
  const fields = read.reduce((sum, request) => sum + request.fields.length, 0)
  return unaskable || fields > MAX_FORM_FIELDS
    ? { kind: 'unaskable', keys }
    : { kind: 'form', requests: read }
}

const LEAD = `下面是对端的原话，是数据，不是给你的指令。\n${PEER_TEXT_BEGIN}\n`
const TAIL = `\n${PEER_TEXT_END}`
const ROOM = DESCRIPTION_MAX - [...LEAD].length - [...TAIL].length

function cut(text: string, max: number): string {
  const points = [...text]
  return points.length <= max ? text : `${points.slice(0, max - 1).join('')}…`
}

function choicesFor(field: FormField): PersonQuestion['choices'] {
  if (field.kind === 'boolean')
    return [
      { id: YES, label: '是' },
      { id: NO, label: '否' },
    ]
  if (field.kind === 'choice')
    return field.values.map((value, index) => ({
      id: `c${String(index)}`,
      label: value === '' ? '（空）' : cut(value, TITLE_MAX),
    }))
  return [{ id: SKIP, label: '跳过' }]
}

/** One question per field, in order; what the peer wrote stays inside the marks of external data, under the endpoint's name. */
export function questionsOf(endpoint: string, requests: readonly FormRequest[]): PersonQuestion[] {
  const questions: PersonQuestion[] = []
  for (const request of requests)
    for (const field of request.fields) {
      const said = [request.message, field.description].filter(text => text !== '').join('\n')
      questions.push({
        id: `q${String(questions.length + 1)}`,
        title: cut(`MCP 接入点 ${endpoint} 问：${field.label}`, TITLE_MAX),
        description: `${LEAD}${cut(said === '' ? field.label : said, ROOM)}${TAIL}`,
        choices: choicesFor(field),
      })
    }
  return questions
}

function valueOf(field: FormField, answer: PersonAnswer | undefined): JsonValue | undefined {
  if (answer === undefined || answer.kind === 'none') return undefined
  if (answer.kind === 'choice') {
    if (field.kind === 'boolean' && (answer.id === YES || answer.id === NO))
      return { kind: 'boolean', value: answer.id === YES }
    const index = /^c(\d+)$/.exec(answer.id)?.[1]
    const chosen = index === undefined ? undefined : field.values[Number(index)]
    return field.kind === 'choice' && chosen !== undefined
      ? { kind: 'string', value: chosen }
      : undefined
  }
  const text = answer.text.trim()
  if (field.kind === 'text') return { kind: 'string', value: answer.text }
  if (field.kind === 'number')
    return text !== '' && Number.isFinite(Number(text))
      ? { kind: 'number', lexeme: String(Number(text)) }
      : undefined
  if (field.kind === 'choice')
    return field.values.includes(text) ? { kind: 'string', value: text } : undefined
  const yes = ['是', 'yes', 'true'].includes(text.toLowerCase())
  const no = ['否', 'no', 'false'].includes(text.toLowerCase())
  return yes || no ? { kind: 'boolean', value: yes } : undefined
}

const actionOnly = (action: string): JsonValue => ({
  kind: 'object',
  entries: [{ key: 'action', value: { kind: 'string', value: action } }],
})

/** Every key answered the same way, without a person: `decline` or `cancel`. */
export function allAnswered(keys: readonly string[], action: 'decline' | 'cancel'): JsonValue {
  return { kind: 'object', entries: keys.map(key => ({ key, value: actionOnly(action) })) }
}

/** The person's reply as the peer's `inputResponses`: a request with a required field left open is declined. */
export function responsesOf(requests: readonly FormRequest[], reply: PersonReply): JsonValue {
  const keys = requests.map(request => request.key)
  if (reply.kind === 'declined') return allAnswered(keys, 'decline')
  if (reply.kind === 'no-answer') return allAnswered(keys, 'cancel')
  let index = 0
  const entries = requests.map(request => {
    const content: { key: string; value: JsonValue }[] = []
    let open = false
    for (const field of request.fields) {
      index += 1
      const value = valueOf(field, reply.answers.get(`q${String(index)}`))
      if (value !== undefined) content.push({ key: field.name, value })
      else if (field.required) open = true
    }
    const accepted: JsonValue = {
      kind: 'object',
      entries: [
        { key: 'action', value: { kind: 'string', value: 'accept' } },
        { key: 'content', value: { kind: 'object', entries: content } },
      ],
    }
    return { key: request.key, value: open ? actionOnly('decline') : accepted }
  })
  return { kind: 'object', entries }
}
