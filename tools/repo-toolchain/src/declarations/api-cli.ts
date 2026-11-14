#!/usr/bin/env node
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

const USAGE = `用法：--write | --check | --diff <基线提交或分支> | --baseline-write <提交> [--milestone <名>] [--member <成员目录>]... | --baseline <区块文件>，可加 [--json] [--root <检出目录>]
给每个契约成员一份 API 快照，并把快照之间的差异粗分为 none、additive、review。动作只给一个：
  --write                    从 dist 重写快照。先构建。
  --check                    拿 dist 现场生成的快照与快照文件比。
  --diff <基线>              基线提交上的快照对工作树的快照，逐成员分类。只比快照文件，先用 --check 确认快照与 dist 一致。判断改动是否可加时，传里程碑登记的基线提交。
  --baseline-write <提交>    生成里程碑基线登记的 json omne-contract-baseline:v1 区块。--milestone 写里程碑名，--member 只写指定成员（可给几次）。
  --baseline <区块文件>      逐成员从登记的提交比到工作树的快照。文件是 JSON 对象，或恰好含一个区块的文本（例如登记评论的正文）。
  --json                     结果按 JSON 写到标准输出。--check --json 给出每份快照文件的 sha256。
  --root                     被检查的检出，缺省取 OMNE_SUBJECT_ROOT，再取当前目录所在 Git 仓库的根。
配置：repo-toolchain.config.json 的 contractApi 一节（members、snapshot）。
退出 0 完成；1 --write 有成员没写成，或 --baseline 有判不了的成员、分类为 review 而没有 breakingCards；2 用法、配置、Git、区块格式或工具出错。`

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

if (process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message)
  process.exitCode = 2
}
