#!/usr/bin/env node
// 契约 API 快照入口：`--write` 写快照，`--check` 核对快照与 dist，`--diff <基线>` 对比基线提交上的快照并粗分类。
// `--check` 与 `--diff` 只报告，有发现也退出 0；`--write` 有成员没写成时退出 1；用法、配置或工具出错退出 2。
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

function parseArguments(argv: readonly string[]): { action: Action; json: boolean; root: string } {
  let action: Action | undefined
  let json = false
  let root = subjectRoot()
  const choose = (next: Action) => {
    if (action !== undefined) throw new Error(`--write、--check、--diff 只能给一个\n${USAGE}`)
    action = next
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--write') choose({ kind: 'write' })
    else if (flag === '--check') choose({ kind: 'check' })
    else if (flag === '--json') json = true
    else if ((flag === '--diff' || flag === '--root') && value !== undefined && value !== '') {
      if (flag === '--diff') choose({ kind: 'diff', base: value })
      else root = resolve(value)
      index += 1
    } else throw new Error(`认不出的参数 ${flag ?? ''}\n${USAGE}`)
  }
  if (action === undefined) throw new Error(USAGE)
  return { action, json, root }
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
  process.exitCode = 2
}
