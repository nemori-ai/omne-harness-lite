import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import physicalProcess from 'node:process'
import { isOk, parseOpaqueIdentifier, parseTenantId } from '@omne-harness-lite/identity-values'
import type {
  AppendFence,
  AppendCondition,
  LogEntryInput,
  SessionRef,
  TenantId,
  ProcessOwnership,
} from '../src/index.ts'
import { fileIo, type FileIo, type LogFile } from '../src/file-io.ts'

const knownProcesses = new Map<string, { exited: boolean }>()
export function registerPhysicalProcess(owner: string, exit: Promise<unknown>): void {
  const life = { exited: false }
  knownProcesses.set(owner, life)
  exit.then(
    () => {
      life.exited = true
    },
    () => {},
  )
}
// Keep one identity on the actual Node process, even across Vitest module isolation.
const lifeKey = Symbol.for('omne-session-log-test-physical-life')
const savedLife: unknown = Reflect.get(physicalProcess, lifeKey)
const current = typeof savedLife === 'string' ? savedLife : `vitest-life:${randomUUID()}`
if (savedLife === undefined) Reflect.set(physicalProcess, lifeKey, current)
else if (typeof savedLife !== 'string') throw new Error('invalid test physical process identity')
export const processOwnership: ProcessOwnership = Object.freeze({
  current,
  async observeExit(owner: string) {
    const life = knownProcesses.get(owner)
    return life === undefined ? 'unknown' : life.exited ? 'exited' : 'alive'
  },
})

const parsedTenant = parseTenantId({ organization: 'organization', account: 'account' })
if (!isOk(parsedTenant)) throw new Error('invalid tenant fixture')
export const tenant: TenantId = parsedTenant.ok
export const unfenced: AppendFence = { kind: 'unfenced' }
export const unconditional: AppendCondition = { kind: 'unconditional' }
export function session(value = 'session'): SessionRef {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  if (!isOk(parsed)) throw new Error('invalid session fixture')
  return parsed.ok
}
export function entry(
  key = 'key',
  payload: LogEntryInput['payload'] = { text: 'one' },
): LogEntryInput {
  return { tenant, dedupeKey: key, readKeys: ['read', key], payload }
}
export async function root(): Promise<string> {
  const base = fileURLToPath(
    new URL('../../../../tmp/model-request-runtime/b1-log-implementation/', import.meta.url),
  )
  await mkdir(base, { recursive: true })
  const workers = join(base, 'physical-workers')
  await mkdir(workers, { recursive: true })
  await writeFile(
    join(workers, `${physicalProcess.pid}.json`),
    JSON.stringify({ pid: physicalProcess.pid, current, node: physicalProcess.version }),
  )
  return mkdtemp(join(base, 'io-'))
}
export function paths(
  dir: string,
  id = 'session',
): { readonly directory: string; readonly entries: string; readonly index: string } {
  const directory = join(dir, createHash('sha256').update(id).digest('hex'))
  return {
    directory,
    entries: join(directory, 'entries.jsonl'),
    index: join(directory, 'index.jsonl'),
  }
}
export function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => {
    throw new Error('deferred not initialized')
  }
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
export function interceptFiles(intercept: (path: string, file: LogFile) => LogFile): FileIo {
  return {
    ...fileIo,
    async open(path, flags) {
      return intercept(path, await fileIo.open(path, flags))
    },
  }
}
