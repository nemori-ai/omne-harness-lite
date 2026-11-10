import type { FixedModelRequest, FixedRequestHead } from './root.ts'

/** The head of a fixed request. The values are the request's own; nothing is copied deeply. */
export function requestHead(request: FixedModelRequest): FixedRequestHead {
  const { system: _system, messages, tools: _tools, ...head } = request
  return { ...head, messageIds: messages.map(message => message.id) }
}
