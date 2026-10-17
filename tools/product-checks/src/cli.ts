import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectCoverage } from './acceptance/coverage.ts'
import { readAcceptanceLockConfig } from '@omne-harness/repo-toolchain/acceptance/lock'
import { attributionViolations, readCommits } from '@omne-harness/repo-toolchain/commits'
import { collectSources, runRules } from '@omne-harness/repo-toolchain/core/scan'
import { RULES } from './rules/index.ts'
import { readLoopConfig } from '@omne-harness/repo-toolchain/loop/config'
import { toolchainConfigPath } from '@omne-harness/repo-toolchain/core/toolchain-config'
import { collectRepositorySources, REPOSITORY_RULES } from './repository.ts'
import { applyAttributionBaseline, readAttributionBaseline } from './attribution-baseline.ts'

// 本成员不发布，只在本仓库里运行：运行检查器的仓库就是它所在的仓库，配置从那里读，不看当前目录。
const runnerRoot = resolve(
  process.env['OMNE_RUNNER_ROOT'] || fileURLToPath(new URL('../../../', import.meta.url)),
)
const config = toolchainConfigPath(runnerRoot)
const repositoryRoot = resolve(process.env['OMNE_SUBJECT_ROOT'] ?? runnerRoot)
if (existsSync(join(repositoryRoot, '.git'))) baselines(repositoryRoot)
const roots = (process.argv.length > 2 ? process.argv.slice(2) : ['packages']).map(p =>
  resolve(process.env['OMNE_SUBJECT_ROOT'] ?? process.cwd(), p),
)
const violations = roots.flatMap(root => runRules(collectSources(root), RULES))
violations.push(...runRules(collectRepositorySources(repositoryRoot), REPOSITORY_RULES))
// 验收的覆盖声明：声明的场景要在产品区的 acceptance.md 里存在。产品区的位置与回路的读法同一份配置。
const coverage = inspectCoverage(
  repositoryRoot,
  readLoopConfig(config).sensors.topicChurn.productRoot,
  readAcceptanceLockConfig(config),
)
violations.push(...coverage.violations)
let commitsNote = '提交署名 未检查（不在 git 检出内）'
if (existsSync(join(repositoryRoot, '.git'))) {
  const commits = readCommits(repositoryRoot)
  // 历史审计基线随本成员维护，只跳过列出的确切提交，见 commit-attribution-baseline.json。
  const baseline = readAttributionBaseline(
    fileURLToPath(new URL('../commit-attribution-baseline.json', import.meta.url)),
  )
  violations.push(...applyAttributionBaseline(attributionViolations(commits), commits, baseline))
  commitsNote = `${commits.length} 个提交的署名`
}
if (violations.length === 0) {
  console.log(
    `PASS: product-checks ${RULES.length} 包规则 + ${REPOSITORY_RULES.length} 仓库路径规则，扫描 ${roots.join('、')} 及仓库执行模块，` +
      `${coverage.declarations.length} 份验收的覆盖声明，${commitsNote}，无违反。`,
  )
} else {
  for (const v of violations) console.error(`${v.path}:${v.line} [${v.rule}] ${v.message}`)
  console.error(`FAIL: product-checks 发现 ${violations.length} 处违反。`)
  process.exit(1)
}
