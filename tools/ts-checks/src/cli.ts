import { resolve } from 'node:path'
import { collectSources, RULES, runRules } from './index.ts'

const root = resolve(process.argv[2] ?? 'packages')
const violations = runRules(collectSources(root))
if (violations.length === 0) {
  console.log(`PASS: ts-checks ${RULES.length} 条规则，扫描 ${root}，无违反。`)
} else {
  for (const v of violations) console.error(`${v.path}:${v.line} [${v.rule}] ${v.message}`)
  console.error(`FAIL: ts-checks 发现 ${violations.length} 处违反。`)
  process.exit(1)
}
