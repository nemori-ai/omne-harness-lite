#!/usr/bin/env node
import { resolve } from 'node:path'
import { runLoopStatus, type RunOptions } from './run.ts'
import { parseScope } from './product-inputs.ts'
import { subjectRoot } from '../core/subject.ts'

const USAGE = `用法：loop-status [--base <ref>] [--snapshot] [--out <dir>] [--strict] [--scope all|engineering] [--root <检出目录>]
整洁的各项指标在哪条带上、这次变更里要解释的红项、超预算的成员。
  --base      另列这次变更里要解释的红项，并核验收锁。
  --snapshot  在干净的工作树上追加一条趋势快照。
  --strict    严格模式：开着的传感器都要有数据。要同时给 --base 与 --out，不能与 --snapshot 同用。
  --scope     all（缺省）或 engineering；engineering 只与 --strict 同用。
  --out       状态与草稿的目录，缺省为回路目录下的 status/<提交短号>[-dirty]/。
  --root      被检查的检出，缺省取 OMNE_SUBJECT_ROOT，再取当前目录所在 Git 仓库的根。
回路目录取 OMNE_METRICS_HOME，缺省为主检出的 tmp/clean-loop/。配置：repo-toolchain.config.json 的 loop 一节。
退出 0 硬线没破；1 硬线被破（依赖违规或环、给了 --base 时验收锁被破、严格模式下开着的传感器没数据）；2 参数、配置或 Git 出错。`

function parseArgs(argv: readonly string[]): RunOptions {
  const values = new Map<string, string>()
  let snapshot = false
  let strict = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--snapshot') snapshot = true
    else if (arg === '--strict') strict = true
    else if (arg === '--base' || arg === '--out' || arg === '--root' || arg === '--scope') {
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
    strict,
    scope: parseScope(values.get('--scope')),
    root: resolve(values.get('--root') ?? subjectRoot()),
    ...(base === undefined ? {} : { base }),
    ...(out === undefined ? {} : { out }),
  }
}

if (process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

try {
  const result = await runLoopStatus(parseArgs(process.argv.slice(2)), process.env)
  console.log(result.lines.join('\n'))
  process.exitCode = result.code
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
