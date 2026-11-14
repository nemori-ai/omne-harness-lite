#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { coordinates, git } from '../core/git.ts'
import { ledgerHome as testLedgerHome } from '../core/test-ledger.ts'
import { countPending, readCatalogue, readIfFile } from './catalogue.ts'
import { readLoopConfig } from './config.ts'
import {
  catalogueBlock,
  commitsBlock,
  debtBlock,
  parseCommitLog,
  sensorsBlock,
  testsBlock,
  type CommitsBlock,
  type Health,
} from './health.ts'
import { healthSummary, renderHealthPage } from './health-render.ts'
import { loopHome } from './home.ts'
import { noData, type Reading } from './reading.ts'
import { readTrend } from './trend.ts'
import { readConformanceSensor } from './sensors/conformance.ts'
import { subjectRoot } from '../core/subject.ts'

const USAGE = '用法：loop-health [--out <dir>] [--root <检出目录>]'
interface Options {
  readonly out?: string
  readonly root: string
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (!['--out', '--root'].includes(arg)) throw new Error(`认不出的参数 ${arg}\n${USAGE}`)
    const value = argv[index + 1]
    if (value === undefined || value === '') throw new Error(`${arg} 需要一个值\n${USAGE}`)
    values.set(arg, value)
    index += 1
  }
  const out = values.get('--out')
  return {
    root: resolve(values.get('--root') ?? subjectRoot()),
    ...(out === undefined ? {} : { out }),
  }
}

function readCommits(root: string, branch: string, count: number): Reading<CommitsBlock> {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`])
  } catch {
    return noData(`没有 ${branch} 分支`)
  }
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
  const ledgerHome = resolve(testLedgerHome('test', at.mainRoot, process.env))
  const outDir = resolve(options.out ?? join(home, 'health'))
  const now = new Date()

  const trendPath = join(home, 'trend.jsonl')
  const trend = readTrend(trendPath)
  const catalogue = config.sensors.catalogue
  const catalogueText = readIfFile(join(root, catalogue.path))

  const notes =
    trend.badLines.length === 0
      ? []
      : [`趋势 ${trendPath} 第 ${trend.badLines.join('、')} 行读不了，已跳过`]
  const debt = debtBlock(trend.snapshots, config, trendPath)
  const health: Health = {
    conformance: readConformanceSensor(root, config.sensors.architecture.enabled),
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
