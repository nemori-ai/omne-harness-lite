#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BriefInputError,
  checkBrief,
  gitRepository,
  gitRoot,
  resolveCommit,
  type Finding,
} from './brief-check.ts'

const usage =
  'Usage: brief-check-cli.ts --spec <closure spec.md> --base <commit> [--root <checkout>] [--json] [--strict]'
const VALUE_FLAGS = ['--spec', '--base', '--root'] as const
const SWITCHES = ['--json', '--strict'] as const

function options(args: readonly string[]) {
  const values = new Map<string, string>()
  const switches = new Set<string>()
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index] as string
    if (SWITCHES.some(name => name === flag) && !switches.has(flag)) switches.add(flag)
    else if (VALUE_FLAGS.some(name => name === flag) && !values.has(flag)) {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--')) throw new BriefInputError(usage)
      values.set(flag, value)
      index += 1
    } else throw new BriefInputError(usage)
  }
  const spec = values.get('--spec'),
    base = values.get('--base')
  if (spec === undefined || base === undefined) throw new BriefInputError(usage)
  return {
    spec,
    base,
    root: values.get('--root'),
    json: switches.has('--json'),
    strict: switches.has('--strict'),
  }
}
/** Relative paths resolve against `INIT_CWD` (set by pnpm) when present, else the current directory. */
const argumentPath = (path: string) => resolve(process.env['INIT_CWD'] ?? process.cwd(), path)
function humanLine(level: 'error' | 'warning', finding: Finding): string {
  const where = finding.line === null ? '' : `, line ${finding.line}`
  return `${level}: ${finding.message} [item ${finding.item}${where}]`
}

try {
  const given = options(process.argv.slice(2))
  let text: string
  try {
    text = readFileSync(argumentPath(given.spec), 'utf8')
  } catch (error) {
    throw new BriefInputError(
      `--spec ${given.spec}: cannot read (${(error as NodeJS.ErrnoException).code ?? 'error'})`,
    )
  }
  const root = given.root === undefined ? gitRoot(process.cwd()) : argumentPath(given.root)
  const commit = resolveCommit(root, given.base)
  const report = checkBrief(text, gitRepository(root, commit), { strict: given.strict })
  if (given.json) process.stdout.write(`${JSON.stringify(report)}\n`)
  else {
    const lines = [
      ...report.errors.map(finding => humanLine('error', finding)),
      ...report.warnings.map(finding => humanLine('warning', finding)),
    ]
    if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)
  }
  process.exitCode = report.errors.length > 0 ? 1 : 0
} catch (error) {
  if (!(error instanceof BriefInputError)) throw error
  process.stderr.write(`brief-check: ${error.message}\n`)
  process.exitCode = 2
}
