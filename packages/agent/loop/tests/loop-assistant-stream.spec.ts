import { describe, expect, it } from 'vitest'
import { AssistantStreamAttempt, type SourceAssistantStreamFrame } from '../dist/index.js'
import { expandAssistantStream, type StreamChunk } from '@omne-harness-lite/llm/baseline'
import { SessionId, SessionSeq } from '@omne-harness-lite/session/baseline'

describe('source Loop stream settlement', () => {
  it('shares exact chunk snapshots between compact history and live frames, then settles after append', () => {
    const frames: SourceAssistantStreamFrame[] = []
    let revision = 0
    let appended = false
    const attempt = new AssistantStreamAttempt(
      SessionId('s'),
      1,
      () => ++revision,
      2,
      3,
      frame => {
        if (frame.type === 'end') expect(appended).toBe(true)
        frames.push(frame)
      },
    )
    attempt.start()
    const block = { type: 'text' as const, text: 'owned' }
    const chunk: StreamChunk = { type: 'block-end', index: 0, block }
    attempt.push(chunk)
    block.text = 'caller mutation'
    attempt.push({ type: 'finish', reason: { kind: 'stop' } })
    const live = frames.filter(frame => frame.type === 'chunk')
    expect(expandAssistantStream(attempt.stream)).toEqual(
      live.map(frame => ({ time: frame.time, chunk: frame.chunk })),
    )
    expect(attempt.blocks()).toEqual([{ type: 'text', text: 'owned' }])
    expect(attempt.ended).toBe(false)
    attempt.settle('assistant/message', () => {
      appended = true
      return SessionSeq(4)
    })
    expect(attempt.ended).toBe(true)
    expect(frames.map(frame => frame.revision)).toEqual([1, 2, 3, 4])
    expect(frames.at(-1)).toMatchObject({
      type: 'end',
      attemptId: 's:1',
      index: 2,
      outcome: { kind: 'committed', eventType: 'assistant/message', seq: 4 },
    })
  })

  it('propagates an append failure and emits abandonment without a committed outcome', () => {
    const frames: SourceAssistantStreamFrame[] = []
    const failure = new Error('source append failed')
    const attempt = new AssistantStreamAttempt(
      SessionId('s'),
      2,
      () => frames.length + 1,
      0,
      0,
      frame => frames.push(frame),
    )
    attempt.start()
    expect(() =>
      attempt.settle('assistant/attempt', () => {
        throw failure
      }),
    ).toThrow(failure)
    expect(attempt.ended).toBe(true)
    expect(frames.at(-1)).toMatchObject({ type: 'end', index: 0, outcome: { kind: 'abandoned' } })
    expect(frames.filter(frame => frame.type === 'end')).toHaveLength(1)
  })
})
