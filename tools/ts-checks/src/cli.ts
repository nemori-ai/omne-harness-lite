import { baselines } from './integration/context.ts'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectCoverage } from './acceptance/coverage.ts'
import { readAcceptanceLockConfig } from './acceptance/lock.ts'
import { attributionViolations, readCommits } from './commits.ts'
import { collectSources, RULES, runRules } from './index.ts'
import { readLoopConfig } from './loop/config.ts'
import { collectRepositorySources, REPOSITORY_RULES } from './repository.ts'

const repositoryRoot = resolve(
  process.env['OMNE_SUBJECT_ROOT'] ?? fileURLToPath(new URL('../../../', import.meta.url)),
)
if (existsSync(join(repositoryRoot, '.git'))) baselines(repositoryRoot)
const roots = (process.argv.length > 2 ? process.argv.slice(2) : ['packages']).map(p =>
  resolve(process.env['OMNE_SUBJECT_ROOT'] ?? process.cwd(), p),
)
const violations = roots.flatMap(root => runRules(collectSources(root)))
violations.push(...runRules(collectRepositorySources(repositoryRoot), REPOSITORY_RULES))
// 验收的覆盖声明：声明的场景要在产品区的 acceptance.md 里存在。产品区的位置与回路的读法同一份配置。
const coverage = inspectCoverage(
  repositoryRoot,
  readLoopConfig().sensors.topicChurn.productRoot,
  readAcceptanceLockConfig(),
)
violations.push(...coverage.violations)
let commitsNote = '提交署名 未检查（不在 git 检出内）'
if (existsSync(join(repositoryRoot, '.git'))) {
  const commits = readCommits(repositoryRoot)
  violations.push(...attributionViolations(commits))
  commitsNote = `${commits.length} 个提交的署名`
}
if (violations.length === 0) {
  console.log(
    `PASS: ts-checks ${RULES.length} 包规则 + ${REPOSITORY_RULES.length} 仓库路径规则，扫描 ${roots.join('、')} 及仓库执行模块，` +
      `${coverage.declarations.length} 份验收的覆盖声明，${commitsNote}，无违反。`,
  )
} else {
  for (const v of violations) console.error(`${v.path}:${v.line} [${v.rule}] ${v.message}`)
  console.error(`FAIL: ts-checks 发现 ${violations.length} 处违反。`)
  process.exit(1)
}
