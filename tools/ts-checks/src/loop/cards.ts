// 卡片台账：一张故事卡的三个时间点，一行一条 JSON，只追加。
// proposed：卡被提出；runnable：主路径第一次能照演示脚本跑；accepted：负责人接受。
// 同一张卡同一个事件只记一次，后两个不早于 proposed；要更正只能手工改文件。
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { CARD_ID } from '../product/stories.ts'

export const CARD_EVENTS = ['proposed', 'runnable', 'accepted'] as const
export type CardEvent = (typeof CARD_EVENTS)[number]

export const EVENT_WORDS: Readonly<Record<CardEvent, string>> = {
  proposed: '提出',
  runnable: '第一次能跑',
  accepted: '接受',
}

export interface CardEntry {
  readonly schema: 1
  readonly card: string
  readonly event: CardEvent
  /** 事件发生的时间（ISO，UTC）。 */
  readonly at: string
  readonly commit: string
  readonly branch: string
  /** 登记的时间；补记时晚于 `at`。 */
  readonly recordedAt: string
}

export interface CardsRead {
  readonly entries: readonly CardEntry[]
  /** 读不了的行号（1 起）。 */
  readonly badLines: readonly number[]
}

const isEvent = (value: unknown): value is CardEvent =>
  (CARD_EVENTS as readonly unknown[]).includes(value)
const isTime = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))

export function parseCardEntry(line: string): CardEntry | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const { card, event, at, commit, branch, recordedAt } = raw
  if (
    raw['schema'] !== 1 ||
    typeof card !== 'string' ||
    !CARD_ID.test(card) ||
    !isEvent(event) ||
    !isTime(at) ||
    typeof commit !== 'string' ||
    typeof branch !== 'string' ||
    !isTime(recordedAt)
  )
    return undefined
  return { schema: 1, card, event, at, commit, branch, recordedAt }
}

/** 文件不存在当作空的；坏行跳过并记下行号。 */
export function readCards(path: string): CardsRead {
  if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true)
    return { entries: [], badLines: [] }
  const entries: CardEntry[] = []
  const badLines: number[] = []
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (line.trim() === '') return
      const entry = parseCardEntry(line)
      if (entry === undefined) badLines.push(index + 1)
      else entries.push(entry)
    })
  return { entries, badLines }
}

export function appendCard(path: string, entry: CardEntry): void {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(entry)}\n`)
}

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/u

/**
 * `AT` 的取法：`YYYY-MM-DD`（本机时区的零点）或 `YYYY-MM-DDTHH:MM[:SS[.sss]][Z|±HH:MM]`（不带时区按本机时区）。
 * 不合法返回 undefined。Date.parse 会把 2 月 30 日滚成 3 月 2 日，所以日期另核一遍。
 */
export function parseAt(text: string): Date | undefined {
  const parts = ISO.exec(text)
  if (parts === null) return undefined
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate())
    return undefined
  const time = Date.parse(parts[4] === undefined ? `${text}T00:00` : text)
  return Number.isNaN(time) ? undefined : new Date(time)
}

export type Judgement = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** 一次登记收不收：同卡同事件已有一条、后两个事件没有 proposed 或早于它，都拒绝并说明。 */
export function judgeEntry(
  entries: readonly CardEntry[],
  candidate: Pick<CardEntry, 'card' | 'event' | 'at'>,
): Judgement {
  const ofCard = entries.filter(entry => entry.card === candidate.card)
  const same = ofCard.find(entry => entry.event === candidate.event)
  if (same !== undefined)
    return {
      ok: false,
      reason: `${candidate.card} 已有一条 ${candidate.event}，时间 ${same.at}（记于 ${same.recordedAt}）；要更正只能手工改台账文件`,
    }
  if (candidate.event === 'proposed') return { ok: true }
  const proposed = ofCard.find(entry => entry.event === 'proposed')
  if (proposed === undefined)
    return {
      ok: false,
      reason: `${candidate.card} 还没有 proposed，不能先记 ${candidate.event}；先记它被提出的时间`,
    }
  if (Date.parse(candidate.at) < Date.parse(proposed.at))
    return {
      ok: false,
      reason: `${candidate.event} 的时间 ${candidate.at} 早于这张卡的 proposed（${proposed.at}）`,
    }
  return { ok: true }
}
