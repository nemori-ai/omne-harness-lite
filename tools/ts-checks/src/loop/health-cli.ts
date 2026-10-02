// 流程体检入口：把卡片台账、趋势快照、测试耗时账本与 git 历史汇成一张自包含的页面，另出 health.json 与文字摘要。
// 只读、只报告：退出码 0 正常，2 是工具自己出错（参数、配置、git、写不了产物）。
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { coordinates, git } from '../metrics/git.ts'
import { readCards } from './cards.ts'
import { countPending, readCatalogue, readIfFile } from './catalogue.ts'
import { readLoopConfig } from './config.ts'
import {
  cardsBlock,
  catalogueBlock,
  commitsBlock,
  debtBlock,
  parseCommitLog,
  remainingCards,
  sensorsBlock,
  testsBlock,
  weeklyAccepted,
  type CommitsBlock,
  type Health,
} from './health.ts'
import { healthSummary, renderHealthPage } from './health-render.ts'
import { loopHome } from './home.ts'
import { noData, type Reading } from './reading.ts'
import { cardIndex, readStories } from '../product/stories.ts'
import { readTrend } from './trend.ts'

const USAGE = '用法：loop-health [--out <dir>] [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

interface Options {
  readonly out?: string
  readonly root: string
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (arg !== '--out' && arg !== '--root') throw new Error(`认不出的参数 ${arg}\n${USAGE}`)
    const value = argv[index + 1]
    if (value === undefined || value === '') throw new Error(`${arg} 需要一个值\n${USAGE}`)
    values.set(arg, value)
    index += 1
  }
  const out = values.get('--out')
  return { root: resolve(values.get('--root') ?? ROOT), ...(out === undefined ? {} : { out }) }
}

function readCommits(root: string, branch: string, count: number): Reading<CommitsBlock> {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`])
  } catch {
    return noData(`没有 ${branch} 分支`)
  }
  // 沿第一父链：主线上的每一个提交（含合并），合并提交按它对第一父的改动计（-m 配 --first-parent，旧版 git 也认）。
  const log = git(root, [
    'log',
    '--first-parent',
    '-m',
    '--format=%x00%H%x09%s',
    '--name-only',
    '-n',
    String(count),
    `refs/heads/${branch}`,
  ])
  return commitsBlock(parseCommitLog(log), branch)
}

/** `<账本根>/<提交>/<时间>/ledger.json` 全部读进来；读不了的 JSON 记为 undefined，交给解析时报出。 */
function readLedgers(home: string): { path: string; value: unknown }[] | undefined {
  if (statSync(home, { throwIfNoEntry: false })?.isDirectory() !== true) return undefined
  const found: { path: string; value: unknown }[] = []
  for (const commit of readdirSync(home, { withFileTypes: true })) {
    if (!commit.isDirectory()) continue
    for (const run of readdirSync(join(home, commit.name), { withFileTypes: true })) {
      const path = join(home, commit.name, run.name, 'ledger.json')
      if (!run.isDirectory() || statSync(path, { throwIfNoEntry: false })?.isFile() !== true)
        continue
      let value: unknown
      try {
        value = JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        value = undefined
      }
      found.push({ path, value })
    }
  }
  return found
}

function main(argv: readonly string[]): number {
  const options = parseArgs(argv)
  const config = readLoopConfig()
  const { root } = options
  const at = coordinates(root, undefined)
  const home = loopHome(at.mainRoot, process.env)
  // 账本根与 `src/testing/cli.ts` 同一取法。
  const ledgerHome = resolve(
    process.env['OMNE_TEST_LEDGER_HOME'] ?? join(at.mainRoot, 'tmp', 'test-ledger'),
  )
  const outDir = resolve(options.out ?? join(home, 'health'))
  const now = new Date()

  const cardsPath = join(home, 'cards.jsonl')
  const cards = readCards(cardsPath)
  const productRoot = config.sensors.topicChurn.productRoot
  const stories = readStories(join(root, productRoot))
  const trendPath = join(home, 'trend.jsonl')
  const trend = readTrend(trendPath)
  const catalogue = config.sensors.catalogue
  const catalogueText = readIfFile(join(root, catalogue.path))

  const notes = [
    ...(cards.badLines.length === 0
      ? []
      : [`台账 ${cardsPath} 第 ${cards.badLines.join('、')} 行读不了，已跳过`]),
    ...(trend.badLines.length === 0
      ? []
      : [`趋势 ${trendPath} 第 ${trend.badLines.join('、')} 行读不了，已跳过`]),
  ]
  const debt = debtBlock(trend.snapshots, config, trendPath)
  const health: Health = {
    meta: {
      head: at.head,
      shortHead: at.shortHead,
      branch: at.branch,
      dirty: at.dirty,
      generatedAt: now.toISOString(),
      home,
      windows: config.health,
      notes,
    },
    cards: cardsBlock(cards.entries, cardIndex(stories ?? []), now, cardsPath),
    weekly: weeklyAccepted(cards.entries, now, config.health.weeks),
    remaining: remainingCards(stories, cards.entries, productRoot),
    commits: readCommits(root, config.primaryBranch, config.health.commits),
    tests: testsBlock(readLedgers(ledgerHome), config.health.runs, ledgerHome),
    debt,
    catalogue: catalogueBlock(
      readCatalogue(root, catalogue.path, catalogue.doctrinePath).categories,
      catalogueText === undefined ? 0 : countPending(catalogueText),
    ),
    sensors: sensorsBlock(debt),
  }

  const page = join(outDir, 'health.html')
  const summary = healthSummary(health, page)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(page, renderHealthPage(health))
  writeFileSync(join(outDir, 'health.json'), `${JSON.stringify(health, null, 1)}\n`)
  writeFileSync(join(outDir, 'summary.md'), `${summary.join('\n')}\n`)
  console.log(summary.join('\n'))
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
