import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { Tone } from '@omne-harness/ui-kit'

type Client = ClientOf<ScheduleProtocol>
type Operations = ScheduleProtocol['operations']
export type Succeeded<K extends keyof Operations> = Extract<
  Awaited<ReturnType<Client[K]>>,
  { outcome: 'succeeded' }
>['body']
export type ScheduleCard = Succeeded<'list-schedules'>['items'][number]
export type ScheduleDetail = Succeeded<'read-schedule'>
export type Upcoming = Succeeded<'preview'>['upcoming'][number]

export const CONTROL_WORDS: Readonly<Record<ScheduleCard['control'], string>> = {
  draft: '草稿',
  active: '生效',
  paused: '暂停',
  stopped: '已停止',
  exhausted: '已到期',
  discarded: '已丢弃',
  superseded: '已被取代',
}

export const STANDING_WORDS: Readonly<Record<ScheduleCard['standing'], string>> = {
  ready: '能按时运行',
  blocked: '暂时受阻',
  terminallyInvalidated: '永久失效',
}

export function authorText(author: ScheduleCard['author']): string {
  switch (author.kind) {
    case 'human':
      return '你'
    case 'agent':
      return `agent（会话 ${author.session}）`
    case 'system':
      return '系统'
  }
}

/** A local date-time of the tenant's zone, as a person reads it: `2026-11-30 17:00`. */
export function localText(local: string): string {
  return local.replace('T', ' ').replace(/:00$/, '')
}

/** The next time as a person reads it; a schedule not in effect has none, whatever the answer carries. */
export function nextText(schedule: Pick<ScheduleCard, 'control' | 'next'>): string {
  if (schedule.control === 'paused') return '暂停中'
  if (schedule.control !== 'active' || schedule.next === null) return '没有下一次'
  return localText(schedule.next.local)
}

export function runnableText(schedule: Pick<ScheduleCard, 'control' | 'standing'>): string {
  if (schedule.control === 'active') return STANDING_WORDS[schedule.standing]
  if (schedule.control === 'draft') return '还没生效'
  if (schedule.control === 'paused') return '恢复之前不会运行'
  return '不会再运行'
}

/** Why a schedule has no planned times; one in effect has them, so nothing to say. */
export function unplannedText(control: ScheduleCard['control']): string | undefined {
  if (control === 'active') return undefined
  if (control === 'draft') return '草稿还没生效，不会到点。'
  if (control === 'paused') return '暂停中，恢复之前不会到点。'
  return `${CONTROL_WORDS[control]}，不会再到点。`
}

/** The calendar and version an upcoming time's working days came from; none when its days need no calendar. */
export function calendarText(item: Upcoming): string | undefined {
  return item.calendar === null ? undefined : `（${item.calendar}，版本 ${item.version ?? '未知'}）`
}

/** What a schedule says of itself when it is not the normal one, in effect and able to run on time: the word its
 * row and its record both write, and the tone the record gives it. */
export type StateNote = Readonly<{
  word: string
  tone: Extract<Tone, 'neutral' | 'caution' | 'danger'>
}>

export function stateNote(
  schedule: Pick<ScheduleCard, 'control' | 'standing'>,
): StateNote | undefined {
  if (schedule.control !== 'active')
    return { word: CONTROL_WORDS[schedule.control], tone: 'neutral' }
  if (schedule.standing === 'blocked') return { word: STANDING_WORDS.blocked, tone: 'caution' }
  if (schedule.standing === 'terminallyInvalidated')
    return { word: STANDING_WORDS.terminallyInvalidated, tone: 'danger' }
  return undefined
}
