// The bytes between the page and its host: one JSON text per request, answer or SSE event. Both
// sides read and write them here, so the wire has one definition. Pure: no Node, no DOM.
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
import type { LoginState } from '@omne-harness/client-assembly/cordis'
import type { LoginCredentials, LoginResult, LogoutResult } from './host-bridge.ts'

/** The host's paths. All same-origin with the page. */
export const BRIDGE = {
  call: '/bridge/call',
  observe: '/bridge/observe',
  login: '/bridge/login',
  logout: '/bridge/logout',
  loginState: '/bridge/login-state',
} as const

/** Budgets for reading any bridge message. An input body may be large; the server checks its own limits. */
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

// ---- call

export type CallMessage = Omit<CallRequest, 'signal'>

export function writeCall(request: CallMessage): string {
  return writeJsonText(
    object({
      protocol: protocolValue(request.protocol),
      operation: string(request.operation),
      messageId: string(request.messageId),
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
  if (protocol === undefined || operation === undefined || messageId === undefined) return undefined
  return body === undefined ? undefined : { protocol, operation, messageId, body }
}

export function writeReport(report: CallReport): string {
  return writeJsonText(
    report.kind === 'answered'
      ? object({ kind: string('answered'), outcome: string(report.outcome), body: report.body })
      : object({ kind: string(report.kind) }),
  )
}

/** The report the host sent; anything else is `uncertain`, since the call may have gone out. */
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

// ---- observe

export type ObserveMessage = Omit<ObserveRequest, 'signal'>

export function writeObserve(request: ObserveMessage): string {
  return writeJsonText(
    object({
      protocol: protocolValue(request.protocol),
      observation: string(request.observation),
      messageId: string(request.messageId),
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
  if (protocol === undefined || observation === undefined || messageId === undefined)
    return undefined
  return open === undefined ? undefined : { protocol, observation, messageId, open }
}

/** One SSE event of an observation: a frame, or how it ended (always the last event). */
export type ObserveEvent = { readonly frame: JsonValue } | { readonly end: ObserveEnd }

export function writeObserveEvent(event: ObserveEvent): string {
  if ('frame' in event) return writeJsonText(object({ kind: string('frame'), frame: event.frame }))
  const end = event.end
  const fields: Record<string, JsonValue> = { kind: string(end.kind) }
  if (end.kind === 'ended') fields['reason'] = string(end.reason)
  if (end.kind === 'refused') fields['outcome'] = string(end.outcome)
  return writeJsonText(object({ kind: string('end'), end: object(fields) }))
}

/** An event the page cannot read ends the observation as `uncertain`. */
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

// ---- login, logout, login state

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

const LOGIN_STATES: readonly LoginState[] = ['signed-out', 'signing-in', 'signed-in', 'signing-out']

export const writeLoginState = (state: LoginState): string =>
  writeJsonText(object({ state: string(state) }))

export function readLoginState(text: string): LoginState | undefined {
  const state = textOf(member(read(text), 'state'))
  return LOGIN_STATES.find(item => item === state)
}
