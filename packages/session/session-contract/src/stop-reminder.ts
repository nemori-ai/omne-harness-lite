import type { MessageId, SystemReminderMessage } from '@omne-harness/message'
import type { BackgroundCallRecord, BackgroundCallStop, StopInitiator } from './background-calls.ts'
import { shortCallId } from './background-calls.ts'
import type { InputId, SessionOperationId } from './identity.ts'
import { digestOf } from './operations.ts'
import type { InputSourceName } from './input-sources.ts'
import type { RoutedInput } from './values.ts'

type Block = SystemReminderMessage['blocks'][number]
type Ordinary = Extract<RoutedInput, { kind: 'ordinary' }>

/** The evidence owner of a stop's record: where the reminder's content came from. */
const STOP_EVIDENCE_OWNER = 'background-call-stop'

const VISIBLE = { toHuman: true, toModel: true } as const

const WHO: Readonly<Record<StopInitiator, string>> = {
  user: 'the user',
  agent: 'you',
  system: 'the system',
}

function reasonText(reason: string | null): string {
  return reason === null ? 'No reason was given.' : `Reason: ${reason}`
}

/** The block an outcome reminder of a stopped call ends with. */
export function stoppedText(message: string, stop: BackgroundCallStop): Block {
  return {
    kind: 'text',
    id: `blk_${digestOf(['stopped', message, stop.operation]).slice(0, 32)}`,
    visibility: VISIBLE,
    text: `This call was stopped by ${WHO[stop.initiator]}. ${reasonText(stop.reason)}`,
  } as Block
}

/** One stop of one call becomes at most this one input (SW-I17). */
export function stopInputId(record: BackgroundCallRecord, operation: SessionOperationId): InputId {
  return `bs_${digestOf({ kind: 'background-stop', producer: record.producer, operation })}` as InputId
}

function callText(record: BackgroundCallRecord): string {
  const { intent, tool, command } = record.label
  const action = command === null ? tool : `${tool} ${command}`
  return intent === null ? action : `${action}: ${intent}`
}

// The reminder a person's stop leaves: which call, why, and that its outcome still comes back.
export function stopReminderInput(
  record: BackgroundCallRecord,
  stop: BackgroundCallStop,
  source: InputSourceName,
): Ordinary {
  const input = stopInputId(record, stop.operation)
  const id = digestOf(['stop-reminder', input]).slice(0, 32)
  const text = [
    `The user stopped background call ${shortCallId(record.ordinal)} (${callText(record)}).`,
    reasonText(stop.reason),
    'Its outcome arrives later as a system reminder; do not start it again unless asked.',
  ].join(' ')
  return {
    kind: 'ordinary',
    input,
    source,
    message: {
      id: `msg_${id}` as MessageId,
      role: 'system_reminder',
      blocks: [{ kind: 'text', id: `blk_${id}`, visibility: VISIBLE, text } as Block],
    },
    origin: {
      owner: STOP_EVIDENCE_OWNER,
      record: record.producer.call,
      revision: stop.operation,
      digest: `sha256:${digestOf({ producer: record.producer, operation: stop.operation })}`,
    },
  }
}
