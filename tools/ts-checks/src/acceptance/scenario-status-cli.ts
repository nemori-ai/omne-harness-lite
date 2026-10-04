// 场景状态报告入口：按 topic 列出每条带编号的验收场景是已交付、交付中、已立卡还是还没切到。
// 只读、只报告：退出码 0 正常，2 是工具自己出错（参数、配置、读不了的文件）。覆盖声明的错由 `lint:rules` 判失败，这里只提一句。
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLoopConfig } from '../loop/config.ts'
import { readProductTopics } from '../product/scenarios.ts'
import { readStories } from '../product/stories.ts'
import { inspectCoverage } from './coverage.ts'
import { readAcceptanceLockConfig } from './lock.ts'
import { renderScenarioStatus, scenarioStatuses } from './scenario-status.ts'

const USAGE = '用法：scenario-status [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

function main(argv: readonly string[]): number {
  let root = ROOT
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1]
    if (argv[index] !== '--root' || value === undefined || value === '')
      throw new Error(`认不出的参数 ${argv[index] ?? ''}\n${USAGE}`)
    root = resolve(value)
  }
  const productRoot = readLoopConfig().sensors.topicChurn.productRoot
  const topics = readProductTopics(join(root, productRoot))
  if (topics === undefined) throw new Error(`产品区 ${join(root, productRoot)} 不存在`)
  const coverage = inspectCoverage(root, productRoot, readAcceptanceLockConfig())
  const notes =
    coverage.violations.length === 0
      ? []
      : [
          `覆盖声明有 ${coverage.violations.length} 处问题（\`pnpm run lint:rules\` 判它失败），不合写法的项没有计入：` +
            coverage.violations
              .slice(0, 3)
              .map(v => `${v.path}:${v.line} ${v.message}`)
              .join('；') +
            (coverage.violations.length > 3 ? ' 等' : ''),
        ]
  const statuses = scenarioStatuses(
    topics,
    readStories(join(root, productRoot)) ?? [],
    coverage.declarations,
  )
  for (const line of renderScenarioStatus(statuses, notes)) console.log(line)
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
