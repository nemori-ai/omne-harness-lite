// 删卡记录入口：`--base <ref>` 给任务基线。退出码 0 表示删卡都有记录、「已发到」没变小，1 表示有缺或对不上，
// 2 表示用法、配置或 Git 出错。
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLoopConfig } from '../loop/config.ts'
import { inspectRetire, renderRetire } from './retire.ts'

const USAGE = '用法：--base <基线提交或分支> [--root <检出目录>]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

function main(argv: readonly string[]): number {
  let base: string | undefined
  let root = ROOT
  for (let index = 0; index < argv.length; index += 2) {
    const arg = argv[index]
    const value = argv[index + 1]
    if ((arg !== '--base' && arg !== '--root') || value === undefined || value === '')
      throw new Error(`认不出的参数 ${arg ?? ''}\n${USAGE}`)
    if (arg === '--base') base = value
    else root = resolve(value)
  }
  if (base === undefined) throw new Error(`缺 --base\n${USAGE}`)
  const report = inspectRetire(root, base, readLoopConfig().sensors.topicChurn.productRoot)
  for (const line of renderRetire(report)) console.log(line)
  return report.violations.length === 0 ? 0 : 1
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
