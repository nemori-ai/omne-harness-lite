import { LosslessNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import {
  captureModelLogValue,
  prepareModelLogEntry,
  type CapturedModelLogValue,
  type ModelLogCategory,
  type ModelLogPurpose,
  type ModelLogShell,
} from '@omne-harness-lite/model-request-runtime'
import type { LogEntry, OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'

const parsedTenant = parseTenantId({ organization: 'codec-organization', account: 'codec-account' })
if (!('ok' in parsedTenant)) throw new Error('fixture tenant')
export const tenant = parsedTenant.ok
const parsedSession = parseOpaqueIdentifier('codec-session', 'SessionRef')
if (!('ok' in parsedSession)) throw new Error('fixture session')
export const session = parsedSession.ok
export const binding: JsonObject = {
  implementation: { name: 'teaching', revision: 'one' },
  definition: { modelId: 'teaching/model', revision: 'one' },
  configuration: {
    revision: 'one',
    values: { precise: new LosslessNumber('9007199254740993'), original: { a: 1, b: 2 } },
  },
}
export const snapshot: JsonObject = {
  adaptation: binding,
  providers: ['first', 'second'],
  allowFallback: true,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 100,
  maxOutputTokens: 20,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  updatedAt: '2026-09-27T00:00:00Z',
}
export const dispatched: JsonObject = {
  kind: 'model_call_dispatched',
  call: 'call',
  dispatch: new LosslessNumber('1.0'),
  response: 'response',
  adaptation: binding,
  profile: { origin: 'official', routeName: 'teaching/model' },
  profileSnapshot: snapshot,
  provider: 'first',
  selectedBy: 'session',
  credentialScope: { layer: 'factory' },
  parameters: {
    temperature: new LosslessNumber('0.7'),
    extra: { remove: 'original', retained: { k: new LosslessNumber('9007199254740993') } },
  },
  parameterAdjustments: [
    { name: 'temperature', requested: new LosslessNumber('0.7'), sent: new LosslessNumber('0.50') },
  ],
  droppedParameters: ['remove'],
}
export const opened: JsonObject = {
  kind: 'model_call_opened',
  call: 'call',
  dispatch: 1,
  firstTokenAt: '2026-09-27T00:00:01Z',
}
export const reply: JsonObject = {
  id: 'winner-message',
  type: 'assistant',
  response: 'response',
  ending: 'complete',
  createdAt: '2026-09-27T00:00:02Z',
  blocks: [
    {
      id: 'block',
      kind: 'text',
      text: 'original answer',
      visibility: { toHuman: true, toModel: true },
    },
  ],
}
export const response: JsonObject = {
  id: 'response',
  call: { callId: 'call' },
  dispatch: 1,
  route: {
    adaptation: binding,
    profile: dispatched.profile ?? null,
    profileSnapshot: snapshot,
    provider: 'first',
    selectedBy: 'session',
    credentialScope: { layer: 'factory' },
    parameters: {
      temperature: new LosslessNumber('0.50'),
      extra: { retained: { k: new LosslessNumber('9007199254740993') } },
    },
    parameterAdjustments: dispatched.parameterAdjustments ?? null,
    droppedParameters: ['remove'],
  },
  outcome: 'complete',
  reply,
  replyDisposition: 'persisted',
  timing: {
    sentAt: '2026-09-27T00:00:00Z',
    firstTokenAt: '2026-09-27T00:00:01Z',
    endedAt: '2026-09-27T00:00:02Z',
  },
  usage: {
    input_tokens: 11,
    output_tokens: 5,
    cache_read_tokens: 'unknown',
    cache_write_tokens: 0,
    source: 'upstream',
  },
  cost: {
    cost_usd: new LosslessNumber('0.0000000000000000000000000310'),
    source: 'upstream_usage',
  },
}
export function capture(category: ModelLogCategory, value: unknown): CapturedModelLogValue {
  const captured = captureModelLogValue({ category, input: { kind: 'value', value } })
  if (!('ok' in captured)) throw new Error(`fixture capture ${category}: ${captured.reason}`)
  return captured.ok
}
export function prepare(
  category: ModelLogCategory,
  value: unknown,
  purpose: ModelLogPurpose,
  shell: ModelLogShell = { tenant },
): OwnedLogEntry {
  const entry = prepareModelLogEntry({
    session,
    shell,
    captured: capture(category, value),
    purpose,
    messagePrefix: [],
  })
  if (!('ok' in entry)) throw new Error(`fixture prepare: ${entry.reason}`)
  return entry.ok
}
export function located(entry: OwnedLogEntry, position: number): LogEntry {
  return { ...entry, session, position }
}
export function anchors() {
  const d = located(prepare('record', dispatched, { kind: 'record' }), 1)
  const o = located(prepare('record', opened, { kind: 'record' }), 2)
  return { entries: [d, o], dispatched: d, opened: o, intent: null }
}
export function batch(value: JsonObject = response): readonly OwnedLogEntry[] {
  const captured = capture('response', value)
  const r = prepare('response', value, { kind: 'response' })
  return value.replyDisposition === 'persisted'
    ? [prepare('message', value.reply, { kind: 'persistedMessage', response: captured }), r]
    : [r]
}
export function durable(value: JsonObject = response) {
  const initial = anchors()
  const members = batch(value).map((entry, index) => located(entry, index + 3))
  return {
    prefix: { entries: [...initial.entries, ...members], tail: members.length + 2 },
    anchors: initial,
  }
}
export function jsonObject(value: JsonValue | undefined): JsonObject {
  if (!objectValue(value)) throw new Error('fixture object')
  return value
}
function objectValue(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof LosslessNumber)
  )
}
