import type { FixedModelRequest, FixedRequestHead } from './root.ts'

export function requestHead(request: FixedModelRequest): FixedRequestHead {
  const { system: _system, messages, tools: _tools, ...head } = request
  return { ...head, messageIds: messages.map(message => message.id) }
}
