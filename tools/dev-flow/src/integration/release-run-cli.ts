#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { strictJson } from '../delivery/strict-json.ts'
import { runGhCommand } from '../delivery/github-read.ts'
import { InputError } from '../delivery/protocol.ts'
import { releaseRun, type ReleaseRunOptions } from './release-run.ts'
import { parseReleaseRunInput } from './release-run-protocol.ts'

export async function releaseRunMain(
  args: string[],
  dependencies?: Pick<ReleaseRunOptions, 'call' | 'now' | 'sleep'>,
): Promise<number> {
  const { values, tokens } = parseArgs({
    args,
    strict: true,
    tokens: true,
    options: {
      input: { type: 'string' },
      journal: { type: 'string' },
      approve: { type: 'boolean' },
      note: { type: 'string' },
      timeout: { type: 'string' },
      help: { type: 'boolean' },
    },
  })
  const names = tokens.filter(token => token.kind === 'option').map(token => token.name)
  if (new Set(names).size !== names.length) throw new InputError('release-run-duplicate-option')
  if (values.help) {
    process.stdout.write(
      'Usage: release-run-cli.ts --input release.json --journal DIR [--approve --note FILE] [--timeout SECONDS]\nDispatches gate-release.yml on github-gate once. Input: schemaVersion=1, repo, operationId, package, commit, issue, dryRun, workflowHead. The exact workflowHead must match github-gate. Approval is limited to npm-release and current GitHub permission. This command is distinct from whole-wave release. Resume with the exact same input and journal.\n',
    )
    return 0
  }
  if (
    values.input === undefined ||
    values.journal === undefined ||
    Boolean(values.approve) !== (values.note !== undefined)
  )
    throw new InputError('release-run-input-journal-or-approval-options-invalid')
  const input = parseReleaseRunInput(strictJson(readFileSync(values.input, 'utf8')))
  const result = await releaseRun({
    ...dependencies,
    call: dependencies?.call ?? runGhCommand,
    input,
    journalRoot: values.journal,
    approval:
      values.approve && values.note !== undefined
        ? { kind: 'approve', note: readFileSync(values.note, 'utf8') }
        : { kind: 'observe' },
    timeoutMs: Number(values.timeout ?? '5400') * 1000,
  })
  process.stdout.write(
    JSON.stringify({
      schemaVersion: 1,
      operation: 'release-run',
      repo: input.repo,
      operationId: input.operationId,
      evidence:
        result.runId === null
          ? []
          : [
              `https://github.com/${input.repo}/actions/runs/${result.runId}/attempts/${result.runAttempt}`,
            ],
      diagnostics: [result.diagnostic],
      ...result,
    }) + '\n',
  )
  return result.status === 'completed' && result.conclusion === 'success' ? 0 : 1
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await releaseRunMain(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        schemaVersion: 1,
        operation: 'release-run',
        status: 'failed',
        errorCode: error instanceof Error ? error.message : 'release-run-failed',
        retryable: false,
        sideEffects: 'unknown; inspect operation journal',
        recovery: 'Repeat exact input and journal; do not select latest run or redispatch',
      }) + '\n',
    )
    process.exitCode = 2
  }
}
