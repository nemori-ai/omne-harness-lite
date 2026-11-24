import type { ExecutionView } from '../journal/index.ts'
import { cursorReach, listedDigests, recordRefs, refsIn } from './content-refs.ts'
import { blobRowDigest } from './journal-batch.ts'
import { readBlob, type Reader } from './journal-read.ts'

// Reads content blocks by row digest into a cache; answers the first one the store does not hold.

export type BlockScope = Readonly<{ tenant: string; execution: string }>

export async function fetchBlobClosure(
  read: Reader,
  scope: BlockScope,
  digests: Iterable<string>,
  into: Map<string, string>,
): Promise<string | null> {
  for (const digest of digests) {
    if (into.has(digest)) continue
    const payload = await readBlob(read, scope.tenant, scope.execution, digest)
    if (typeof payload !== 'string') return digest
    into.set(digest, payload)
  }
  return null
}

async function fetchExecution(
  read: Reader,
  scope: BlockScope,
  execution: ExecutionView,
  into: Map<string, string>,
): Promise<string | null> {
  const named = new Set<string>()
  const lists: string[] = []
  const cursors: string[] = []
  for (const ref of recordRefs(execution)) named.add(blobRowDigest(ref))
  for (const list of execution.finish.lists.values()) lists.push(list.issued.listed.digest)
  for (const candidate of execution.finish.candidates) cursors.push(candidate.cursor.digest)
  const missing = await fetchBlobClosure(read, scope, named, into)
  if (missing !== null) return missing
  const items = new Set<string>()
  const payloadOf = (digest: string) => into.get(blobRowDigest(digest))
  for (const digest of lists) {
    const payload = payloadOf(digest)
    if (payload === undefined) continue
    for (const item of listedDigests(payload)) items.add(blobRowDigest(item))
  }
  // A candidate keeps the cursor of the step it was established on; after later steps only that cursor block names the member blocks of that step.
  const members: unknown[] = [execution.cursor]
  for (const digest of cursors) {
    const payload = payloadOf(digest)
    if (payload === undefined) continue
    const cursor = JSON.parse(payload) as { members?: unknown }
    for (const ref of refsIn(cursor)) items.add(blobRowDigest(ref))
    members.push(cursor.members)
  }
  const listed = await fetchBlobClosure(read, scope, items, into)
  if (listed !== null) return listed
  // The extension calls of a cursor are two blocks deep: the index names the calls, each call names its declaration.
  for (let depth = 0; depth < 2; depth += 1) {
    const reached = new Set<string>()
    for (const cursor of members)
      for (const ref of cursorReach(cursor, payloadOf)) reached.add(blobRowDigest(ref))
    const unread = await fetchBlobClosure(read, scope, reached, into)
    if (unread !== null) return unread
  }
  return null
}

export function fetchNamed(
  read: Reader,
  tenant: string,
  execution: ExecutionView,
  into: Map<string, string>,
): Promise<string | null> {
  return fetchExecution(read, { tenant, execution: execution.execution }, execution, into)
}
