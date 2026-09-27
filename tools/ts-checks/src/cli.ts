import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSources, RULES, runRules } from './index.ts'
import { collectRepositorySources, REPOSITORY_RULES } from './repository.ts'

const roots = (process.argv.length > 2 ? process.argv.slice(2) : ['packages']).map(p => resolve(p))
const violations = roots.flatMap(root => runRules(collectSources(root)))
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))
violations.push(...runRules(collectRepositorySources(repositoryRoot), REPOSITORY_RULES))
if (violations.length === 0) {
  console.log(
    `PASS: ts-checks ${RULES.length} 包规则 + ${REPOSITORY_RULES.length} 仓库路径规则，扫描 ${roots.join('、')} 及仓库执行模块，无违反。`,
  )
} else {
  for (const v of violations) console.error(`${v.path}:${v.line} [${v.rule}] ${v.message}`)
  console.error(`FAIL: ts-checks 发现 ${violations.length} 处违反。`)
  process.exit(1)
}
