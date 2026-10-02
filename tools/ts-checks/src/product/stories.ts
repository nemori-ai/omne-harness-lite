// 故事卡：取卡号、标题、「就绪」与「覆盖场景」的链接，以及文件开头的「已发到」。格式契约在
// `.meta_harness/design/product/conventions.md`：卡放在 `PF-*/stories.md`，标题行是 `### ST-016-01 · 一句话`，
// 字段行是 `- **就绪**：是` 或 `否——缺什么`，「已发到」一行是 `**已发到**：ST-016-03`。
// 卡的形状对不对归设计区的对账器（`tooling/src/stories.py`），这里不判，认不出的行跳过；
// 只有卡、没有「已发到」，或只有「已发到」、一张卡都没有（队列清空了），都照常读。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { bareLabel, TOPIC_DIR } from './scenarios.ts'

export const CARD_ID = /^ST-\d{3}-\d{2}$/u

const CARD_HEADING = /^###\s+(ST-\d{3}-\d{2})\s*·\s*(\S.*?)\s*$/u
const HEADING = /^#{1,6}\s/u
const FIELD = /^- \*\*(.+?)\*\*\s*[:：]\s*(.*)$/u
const HIGH_WATER = /^\*\*已发到\*\*\s*[:：]\s*(.*?)\s*$/u
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/gu
const FENCE = /^\s*(```|~~~)/u

/** `unknown`：没写「就绪」，或写的既不以「是」也不以「否」开头。 */
export type Readiness = 'ready' | 'not-ready' | 'unknown'

/** 「覆盖场景」里的一条链接：文字是场景编号，目标是某个 topic 的 acceptance.md（相对 stories.md）。 */
export interface ScenarioLink {
  readonly label: string
  readonly href: string
}

export interface StoryCard {
  readonly id: string
  readonly title: string
  readonly ready: Readiness
  readonly covers: readonly ScenarioLink[]
}

export interface StoriesFile {
  readonly cards: readonly StoryCard[]
  /** 每一行「已发到」写的值，按出现先后；合乎约定的文件恰好一个。 */
  readonly highWater: readonly string[]
}

export interface TopicStories extends StoriesFile {
  /** topic 目录名，如 `PF-016-cli-tui-delivery-surface`。 */
  readonly topic: string
}

function readinessOf(text: string): Readiness {
  if (text.startsWith('是')) return 'ready'
  return text.startsWith('否') ? 'not-ready' : 'unknown'
}

interface OpenCard {
  id: string
  title: string
  ready: Readiness
  covers: ScenarioLink[]
}

export function parseStories(text: string): StoriesFile {
  const cards: OpenCard[] = []
  const highWater: string[] = []
  let current: OpenCard | undefined
  let field: string | undefined
  let fenced = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const water = HIGH_WATER.exec(line)
    if (water !== null) {
      highWater.push(water[1] ?? '')
      continue
    }
    if (HEADING.test(line)) {
      const heading = CARD_HEADING.exec(line)
      field = undefined
      current =
        heading === null
          ? undefined
          : { id: heading[1] ?? '', title: heading[2] ?? '', ready: 'unknown', covers: [] }
      if (current !== undefined) cards.push(current)
      continue
    }
    if (current === undefined) continue
    const named = FIELD.exec(line)
    if (named !== null) field = named[1]?.trim()
    const rest = named === null ? line : (named[2] ?? '')
    if (named !== null && field === '就绪') current.ready = readinessOf(rest)
    if (field === '覆盖场景')
      for (const [, label = '', href = ''] of rest.matchAll(LINK))
        current.covers.push({ label, href })
  }
  return { cards, highWater }
}

/** `productRoot` 下每个有 `stories.md` 的 topic；目录不存在返回 undefined。 */
export function readStories(productRoot: string): TopicStories[] | undefined {
  if (statSync(productRoot, { throwIfNoEntry: false })?.isDirectory() !== true) return undefined
  return readdirSync(productRoot)
    .filter(name => TOPIC_DIR.test(name))
    .sort()
    .flatMap(topic => {
      const path = join(productRoot, topic, 'stories.md')
      if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) return []
      return [{ topic, ...parseStories(readFileSync(path, 'utf8')) }]
    })
}

export function cardIndex(
  topics: readonly TopicStories[],
): Map<string, StoryCard & { topic: string }> {
  const index = new Map<string, StoryCard & { topic: string }>()
  for (const { topic, cards } of topics)
    for (const card of cards) if (!index.has(card.id)) index.set(card.id, { ...card, topic })
  return index
}

/**
 * 一条「覆盖场景」链接指向的场景：（topic 目录名，编号）。链接要落在产品区某个 topic 的 acceptance.md 上，
 * 否则返回 undefined——那是对账器报的错，这里只是认不出。`topic` 是这张卡所在的 topic 目录名。
 */
export function linkedScenario(
  topic: string,
  link: ScenarioLink,
): { readonly topic: string; readonly id: string } | undefined {
  let target: string
  try {
    target = decodeURIComponent(link.href.split('#', 1)[0] ?? '')
  } catch {
    return undefined
  }
  // 以产品区为根解析：`acceptance.md` 是本 topic 的，`../PF-017-x/acceptance.md` 是别的 topic 的。
  const resolved = posix.normalize(posix.join(topic, target))
  const parts = resolved.split('/')
  if (parts.length !== 2 || parts[1] !== 'acceptance.md' || !TOPIC_DIR.test(parts[0] ?? ''))
    return undefined
  return { topic: parts[0] ?? '', id: bareLabel(link.label) }
}
