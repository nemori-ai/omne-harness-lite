// 故事卡：只取卡号、标题与「就绪」。格式契约在 `.meta_harness/design/product/conventions.md`：
// 卡放在 `PF-*/stories.md`，标题行是 `### ST-016-01 · 一句话`，字段行是 `- **就绪**：是` 或 `否——缺什么`。
// 卡的形状对不对归设计区的对账器（`tooling/src/stories.py`），这里不判，认不出的行跳过。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const CARD_ID = /^ST-\d{3}-\d{2}$/u

const TOPIC = /^PF-\d{3}(?:-|$)/u
const CARD_HEADING = /^###\s+(ST-\d{3}-\d{2})\s*·\s*(\S.*?)\s*$/u
const HEADING = /^#{1,6}\s/u
const READY_FIELD = /^- \*\*就绪\*\*\s*[:：]\s*(.*)$/u
const FENCE = /^\s*(```|~~~)/u

/** `unknown`：没写「就绪」，或写的既不以「是」也不以「否」开头。 */
export type Readiness = 'ready' | 'not-ready' | 'unknown'

export interface StoryCard {
  readonly id: string
  readonly title: string
  readonly ready: Readiness
}

export interface TopicStories {
  /** topic 目录名，如 `PF-016-cli-tui-delivery-surface`。 */
  readonly topic: string
  readonly cards: readonly StoryCard[]
}

function readinessOf(text: string): Readiness {
  if (text.startsWith('是')) return 'ready'
  return text.startsWith('否') ? 'not-ready' : 'unknown'
}

export function parseStories(text: string): StoryCard[] {
  const cards: { id: string; title: string; ready: Readiness }[] = []
  let current: { id: string; title: string; ready: Readiness } | undefined
  let fenced = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (HEADING.test(line)) {
      const heading = CARD_HEADING.exec(line)
      current =
        heading === null
          ? undefined
          : { id: heading[1] ?? '', title: heading[2] ?? '', ready: 'unknown' }
      if (current !== undefined) cards.push(current)
      continue
    }
    const ready = current === undefined ? null : READY_FIELD.exec(line)
    if (current !== undefined && ready !== null) current.ready = readinessOf(ready[1] ?? '')
  }
  return cards
}

/** `productRoot` 下每个有 `stories.md` 的 topic；目录不存在返回 undefined。 */
export function readStories(productRoot: string): TopicStories[] | undefined {
  if (statSync(productRoot, { throwIfNoEntry: false })?.isDirectory() !== true) return undefined
  return readdirSync(productRoot)
    .filter(name => TOPIC.test(name))
    .sort()
    .flatMap(topic => {
      const path = join(productRoot, topic, 'stories.md')
      if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) return []
      return [{ topic, cards: parseStories(readFileSync(path, 'utf8')) }]
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
