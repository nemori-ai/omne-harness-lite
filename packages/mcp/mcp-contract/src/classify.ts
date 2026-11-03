// The classification of a peer answer into a call outcome (protocol revision 2026-07-28).
import type { JsonValue } from '@omne-harness/json-text'
import { toContentBlocks } from './content.ts'
import { isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
import type { CallOutcome, OutputCheck, OutputValidator, PeerAnswer } from './outcomes.ts'
import { isRequestState, isTaskId, type Generation } from './values.ts'

export type ClassifyContext = Readonly<{
  /** The connection generation that the request was sent on. */
  issuedAt: Generation
  /** The output schema of the action, when the action declares one. */
  outputSchema?: JsonValue
  checkOutput: OutputValidator
}>

const MALFORMED: CallOutcome = { kind: 'protocolError', fault: { kind: 'result-malformed' } }

function outputCheck(structured: JsonValue | undefined, context: ClassifyContext): OutputCheck {
  if (context.outputSchema === undefined) return { kind: 'no-schema' }
  if (structured === undefined) return { kind: 'violates', reason: 'structured-content-missing' }
  return context.checkOutput(structured, context.outputSchema)
}

/** `complete`, or `toolError` when `isError` is true. Omitted content reads as no content. */
function completed(result: JsonObject, context: ClassifyContext): CallOutcome {
  const contentValue = member(result, 'content')
  const items = contentValue === undefined ? [] : itemsOf(contentValue)
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

/** At least one of `inputRequests` and `requestState` is present. */
function inputRequired(result: JsonObject, issuedAt: Generation): CallOutcome {
  const inputRequests = member(result, 'inputRequests')
  const stateValue = member(result, 'requestState')
  const requestState = textOf(stateValue)
  if (stateValue !== undefined && !isRequestState(requestState)) return MALFORMED
  if (inputRequests === undefined && requestState === undefined) return MALFORMED
  return {
    kind: 'inputRequired',
    ...(inputRequests === undefined ? {} : { inputRequests }),
    ...(isRequestState(requestState) ? { requestState } : {}),
    issuedAt,
  }
}

function task(result: JsonObject, issuedAt: Generation): CallOutcome {
  const taskId = textOf(member(result, 'taskId'))
  return isTaskId(taskId) ? { kind: 'task', taskId, issuedAt } : MALFORMED
}

function classifyResult(result: JsonValue, context: ClassifyContext): CallOutcome {
  if (!isObject(result)) return MALFORMED
  const typeValue = member(result, 'resultType')
  // A result of an earlier revision has no resultType and is complete.
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

/** A JSON-RPC error object: an integer code and a message, and data when the peer gave it. */
function classifyError(error: JsonValue): CallOutcome {
  const malformed: CallOutcome = { kind: 'protocolError', fault: { kind: 'error-malformed' } }
  if (!isObject(error)) return malformed
  const codeValue = member(error, 'code')
  const message = textOf(member(error, 'message'))
  const code = codeValue?.kind === 'number' ? Number(codeValue.lexeme) : Number.NaN
  if (!Number.isSafeInteger(code) || message === undefined) return malformed
  const data = member(error, 'data')
  return {
    kind: 'protocolError',
    fault: { kind: 'peer-error', code, message, ...(data === undefined ? {} : { data }) },
  }
}

/**
 * Classifies the answer to a sent call. A result is `complete`, `toolError`, `inputRequired` or
 * `task` by its `resultType` and `isError`; an unknown `resultType` and a malformed result or
 * error are protocol errors, as is a JSON-RPC error. No answer is `unknown`. The output validator
 * is called only when the action declares an output schema and the result carries structured
 * content.
 */
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
