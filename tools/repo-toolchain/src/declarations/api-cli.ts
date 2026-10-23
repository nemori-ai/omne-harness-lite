#!/usr/bin/env node
// 契约 API 快照入口：`--write` 写快照，`--check` 核对快照与 dist，`--diff <基线>` 对比基线提交上的快照并粗分类。
// `--check` 与 `--diff` 只报告，有发现也退出 0；`--write` 有成员没写成时退出 1；用法、配置、基线或工具出错退出 2。
// 读 dist：先构建。`--json` 把结果按 JSON 写到标准输出。
import { resolve } from 'node:path'
import { subjectRoot } from '../core/subject.ts'
import {
  checkSnapshots,
  diffSnapshots,
  readContractApiConfig,
  renderCheck,
  renderDiff,
  renderWrite,
  writeSnapshots,
} from './contract-api.ts'

const USAGE = '用法：--write | --check | --diff <基线提交或分支>，可加 [--json] [--root <检出目录>]'

type Action =
  | { readonly kind: 'write' }
  | { readonly kind: 'check' }
  | { readonly kind: 'diff'; readonly base: string }

interface Arguments {
  action?: Action
  json: boolean
  root: string
}

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value === '' || value.startsWith('--'))
    throw new Error(`${flag} 要一个值\n${USAGE}`)
  return value
}

function choose(parsed: Arguments, action: Action): void {
  if (parsed.action !== undefined) throw new Error(`--write、--check、--diff 只能给一个\n${USAGE}`)
  parsed.action = action
}

/** 读一个参数，返回它占了几个位置。 */
function readFlag(argv: readonly string[], index: number, parsed: Arguments): number {
  const flag = argv[index]
  switch (flag) {
    case '--write':
    case '--check':
      choose(parsed, { kind: flag === '--write' ? 'write' : 'check' })
      return 1
    case '--json':
      parsed.json = true
      return 1
    case '--diff':
      choose(parsed, { kind: 'diff', base: valueAfter(argv, index, flag) })
      return 2
    case '--root':
      parsed.root = resolve(valueAfter(argv, index, flag))
      return 2
    default:
      throw new Error(`认不出的参数 ${flag ?? ''}\n${USAGE}`)
  }
}

function parseArguments(argv: readonly string[]): Required<Arguments> {
  const parsed: Arguments = { json: false, root: subjectRoot() }
  for (let index = 0; index < argv.length;) index += readFlag(argv, index, parsed)
  if (parsed.action === undefined) throw new Error(USAGE)
  return { action: parsed.action, json: parsed.json, root: parsed.root }
}

function main(argv: readonly string[]): number {
  const { action, json, root } = parseArguments(argv)
  const config = readContractApiConfig()
  const print = (value: unknown, lines: readonly string[]) => {
    if (json) console.log(JSON.stringify(value, null, 2))
    else for (const line of lines) console.log(line)
  }
  switch (action.kind) {
    case 'write': {
      const run = writeSnapshots(root, config)
      print(run, renderWrite(run))
      return run.members.some(item => item.status === 'unbuilt' || item.status === 'invalid')
        ? 1
        : 0
    }
    case 'check': {
      const run = checkSnapshots(root, config)
      print(run, renderCheck(run))
      return 0
    }
    case 'diff': {
      const run = diffSnapshots(root, config, action.base)
      print(run, renderDiff(run))
      return 0
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message)
  process.exitCode = 2
}
