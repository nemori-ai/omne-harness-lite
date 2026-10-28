#!/usr/bin/env node
import { resolve } from 'node:path'
import { TaskContextError } from '@omne-harness/repo-toolchain/core/task-context'
import { IntegrationError } from '../integration/parse.ts'
import { changeScope } from './change-scope.ts'

const usage = 'Usage: change-scope-cli.ts [--root PATH] [--lines FILE]'

function options(args: readonly string[]): { root: string; lines?: string } {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index] ?? '',
      value = args[index + 1]
    if (
      !['--root', '--lines'].includes(key) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(key)
    )
      throw new IntegrationError('input-error', usage)
    values.set(key, value)
  }
  const lines = values.get('--lines')
  return {
    root: resolve(values.get('--root') ?? process.cwd()),
    ...(lines === undefined ? {} : { lines: resolve(lines) }),
  }
}
/**
 * Checks that the changes of the card bound to this tree stay in its write scope and line, and
 * that its contract snapshot changes stay within its declared contract change. Standard output
 * is the JSON report. Exit 0 without findings or without a task context, 1 with findings, 2 on
 * unusable input or a failed read, including a failed `omne-contract-api --diff`.
 */
function main(args: readonly string[]): number {
  const { root, lines } = options(args)
  const report = changeScope({ root, ...(lines === undefined ? {} : { linesFile: lines }) })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.bound) {
    process.stderr.write(`change-scope: ${report.message}\n`)
    return 0
  }
  for (const finding of report.findings)
    process.stderr.write(
      `change-scope: ${finding.code} ${'file' in finding ? finding.file : finding.member}: ${finding.message} 改法：${finding.remedy}\n`,
    )
  return report.findings.length > 0 ? 1 : 0
}
try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      code:
        error instanceof IntegrationError || error instanceof TaskContextError
          ? error.code
          : 'unknown',
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  )
  process.exitCode = 2
}
