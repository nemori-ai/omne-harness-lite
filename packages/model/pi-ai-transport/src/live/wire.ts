import {
  decodeModelOperationId,
  type LiveCommand,
  type LiveCommandOutcome,
  type MediaFrame,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type { CallAccountReport, LiveFact } from '@omne-harness/model-contract/provider'
import type { RouteAccounting } from '../config.ts'
import { unreportedCost } from '../cost-lookup.ts'

type Message = Readonly<Record<string, unknown>>
type Accounting = Pick<RouteAccounting, 'place' | 'costUnit' | 'generation'>

/** The audio a session is told to send and expect, by the name a live request gives it. */
const AUDIO: Readonly<Record<string, Readonly<{ type: string; rate: number }>>> = {
  pcm16: { type: 'audio/pcm', rate: 24000 },
}
const APPEND: Readonly<Record<LiveCommand['use'], string>> = {
  directive: 'session.instructions.append',
  context: 'session.thinking.append',
  speak: 'session.commentary.append',
}
const ACCEPTED = new Set(Object.values(APPEND).map(type => `${type}ed`))

export const LIVE_CLOSE = Object.freeze({ type: 'session.close', event_id: 'close' })

export type LiveStart = Readonly<{
  model: string
  instructions: string
  voice: string | null
  audio: string
}>

export function startMessage(
  start: LiveStart,
): Readonly<{ ok: Message }> | Readonly<{ failure: string }> {
  const format = AUDIO[start.audio]
  if (format === undefined) return { failure: 'request.media.audio' }
  const output = start.voice === null ? {} : { output: { voice: start.voice } }
  return {
    ok: {
      type: 'session.start',
      event_id: 'start',
      session: {
        model: start.model,
        instructions: start.instructions,
        audio: { format, ...output },
        delegation: { type: 'client' },
      },
    },
  }
}

/** The append a command is said as; null when its content is not all text, which no append carries. */
export function commandMessage(command: LiveCommand, id: ModelOperationId): Message | null {
  const parts: string[] = []
  for (const block of command.content) {
    if (block.kind !== 'text') return null
    parts.push(block.text)
  }
  return {
    type: APPEND[command.use],
    event_id: id,
    delegation_id: command.about,
    content: parts.join(''),
  }
}

export function mediaMessage(frame: MediaFrame): Message | null {
  if (frame.modality !== 'voice') return null
  return { type: 'session.input_audio.append', audio: Buffer.from(frame.bytes).toString('base64') }
}

const isRecord = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function operationOf(value: unknown): ModelOperationId | null {
  if (typeof value !== 'string') return null
  const decoded = decodeModelOperationId(value)
  return 'ok' in decoded ? decoded.ok : null
}

function transcript(who: 'caller' | 'model', message: Message): readonly LiveFact[] {
  const { start_ms: startMs, end_ms: endMs, delta: text } = message
  if (!isCount(startMs) || !isCount(endMs) || typeof text !== 'string') return []
  return [{ kind: 'event', event: { t: 'transcript', who, startMs, endMs, text } }]
}

function opened(message: Message): readonly LiveFact[] {
  const expires = isRecord(message.session) ? message.session.expires_at : undefined
  const expiresAt = isCount(expires) ? new Date(expires * 1000).toISOString() : null
  return [{ kind: 'opened', expiresAt }]
}

function delegation(message: Message): readonly LiveFact[] {
  const { offset_ms: offsetMs, delegation: created } = message
  if (!isCount(offsetMs) || !isRecord(created) || typeof created.id !== 'string') return []
  return [{ kind: 'event', event: { t: 'delegation', id: created.id, offsetMs } }]
}

function refused(message: Message): readonly LiveFact[] {
  const { error } = message
  if (!isRecord(error)) return []
  const id = operationOf(error.client_event_id)
  if (id === null || typeof error.message !== 'string') return []
  const code = typeof error.code === 'string' ? error.code : null
  const outcome: LiveCommandOutcome = { rejected: { code, message: error.message } }
  return [{ kind: 'command', id, outcome }]
}

function closed(message: Message, accounting: Accounting): readonly LiveFact[] {
  const seconds = isRecord(message.usage) ? message.usage.seconds : undefined
  if (!isCount(seconds)) return [{ kind: 'closed' }]
  const value: CallAccountReport = {
    usage: [{ name: 'session', state: 'known', lexeme: String(seconds), unit: 'second' }],
    cost: unreportedCost(accounting),
    trimmed: { state: 'unknown', unit: 'token' },
    place: accounting.place,
    duration: { state: 'unknown' },
    revision: '1',
  }
  return [{ kind: 'account', event: 'usage', value }, { kind: 'closed' }]
}

function audio(message: Message): readonly LiveFact[] {
  if (typeof message.delta !== 'string') return []
  const bytes = new Uint8Array(Buffer.from(message.delta, 'base64'))
  return [{ kind: 'media', frame: { modality: 'voice', bytes } }]
}

const READ: Readonly<
  Record<string, (message: Message, accounting: Accounting) => readonly LiveFact[]>
> = {
  'session.started': opened,
  'session.input_transcript.delta': message => transcript('caller', message),
  'session.output_transcript.delta': message => transcript('model', message),
  'session.delegation.created': delegation,
  'session.paused': () => [{ kind: 'event', event: { t: 'asleep', on: true } }],
  'session.resumed': () => [{ kind: 'event', event: { t: 'asleep', on: false } }],
  'session.output_audio.delta': audio,
  error: refused,
  'session.closed': closed,
}

/** The facts one upstream message makes; a message the table does not know makes none. */
export function factsOf(message: unknown, accounting: Accounting): readonly LiveFact[] {
  if (!isRecord(message) || typeof message.type !== 'string') return []
  if (ACCEPTED.has(message.type)) {
    const id = operationOf(message.client_event_id)
    return id === null ? [] : [{ kind: 'command', id, outcome: 'accepted' }]
  }
  return Object.hasOwn(READ, message.type) ? READ[message.type]!(message, accounting) : []
}
