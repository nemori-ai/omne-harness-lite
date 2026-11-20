import type { ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'

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

/** One upcoming time in the tenant's zone, and the calendar and version its working days came from. */
export function upcomingText(item: Upcoming): string {
  return item.calendar === null
    ? localText(item.local)
    : `${localText(item.local)}（${item.calendar}，版本 ${item.version ?? '未知'}）`
}
