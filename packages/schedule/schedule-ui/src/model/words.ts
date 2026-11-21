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

export function basisText(basis: ScheduleDetail['basis']): string {
  switch (basis.kind) {
    case 'owner':
      return '你本人的操作'
    case 'blanket':
      return basis.scope === 'standing'
        ? '你的全权同意（始终放行）'
        : '你的全权同意（只在那个会话里）'
    case 'granular':
      return '你对这一次的放行'
    case 'none':
      return '无：还没有生效'
  }
}

/** A local date-time of the tenant's zone, as a person reads it: `2026-11-30 17:00`. */
export function localText(local: string): string {
  return local.replace('T', ' ').replace(/:00$/, '')
}

/** The next time of a schedule as a person reads it, or that there is none. */
export function nextText(next: Upcoming | null): string {
  return next === null ? '没有下一次' : localText(next.local)
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
