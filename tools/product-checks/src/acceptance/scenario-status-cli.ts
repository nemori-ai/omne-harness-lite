import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLoopConfig } from '@omne-harness/repo-toolchain/loop/config'
import { toolchainConfigPath } from '@omne-harness/repo-toolchain/core/toolchain-config'
import { inspectCoverage } from './coverage.ts'
import { readAcceptanceLockConfig } from '@omne-harness/repo-toolchain/acceptance/lock'
import { renderScenarioStatus, scenarioStatuses } from './scenario-status.ts'

const USAGE = '用法：scenario-status [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
// 本成员只在本仓库里运行：配置取运行检查器的仓库，也就是本仓库。
const CONFIG = toolchainConfigPath(resolve(process.env['OMNE_RUNNER_ROOT'] || ROOT))

function main(argv: readonly string[]): number {
  let root = ROOT
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1]
    if (!['--root'].includes(argv[index] ?? '') || value === undefined || value === '')
      throw new Error(`认不出的参数 ${argv[index] ?? ''}\n${USAGE}`)
    if (argv[index] === '--root') root = resolve(value)
  }
  const productRoot = readLoopConfig(CONFIG).sensors.topicChurn.productRoot
  const coverage = inspectCoverage(root, productRoot, readAcceptanceLockConfig(CONFIG))
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
  const statuses = scenarioStatuses(coverage)
  for (const line of renderScenarioStatus(statuses, notes)) console.log(line)
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
