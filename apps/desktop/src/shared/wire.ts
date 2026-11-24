import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import type {
  CallReport,
  CallRequest,
  ObserveEnd,
  ObserveRequest,
  ProtocolKey,
} from '@omne-harness/sdk/core'
import type { LoginCredentials, LoginResult, LogoutResult } from './channel.ts'

export const BRIDGE = {
  call: '/bridge/call',
  observe: '/bridge/observe',
  unobserve: '/bridge/unobserve',
  events: '/bridge/events',
  login: '/bridge/login',
  logout: '/bridge/logout',
  loginStanding: '/bridge/login-standing',
} as const

export const WIRE_LIMITS: JsonLimits = {
  maxBytes: 8 * 1024 * 1024,
  maxDepth: 64,
  maxItems: 200_000,
  maxMembers: 10_000,
  maxStringLength: 8 * 1024 * 1024,
  maxNumberLength: 64,
}

const string = (value: string): JsonValue => ({ kind: 'string', value })
const number = (value: number): JsonValue => ({ kind: 'number', lexeme: String(value) })
const object = (fields: Readonly<Record<string, JsonValue>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(fields).map(([key, value]) => ({ key, value })),
})

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  if (value?.kind !== 'object') return undefined
  return value.entries.find(entry => entry.key === key)?.value
}
function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}
function read(text: string): JsonValue | undefined {
  const result = readJsonText(text, WIRE_LIMITS)
  return result.kind === 'ok' ? result.value : undefined
}

const protocolValue = (key: ProtocolKey): JsonValue =>
  object({ name: string(key.name), major: number(key.major) })

function protocolOf(value: JsonValue | undefined): ProtocolKey | undefined {
  const name = textOf(member(value, 'name'))
  const major = member(value, 'major')
  if (name === undefined || major?.kind !== 'number') return undefined
  const parsed = Number(major.lexeme)
  return Number.isSafeInteger(parsed) && parsed > 0 ? { name, major: parsed } : undefined
}

/** The contract revision the page's client was built with. It rides in the message: the forwarding
 * layer is a client of its own, so no header of the page reaches the server. */
const revisionValue = (revision: number | undefined): Readonly<Record<string, JsonValue>> =>
  revision === undefined ? {} : { revision: number(revision) }

type Revision = Readonly<{ ok: true; revision?: number }> | Readonly<{ ok: false }>

function revisionOf(value: JsonValue | undefined): Revision {
  if (value === undefined) return { ok: true }
  const parsed = value.kind === 'number' ? Number(value.lexeme) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? { ok: true, revision: parsed } : { ok: false }
}

export type CallMessage = Omit<CallRequest, 'signal'>

export function writeCall(request: CallMessage): string {
  return writeJsonText(
    object({
      protocol: protocolValue(request.protocol),
      operation: string(request.operation),
      messageId: string(request.messageId),
      ...revisionValue(request.revision),
      body: request.body,
    }),
  )
}

export function readCall(text: string): CallMessage | undefined {
  const value = read(text)
  const protocol = protocolOf(member(value, 'protocol'))
  const operation = textOf(member(value, 'operation'))
  const messageId = textOf(member(value, 'messageId'))
  const body = member(value, 'body')
  const revision = revisionOf(member(value, 'revision'))
  if (protocol === undefined || operation === undefined || messageId === undefined) return undefined
  if (body === undefined || !revision.ok) return undefined
  const { ok: _, ...carried } = revision
  return { protocol, operation, messageId, ...carried, body }
}

export function writeReport(report: CallReport): string {
  return writeJsonText(
    report.kind === 'answered'
      ? object({ kind: string('answered'), outcome: string(report.outcome), body: report.body })
      : object({ kind: string(report.kind) }),
  )
}

export function readReport(text: string): CallReport {
  const value = read(text)
  const kind = textOf(member(value, 'kind'))
  if (kind === 'not-sent') return { kind: 'not-sent' }
  if (kind === 'answered') {
    const outcome = textOf(member(value, 'outcome'))
    const body = member(value, 'body')
    if (outcome !== undefined && body !== undefined) return { kind: 'answered', outcome, body }
  }
  return { kind: 'uncertain' }
}

export type ObserveMessage = Omit<ObserveRequest, 'signal'>

export function writeObserve(request: ObserveMessage): string {
  return writeJsonText(
    object({
      protocol: protocolValue(request.protocol),
      observation: string(request.observation),
      messageId: string(request.messageId),
      ...revisionValue(request.revision),
      open: request.open,
    }),
  )
}

export function readObserve(text: string): ObserveMessage | undefined {
  const value = read(text)
  const protocol = protocolOf(member(value, 'protocol'))
  const observation = textOf(member(value, 'observation'))
  const messageId = textOf(member(value, 'messageId'))
  const open = member(value, 'open')
  const revision = revisionOf(member(value, 'revision'))
  if (protocol === undefined || observation === undefined || messageId === undefined)
    return undefined
  if (open === undefined || !revision.ok) return undefined
  const { ok: _, ...carried } = revision
  return { protocol, observation, messageId, ...carried, open }
}

export type ObserveEvent = { readonly frame: JsonValue } | { readonly end: ObserveEnd }

export function writeObserveEvent(event: ObserveEvent): string {
  if ('frame' in event) return writeJsonText(object({ kind: string('frame'), frame: event.frame }))
  const end = event.end
  const fields: Record<string, JsonValue> = { kind: string(end.kind) }
  if (end.kind === 'ended') fields['reason'] = string(end.reason)
  if (end.kind === 'refused') fields['outcome'] = string(end.outcome)
  return writeJsonText(object({ kind: string('end'), end: object(fields) }))
}

export function readObserveEvent(text: string): ObserveEvent {
  const value = read(text)
  const kind = textOf(member(value, 'kind'))
  const frame = member(value, 'frame')
  if (kind === 'frame' && frame !== undefined) return { frame }
  const end = member(value, 'end')
  const endKind = textOf(member(end, 'kind'))
  const reason = textOf(member(end, 'reason'))
  const outcome = textOf(member(end, 'outcome'))
  if (kind === 'end') {
    if (endKind === 'ended' && reason !== undefined) return { end: { kind: 'ended', reason } }
    if (endKind === 'refused' && outcome !== undefined) return { end: { kind: 'refused', outcome } }
    if (endKind === 'not-sent' || endKind === 'aborted' || endKind === 'uncertain')
      return { end: { kind: endKind } }
  }
  return { end: { kind: 'uncertain' } }
}

/** An observation put on a page's one event stream, under an identifier the page chose. */
export type Attach = {
  readonly page: string
  readonly id: string
  readonly request: ObserveMessage
}

export function writeAttach(page: string, id: string, request: string): string {
  return writeJsonText(object({ page: string(page), id: string(id), request: string(request) }))
}

export function readAttach(text: string): Attach | undefined {
  const value = read(text)
  const page = textOf(member(value, 'page'))
  const id = textOf(member(value, 'id'))
  const request = readObserve(textOf(member(value, 'request')) ?? '')
  return page === undefined || id === undefined || request === undefined
    ? undefined
    : { page, id, request }
}

export type Detach = { readonly page: string; readonly id: string }

export function writeDetach(page: string, id: string): string {
  return writeJsonText(object({ page: string(page), id: string(id) }))
}

export function readDetach(text: string): Detach | undefined {
  const value = read(text)
  const page = textOf(member(value, 'page'))
  const id = textOf(member(value, 'id'))
  return page === undefined || id === undefined ? undefined : { page, id }
}

export function writePageEvent(id: string, event: ObserveEvent): string {
  return writeJsonText(object({ id: string(id), event: string(writeObserveEvent(event)) }))
}

/** One event of one observation on the page's stream; `last` when it says how it ended. */
export type PageEvent = { readonly id: string; readonly event: string; readonly last: boolean }

export function readPageEvent(text: string): PageEvent | undefined {
  const value = read(text)
  const id = textOf(member(value, 'id'))
  const event = textOf(member(value, 'event'))
  if (id === undefined || event === undefined) return undefined
  return { id, event, last: 'end' in readObserveEvent(event) }
}

export function writeCredentials(credentials: LoginCredentials): string {
  return writeJsonText(
    object({
      loginIdentifier: string(credentials.loginIdentifier),
      credential: string(credentials.credential),
    }),
  )
}

export function readCredentials(text: string): LoginCredentials | undefined {
  const value = read(text)
  const loginIdentifier = textOf(member(value, 'loginIdentifier'))
  const credential = textOf(member(value, 'credential'))
  return loginIdentifier === undefined || credential === undefined
    ? undefined
    : { loginIdentifier, credential }
}

export const writeResult = (result: LoginResult | LogoutResult): string =>
  writeJsonText(object({ result: string(result) }))

export function readResult<R extends string>(text: string, allowed: readonly R[]): R | undefined {
  const result = textOf(member(read(text), 'result'))
  return allowed.find(item => item === result)
}

export type LoginStandingAnswer = Readonly<{
  state: 'signed-in' | 'signed-out'
  note?: 'expired' | 'unverified'
}>

const STANDING_STATES = ['signed-in', 'signed-out'] as const
const STANDING_NOTES = ['expired', 'unverified'] as const

export const writeLoginStanding = (
  standing: LoginStandingAnswer,
  protocols: readonly ProtocolKey[],
): string =>
  writeJsonText(
    object({
      state: string(standing.state),
      ...(standing.note === undefined ? {} : { note: string(standing.note) }),
      protocols: { kind: 'array', items: protocols.map(protocolValue) },
    }),
  )

export function readLoginStanding(text: string): LoginStandingAnswer | undefined {
  const value = read(text)
  const state = textOf(member(value, 'state'))
  const found = STANDING_STATES.find(item => item === state)
  if (found === undefined) return undefined
  const note = textOf(member(value, 'note'))
  const known = STANDING_NOTES.find(item => item === note)
  return known === undefined ? { state: found } : { state: found, note: known }
}

export function readForwardingProtocols(text: string): readonly ProtocolKey[] | null {
  const list = member(read(text), 'protocols')
  if (list?.kind !== 'array') return null
  return list.items.flatMap(item => {
    const key = protocolOf(item)
    return key === undefined ? [] : [key]
  })
}

export function missingAtForwarding(
  page: readonly ProtocolKey[],
  forwarding: readonly ProtocolKey[] | null,
): readonly ProtocolKey[] {
  if (forwarding === null) return page
  return page.filter(
    key => !forwarding.some(known => known.name === key.name && known.major === key.major),
  )
}
