import { describe, expect, it } from 'vitest'
import {
  authorText,
  CONTROL_WORDS,
  localText,
  STANDING_WORDS,
  upcomingText,
} from '../src/model/words.ts'

describe('the words a person reads for a schedule', () => {
  it('every control and every standing has its own word', () => {
    expect(CONTROL_WORDS).toEqual({
      draft: '草稿',
      active: '生效',
      paused: '暂停',
      stopped: '已停止',
      exhausted: '已到期',
      discarded: '已丢弃',
      superseded: '已被取代',
    })
    expect(STANDING_WORDS).toEqual({
      ready: '能按时运行',
      blocked: '暂时受阻',
      terminallyInvalidated: '永久失效',
    })
  })

  it.each([
    [{ kind: 'human' }, '你'],
    [{ kind: 'agent', session: 'ses_1' }, 'agent（会话 ses_1）'],
    [{ kind: 'system' }, '系统'],
  ] as const)('the author %o reads as %s', (author, text) => {
    expect(authorText(author)).toBe(text)
  })

  it.each([
    ['2026-11-30T17:00:00', '2026-11-30 17:00'],
    ['2026-11-30T09:00:30', '2026-11-30 09:00:30'],
    ['2026-11-30T09:30:00', '2026-11-30 09:30'],
  ])('the local time %s reads as %s; only whole-minute seconds are dropped', (local, text) => {
    expect(localText(local)).toBe(text)
  })

  it('an upcoming time names its calendar and version, or neither when its days need no calendar', () => {
    const at = undefined as never
    expect(
      upcomingText({
        at,
        local: '2026-11-30T17:00:00',
        calendar: 'cn-legal-holidays',
        version: null,
      }),
    ).toBe('2026-11-30 17:00（cn-legal-holidays，版本 未知）')
    expect(upcomingText({ at, local: '2026-11-30T17:00:00', calendar: null, version: null })).toBe(
      '2026-11-30 17:00',
    )
  })
})
