import { DECISION_REPRESENTATION } from './decision-call.ts'
import { LIVE_REPRESENTATION } from './live-call.ts'
import type { Adoption, FixedModelRequest, FixedRequestHead } from './root.ts'

export function requestHead(request: FixedModelRequest): FixedRequestHead {
  switch (request.kind) {
    case 'llm': {
      const { system: _system, messages, tools: _tools, ...head } = request
      return { ...head, messageIds: messages.map(message => message.id) }
    }
    case 'decisions': {
      const { ask: _ask, ...head } = request
      return head
    }
    case 'live': {
      const { instructions: _instructions, history, ...head } = request
      return { ...head, messageIds: history.map(message => message.id) }
    }
    default: {
      const _exhaustive: never = request
      return _exhaustive
    }
  }
}

/** The representation a request is written in: the one a chat request names, or the one of every decision or live call. */
export function requestRepresentation(request: FixedModelRequest | FixedRequestHead): Adoption {
  switch (request.kind) {
    case 'llm':
      return request.representation
    case 'decisions':
      return DECISION_REPRESENTATION
    case 'live':
      return LIVE_REPRESENTATION
    default: {
      const _exhaustive: never = request
      return _exhaustive
    }
  }
}
