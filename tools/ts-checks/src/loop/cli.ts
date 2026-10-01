// 回路状态的命令行外壳：解析参数、调 run.ts、打印、给退出码。
// 退出码 1 只在硬线被破时；2 是工具自己出错（参数、配置、git）。
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLoopStatus, type RunOptions } from './run.ts'

const USAGE = '用法：loop-status [--base <ref>] [--snapshot] [--out <dir>] [--root <检出目录>]'
/** 被量的检出缺省是本工具所在的检出；测试用 `--root` 指向临时仓库。 */
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

function parseArgs(argv: readonly string[]): RunOptions {
  const values = new Map<string, string>()
  let snapshot = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--snapshot') snapshot = true
    else if (arg === '--base' || arg === '--out' || arg === '--root') {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${arg} 需要一个值\n${USAGE}`)
      values.set(arg, value)
      index += 1
    } else throw new Error(`认不出的参数 ${String(arg)}\n${USAGE}`)
  }
  const base = values.get('--base')
  const out = values.get('--out')
  return {
    snapshot,
    root: resolve(values.get('--root') ?? ROOT),
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
  }
}

try {
  const result = await runLoopStatus(parseArgs(process.argv.slice(2)), process.env)
  console.log(result.lines.join('\n'))
  process.exitCode = result.code
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
