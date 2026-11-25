import { baselines } from '@omne-harness/repo-toolchain/core/task-context'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectCoverage } from './acceptance/coverage.ts'
import { readAcceptanceLockConfig } from '@omne-harness/repo-toolchain/acceptance/lock'
import { attributionViolations, readCommits } from '@omne-harness/repo-toolchain/commits'
import { collectSources, runRules } from '@omne-harness/repo-toolchain/core/scan'
import { RULES, rulesForRoot } from './rules/index.ts'
import { readLoopConfig } from '@omne-harness/repo-toolchain/loop/config'
import { toolchainConfigPath } from '@omne-harness/repo-toolchain/core/toolchain-config'
import { collectRepositorySources, REPOSITORY_RULES } from './repository.ts'
import { collectTrackedText, noConflictMarkers } from './rules/no-conflict-markers.ts'
import { applyAttributionBaseline, readAttributionBaseline } from './attribution-baseline.ts'
import { parseArguments } from './hygiene/arguments.ts'
import { HYGIENE_CHECK_COUNT, runHygiene } from './hygiene/run.ts'

const USAGE = `用法：cli.ts [--hygiene] [<包根>...]
在给出的包根（缺省 packages）上跑包规则，再在被检查的仓库上跑仓库路径规则、验收覆盖声明与提交署名。根 pnpm run lint:rules 给的是 --hygiene ../../packages ../../apps。
  --hygiene  另跑整洁检查。
环境变量：OMNE_RUNNER_ROOT 是运行检查器的仓库，缺省为本工具所在的检出；OMNE_SUBJECT_ROOT 是被检查的仓库，缺省为运行检查器的仓库；相对的包根从它解析，没设时从当前目录解析。
退出 0 没有违反；1 有违反，逐条写在标准错误。`

if (process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

const runnerRoot = resolve(
  process.env['OMNE_RUNNER_ROOT'] || fileURLToPath(new URL('../../../', import.meta.url)),
)
const config = toolchainConfigPath(runnerRoot)
const repositoryRoot = resolve(process.env['OMNE_SUBJECT_ROOT'] ?? runnerRoot)
if (existsSync(join(repositoryRoot, '.git'))) baselines(repositoryRoot)
const args = parseArguments(process.argv.slice(2))
const roots = args.paths.map(p => resolve(process.env['OMNE_SUBJECT_ROOT'] ?? process.cwd(), p))
const violations = roots.flatMap(root => runRules(collectSources(root), rulesForRoot(root)))
violations.push(...runRules(collectRepositorySources(repositoryRoot), REPOSITORY_RULES))
const tracked = existsSync(join(repositoryRoot, '.git'))
if (tracked) violations.push(...runRules(collectTrackedText(repositoryRoot), [noConflictMarkers]))
let hygieneText = ''
let hygieneNote: string | undefined
if (args.hygiene) {
  if (existsSync(join(repositoryRoot, '.git'))) {
    const hygiene = runHygiene(
      repositoryRoot,
      fileURLToPath(new URL('../hygiene-baseline.json', import.meta.url)),
    )
    violations.push(...hygiene.violations)
    hygieneNote = hygiene.note
    hygieneText = `${HYGIENE_CHECK_COUNT} 项整洁检查，`
  } else hygieneNote = '整洁检查 未检查（不在 git 检出内）'
}
const coverage = inspectCoverage(
  repositoryRoot,
  readLoopConfig(config).sensors.topicChurn.productRoot,
  readAcceptanceLockConfig(config),
)
violations.push(...coverage.violations)
let commitsNote = '提交署名 未检查（不在 git 检出内）'
if (existsSync(join(repositoryRoot, '.git'))) {
  const commits = readCommits(repositoryRoot)
  const baseline = readAttributionBaseline(
    fileURLToPath(new URL('../commit-attribution-baseline.json', import.meta.url)),
  )
  violations.push(...applyAttributionBaseline(attributionViolations(commits), commits, baseline))
  commitsNote = `${commits.length} 个提交的署名`
}
if (violations.length === 0) {
  console.log(
    `PASS: product-checks ${RULES.length} 包规则 + ${REPOSITORY_RULES.length + Number(tracked)} 仓库路径规则，扫描 ${roots.join('、')} 及仓库执行模块，` +
      `${hygieneText}${coverage.declarations.length} 份验收的覆盖声明，${commitsNote}，无违反。`,
  )
  if (hygieneNote !== undefined) console.log(hygieneNote)
  if (!tracked) console.log('冲突标记 未检查（不在 git 检出内）')
} else {
  for (const v of violations) console.error(`${v.path}:${v.line} [${v.rule}] ${v.message}`)
  console.error(`FAIL: product-checks 发现 ${violations.length} 处违反。`)
  process.exit(1)
}
