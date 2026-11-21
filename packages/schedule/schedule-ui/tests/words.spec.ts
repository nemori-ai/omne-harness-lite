import { describe, expect, it } from 'vitest'
import {
  authorText,
  calendarText,
  CONTROL_WORDS,
  localText,
  nextText,
  STANDING_WORDS,
  stateNote,
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

  it('the next time reads as its local time, or says there is none', () => {
    const at = undefined as never
    expect(nextText({ at, local: '2026-11-30T17:00:00', calendar: null, version: null })).toBe(
      '2026-11-30 17:00',
    )
    expect(nextText(null)).toBe('没有下一次')
  })

  it('an upcoming time names its calendar and version, or neither when its days need no calendar', () => {
    const at = undefined as never
    expect(
      calendarText({
        at,
        local: '2026-11-30T17:00:00',
        calendar: 'cn-legal-holidays',
        version: null,
      }),
    ).toBe('（cn-legal-holidays，版本 未知）')
    expect(
      calendarText({ at, local: '2026-11-30T17:00:00', calendar: null, version: null }),
    ).toBeUndefined()
  })

  it.each([
    [{ control: 'active', standing: 'ready' }, undefined],
    [
      { control: 'active', standing: 'blocked' },
      { word: '暂时受阻', tone: 'caution' },
    ],
    [
      { control: 'active', standing: 'terminallyInvalidated' },
      { word: '永久失效', tone: 'danger' },
    ],
    [
      { control: 'draft', standing: 'ready' },
      { word: '草稿', tone: 'neutral' },
    ],
    [
      { control: 'paused', standing: 'blocked' },
      { word: '暂停', tone: 'neutral' },
    ],
    [
      { control: 'stopped', standing: 'terminallyInvalidated' },
      { word: '已停止', tone: 'neutral' },
    ],
  ] as const)('a schedule %o is noted as %o', (state, note) => {
    expect(stateNote(state)).toEqual(note)
  })
})
