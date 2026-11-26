import type { ChatUsage, Finish, Open, Writer } from './chat-frames.ts'

/** How the Responses and the Messages interfaces each write the steps of a reply a script gave in chat frames. */
export function responsesWriter(): Writer {
  let sequence = 0
  let model: string | undefined
  const output: object[] = []
  const event = (type: string, fields: object): string => {
    const written = JSON.stringify({ type, ...fields, sequence_number: sequence })
    sequence += 1
    return `data: ${written}\n\n`
  }
  const response = (status: string, fields: object) => ({
    id: 'gen-test-gateway',
    object: 'response',
    model,
    status,
    ...fields,
  })
  const part = (text: string) => ({ type: 'output_text', text, annotations: [], logprobs: [] })
  const idOf = (item: Open): string => `${item.kind === 'text' ? 'msg' : 'fc'}_${String(item.at)}`
  const itemOf = (item: Open, done: boolean): object => {
    const status = done ? 'completed' : 'in_progress'
    return item.kind === 'text'
      ? {
          id: idOf(item),
          type: 'message',
          status,
          role: 'assistant',
          content: done ? [part(item.text)] : [],
          phase: 'final_answer',
        }
      : {
          id: idOf(item),
          type: 'function_call',
          status,
          call_id: item.callId,
          name: item.name,
          arguments: done ? item.args : '',
        }
  }
  const itemDone = (at: number, item: object): string => {
    output.push(item)
    return event('response.output_item.done', { output_index: at, item })
  }
  return {
    start: frame => {
      model = frame.model
      return event('response.created', { response: response('in_progress', { output: [] }) })
    },
    error: ({ type: _type, ...error }) => event('error', error),
    reasoning: (at, detail) => {
      const id = detail.id ?? `rs_${String(at)}`
      const added = { id, type: 'reasoning', status: 'in_progress', summary: [] }
      return (
        event('response.output_item.added', { output_index: at, item: added }) +
        itemDone(at, {
          ...added,
          status: 'completed',
          encrypted_content: detail.data,
          format: detail.format,
        })
      )
    },
    open: item => {
      const added = event('response.output_item.added', {
        output_index: item.at,
        item: itemOf(item, false),
      })
      if (item.kind === 'call') return added
      const where = { output_index: item.at, item_id: idOf(item), content_index: 0 }
      return added + event('response.content_part.added', { ...where, part: part('') })
    },
    grow: (item, delta) =>
      item.kind === 'text'
        ? event('response.output_text.delta', {
            output_index: item.at,
            item_id: idOf(item),
            content_index: 0,
            delta,
            logprobs: [],
          })
        : event('response.function_call_arguments.delta', {
            output_index: item.at,
            item_id: idOf(item),
            delta,
          }),
    close: item => {
      const where = { output_index: item.at, item_id: idOf(item) }
      const closing =
        item.kind === 'text'
          ? event('response.output_text.done', {
              ...where,
              content_index: 0,
              text: item.text,
              logprobs: [],
            }) +
            event('response.content_part.done', {
              ...where,
              content_index: 0,
              part: part(item.text),
            })
          : event('response.function_call_arguments.done', {
              ...where,
              name: item.name,
              arguments: item.args,
            })
      return closing + itemDone(item.at, itemOf(item, true))
    },
    finish: (reason, usage) => {
      const counted = usage === undefined ? {} : { usage: responsesUsage(usage) }
      return reason === 'length'
        ? event('response.incomplete', {
            response: response('incomplete', {
              incomplete_details: { reason: 'max_output_tokens' },
              output,
              ...counted,
            }),
          })
        : event('response.completed', { response: response('completed', { output, ...counted }) })
    },
    endMarker: 'data: [DONE]\n\n',
  }
}

function responsesUsage(usage: ChatUsage): object {
  return {
    input_tokens: usage.prompt_tokens,
    input_tokens_details: { cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 },
    output_tokens: usage.completion_tokens,
    output_tokens_details: {
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    cost: usage.cost,
  }
}

const STOP_REASONS: Readonly<Record<Finish, string>> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  length: 'max_tokens',
}

export function messagesWriter(): Writer {
  const event = (type: string, fields: object = {}): string =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`
  const stop = (at: number): string => event('content_block_stop', { index: at })
  return {
    start: frame =>
      event('message_start', {
        message: {
          id: 'msg_test_gateway',
          type: 'message',
          role: 'assistant',
          content: [],
          model: frame.model,
          stop_reason: null,
          stop_sequence: null,
          usage: messagesUsage(frame.usage),
          provider: frame.provider,
        },
      }),
    error: error => event('error', { error }),
    reasoning: (at, detail) =>
      event('content_block_start', {
        index: at,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }) +
      event('content_block_delta', {
        index: at,
        delta: { type: 'signature_delta', signature: detail.data },
      }) +
      stop(at),
    open: item =>
      event('content_block_start', {
        index: item.at,
        content_block:
          item.kind === 'text'
            ? { type: 'text', text: '', citations: [] }
            : { type: 'tool_use', id: item.callId, name: item.name, input: {} },
      }),
    grow: (item, piece) =>
      event('content_block_delta', {
        index: item.at,
        delta:
          item.kind === 'text'
            ? { type: 'text_delta', text: piece }
            : { type: 'input_json_delta', partial_json: piece },
      }),
    close: item => stop(item.at),
    finish: (reason, usage) =>
      event('message_delta', {
        delta: { stop_reason: STOP_REASONS[reason], stop_sequence: null },
        usage: messagesUsage(usage),
      }) + event('message_stop'),
    endMarker: '',
  }
}

function messagesUsage(usage: ChatUsage | undefined): object {
  if (usage === undefined) return {}
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
  return {
    input_tokens: usage.prompt_tokens === undefined ? undefined : usage.prompt_tokens - cached,
    cache_read_input_tokens: cached,
    output_tokens: usage.completion_tokens,
    output_tokens_details: {
      thinking_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    cost: usage.cost,
  }
}
