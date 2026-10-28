import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { object, string } from '../integration/parse.ts'
import { decodeRecordComment } from './collaboration-comments.ts'
import { strictJson } from './strict-json.ts'
import type { ReleaseRecord, WaveIdentity } from './collaboration-records.ts'
import type { ReduceRequest } from './reduce-integration-read.ts'
import { InputError } from './protocol.ts'

/** An absent write receipt blocks a different operation, even when the caller changes its UUID. */
export function assertReduceOperationsSettled(
  root: string,
  context: WaveIdentity,
  operationId: string,
  requests: ReduceRequest[],
): void {
  if (!existsSync(root)) return
  const observed = new Set(
    requests.flatMap(request => request.history.map(item => item.record.operationId)),
  )
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === operationId) continue
    const path = join(root, entry.name, 'intent.json')
    if (!existsSync(path)) continue
    const intent = object(strictJson(readFileSync(path, 'utf8')), 'pending intent')
    const record = decodeRecordComment(string(intent.body, 'pending intent.body'))
    if (
      record?.kind !== 'state' ||
      record.context.repo !== context.repo ||
      record.context.milestone !== context.milestone ||
      record.context.reduceIssue !== context.reduceIssue
    )
      continue
    if (!observed.has(record.operationId))
      throw new InputError('reduce-previous-write-outcome-unknown')
  }
}

/** A release attempt belongs to one operation until its remote outcome is reconciled. */
export function assertReduceReleaseOperation(root: string, release: ReleaseRecord): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === release.operationId) continue
    const folder = join(root, entry.name)
    if (!existsSync(join(folder, 'publish.json'))) continue
    const path = join(folder, 'release.json')
    if (!existsSync(path)) throw new InputError('reduce-release-intent-missing')
    const intent = object(strictJson(readFileSync(path, 'utf8')), 'release intent')
    const previous = object(intent.release, 'release intent.record')
    const context = object(previous.context, 'release intent.context')
    if (
      context.repo === release.context.repo &&
      context.milestone === release.context.milestone &&
      context.reduceIssue === release.context.reduceIssue
    )
      throw new InputError('reduce-previous-release-attempt-exists')
  }
}
