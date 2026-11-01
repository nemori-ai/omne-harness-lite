import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EntryError } from './exports.ts'
import { GitError } from './references.ts'
import { renderScope, renderText } from './render.ts'
import { scanRetire } from './scan.ts'
import { DEFAULT_TABLE_PATH, readRetireTable, TableError, WAVES, type Wave } from './table.ts'

const USAGE =
  '用法：retire --wave <A|B|C|D|E> [--root <检出目录>] [--table <退役表>] [--json] [--strict]'
const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

interface Arguments {
  readonly wave: Wave
  readonly root: string
  readonly table: string
  readonly json: boolean
  readonly strict: boolean
}

function parseArguments(argv: readonly string[]): Arguments {
  let wave: string | undefined
  let root = ROOT
  let table = DEFAULT_TABLE_PATH
  let json = false
  let strict = false
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === '--json') json = true
    else if (flag === '--strict') strict = true
    else if (flag === '--wave' || flag === '--root' || flag === '--table') {
      const value = argv[++index]
      if (value === undefined || value === '') throw new Error(`${flag} 缺少取值\n${USAGE}`)
      if (flag === '--wave') wave = value
      else if (flag === '--root') root = resolve(value)
      else table = resolve(value)
    } else throw new Error(`认不出的参数 ${flag ?? ''}\n${USAGE}`)
  }
  if (wave === undefined) throw new Error(`缺少 --wave\n${USAGE}`)
  if (!WAVES.includes(wave as Wave)) throw new Error(`放行波次 ${wave} 不合法\n${USAGE}`)
  return { wave: wave as Wave, root, table, json, strict }
}

/** 退出码：0 无问题；1 有问题（--strict 时含未映射）；2 表、检出或参数不可用，或表过期。 */
function main(argv: readonly string[]): number {
  const args = parseArguments(argv)
  const table = readRetireTable(args.table)
  const result = scanRetire({ root: args.root, wave: args.wave, table })
  console.log(
    args.json ? JSON.stringify(result, null, 2) : renderText(result, renderScope(table, args.wave)),
  )
  if (result.stale.length > 0) {
    console.error('表过期：表里的导出名在检出里找不到定义，结果不可信，先由表的维护者更新退役表')
    return 2
  }
  if (result.findings.length > 0) return 1
  return args.strict && result.unmapped.length > 0 ? 1 : 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    error instanceof TableError
      ? `退役表不可用：${message}`
      : error instanceof GitError || error instanceof EntryError
        ? `无法扫描：${message}`
        : message,
  )
  process.exitCode = 2
}
