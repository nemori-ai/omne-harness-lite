import { readFileSync } from 'node:fs'
import type { PiProtocolFrame } from '../../src/index.ts'
import type { ResponsesRecord } from '../../src/responses/index.ts'
import { ROUTE } from './chat-record.ts'
import { frame } from './messages-record.ts'

export const ITEMS_FORMAT = 'lab-items-v1'

export function responsesRecord(overrides: Partial<ResponsesRecord> = {}): ResponsesRecord {
  return {
    name: 'model-r',
    revision: '1',
    route: ROUTE,
    status: 'current',
    engine: 'responses',
    serving: { order: ['lab'], reports: ['Lab'] },
    wire: {
      system: 'developer',
      cache: { kind: 'none' },
      image: { mediaTypes: ['image/png'] },
      reasoning: { summary: null },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    },
    parameters: {
      temperature: { support: 'unsupported' },
      'top-p': { support: 'unsupported' },
      'max-output-tokens': {
        support: 'supported',
        default: { kind: 'absent' },
        accept: { max: '4096' },
        wire: { field: 'max_tokens' },
      },
      stop: { support: 'unsupported' },
      'reasoning-effort': {
        support: 'supported',
        default: { kind: 'absent' },
        accept: {},
        wire: {
          none: 'unsupported',
          low: { field: 'reasoning.effort', value: 'low' },
          medium: { field: 'reasoning.effort', value: 'medium' },
          high: { field: 'reasoning.effort', value: 'high' },
          max: { field: 'reasoning.effort', value: 'xhigh' },
        },
      },
      seed: { support: 'unsupported' },
      'frequency-penalty': { support: 'unsupported' },
      'presence-penalty': { support: 'unsupported' },
    },
    extensions: [],
    accepts: { forcedToolChoice: false, endsWithAssistant: false },
    replay: {
      declaration: {},
      formats: { produces: ITEMS_FORMAT, accepts: [ITEMS_FORMAT] },
      binding: 'none',
    },
    ...overrides,
  }
}

/** The frames of a recorded event stream, in order, its end marker included. */
export function responsesFramesOf(fixture: string): readonly PiProtocolFrame[] {
  const text = readFileSync(new URL(`../fixtures/responses/${fixture}`, import.meta.url), 'utf8')
  return text
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
    .map(data =>
      data === '[DONE]' ? ({ kind: 'end-marker' } as const) : frame(JSON.parse(data) as unknown),
    )
}

/** The output items a recorded stream ends with, as plain JSON. */
export function outputOf(fixture: string): readonly Readonly<Record<string, unknown>>[] {
  const text = readFileSync(new URL(`../fixtures/responses/${fixture}`, import.meta.url), 'utf8')
  const completed = text
    .split('\n')
    .filter(line => line.startsWith('data:') && line.includes('"response.completed"'))
    .map(line => JSON.parse(line.slice('data:'.length).trim()) as { response: { output: [] } })
  const [last] = completed
  if (last === undefined) throw new Error(`fixture ${fixture} has no completed event`)
  return last.response.output
}

/** The frames of one response, written for a case. */
export const stream = {
  created: frame({ type: 'response.created', response: { status: 'in_progress' } }),
  added: (at: number, item: object) =>
    frame({ type: 'response.output_item.added', output_index: at, item }),
  done: (at: number, item: object) =>
    frame({ type: 'response.output_item.done', output_index: at, item }),
  partAdded: (at: number, part = 0, text = '') =>
    frame({
      type: 'response.content_part.added',
      output_index: at,
      content_index: part,
      part: { type: 'output_text', text, annotations: [] },
    }),
  textDelta: (at: number, delta: string, part = 0) =>
    frame({ type: 'response.output_text.delta', output_index: at, content_index: part, delta }),
  textDone: (at: number, part = 0) =>
    frame({ type: 'response.output_text.done', output_index: at, content_index: part, text: '' }),
  partDone: (at: number, part = 0) =>
    frame({ type: 'response.content_part.done', output_index: at, content_index: part }),
  argumentsDelta: (at: number, delta: string) =>
    frame({ type: 'response.function_call_arguments.delta', output_index: at, delta }),
  summaryDelta: (at: number, summary: number, delta: string) =>
    frame({
      type: 'response.reasoning_summary_text.delta',
      output_index: at,
      summary_index: summary,
      delta,
    }),
  summaryDone: (at: number, summary: number, text: string) =>
    frame({
      type: 'response.reasoning_summary_text.done',
      output_index: at,
      summary_index: summary,
      text,
    }),
  completed: (usage: object = { input_tokens: 7, output_tokens: 5 }) =>
    frame({ type: 'response.completed', response: { status: 'completed', usage } }),
  incomplete: (reason: string | null, usage: object = { output_tokens: 5 }) =>
    frame({
      type: 'response.incomplete',
      response: { status: 'incomplete', incomplete_details: { reason }, usage },
    }),
}

/** A message item with one text part, from its start to its end. */
export function messageItem(
  at: number,
  id: string,
  text: string,
  phase: string | null = null,
): readonly PiProtocolFrame[] {
  const shell = { id, type: 'message', role: 'assistant', ...(phase === null ? {} : { phase }) }
  return [
    stream.added(at, { ...shell, status: 'in_progress', content: [] }),
    stream.partAdded(at),
    stream.textDelta(at, text),
    stream.textDone(at),
    stream.partDone(at),
    stream.done(at, {
      ...shell,
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    }),
  ]
}

/** A function call item with its arguments in one delta. */
export function callItem(
  at: number,
  id: string,
  callId: string,
  args: string,
  name = 'lookup',
): readonly PiProtocolFrame[] {
  const shell = { id, type: 'function_call', call_id: callId, name }
  return [
    stream.added(at, { ...shell, status: 'in_progress', arguments: '' }),
    stream.argumentsDelta(at, args),
    frame({ type: 'response.function_call_arguments.done', output_index: at, arguments: args }),
    stream.done(at, { ...shell, status: 'completed', arguments: args }),
  ]
}

/** A reasoning item, with a summary part for each text given. */
export function reasoningItem(
  at: number,
  id: string,
  summaries: readonly string[] = [],
): readonly PiProtocolFrame[] {
  const summary = summaries.map(text => ({ type: 'summary_text', text }))
  return [
    stream.added(at, { id, type: 'reasoning', status: 'in_progress', summary: [] }),
    ...summaries.flatMap((text, index) => [
      stream.summaryDelta(at, index, text),
      stream.summaryDone(at, index, text),
    ]),
    stream.done(at, {
      id,
      type: 'reasoning',
      status: 'completed',
      summary,
      encrypted_content: `cipher-${id}`,
      format: 'lab-v1',
    }),
  ]
}
