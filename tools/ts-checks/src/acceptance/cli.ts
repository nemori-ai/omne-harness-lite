// 验收锁入口：`--base <ref>` 给任务基线。退出码 0 表示没有不该改验收的角色动过它，1 表示锁被破，2 表示用法或 Git 出错。
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect, readAcceptanceLockConfig, render } from './lock.ts'

const USAGE = '用法：--base <基线提交或分支> [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

function main(argv: readonly string[]): number {
  let base: string | undefined
  let root = ROOT
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]
    if ((arg !== '--base' && arg !== '--root') || value === undefined || value === '')
      throw new Error(`认不出的参数 ${arg ?? ''}\n${USAGE}`)
    if (arg === '--base') base = value
    else root = resolve(value)
    index += 1
  }
  if (base === undefined) throw new Error(`缺 --base\n${USAGE}`)
  const config = readAcceptanceLockConfig()
  const report = inspect(root, base, config)
  for (const line of render(report, config)) console.log(line)
  return report.violations.length === 0 ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
