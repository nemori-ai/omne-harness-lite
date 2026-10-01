// 卡片台账入口：给一张故事卡记一个时间点，追加到 `<回路目录>/cards.jsonl`。
// 退出码：0 记下了；1 拒绝了这次登记（重复、时间倒挂、没有 proposed 先来后两个）；2 是工具自己出错（参数、读不了的文件、git）。
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coordinates } from '../metrics/git.ts'
import {
  appendCard,
  CARD_EVENTS,
  EVENT_WORDS,
  judgeEntry,
  parseAt,
  readCards,
  type CardEvent,
} from './cards.ts'
import { readLoopConfig } from './config.ts'
import { loopHome } from './home.ts'
import { cardIndex, CARD_ID, readStories } from './stories.ts'

const USAGE =
  '用法：loop-card --card <ST-NNN-NN> --event proposed|runnable|accepted [--at <ISO 时间>] [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

interface Options {
  readonly card: string
  readonly event: CardEvent
  readonly at?: Date
  readonly root: string
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (!['--card', '--event', '--at', '--root'].includes(arg))
      throw new Error(`认不出的参数 ${arg}\n${USAGE}`)
    const value = argv[index + 1]
    if (value === undefined || value === '') throw new Error(`${arg} 需要一个值\n${USAGE}`)
    values.set(arg, value)
    index += 1
  }
  const card = values.get('--card')
  const event = values.get('--event')
  if (card === undefined || event === undefined) throw new Error(`要给 --card 与 --event\n${USAGE}`)
  if (!CARD_ID.test(card)) throw new Error(`卡号 ${card} 不合 ST-<三位 topic 编号>-<两位序号>`)
  const known = CARD_EVENTS.find(name => name === event)
  if (known === undefined) throw new Error(`事件 ${event} 不是 ${CARD_EVENTS.join('、')} 之一`)
  const atText = values.get('--at')
  const at = atText === undefined ? undefined : parseAt(atText)
  if (atText !== undefined && at === undefined)
    throw new Error(
      `--at ${atText} 不是合法的 ISO 时间（YYYY-MM-DD 或 YYYY-MM-DDTHH:MM[:SS][Z|±HH:MM]）`,
    )
  return {
    card,
    event: known,
    root: resolve(values.get('--root') ?? ROOT),
    ...(at === undefined ? {} : { at }),
  }
}

function main(argv: readonly string[]): number {
  const options = parseArgs(argv)
  const config = readLoopConfig()
  const at = coordinates(options.root, undefined)
  const path = join(loopHome(at.mainRoot, process.env), 'cards.jsonl')
  const { entries, badLines } = readCards(path)
  if (badLines.length > 0) console.log(`台账第 ${badLines.join('、')} 行读不了，已跳过：${path}`)

  const now = new Date()
  const candidate = {
    card: options.card,
    event: options.event,
    at: (options.at ?? now).toISOString(),
  }
  const judged = judgeEntry(entries, candidate)
  if (!judged.ok) {
    console.log(`拒绝：${judged.reason}`)
    return 1
  }
  appendCard(path, {
    schema: 1,
    ...candidate,
    commit: at.head,
    branch: at.branch,
    recordedAt: now.toISOString(),
  })
  console.log(
    `已记 ${options.card} ${options.event}（${EVENT_WORDS[options.event]}）于 ${candidate.at}：${path}`,
  )
  const stories = readStories(join(options.root, config.sensors.topicChurn.productRoot))
  if (stories === undefined || !cardIndex(stories).has(options.card))
    console.log(
      `提醒：${options.card} 不在这个检出的任何 stories.md 里（卡可能还没合入这条分支），照记不误`,
    )
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
