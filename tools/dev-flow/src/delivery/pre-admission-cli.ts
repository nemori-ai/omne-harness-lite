#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { preAdmission } from './pre-admission.ts'
import { InputError } from './protocol.ts'

export function preAdmissionMain(args: string[]): number {
  const { values, tokens } = parseArgs({
    args,
    strict: true,
    tokens: true,
    options: {
      worktree: { type: 'string' },
      journal: { type: 'string' },
      'operation-id': { type: 'string' },
      help: { type: 'boolean' },
    },
  })
  const names = tokens.filter(token => token.kind === 'option').map(token => token.name)
  if (new Set(names).size !== names.length) throw new InputError('pre-admission-duplicate-option')
  if (values.help) {
    process.stdout.write(
      'Usage: pre-admission-cli.ts [--worktree PATH] --journal DIR [--operation-id UUID]\nRuns acceptance-lock, affected build, declarations, contract-api, lines, docs, design, deps, rules, oxlint and format; stops with the failed step exit code.\n',
    )
    return 0
  }
  if (values.journal === undefined) throw new InputError('pre-admission-journal-required')
  const operationId = values['operation-id'] ?? randomUUID()
  const result = preAdmission({
    worktree: values.worktree ?? process.cwd(),
    journalRoot: values.journal,
    operationId,
  })
  process.stdout.write(
    JSON.stringify({ schemaVersion: 1, operation: 'pre-admission', operationId, ...result }) + '\n',
  )
  return result.exitCode
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = preAdmissionMain(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        status: 'failed',
        errorCode: error instanceof Error ? error.message : 'pre-admission-failed',
      }) + '\n',
    )
    process.exitCode = 2
  }
}
