import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { canonical, digest, fields, integer, literal } from '../integration/parse.ts'
import { strictJson } from './strict-json.ts'
import { parseRequestInput } from './collaboration-parse.ts'
import type { RequestInput, WorkflowEvidence } from './collaboration-records.ts'
import { parseWorkflow, utcTime, uuid } from './collaboration-values.ts'
import { InputError } from './protocol.ts'

export type RequestIntent = {
  schemaVersion: 1
  operationId: string
  input: RequestInput
  workflow: Omit<WorkflowEvidence, 'runId' | 'runAttempt'>
  preparedAt: string
}

function durableFile(path: string, value: unknown): void {
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(fd, canonical(value) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function syncDirectory(path: string): void {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function parseIntent(value: unknown): RequestIntent {
  const v = fields(
    value,
    ['schemaVersion', 'operationId', 'input', 'workflow', 'preparedAt'],
    'request intent',
  )
  const input = parseRequestInput(v.input)
  const w = fields(v.workflow, ['path', 'ref', 'head', 'inputDigest'], 'request workflow')
  const {
    runId: _id,
    runAttempt: _attempt,
    ...workflow
  } = parseWorkflow({ ...w, runId: 1, runAttempt: 1 })
  if (workflow.inputDigest !== digest(canonical(input)))
    throw new InputError('integration-request-journal-digest-mismatch')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'intent.schemaVersion'),
    operationId: uuid(v.operationId, 'intent.operationId'),
    input,
    workflow,
    preparedAt: utcTime(v.preparedAt, 'intent.preparedAt'),
  }
}

export class RequestJournal {
  readonly directory: string
  constructor(root: string, input: RequestInput) {
    this.directory = join(
      root,
      digest(
        canonical([
          input.context.repo,
          input.context.milestone,
          input.context.wave,
          input.lineParent,
          input.requestId,
        ]),
      ),
    )
    const first = mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    if (first !== undefined) {
      for (let directory = resolve(this.directory); ; directory = dirname(directory)) {
        syncDirectory(directory)
        syncDirectory(dirname(directory))
        if (directory === resolve(first)) break
      }
    }
    syncDirectory(root)
  }
  lock<T>(run: () => T): T {
    const path = join(this.directory, 'lock')
    try {
      durableFile(path, { pid: process.pid })
    } catch (error) {
      if (existsSync(path)) throw new InputError('integration-request-journal-locked')
      throw error
    }
    try {
      return run()
    } finally {
      unlinkSync(path)
      syncDirectory(this.directory)
    }
  }
  read(): RequestIntent | null {
    const path = join(this.directory, 'intent.json')
    return existsSync(path) ? parseIntent(strictJson(readFileSync(path, 'utf8'))) : null
  }
  prepare(intent: RequestIntent): RequestIntent {
    const previous = this.read()
    if (previous !== null) {
      if (
        canonical(previous.input) !== canonical(intent.input) ||
        previous.operationId !== intent.operationId
      )
        throw new InputError('integration-request-journal-conflict')
      return previous
    }
    durableFile(join(this.directory, 'intent.json'), intent)
    syncDirectory(this.directory)
    return intent
  }
  get attempted(): boolean {
    const path = join(this.directory, 'attempted.json')
    if (!existsSync(path)) return false
    const intent = this.read()
    const value = fields(
      strictJson(readFileSync(path, 'utf8')),
      ['operationId', 'inputDigest'],
      'dispatch intent',
    )
    if (
      intent === null ||
      value.operationId !== intent.operationId ||
      value.inputDigest !== intent.workflow.inputDigest
    )
      throw new InputError('integration-request-dispatch-journal-conflict')
    return true
  }
  attemptedDispatch(intent: RequestIntent): void {
    durableFile(join(this.directory, 'attempted.json'), {
      operationId: intent.operationId,
      inputDigest: intent.workflow.inputDigest,
    })
    syncDirectory(this.directory)
  }
  saveRun(runId: number): void {
    const path = join(this.directory, 'run.json')
    if (existsSync(path)) {
      if (this.runId() !== runId) throw new InputError('integration-request-dispatch-run-conflict')
      return
    }
    durableFile(path, { runId })
    syncDirectory(this.directory)
  }
  runId(): number | null {
    const path = join(this.directory, 'run.json')
    if (!existsSync(path)) return null
    const v = fields(strictJson(readFileSync(path, 'utf8')), ['runId'], 'dispatch run')
    return integer(v.runId, 'dispatch.runId')
  }
}
