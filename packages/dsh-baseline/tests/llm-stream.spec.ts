import { describe, expect, it } from 'vitest'
import {
  AssistantStreamAccumulator,
  BlockAssembler,
  ToolCallId,
  assembleAssistantStream,
  expandAssistantStream,
  joinAssistantStreamText,
  type AssistantStreamRecord,
  type StreamChunk,
  type TimedStreamChunk,
} from '../dist/llm/index.js'

describe('source LLM block assembly', () => {
  it('assembles interleaved deltas and keeps usage and finish facts', () => {
    const chunks: StreamChunk[] = [
      { type: 'reasoning-delta', index: 0, text: 'think' },
      { type: 'text-delta', index: 1, text: 'Hello' },
      { type: 'text-delta', index: 1, text: ' world' },
      { type: 'tool-call-delta', index: 2, id: ToolCallId('call-1'), name: 'echo', argumentsDelta: '{' },
      { type: 'tool-call-delta', index: 2, id: ToolCallId('call-1'), argumentsDelta: '}' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
    const assembler = new BlockAssembler()
    chunks.forEach(chunk => assembler.push(chunk))
    expect(assembler.blocks()).toEqual([
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'Hello world' },
      { type: 'tool-call', id: 'call-1', name: 'echo', arguments: '{}' },
    ])
    expect(assembler.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
    expect(assembler.finish).toEqual({ kind: 'tool-calls' })
  })

  it('uses the first close and ignores later deltas for the closed block', () => {
    const assembler = new BlockAssembler()
    assembler.push({ type: 'block-end', index: 0, block: { type: 'text', text: 'first' } })
    assembler.push({ type: 'text-delta', index: 0, text: 'ignored' })
    assembler.push({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'second' } })
    expect(assembler.blocks()).toEqual([{ type: 'text', text: 'first' }])
  })

  it('drops unsafe tool calls and aligned replay metadata on max-token finish', () => {
    const assembler = new BlockAssembler()
    assembler.push({ type: 'block-end', index: 0, block: { type: 'text', text: 'partial' } })
    assembler.push({
      type: 'block-end',
      index: 1,
      block: { type: 'tool-call', id: ToolCallId('c1'), name: 'echo', arguments: '{' },
    })
    assembler.push({
      type: 'finish',
      reason: { kind: 'max-tokens' },
      replayState: { response: { id: 'r' }, blocks: ['text', 'call'] },
    })
    expect(assembler.blocks()).toEqual([{ type: 'text', text: 'partial' }])
    expect(assembler.replayState).toEqual({ response: { id: 'r' }, blocks: ['text'] })
  })

  it('keeps only visible text and reasoning when interrupted', () => {
    const assembler = new BlockAssembler()
    assembler.push({ type: 'text-delta', index: 0, text: 'partial' })
    assembler.push({ type: 'reasoning-delta', index: 1, text: '  ' })
    assembler.push({ type: 'tool-call-delta', index: 2, id: ToolCallId('c'), name: 'read', argumentsDelta: '{}' })
    expect(assembler.interruptedBlocks()).toEqual([{ type: 'text', text: 'partial' }])
  })
})

describe('source assistant stream records', () => {
  it('compacts adjacent deltas and expands their exact timestamps and boundaries', () => {
    const input: readonly TimedStreamChunk[] = [
      { time: 1_000, chunk: { type: 'text-delta', index: 0, text: 'hel' } },
      { time: 1_006, chunk: { type: 'text-delta', index: 0, text: 'lo' } },
      { time: 1_010, chunk: { type: 'finish', reason: { kind: 'stop' } } },
    ]
    const accumulator = new AssistantStreamAccumulator()
    input.forEach(value => accumulator.push(value))
    const compact = accumulator.snapshot()
    expect(compact).toEqual([
      { type: 'text-chunks', time0: 1_000, index: 0, dt: [6], texts: ['hel', 'lo'] },
      { type: 'chunk', time: 1_010, chunk: { type: 'finish', reason: { kind: 'stop' } } },
    ])
    expect(expandAssistantStream(compact)).toEqual(input)
    expect(Object.isFrozen(compact)).toBe(true)
    expect(joinAssistantStreamText(compact)).toBe('hello')
  })

  it('validates malformed records at the durable boundary', () => {
    const malformed = [{ type: 'text-chunks', time0: 1, index: 0, dt: [1], texts: ['only'] }]
    expect(() => expandAssistantStream(malformed as readonly AssistantStreamRecord[])).toThrow(/dt length/)
  })

  it('assembles compact runs without changing assembled output', () => {
    const stream: readonly AssistantStreamRecord[] = [
      { type: 'text-chunks', time0: 1, index: 0, dt: [1], texts: ['a', 'b'] },
      { type: 'chunk', time: 3, chunk: { type: 'finish', reason: { kind: 'stop' } } },
    ]
    expect(assembleAssistantStream(stream).blocks()).toEqual([{ type: 'text', text: 'ab' }])
  })
})
