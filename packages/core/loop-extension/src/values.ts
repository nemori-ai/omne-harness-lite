import {
  contentBlockFromRepresentation,
  type JsonValue,
  type ToolCallBlock,
  type ToolResultBlock,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, type OpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { brandMessage, brandRecord, type Wire } from '@omne-harness-lite/messages'
import type {
  Conclusion,
  ExtensionInput,
  ExtensionOutput,
  ModelRetryConclusion,
  PositionedSubject,
  Subject,
} from './types.ts'
import { validate } from './schema.ts'
import { object } from './json.ts'

function identifier<B extends string>(value: string, brand: B): OpaqueIdentifier<B> {
  const parsed = parseOpaqueIdentifier(value, brand)
  if (!('ok' in parsed)) throw new Error('admitted loop identity failed branding')
  return parsed.ok
}
function toolCall(value: unknown): ToolCallBlock {
  const block = contentBlockFromRepresentation(value)
  if (block.kind !== 'tool_call' || !block.complete)
    throw new Error('admitted action has no complete call')
  return block
}
function toolResult(value: unknown): ToolResultBlock {
  const block = contentBlockFromRepresentation(value)
  if (block.kind !== 'tool_result') throw new Error('admitted action has no result')
  return block
}
function subject(value: Wire<Subject>): Subject {
  if ('message' in value) return Object.freeze({ ...value, message: brandMessage(value.message) })
  if ('compaction' in value) {
    const compaction = brandMessage(value.compaction)
    if (compaction.type !== 'compaction') throw new Error('admitted compaction has another type')
    return Object.freeze({ compaction })
  }
  if ('request' in value)
    return Object.freeze({
      request: Object.freeze({
        ...value.request,
        messages: Object.freeze(value.request.messages.map(brandMessage)),
      }),
    })
  if ('reply' in value) {
    const reply = brandMessage(value.reply)
    if (reply.type !== 'assistant') throw new Error('admitted reply has another type')
    return Object.freeze({ ...value, reply })
  }
  if ('dispatches' in value) {
    const restore = (item: Wire<(typeof value.dispatches)[number]>) => {
      const record = brandRecord(item)
      if (record.kind !== 'model_call_dispatched')
        throw new Error('admitted failure has another record kind')
      return record
    }
    return Object.freeze({
      ...value,
      dispatches: Object.freeze([
        restore(value.dispatches[0]),
        ...value.dispatches.slice(1).map(restore),
      ] as const),
      retryConclusions: Object.freeze(value.retryConclusions.map(retryConclusion)),
    })
  }
  if ('call' in value)
    return Object.freeze({
      ...value,
      call: toolCall(value.call),
      batch: Object.freeze([
        identifier(value.batch[0], 'CallId'),
        ...value.batch.slice(1).map(item => identifier(item, 'CallId')),
      ] as const),
    })
  if ('callId' in value) {
    const { result, ...rest } = value
    return Object.freeze({
      ...rest,
      callId: identifier(value.callId, 'CallId'),
      ...(result === undefined ? {} : { result: toolResult(result) }),
    })
  }
  if ('outcomes' in value) {
    const restore = (item: (typeof value.outcomes)[number]) =>
      Object.freeze({ ...item, callId: identifier(item.callId, 'CallId') })
    return Object.freeze({
      outcomes: Object.freeze([
        restore(value.outcomes[0]),
        ...value.outcomes.slice(1).map(restore),
      ] as const),
    })
  }
  return value
}
function positioned(value: Wire<PositionedSubject>): PositionedSubject {
  const restored = subject(value.subject)
  // The frozen selectors already establish the correspondence. These structural
  // checks narrow the constructed domain union without asserting a raw value.
  switch (value.position) {
    case 'attempt_started':
      if ('attempt' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'before_persist_message':
      if ('producer' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'after_persist_message':
      if ('message' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'before_compaction':
      if ('plan' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'after_compaction':
      if ('compaction' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'before_model_call':
      if ('request' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'after_model_call':
      if (value.dimension.ending === 'complete_reply' && 'reply' in restored)
        return Object.freeze({
          ...value,
          dimension: Object.freeze({ ending: 'complete_reply' as const }),
          subject: restored,
        })
      if (value.dimension.ending === 'failure' && 'failure' in restored)
        return Object.freeze({
          ...value,
          dimension: Object.freeze({ ending: 'failure' as const }),
          subject: restored,
        })
      break
    case 'before_action':
      if ('call' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'after_action':
      if (value.dimension.scope === 'each' && 'callId' in restored)
        return Object.freeze({
          ...value,
          dimension: Object.freeze({ scope: 'each' as const }),
          subject: restored,
        })
      if (value.dimension.scope === 'batch' && 'outcomes' in restored)
        return Object.freeze({
          ...value,
          dimension: Object.freeze({ scope: 'batch' as const }),
          subject: restored,
        })
      break
    case 'before_terminal':
      if ('proposed' in restored) return Object.freeze({ ...value, subject: restored })
      break
    case 'after_terminal':
      if ('terminal' in restored) return Object.freeze({ ...value, subject: restored })
      break
  }
  throw new Error('admitted loop subject does not match its position')
}
/** This conversion follows judgment of the position, dimension, and selected subject. */
export function positionedFromRepresentation(value: JsonValue): PositionedSubject {
  if (!object(value) || !object(value.subject) || !validate('Subject', value.subject).valid)
    throw new Error('admitted positioned subject failed Schema narrowing')
  if (!isWirePositioned(value))
    throw new Error('admitted positioned subject failed position narrowing')
  return positioned(value)
}
function isWirePositioned(value: JsonValue): value is JsonValue & Wire<PositionedSubject> {
  if (!object(value) || !object(value.subject) || !validate('Subject', value.subject).valid)
    return false
  switch (value.position) {
    case 'after_model_call':
      return (
        object(value.dimension) &&
        (value.dimension.ending === 'failure' || value.dimension.ending === 'complete_reply')
      )
    case 'after_action':
      return (
        object(value.dimension) &&
        (value.dimension.scope === 'each' || value.dimension.scope === 'batch')
      )
    case 'attempt_started':
    case 'before_persist_message':
    case 'after_persist_message':
    case 'before_compaction':
    case 'after_compaction':
    case 'before_model_call':
    case 'before_action':
    case 'before_terminal':
    case 'after_terminal':
      return !Object.hasOwn(value, 'dimension')
    default:
      return false
  }
}
function output(value: Wire<ExtensionOutput>): ExtensionOutput {
  switch (value.kind) {
    case 'rewrite':
      return Object.freeze({ kind: 'rewrite', subject: subject(value.subject) })
    case 'inject': {
      const message = brandMessage(value.message)
      if (message.type !== 'system_reminder') throw new Error('admitted inject has another type')
      return Object.freeze({ kind: 'inject', message })
    }
    case 'ask': {
      const { callId, ...about } = value.card.about
      return Object.freeze({
        ...value,
        card: Object.freeze({
          ...value.card,
          about: Object.freeze({
            ...about,
            ...(callId === undefined ? {} : { callId: identifier(callId, 'CallId') }),
          }),
        }),
      })
    }
    default:
      return value
  }
}
function isWireConclusion(value: JsonValue): value is JsonValue & Wire<Conclusion> {
  return validate('Conclusion', value).valid
}
type IdentityOf<T> = T extends unknown
  ? Pick<T, Extract<keyof T, 'position' | 'dimension' | 'callId' | 'modelCallId'>>
  : never
type ConclusionIdentity = IdentityOf<Conclusion>
function actionIdentity(value: Wire<Conclusion>): ConclusionIdentity {
  switch (value.position) {
    case 'before_action':
      return Object.freeze({ position: value.position, callId: identifier(value.callId, 'CallId') })
    case 'after_action':
      if (value.dimension.scope === 'each') {
        if (value.callId === undefined) throw new Error('admitted action conclusion lacks callId')
        return Object.freeze({
          position: value.position,
          dimension: Object.freeze({ scope: 'each' as const }),
          callId: identifier(value.callId, 'CallId'),
        })
      }
      return Object.freeze({
        position: value.position,
        dimension: Object.freeze({ scope: 'batch' as const }),
      })
    case 'after_model_call':
      if (value.dimension.ending === 'failure') {
        if (typeof value.modelCallId !== 'string')
          throw new Error('admitted failure conclusion lacks modelCallId')
        return Object.freeze({
          position: value.position,
          dimension: Object.freeze({ ending: 'failure' as const }),
          modelCallId: identifier(value.modelCallId, 'ModelCallId'),
        })
      }
      return Object.freeze({
        position: value.position,
        dimension: Object.freeze({ ending: 'complete_reply' as const }),
      })
    default:
      return Object.freeze({ position: value.position })
  }
}
function conclusion(value: Wire<Conclusion>): Conclusion {
  const base = {
    ...actionIdentity(value),
    extension: value.extension,
    power: value.power,
    at: value.at,
  }
  if (value.skipped === 'unavailable')
    return Object.freeze({
      ...base,
      skipped: 'unavailable' as const,
      unavailability: value.unavailability,
    })
  const restored = output(value.output)
  if (value.skipped === 'errored') {
    if (restored.kind === 'stop' && restored.terminal === 'failed')
      return Object.freeze({
        ...base,
        skipped: 'errored' as const,
        error: value.error,
        output: Object.freeze({ ...restored, terminal: 'failed' as const }),
      })
    if (restored.kind !== 'observed' && restored.kind !== 'inject' && restored.kind !== 'veto')
      throw new Error('admitted errored output is not recordable')
    return Object.freeze({
      ...base,
      skipped: 'errored' as const,
      error: value.error,
      output: restored,
    })
  }
  return Object.freeze({ ...base, output: restored })
}
function retryConclusion(value: Wire<ModelRetryConclusion>): ModelRetryConclusion {
  const restored = conclusion(value)
  if (
    restored.position !== 'after_model_call' ||
    restored.dimension.ending !== 'failure' ||
    typeof restored.modelCallId !== 'string' ||
    !('output' in restored) ||
    restored.output.kind !== 'retry' ||
    'skipped' in restored
  )
    throw new Error('admitted retry conclusion is not effective')
  return Object.freeze({
    ...restored,
    position: 'after_model_call' as const,
    dimension: Object.freeze({ ending: 'failure' as const }),
    modelCallId: restored.modelCallId,
    output: restored.output,
  })
}
export function inputFromRepresentation(value: JsonValue): ExtensionInput {
  if (!isWireInput(value)) throw new Error('admitted loop input failed Schema narrowing')
  const wire: Wire<ExtensionInput> = value
  const frame = positioned(wire)
  const common = {
    log: identifier(wire.log, 'LogHandle'),
    environment: identifier(wire.environment, 'EnvironmentHandle'),
    earlier: Object.freeze(wire.earlier.map(conclusion)),
  }
  if (frame.position === 'before_persist_message') return Object.freeze({ ...frame, ...common })
  if (wire.position === 'before_persist_message')
    throw new Error('admitted input position mismatch')
  return Object.freeze({ ...frame, ...common, run: wire.run, attempt: wire.attempt })
}
function isWireInput(value: JsonValue): value is JsonValue & Wire<ExtensionInput> {
  return validate('ExtensionInput', value).valid
}
export function outputFromRepresentation(value: JsonValue): ExtensionOutput {
  if (!isWireOutput(value)) throw new Error('admitted loop output failed Schema narrowing')
  const wire: Wire<ExtensionOutput> = value
  return output(wire)
}
function isWireOutput(value: JsonValue): value is JsonValue & Wire<ExtensionOutput> {
  return validate('ExtensionOutput', value).valid
}
export function conclusionFromRepresentation(value: JsonValue): Conclusion {
  if (!isWireConclusion(value)) throw new Error('admitted conclusion failed Schema narrowing')
  const wire: Wire<Conclusion> = value
  return conclusion(wire)
}
