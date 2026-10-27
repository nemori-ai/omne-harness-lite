#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { collaborationJson } from './collaboration-json.ts'
import { parseRequestInput } from './collaboration-parse.ts'
import { WaitTimeout } from './events-wait.ts'
import { InputError } from './protocol.ts'
import { runReduceWatch, type ReduceWatchInput } from './reduce-watch.ts'
import type { ReduceWatchPorts } from './reduce-watch-materials.ts'

export const reduceWatchUsage =
  'watch --repo owner/name --parent N --operation-id UUID --journal PATH --file PATH [--watch-reduce-issue N] [--next-reduce-issue N] [--timeout SECONDS] [--purpose disposition --request-input PATH]'
export type ReduceWatchBootstrap = (
  input: ReduceWatchInput,
) => ReduceWatchPorts | Promise<ReduceWatchPorts>
export type ReduceWatchIO = {
  stdout: (text: string) => void
  stderr: (text: string) => void
  signal?: AbortSignal
}

export function parseReduceWatchArgs(argv: string[]): ReduceWatchInput {
  const args = argv[0] === 'watch' ? argv.slice(1) : argv
  const parsed = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    tokens: true,
    options: {
      repo: { type: 'string' },
      parent: { type: 'string' },
      'operation-id': { type: 'string' },
      journal: { type: 'string' },
      file: { type: 'string' },
      'watch-reduce-issue': { type: 'string' },
      'next-reduce-issue': { type: 'string' },
      timeout: { type: 'string' },
      purpose: { type: 'string' },
      'request-input': { type: 'string' },
      'recover-lock': { type: 'boolean' },
    },
  })
  const seen = new Set<string>()
  for (const token of parsed.tokens)
    if (token.kind === 'option') {
      if (seen.has(token.name)) throw new InputError(`watch-duplicate-option:${token.name}`)
      seen.add(token.name)
    }
  const v = parsed.values
  const required = (value: string | undefined, name: string) => {
    if (value === undefined || value.trim() === '' || value.startsWith('--'))
      throw new InputError(`watch-required:${name}`)
    return value
  }
  const issue = (value: string | undefined, name: string) => {
    const text = required(value, name)
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)))
      throw new InputError(`watch-invalid:${name}`)
    return Number(text)
  }
  let purpose: ReduceWatchInput['purpose'] = { kind: 'wave' }
  if (v.purpose === 'disposition') {
    const request = parseRequestInput(
      collaborationJson(readFileSync(required(v['request-input'], 'request-input'), 'utf8')),
    )
    if (request.context.repo !== v.repo || request.lineParent !== issue(v.parent, 'parent'))
      throw new InputError('watch-request-input-owner')
    purpose = { kind: 'disposition', requestId: request.requestId, tasks: request.tasks }
  } else if ((v.purpose !== undefined && v.purpose !== 'wave') || v['request-input'] !== undefined)
    throw new InputError('watch-purpose-invalid')
  const seconds = v.timeout === undefined ? undefined : Number(v.timeout)
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0))
    throw new InputError('watch-timeout-invalid')
  return {
    repo: required(v.repo, 'repo'),
    lineParent: issue(v.parent, 'parent'),
    operationId: required(v['operation-id'], 'operation-id'),
    journal: required(v.journal, 'journal'),
    file: required(v.file, 'file'),
    purpose,
    ...(v['recover-lock'] === undefined ? {} : { recoverLock: v['recover-lock'] }),
    ...(v['watch-reduce-issue'] === undefined
      ? {}
      : { watchReduceIssue: issue(v['watch-reduce-issue'], 'watch-reduce-issue') }),
    ...(v['next-reduce-issue'] === undefined
      ? {}
      : { nextReduceIssue: issue(v['next-reduce-issue'], 'next-reduce-issue') }),
    ...(seconds === undefined ? {} : { timeoutMs: Math.round(seconds * 1000) }),
  }
}

/** Bootstrap is supplied by the adopted tool assembly, never selected by caller JSON or a CLI module path. */
export async function runReduceWatchCli(
  argv: string[],
  bootstrap: ReduceWatchBootstrap,
  io: ReduceWatchIO,
): Promise<number> {
  let input: ReduceWatchInput | undefined
  try {
    input = parseReduceWatchArgs(argv)
    if (io.signal !== undefined) input.signal = io.signal
    const result = await runReduceWatch(input, await bootstrap(input))
    io.stdout(`${JSON.stringify(result)}\n`)
    return 0
  } catch (error) {
    const cancelled = io.signal?.aborted === true
    const timeout = error instanceof WaitTimeout
    const code = cancelled ? 130 : timeout ? 3 : 2
    const status = cancelled ? 'cancelled' : timeout ? 'timed-out' : 'unknown'
    const message =
      error instanceof InputError
        ? error.message
        : timeout
          ? 'watch-timeout'
          : cancelled
            ? 'watch-cancelled'
            : 'watch-read-or-input-failed'
    const result = {
      schemaVersion: 1,
      operation: 'watch',
      operationId: input?.operationId ?? null,
      repo: input?.repo ?? null,
      status,
      released: false,
      errorCode: message,
      retryable: !cancelled,
      effects: ['local wait journal may exist; no remote writes'],
      recovery:
        'Read the saved operation and current authority through the same command. Use --recover-lock only to recover a saved lock after the recorded local process has stopped.',
      evidence: [],
      diagnostics: [message],
    }
    io.stdout(`${JSON.stringify(result)}\n`)
    io.stderr(`${message}\n`)
    return code
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const controller = new AbortController()
  const cancel = () => controller.abort(new Error('watch-cancelled'))
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  process.exitCode = await runReduceWatchCli(
    process.argv.slice(2),
    () => {
      throw new InputError(
        'watch-adopted-bootstrap-required: invoke through the adopted root assembly',
      )
    },
    {
      stdout: text => process.stdout.write(text),
      stderr: text => process.stderr.write(text),
      signal: controller.signal,
    },
  )
  process.removeListener('SIGINT', cancel)
  process.removeListener('SIGTERM', cancel)
}
