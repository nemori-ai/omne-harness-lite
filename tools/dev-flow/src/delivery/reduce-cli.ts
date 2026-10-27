#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { fields, IntegrationError, literal, string } from '../integration/parse.ts'
import { collaborationJson } from './collaboration-json.ts'
import { InputError } from './protocol.ts'
import { deployedReduce } from './reduce-bootstrap.ts'
import {
  executeReduceCommand,
  parseReduceCommand,
  reduceCommandRepository,
} from './reduce-command.ts'
import { acknowledgeReduceSignal } from './reduce-supervise.ts'
import { parseReduceSupervision } from './reduce-supervision-input.ts'
import { runInstalledSupervision } from './reduce-supervision.ts'

class ReduceExecutionFailure extends Error {
  readonly original: unknown
  readonly repo: string
  readonly operationId: string | null
  readonly recovery: unknown
  constructor(original: unknown, repo: string, operationId: string | null, recovery: unknown) {
    super('reduce execution failed; inspect original operation')
    this.original = original
    this.repo = repo
    this.operationId = operationId
    this.recovery = recovery
  }
}

export const reduceUsage = `Usage:
  reduce-cli.ts next|claim|record|prepare|check-release|release|supervise|ack --input FILE
All JSON inputs require schemaVersion:1. No bootstrap module or workflow-head override is accepted.
next: {context, owner, since?}; reads the full current queue, including older pending requests.
claim|record|prepare: {record, journalRoot, checkpoint}; record is a canonical state record.
check-release: {record, readinessEvidence}; checks readiness without acceptance or publication.
release: {record, readinessEvidence, journalRoot}; requires the existing exact acceptance.
prepare saves the pre-push candidate intent; it does not push, merge or approve a workflow.
Unknown outcomes require the same operationId, input and journal. Never retry with a new identity.
The installed v3 descriptor supplies the gate workflow revision and all authority sources.
supervise: {context,owner,epoch,operationId,journalRoot,phase,deadline,timeoutMs?,file,runs,candidates,local,release}.
Use absolute paths for supervision files. release is null or {record,readinessEvidence}; required in closing phases.
Remote probes run in separate read-only processes. Local health runs every 5s, active runs every 10s.
ack: {supervision:originalInput,id:signalId,evidence:handlingEvidence}; acknowledges only the local signal.
Returning a signal never acknowledges it or changes business state. Resume with the original input and journal.
Exit 0: observed result; 1: unknown outcome; 2: invalid input, conflict or unavailable evidence;
3: supervision timed out; 130: supervision cancelled. No automatic workflow approval.`

function readInput(rest: string[]): unknown {
  const { values, tokens } = parseArgs({
    args: rest,
    strict: true,
    tokens: true,
    options: { input: { type: 'string' } },
  })
  if (tokens.length !== 1 || values.input === undefined)
    throw new InputError('reduce-one-input-required')
  return collaborationJson(readFileSync(values.input, 'utf8'))
}

export function reduceMain(args: string[], bootstrap = deployedReduce): number {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(reduceUsage + '\n')
    return 0
  }
  const [operation, ...rest] = args
  const command = parseReduceCommand(operation, readInput(rest))
  const repo = reduceCommandRepository(command)
  try {
    const result = executeReduceCommand(command, bootstrap(repo))
    process.stdout.write(JSON.stringify(result) + '\n')
    return result.status === 'unknown' ? 1 : 0
  } catch (error) {
    throw new ReduceExecutionFailure(
      error,
      repo,
      command.kind === 'next' ? null : command.input.record.operationId,
      {
        journalRoot: 'journalRoot' in command.input ? command.input.journalRoot : null,
        action:
          'Read original journal and current remote facts; retain input and operation ID. Do not repost with a new ID.',
      },
    )
  }
}

export async function reduceCli(args: string[]): Promise<number> {
  const [operation, ...rest] = args
  if (operation !== 'supervise' && operation !== 'ack') return reduceMain(args)
  const value = readInput(rest)
  if (operation === 'ack') {
    const v = fields(value, ['schemaVersion', 'supervision', 'id', 'evidence'], 'ack')
    literal(v.schemaVersion, 1, 'schemaVersion')
    const { input } = parseReduceSupervision(v.supervision)
    const id = string(v.id, 'signal id')
    acknowledgeReduceSignal(input, id, string(v.evidence, 'handling evidence'))
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        operation,
        status: 'acknowledged',
        repo: input.context.repo,
        operationId: input.operationId,
        id,
        evidence: [v.evidence],
        diagnostics: [],
      }) + '\n',
    )
    return 0
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  try {
    const result = await runInstalledSupervision(value, controller.signal)
    process.stdout.write(
      JSON.stringify({
        ...result,
        ...(result.status === 'actionable'
          ? {}
          : {
              errorCode: `reduce-supervision-${result.status}`,
              retryable: true,
              sideEffects: 'local-journal-only',
              recovery: result.resume,
            }),
      }) + '\n',
    )
    return result.status === 'timeout' ? 3 : result.status === 'cancelled' ? 130 : 0
  } finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await reduceCli(process.argv.slice(2))
  } catch (error) {
    const cause = error instanceof ReduceExecutionFailure ? error.original : error
    const diagnostic =
      cause instanceof InputError || cause instanceof IntegrationError
        ? cause.message
        : 'reduce-command-failed; details omitted'
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        operation: process.argv[2] ?? null,
        status: 'error',
        repo: error instanceof ReduceExecutionFailure ? error.repo : null,
        operationId: error instanceof ReduceExecutionFailure ? error.operationId : null,
        evidence: [],
        diagnostics: [diagnostic],
        errorCode: 'reduce-command-failed',
        retryable: false,
        sideEffects: 'unknown',
        recovery:
          error instanceof ReduceExecutionFailure
            ? error.recovery
            : {
                action:
                  'Inspect the original input, journal and remote facts before resuming; do not create a replacement operation.',
              },
      }) + '\n',
    )
    process.stderr.write(diagnostic + '\n')
    process.exitCode = 2
  }
}
