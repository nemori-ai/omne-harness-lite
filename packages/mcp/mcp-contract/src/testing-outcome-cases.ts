// The exhaustive sample table of `classifyOutcome` (protocol revision 2026-07-28). Each case
// gives the peer answer, the output schema of the action, what the injected output validator
// answers, and the outcome that the classification must give. Content is converted by
// `toContentBlocks`, whose own rules are checked apart.
import { toContentBlocks } from './content.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type { CallOutcome, OutputCheck, PeerAnswer } from './outcomes.ts'
import { generationOf, jsonOf, jsonTextOf, requestStateOf, taskIdOf } from './testing-values.ts'
import type { Generation } from './brands.ts'

export type ClassifyOutcomeCase = Readonly<{
  name: string
  answer: PeerAnswer
  issuedAt: Generation
  outputSchema?: JsonValue
  /** What the injected validator answers. Absent: the classification must not call it. */
  validatorAnswer?: OutputCheck
  expected: CallOutcome
}>

const issuedAt = generationOf(7)
const text = [{ type: 'text', text: 'done' }]
const content = toContentBlocks(text.map(jsonOf))
const schema = jsonOf({ type: 'object', required: ['count'] })

function result(value: unknown): PeerAnswer {
  return { kind: 'result', result: jsonOf(value) }
}

function error(value: unknown): PeerAnswer {
  return { kind: 'error', error: jsonOf(value) }
}

const malformed: CallOutcome = { kind: 'protocolError', fault: { kind: 'result-malformed' } }
const errorMalformed: CallOutcome = { kind: 'protocolError', fault: { kind: 'error-malformed' } }

function peerError(code: number, message: string, data?: unknown): CallOutcome {
  return {
    kind: 'protocolError',
    fault: {
      kind: 'peer-error',
      code,
      message,
      ...(data === undefined ? {} : { data: jsonOf(data) }),
    },
  }
}

const completeCases: readonly ClassifyOutcomeCase[] = [
  {
    name: 'complete: content and no output schema',
    answer: result({ resultType: 'complete', content: text }),
    issuedAt,
    expected: { kind: 'complete', content, output: { kind: 'no-schema' } },
  },
  {
    name: 'complete: a result without resultType from an earlier revision',
    answer: result({ content: text }),
    issuedAt,
    expected: { kind: 'complete', content, output: { kind: 'no-schema' } },
  },
  {
    name: 'complete: isError false is a complete result',
    answer: result({ resultType: 'complete', isError: false, content: text }),
    issuedAt,
    expected: { kind: 'complete', content, output: { kind: 'no-schema' } },
  },
  {
    name: 'complete: structured content conforms to the output schema',
    answer: result({ resultType: 'complete', content: [], structuredContent: { count: 2 } }),
    issuedAt,
    outputSchema: schema,
    validatorAnswer: { kind: 'conforms' },
    expected: {
      kind: 'complete',
      content: [],
      structured: jsonOf({ count: 2 }),
      output: { kind: 'conforms' },
    },
  },
  {
    name: 'complete: structured content violates the output schema',
    answer: result({ resultType: 'complete', content: [], structuredContent: { total: 2 } }),
    issuedAt,
    outputSchema: schema,
    validatorAnswer: { kind: 'violates', reason: 'count is required' },
    expected: {
      kind: 'complete',
      content: [],
      structured: jsonOf({ total: 2 }),
      output: { kind: 'violates', reason: 'count is required' },
    },
  },
  {
    name: 'complete: an output schema but no structured content violates it',
    answer: result({ resultType: 'complete', content: text }),
    issuedAt,
    outputSchema: schema,
    expected: {
      kind: 'complete',
      content,
      output: { kind: 'violates', reason: 'structured-content-missing' },
    },
  },
  {
    name: 'complete: structured content without an output schema is kept unchecked',
    answer: result({ resultType: 'complete', content: [], structuredContent: [1, 'a'] }),
    issuedAt,
    expected: {
      kind: 'complete',
      content: [],
      structured: jsonOf([1, 'a']),
      output: { kind: 'no-schema' },
    },
  },
  {
    name: 'toolError: isError true is the failure of the action, not of the protocol',
    answer: result({ resultType: 'complete', isError: true, content: text }),
    issuedAt,
    outputSchema: schema,
    expected: { kind: 'toolError', content },
  },
  {
    name: 'toolError: isError true without resultType keeps the structured content',
    answer: result({ isError: true, content: text, structuredContent: { code: 'E1' } }),
    issuedAt,
    expected: { kind: 'toolError', content, structured: jsonOf({ code: 'E1' }) },
  },
]

const interimCases: readonly ClassifyOutcomeCase[] = [
  {
    name: 'inputRequired: input requests and request state',
    answer: result({
      resultType: 'input_required',
      inputRequests: { ask: { method: 'elicitation/create' } },
      requestState: 'opaque-1',
    }),
    issuedAt,
    expected: {
      kind: 'inputRequired',
      inputRequests: { untrusted: jsonOf({ ask: { method: 'elicitation/create' } }) },
      requestState: requestStateOf('opaque-1'),
      issuedAt,
    },
  },
  {
    name: 'inputRequired: request state only',
    answer: result({ resultType: 'input_required', requestState: 'opaque-2' }),
    issuedAt,
    expected: { kind: 'inputRequired', requestState: requestStateOf('opaque-2'), issuedAt },
  },
  {
    name: 'inputRequired: input requests only',
    answer: result({ resultType: 'input_required', inputRequests: {} }),
    issuedAt,
    expected: { kind: 'inputRequired', inputRequests: { untrusted: jsonOf({}) }, issuedAt },
  },
  {
    name: 'inputRequired: an empty request state is opaque peer text, not a defect',
    answer: result({ resultType: 'input_required', requestState: '' }),
    issuedAt,
    expected: { kind: 'inputRequired', requestState: requestStateOf(''), issuedAt },
  },
  {
    name: 'task: a task handle carries the task id and the generation it was issued on',
    answer: result({ resultType: 'task', taskId: 'task-9', status: 'working' }),
    issuedAt,
    expected: { kind: 'task', taskId: taskIdOf('task-9'), issuedAt },
  },
  {
    name: 'task: the poll interval, the ttl and the status message come along, the message untrusted',
    answer: result({
      resultType: 'task',
      taskId: 'task-9',
      status: 'working',
      statusMessage: 'queued',
      ttlMs: 60000,
      pollIntervalMs: 5000,
      createdAt: '2026-07-28T00:00:00Z',
    }),
    issuedAt,
    expected: {
      kind: 'task',
      taskId: taskIdOf('task-9'),
      issuedAt,
      pollIntervalMs: 5000,
      ttlMs: 60000,
      statusMessage: { untrusted: 'queued' },
    },
  },
  {
    name: 'task: a null ttl means unlimited and is left out, as is a hint that is not a number',
    answer: result({
      resultType: 'task',
      taskId: 'task-9',
      status: 'working',
      ttlMs: null,
      pollIntervalMs: 'soon',
      statusMessage: 5,
    }),
    issuedAt,
    expected: { kind: 'task', taskId: taskIdOf('task-9'), issuedAt },
  },
]

const faultCases: readonly ClassifyOutcomeCase[] = [
  {
    name: 'protocolError: an unknown resultType is not guessed',
    answer: result({ resultType: 'stream', content: text }),
    issuedAt,
    expected: {
      kind: 'protocolError',
      fault: { kind: 'result-type-unknown', resultType: 'stream' },
    },
  },
  {
    name: 'protocolError: a resultType that is not text',
    answer: result({ resultType: 1 }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: a result that is not an object',
    answer: result([]),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: content that is not a list',
    answer: result({ resultType: 'complete', content: 'done' }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: isError that is not a boolean',
    answer: result({ resultType: 'complete', isError: 'true', content: [] }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: input required with neither input requests nor request state',
    answer: result({ resultType: 'input_required' }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: a complete result without content',
    answer: result({ resultType: 'complete', structuredContent: { count: 1 } }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: input requests that are not an object',
    answer: result({ resultType: 'input_required', inputRequests: 5, requestState: 's' }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: a task handle without a task id',
    answer: result({ resultType: 'task', status: 'working' }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: JSON-RPC error -32602 invalid params',
    answer: error({ code: -32602, message: 'Invalid params' }),
    issuedAt,
    expected: peerError(-32602, 'Invalid params'),
  },
  {
    name: 'protocolError: JSON-RPC error -32603 internal error keeps its data',
    answer: error({ code: -32603, message: 'Internal error', data: { trace: 'x' } }),
    issuedAt,
    expected: peerError(-32603, 'Internal error', { trace: 'x' }),
  },
  {
    name: 'protocolError: JSON-RPC error -32601 method not found',
    answer: error({ code: -32601, message: 'Method not found' }),
    issuedAt,
    expected: peerError(-32601, 'Method not found'),
  },
  {
    name: 'protocolError: JSON-RPC error -32022 unsupported protocol version',
    answer: error({ code: -32022, message: 'Unsupported protocol version' }),
    issuedAt,
    expected: peerError(-32022, 'Unsupported protocol version'),
  },
  {
    name: 'protocolError: an implementation-defined JSON-RPC error code -32000',
    answer: error({ code: -32000, message: 'Server error' }),
    issuedAt,
    expected: peerError(-32000, 'Server error'),
  },
  {
    name: 'protocolError: an error that is not an object',
    answer: error('boom'),
    issuedAt,
    expected: errorMalformed,
  },
  {
    name: 'protocolError: an error without a code',
    answer: error({ message: 'no code' }),
    issuedAt,
    expected: errorMalformed,
  },
  {
    name: 'protocolError: an error code that is not an integer',
    answer: error({ code: -32600.5, message: 'odd' }),
    issuedAt,
    expected: errorMalformed,
  },
  {
    name: 'protocolError: an error code with a fraction written in its lexeme',
    answer: { kind: 'error', error: jsonTextOf('{"code":-32600.0,"message":"m"}') },
    issuedAt,
    expected: errorMalformed,
  },
  {
    name: 'protocolError: an error code written with an exponent',
    answer: { kind: 'error', error: jsonTextOf('{"code":-3e4,"message":"m"}') },
    issuedAt,
    expected: errorMalformed,
  },
  {
    name: 'protocolError: input required with a request state that is not text',
    answer: result({ resultType: 'input_required', requestState: 7 }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: a task id that is not text',
    answer: result({ resultType: 'task', taskId: 9 }),
    issuedAt,
    expected: malformed,
  },
  {
    name: 'protocolError: an error without a message',
    answer: error({ code: -32600 }),
    issuedAt,
    expected: errorMalformed,
  },
]

const noAnswerCases: readonly ClassifyOutcomeCase[] = (
  ['stream-broken', 'process-exited', 'abandoned'] as const
).map(cause => ({
  name: `unknown: sent without an answer (${cause})`,
  answer: { kind: 'no-answer', cause },
  issuedAt,
  expected: { kind: 'unknown', cause },
}))

export const classifyOutcomeCases: readonly ClassifyOutcomeCase[] = [
  ...completeCases,
  ...interimCases,
  ...faultCases,
  ...noAnswerCases,
]
