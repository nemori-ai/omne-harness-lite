import { describe, expect, it } from 'vitest'
import {
  authorText,
  calendarText,
  CONTROL_WORDS,
  localText,
  nextText,
  runnableText,
  STANDING_WORDS,
  stateNote,
  unplannedText,
} from '../src/model/words.ts'
import { parseInstant } from '@omne-harness/utc-instant'
import { slotFact, type SlotRow } from '../src/model/jobs.ts'

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

  it('the next time of a schedule in effect reads as its local time, or says there is none', () => {
    const at = undefined as never
    const next = { at, local: '2026-11-30T17:00:00', calendar: null, version: null }
    expect(nextText({ control: 'active', next })).toBe('2026-11-30 17:00')
    expect(nextText({ control: 'active', next: null })).toBe('没有下一次')
  })

  it.each([
    ['draft', '还没生效', '没有下一次', '草稿还没生效，不会到点。'],
    ['paused', '恢复之前不会运行', '暂停中', '暂停中，恢复之前不会到点。'],
    ['stopped', '不会再运行', '没有下一次', '已停止，不会再到点。'],
    ['exhausted', '不会再运行', '没有下一次', '已到期，不会再到点。'],
    ['discarded', '不会再运行', '没有下一次', '已丢弃，不会再到点。'],
    ['superseded', '不会再运行', '没有下一次', '已被取代，不会再到点。'],
  ] as const)(
    'a %s schedule says what its control means: can it run %s, its next time %s, and why nothing is planned',
    (control, runnable, next, unplanned) => {
      const at = undefined as never
      const stale = { at, local: '2026-11-30T17:00:00', calendar: null, version: null }
      for (const standing of ['ready', 'blocked', 'terminallyInvalidated'] as const)
        expect(runnableText({ control, standing })).toBe(runnable)
      expect(nextText({ control, next: stale })).toBe(next)
      expect(nextText({ control, next: null })).toBe(next)
      expect(unplannedText(control)).toBe(unplanned)
    },
  )

  it('a schedule in effect says its standing as whether it can run, and has planned times', () => {
    expect(runnableText({ control: 'active', standing: 'ready' })).toBe('能按时运行')
    expect(runnableText({ control: 'active', standing: 'blocked' })).toBe('暂时受阻')
    expect(runnableText({ control: 'active', standing: 'terminallyInvalidated' })).toBe('永久失效')
    expect(unplannedText('active')).toBeUndefined()
  })

  it.each([
    ['succeeded', null, '用时 12 分钟'],
    ['failed', 'exit-1', '用时 12 分钟'],
    ['cancelled', null, '用时 12 分钟'],
    ['failed', 'interrupted', '服务停了，被中断'],
  ] as const)('a run that ended %s for %s says %s', (outcome, reason, fact) => {
    const moment = (text: string) => {
      const parsed = parseInstant(text)
      if (!parsed.ok) throw new Error(text)
      return parsed.value
    }
    const row = {
      reason: 'accepted',
      job: {
        state: 'concluded',
        outcome,
        reason,
        origin: 'due',
        startedAt: moment('2026-11-27T09:00:00Z'),
        endedAt: moment(reason === 'interrupted' ? '2026-11-30T09:00:00Z' : '2026-11-27T09:12:00Z'),
      },
    } as unknown as SlotRow
    expect(slotFact(row, 0)).toBe(fact)
  })

  it('a run not started says nothing of its time; one still running says how long it has run', () => {
    const moment = (text: string) => {
      const parsed = parseInstant(text)
      if (!parsed.ok) throw new Error(text)
      return parsed.value
    }
    const job = { state: 'accepted', outcome: null, reason: null, origin: 'due' }
    const waiting = { reason: 'accepted', job: { ...job, startedAt: null, endedAt: null } }
    expect(slotFact(waiting as unknown as SlotRow, 0)).toBe('')
    const started = moment('2026-11-27T09:00:00Z')
    const running = {
      reason: 'accepted',
      job: { ...job, state: 'running', origin: 'catchUp', startedAt: started, endedAt: null },
    }
    const now = Date.parse('2026-11-27T09:25:00Z')
    expect(slotFact(running as unknown as SlotRow, now)).toBe('补跑 · 已跑 25 分钟')
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
