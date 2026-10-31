#!/usr/bin/env node
// 契约 API 快照入口：`--write` 写快照，`--check` 核对快照与 dist，`--diff <基线>` 对比基线提交上的快照并粗分类。
// `--baseline-write <提交>` 生成里程碑基线的机读区块，`--baseline <文件>` 逐成员按登记的提交核对。
// `--check` 与 `--diff` 只报告，有发现也退出 0；`--write` 有成员没写成时退出 1；`--baseline` 有判不了的成员，
// 或有 review 而没有 breakingCards 时退出 1；用法、配置、基线或工具出错退出 2。
// `--write` 与 `--check` 读 dist：先构建。`--json` 把结果按 JSON 写到标准输出。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { subjectRoot } from '../core/subject.ts'
import {
  checkBaseline,
  parseBaselineText,
  renderBaseline,
  renderBaselineBlock,
  writeBaseline,
} from './api-baseline.ts'
import {
  checkSnapshots,
  diffSnapshots,
  readContractApiConfig,
  renderCheck,
  renderDiff,
  renderWrite,
  writeSnapshots,
} from './contract-api.ts'

const USAGE =
  '用法：--write | --check | --diff <基线提交或分支> | --baseline-write <提交> [--milestone <名>] [--member <成员目录>]... | --baseline <区块文件>，可加 [--json] [--root <检出目录>]'

type Action =
  | { readonly kind: 'write' }
  | { readonly kind: 'check' }
  | { readonly kind: 'diff'; readonly base: string }
  | { readonly kind: 'baseline-write'; readonly commit: string }
  | { readonly kind: 'baseline'; readonly file: string }

interface Arguments {
  action?: Action
  json: boolean
  root: string
  milestone?: string
  members: string[]
}

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value === '' || value.startsWith('--'))
    throw new Error(`${flag} 要一个值\n${USAGE}`)
  return value
}

function choose(parsed: Arguments, action: Action): void {
  if (parsed.action !== undefined)
    throw new Error(`--write、--check、--diff、--baseline-write、--baseline 只能给一个\n${USAGE}`)
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
    case '--baseline-write':
      choose(parsed, { kind: 'baseline-write', commit: valueAfter(argv, index, flag) })
      return 2
    case '--baseline':
      choose(parsed, { kind: 'baseline', file: resolve(valueAfter(argv, index, flag)) })
      return 2
    case '--milestone':
      if (parsed.milestone !== undefined) throw new Error(`--milestone 只能给一次\n${USAGE}`)
      parsed.milestone = valueAfter(argv, index, flag)
      return 2
    case '--member':
      parsed.members.push(valueAfter(argv, index, flag))
      return 2
    default:
      throw new Error(`认不出的参数 ${flag ?? ''}\n${USAGE}`)
  }
}

type Parsed = Omit<Arguments, 'action'> & { action: Action }

function parseArguments(argv: readonly string[]): Parsed {
  const parsed: Arguments = { json: false, root: subjectRoot(), members: [] }
  for (let index = 0; index < argv.length;) index += readFlag(argv, index, parsed)
  if (parsed.action === undefined) throw new Error(USAGE)
  if (
    parsed.action.kind !== 'baseline-write' &&
    (parsed.milestone !== undefined || parsed.members.length > 0)
  )
    throw new Error(`--milestone 与 --member 只配 --baseline-write\n${USAGE}`)
  return { ...parsed, action: parsed.action }
}

function main(argv: readonly string[]): number {
  const { action, json, root, milestone, members } = parseArguments(argv)
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
    case 'baseline-write': {
      const baseline = writeBaseline(root, config, action.commit, {
        milestone: milestone ?? null,
        ...(members.length > 0 ? { members } : {}),
      })
      if (json) console.log(JSON.stringify(baseline, null, 2))
      else process.stdout.write(renderBaselineBlock(baseline))
      return 0
    }
    case 'baseline': {
      const run = checkBaseline(root, config, parseBaselineText(readFileSync(action.file, 'utf8')))
      print(run, renderBaseline(run))
      return run.refused ? 1 : 0
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
