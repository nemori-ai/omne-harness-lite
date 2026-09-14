import { describe, expect, it } from 'vitest'
import {
  MessageId,
  ToolCallId,
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
  createUserMessage,
  freezeMessage,
} from '../dist/index.js'

describe('source LLM message construction', () => {
  it('publishes a detached, deeply frozen message with a fresh identity', () => {
    const input = {
      content: [{ type: 'text' as const, text: 'original' }],
      source: { kind: 'plugin' as const, plugin: 'test' },
    }

    const message = createUserMessage(input)

    expect(message.id).toEqual(expect.any(String))
    expect(message.id).not.toHaveLength(0)
    expect(message.role).toBe('user')
    expect(message).not.toBe(input)
    expect(Object.isFrozen(message)).toBe(true)
    expect(Object.isFrozen(message.content)).toBe(true)
    expect(Object.isFrozen(message.content[0])).toBe(true)
    input.content[0]!.text = 'caller mutation'
    expect(message.content).toEqual([{ type: 'text', text: 'original' }])
  })

  it('preserves existing identity and fixes specialized role/source shapes', () => {
    const id = MessageId('existing')
    const frozen = freezeMessage({
      id,
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'answer' }],
      source: { kind: 'model' as const, provider: 'p', model: 'm' },
    })
    expect(frozen.id).toBe(id)

    expect(
      createAssistantMessage({
        content: [{ type: 'text', text: 'answer' }],
        source: { provider: 'p', model: 'm', replayState: { request: 1 } },
      }),
    ).toMatchObject({ role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' } })

    expect(createSystemMessage('', 'prompt')).toMatchObject({
      role: 'system',
      content: [],
      source: { kind: 'plugin', plugin: 'prompt' },
    })
  })

  it('couples one tool result to the same call identity', () => {
    const callId = ToolCallId('call-1')
    const message = createToolResultMessage({
      callId,
      content: [{ type: 'text', text: 'result' }],
      isError: false,
    })
    expect(message).toMatchObject({
      role: 'user',
      source: { kind: 'tool', callId },
      content: [{ type: 'tool-result', toolCallId: callId, isError: false }],
    })
  })
})
