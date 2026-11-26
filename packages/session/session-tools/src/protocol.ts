import { z } from 'zod'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import type { SessionsListInput, SessionsSearchInput } from './port.ts'

export const sessionsAdoption = describedAdoption({
  owner: '@omne-harness/session-tools',
  name: 'sessions-protocol',
  revision: '1',
  changes: 'One declaration with the command named in the call; reads of the tenant sessions only.',
})
const vocabulary = describedAdoption({
  owner: '@omne-harness/session-tools',
  name: 'json-schema',
  revision: '2020-12',
  dialect: 'https://json-schema.org/draft/2020-12/schema',
})
const limits = {
  maxBytes: 65_536,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 4096,
  maxNumberLength: 32,
}

export function tree(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new TypeError('Sessions protocol JSON is not bounded')
  return read.value
}

export const sessionsCommandNames = ['help', 'list', 'search', 'show', 'read'] as const
export type SessionsCommandName = (typeof sessionsCommandNames)[number]
export const SEARCHABLE_KINDS = [
  'message.user',
  'message.assistant',
  'message.tool',
  'message.system_reminder',
  'message.tool_internal',
  'message.compaction',
] as const
export type SessionsArguments =
  | Readonly<{ kind: 'help'; name?: string }>
  | Readonly<{ kind: 'list'; input: SessionsListInput }>
  | Readonly<{ kind: 'show'; session: string }>
  | Readonly<{
      kind: 'read'
      session: string
      cursor: string | null
      backward: boolean
      inherited: boolean
      after: string | null
    }>
  | Readonly<{ kind: 'search'; input: SessionsSearchInput }>

const PAGE = 20
const cursor = z.string().min(1).optional()
const limit = z.int().min(1).max(50).optional()
const session = z.string().min(1).max(256)
const instant = z.iso.datetime({ offset: true }).optional()
const PARSERS = {
  help: z.strictObject({ name: z.enum(sessionsCommandNames).optional() }),
  list: z.strictObject({
    archived: z.boolean().optional(),
    title: z.string().min(1).optional(),
    relation: z.enum(['main', 'child', 'handoff']).optional(),
    parent: session.optional(),
    attendance: z.enum(['attended', 'unattended']).optional(),
    definition: z.string().min(1).max(200).optional(),
    cursor,
    limit,
  }),
  show: z.strictObject({ session }),
  read: z
    .strictObject({
      session,
      cursor,
      backward: z.boolean().optional(),
      inherited: z.boolean().optional(),
      after: z.string().min(1).max(256).optional(),
    })
    .refine(
      ({ after, cursor: next, backward, inherited }) =>
        after === undefined || (next === undefined && backward !== true && inherited !== true),
      {
        message:
          'after starts a reading at a position: give it without cursor, backward and inherited',
      },
    ),
  search: z
    .strictObject({
      text: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(8)]).optional(),
      regex: z.string().min(1).optional(),
      case_sensitive: z.boolean().default(false),
      sessions: z.array(session).min(1).max(64).optional(),
      archived: z.enum(['unarchived', 'archived', 'all']).default('all'),
      from: instant,
      to: instant,
      kinds: z.array(z.enum(SEARCHABLE_KINDS)).min(1).max(6).default([]),
      cursor,
      limit: z.int().min(1).max(50).default(PAGE),
    })
    .refine(params => (params.text === undefined) !== (params.regex === undefined), {
      message: 'give exactly one of text and regex',
    }),
} as const

type Params<N extends SessionsCommandName> = z.infer<(typeof PARSERS)[N]>

function contentOf(params: Params<'search'>): SessionsSearchInput['content'] {
  const caseSensitive = params.case_sensitive
  if (params.text === undefined)
    return { kind: 'regex', pattern: params.regex ?? '', caseSensitive }
  const all = typeof params.text === 'string' ? [params.text] : params.text
  return { kind: 'literals', all, caseSensitive }
}
const BUILD: { readonly [N in SessionsCommandName]: (params: Params<N>) => SessionsArguments } = {
  help: params =>
    params.name === undefined ? { kind: 'help' } : { kind: 'help', name: params.name },
  list: params => ({
    kind: 'list',
    input: {
      archived: params.archived ?? false,
      title: params.title ?? null,
      relation: params.relation ?? null,
      parent: params.parent ?? null,
      attendance: params.attendance ?? null,
      definition: params.definition ?? null,
      cursor: params.cursor ?? null,
      limit: params.limit ?? PAGE,
    },
  }),
  show: params => ({ kind: 'show', session: params.session }),
  read: params => ({
    kind: 'read',
    session: params.session,
    cursor: params.cursor ?? null,
    backward: params.backward ?? false,
    inherited: params.inherited ?? false,
    after: params.after ?? null,
  }),
  search: params => ({
    kind: 'search',
    input: {
      content: contentOf(params),
      sessions: params.sessions ?? null,
      archived: params.archived,
      from: params.from ?? null,
      to: params.to ?? null,
      kinds: params.kinds,
      cursor: params.cursor ?? null,
      limit: params.limit,
    },
  }),
}

const SESSION = 'A session id, as list, show or a search hit gives it.'
const CURSOR = 'The next value of the previous page; omit for the first page.'
const LIMIT = 'At most this many items, 1 to 50; 20 when omitted.'
type Command = Readonly<{
  name: SessionsCommandName
  summary: string
  properties: Readonly<Record<string, unknown>>
  required: readonly string[]
  descriptions: Readonly<Record<string, string>>
}>
const text = { type: 'string' }
const page = { type: 'integer', minimum: 1, maximum: 50 }

export const sessionsCommands: readonly Command[] = [
  {
    name: 'help',
    summary: 'Read command usage.',
    properties: { name: { type: 'string', enum: sessionsCommandNames } },
    required: [],
    descriptions: { name: 'Command name. Omit for the complete menu.' },
  },
  {
    name: 'list',
    summary: 'List the sessions of this user, the open ones or the archived ones, newest first.',
    properties: { archived: { type: 'boolean' }, title: text, cursor: text, limit: page },
    required: [],
    descriptions: {
      archived: 'true lists the archived sessions; false or omitted lists the others.',
      title: 'Only with archived: keep the sessions whose title contains this text.',
      cursor: CURSOR,
      limit: LIMIT,
    },
  },
  {
    name: 'search',
    summary: 'Find messages in the sessions of this user by words or a regular expression.',
    properties: {
      text: { oneOf: [text, { type: 'array', items: text, minItems: 1, maxItems: 8 }] },
      regex: text,
      case_sensitive: { type: 'boolean' },
      sessions: { type: 'array', items: text, minItems: 1, maxItems: 64 },
      archived: { type: 'string', enum: ['unarchived', 'archived', 'all'] },
      from: text,
      to: text,
      kinds: { type: 'array', items: { type: 'string', enum: SEARCHABLE_KINDS }, minItems: 1 },
      cursor: text,
      limit: page,
    },
    required: [],
    descriptions: {
      text: 'A word or phrase, or a list of them that must all appear in one message. Give text or regex, not both.',
      regex: 'A regular expression one message must match.',
      case_sensitive: 'Match case exactly; false when omitted.',
      sessions: 'Search only these sessions; all of them when omitted.',
      archived: 'unarchived, archived or all; all when omitted.',
      from: 'Only messages at or after this instant, as 2026-11-19T08:00:00Z.',
      to: 'Only messages at or before this instant.',
      kinds: 'Which messages; user, assistant, tool and reminder messages when omitted.',
      cursor: CURSOR,
      limit: LIMIT,
    },
  },
  {
    name: 'show',
    summary: 'One session as the list shows it: title, state, times and archive.',
    properties: { session: text },
    required: ['session'],
    descriptions: { session: SESSION },
  },
  {
    name: 'read',
    summary: 'Read the messages of one session, a page at a time.',
    properties: {
      session: text,
      cursor: text,
      backward: { type: 'boolean' },
      inherited: { type: 'boolean' },
      after: text,
    },
    required: ['session'],
    descriptions: {
      session: SESSION,
      cursor: CURSOR,
      after:
        'A position of this session, as an item of a page or the since of a Job names it: reading starts with what was recorded after it. Not with cursor, backward or inherited.',
      backward:
        'true starts at the newest message and goes back; false or omitted starts at the first.',
      inherited:
        'true, for a session forked from another (a spawned agent): first the conversation it started from, each item under the session it is of; not with backward.',
    },
  },
]

function commandNamed(name: SessionsCommandName): Command {
  const command = sessionsCommands.find(candidate => candidate.name === name)
  if (command === undefined) throw new TypeError(`Sessions has no command ${name}`)
  return command
}

export function sessionsContract(name: SessionsCommandName): ParameterContract {
  const command = commandNamed(name)
  return {
    schema: tree({
      type: 'object',
      additionalProperties: false,
      properties: command.properties,
      required: command.required,
    }),
    vocabulary,
    descriptions: Object.entries(command.descriptions).map(([path, text]) => ({ path, text })),
  }
}

const strictJson = createDefaultParameterCodec(limits)

/** Parses one command's params: unknown fields, missing fields and bad values are invalid. */
export function sessionsParameterCodec(
  name: SessionsCommandName,
): ParameterCodec<SessionsArguments> {
  if ('failure' in strictJson) throw new TypeError(strictJson.failure.reason)
  const base = strictJson.ok
  return {
    adoption: sessionsAdoption,
    parse(input) {
      const read = base.parse(input)
      if ('failure' in read) return read
      const params = PARSERS[name].safeParse(JSON.parse(writeJsonText(read.ok)))
      if (!params.success) {
        const issue = params.error.issues[0]
        const at = issue?.path.join('.') ?? ''
        return fail({
          kind: 'invalid',
          reason: `${at === '' ? '' : `${at}: `}${issue?.message ?? 'invalid'}`,
        })
      }
      return succeed((BUILD[name] as (params: unknown) => SessionsArguments)(params.data))
    },
  }
}
