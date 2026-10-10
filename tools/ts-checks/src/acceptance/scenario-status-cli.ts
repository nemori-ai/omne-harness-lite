import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLoopConfig } from '../loop/config.ts'
import { readProductTopics } from '../product/scenarios.ts'
import { inspectCurrentSources } from '../product/sources.ts'
import { inspectCoverage } from './coverage.ts'
import { readAcceptanceLockConfig } from './lock.ts'
import { renderScenarioStatus, scenarioStatuses } from './scenario-status.ts'

const USAGE = '用法：scenario-status [--root <检出目录>] [--config <路径>] [--capture <路径>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

function main(argv: readonly string[]): number {
  let root = ROOT
  let configPath: string | undefined
  let capturePath: string | undefined
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1]
    if (
      !['--root', '--config', '--capture'].includes(argv[index] ?? '') ||
      value === undefined ||
      value === ''
    )
      throw new Error(`认不出的参数 ${argv[index] ?? ''}\n${USAGE}`)
    if (argv[index] === '--root') root = resolve(value)
    else if (argv[index] === '--config')
      configPath = isAbsolute(value) ? value : `${process.cwd()}/${value}`
    else capturePath = isAbsolute(value) ? value : `${process.cwd()}/${value}`
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
  const sources = inspectCurrentSources({
    root,
    productRoot,
    ...(configPath === undefined ? {} : { configPath }),
    ...(capturePath === undefined ? {} : { capturePath }),
  })
  notes.push(
    ...sources.findings.map(finding => `${finding.category} ${finding.code}：${finding.message}`),
  )
  const statuses = scenarioStatuses(topics, sources, coverage.declarations)
  for (const line of renderScenarioStatus(statuses, notes)) console.log(line)
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
