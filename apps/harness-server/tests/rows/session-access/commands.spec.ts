import { describe, expect, it } from 'vitest'
import { choiceOf } from '../../../src/rows/session-access/commands.ts'

const listed = (over: Record<string, unknown> = {}) =>
  choiceOf({
    route: 'text/only',
    selectable: false,
    reasons: ['modality'],
    credential: 'available',
    ...over,
  } as never)

describe('a model offered for /model in a session', () => {
  it('stopped by blocks of the session says how many', () => {
    const blocks = [
      { message: 'm-1', block: 'b-1' },
      { message: 'm-2', block: 'b-2' },
    ]
    expect(listed({ blocks }).unavailable).toBe('读不了这段会话里的 2 块内容')
    expect(listed({ blocks, reasons: ['modality', 'locked'] }).unavailable).toBe(
      '读不了这段会话里的 2 块内容；被锁定',
    )
  })

  it('stopped by modality without blocks says the content; one that can be picked says nothing', () => {
    expect(listed().unavailable).toBe('读不了这段会话里的内容')
    expect('unavailable' in listed({ selectable: true, reasons: [] })).toBe(false)
  })
})
