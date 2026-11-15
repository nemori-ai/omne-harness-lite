import type { JsonValue } from '@omne-harness/json-text'
import { toContentBlocks } from './content.ts'
import { isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
import {
  OUTPUT_CHECK_FAILED,
  STRUCTURED_CONTENT_MISSING,
  type CallOutcome,
  type OutputCheck,
  type OutputValidator,
  type PeerAnswer,
  type TaskHints,
} from './outcomes.ts'
import { isRequestState, isTaskId, type Generation } from './brands.ts'

export type ClassifyContext = Readonly<{
  issuedAt: Generation
  outputSchema?: JsonValue
  checkOutput: OutputValidator
}>

const INTEGER = /^-?\d+$/u

const MALFORMED: CallOutcome = { kind: 'protocolError', fault: { kind: 'result-malformed' } }

function outputCheck(structured: JsonValue | undefined, context: ClassifyContext): OutputCheck {
  if (context.outputSchema === undefined) return { kind: 'no-schema' }
  if (structured === undefined) return { kind: 'violates', reason: STRUCTURED_CONTENT_MISSING }
  try {
    return context.checkOutput(structured, context.outputSchema)
  } catch {
    return { kind: 'violates', reason: OUTPUT_CHECK_FAILED }
  }
}

function completed(result: JsonObject, context: ClassifyContext): CallOutcome {
  const items = itemsOf(member(result, 'content'))
  const isError = member(result, 'isError')
  if (items === undefined) return MALFORMED
  if (isError !== undefined && isError.kind !== 'boolean') return MALFORMED
  const content = toContentBlocks(items)
  const structured = member(result, 'structuredContent')
  const withStructured = structured === undefined ? {} : { structured }
  if (isError?.kind === 'boolean' && isError.value)
    return { kind: 'toolError', content, ...withStructured }
  return { kind: 'complete', content, ...withStructured, output: outputCheck(structured, context) }
}

function inputRequired(result: JsonObject, issuedAt: Generation): CallOutcome {
  const inputRequests = member(result, 'inputRequests')
  const stateValue = member(result, 'requestState')
  const requestState = textOf(stateValue)
  if (stateValue !== undefined && !isRequestState(requestState)) return MALFORMED
  if (inputRequests !== undefined && !isObject(inputRequests)) return MALFORMED
  if (inputRequests === undefined && requestState === undefined) return MALFORMED
  return {
    kind: 'inputRequired',
    ...(inputRequests === undefined ? {} : { inputRequests: { untrusted: inputRequests } }),
    ...(isRequestState(requestState) ? { requestState } : {}),
    issuedAt,
  }
}

const COUNT = /^\d+$/u

export function countOf(value: JsonValue | undefined): number | undefined {
  if (value?.kind !== 'number' || !COUNT.test(value.lexeme)) return undefined
  const count = Number(value.lexeme)
  return Number.isSafeInteger(count) ? count : undefined
}

export function taskHintsOf(task: JsonObject): TaskHints {
  const pollIntervalMs = countOf(member(task, 'pollIntervalMs'))
  const ttlMs = countOf(member(task, 'ttlMs'))
  const message = textOf(member(task, 'statusMessage'))
  return {
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    ...(ttlMs === undefined ? {} : { ttlMs }),
    ...(message === undefined ? {} : { statusMessage: { untrusted: message } }),
  }
}

function task(result: JsonObject, issuedAt: Generation): CallOutcome {
  const taskId = textOf(member(result, 'taskId'))
  return isTaskId(taskId) ? { kind: 'task', taskId, issuedAt, ...taskHintsOf(result) } : MALFORMED
}

function classifyResult(result: JsonValue, context: ClassifyContext): CallOutcome {
  if (!isObject(result)) return MALFORMED
  const typeValue = member(result, 'resultType')
  const resultType = typeValue === undefined ? 'complete' : textOf(typeValue)
  switch (resultType) {
    case undefined:
      return MALFORMED
    case 'complete':
      return completed(result, context)
    case 'input_required':
      return inputRequired(result, context.issuedAt)
    case 'task':
      return task(result, context.issuedAt)
    default:
      return { kind: 'protocolError', fault: { kind: 'result-type-unknown', resultType } }
  }
}

function classifyError(error: JsonValue): CallOutcome {
  const malformed: CallOutcome = { kind: 'protocolError', fault: { kind: 'error-malformed' } }
  if (!isObject(error)) return malformed
  const codeValue = member(error, 'code')
  const message = textOf(member(error, 'message'))
  const code =
    codeValue?.kind === 'number' && INTEGER.test(codeValue.lexeme)
      ? Number(codeValue.lexeme)
      : Number.NaN
  if (!Number.isSafeInteger(code) || message === undefined) return malformed
  const data = member(error, 'data')
  return {
    kind: 'protocolError',
    fault: { kind: 'peer-error', code, message, ...(data === undefined ? {} : { data }) },
  }
}

export function classifyOutcome(answer: PeerAnswer, context: ClassifyContext): CallOutcome {
  switch (answer.kind) {
    case 'result':
      return classifyResult(answer.result, context)
    case 'error':
      return classifyError(answer.error)
    case 'no-answer':
      return { kind: 'unknown', cause: answer.cause }
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}
