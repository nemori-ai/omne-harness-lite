#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { integer, literal } from '../integration/parse.ts'
import { deployedCollaboration } from './collaboration-bootstrap.ts'
import { collaborationJson } from './collaboration-json.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import type { RecordWriteInput } from './collaboration-write.ts'
import { runGhCommand, type GhCommand } from './github-read.ts'
import { lineInbox } from './line-inbox.ts'
import { publishLineDelta } from './line-delta.ts'
import { publishLineState } from './line-state.ts'
import { InputError } from './protocol.ts'

export const lineCommandUsage = `Usage:
  line-inbox-cli.ts inbox --repo owner/name --parent N --milestone N [--since comment-id] [--protocol-version 1]
  line-inbox-cli.ts delta|state --repo owner/name --parent N --input record.json --journal DIR [--protocol-version 1]
inbox reads unread line-delta records; delta publishes line-delta; state publishes line-state consumption.
Writes require complete canonical records with expected revision, predecessor and stable operationId.
Unknown writes recover from the same input and journal; no automatic repost or event cursor consumption.`

export type LineCommand =
  | { kind: 'inbox'; repo: string; parent: number; milestone: number; since?: number }
  | { kind: 'delta' | 'state'; repo: string; parent: number; record: unknown; journalRoot: string }
export function executeLineCommand(
  command: LineCommand,
  dependencies: { call: GhCommand; authority: RecordWriteInput['authority'] },
) {
  if (command.kind === 'inbox') {
    const inbox = lineInbox({
      ...command,
      read: dependencies.call,
      authority: dependencies.authority,
    })
    return {
      schemaVersion: 1,
      operation: 'inbox',
      status: 'read',
      repo: command.repo,
      operationId: null,
      evidence: inbox.deltas.map(item => item.url),
      diagnostics: [],
      ...inbox,
    }
  }
  const record = parseCollaborationRecord(command.record)
  if (
    (record.kind !== 'delta' && record.kind !== 'consumption') ||
    record.context.repo !== command.repo ||
    record.lineParent !== command.parent
  )
    throw new InputError('line-command-context-mismatch')
  const input = { ...dependencies, record, journalRoot: command.journalRoot }
  const result = command.kind === 'delta' ? publishLineDelta(input) : publishLineState(input)
  return {
    schemaVersion: 1,
    operation: command.kind,
    status: result.kind,
    repo: command.repo,
    operationId: record.operationId,
    evidence: result.kind === 'confirmed' ? [result.reference] : [],
    diagnostics: result.kind === 'unknown' ? [result.reason] : [],
    result,
  }
}

export function lineCommandMain(
  args: string[],
  dependencies?: Parameters<typeof executeLineCommand>[1],
): number {
  if (args.includes('--help')) {
    process.stdout.write(lineCommandUsage + '\n')
    return 0
  }
  const [kind, ...rest] = args
  if (kind !== 'inbox' && kind !== 'delta' && kind !== 'state')
    throw new InputError(lineCommandUsage)
  const { values, tokens } = parseArgs({
    args: rest,
    strict: true,
    tokens: true,
    options: {
      repo: { type: 'string' },
      parent: { type: 'string' },
      milestone: { type: 'string' },
      since: { type: 'string' },
      input: { type: 'string' },
      journal: { type: 'string' },
      'protocol-version': { type: 'string' },
    },
  })
  const names = tokens.filter(token => token.kind === 'option').map(token => token.name)
  if (new Set(names).size !== names.length) throw new InputError('line-duplicate-option')
  literal(values['protocol-version'] ?? '1', '1', 'protocol-version')
  const repo = values.repo
  if (repo === undefined) throw new InputError('line-repo-required')
  const parent = integer(Number(values.parent), 'parent')
  let command: LineCommand
  if (kind === 'inbox') {
    if (values.input !== undefined || values.journal !== undefined)
      throw new InputError('line-inbox-write-options')
    command = {
      kind,
      repo,
      parent,
      milestone: integer(Number(values.milestone), 'milestone'),
      ...(values.since === undefined ? {} : { since: integer(Number(values.since), 'since') }),
    }
  } else {
    if (
      values.input === undefined ||
      values.journal === undefined ||
      values.milestone !== undefined ||
      values.since !== undefined
    )
      throw new InputError(lineCommandUsage)
    command = {
      kind,
      repo,
      parent,
      record: collaborationJson(readFileSync(values.input, 'utf8')),
      journalRoot: values.journal,
    }
  }
  let deps = dependencies
  if (deps === undefined) {
    const assembly = deployedCollaboration(repo)
    deps = {
      call: runGhCommand,
      authority: context => assembly.authorityFor(context.reduceIssue),
    }
  }
  const result = executeLineCommand(command, deps)
  process.stdout.write(JSON.stringify(result) + '\n')
  return result.status === 'unknown' ? 1 : 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = lineCommandMain(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'line',
        status: 'failed',
        errorCode: error instanceof Error ? error.message : 'line-command-failed',
        retryable: false,
        sideEffects: 'unknown; inspect operation journal',
        recovery: 'Repeat exact input and journal to read back; never change operationId to retry',
      }) + '\n',
    )
    process.exitCode = 2
  }
}
