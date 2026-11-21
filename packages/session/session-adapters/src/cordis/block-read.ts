import type { ExecutionView } from '../journal/index.ts'
import { listedDigests, recordRefs, refsIn } from './content-refs.ts'
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
  for (const digest of lists) {
    const payload = into.get(blobRowDigest(digest))
    if (payload === undefined) continue
    for (const item of listedDigests(payload)) items.add(blobRowDigest(item))
  }
  // A candidate keeps the cursor of the step it was established on; after later steps only that cursor block names the member blocks of that step.
  for (const digest of cursors) {
    const payload = into.get(blobRowDigest(digest))
    if (payload === undefined) continue
    for (const ref of refsIn(JSON.parse(payload) as unknown)) items.add(blobRowDigest(ref))
  }
  return fetchBlobClosure(read, scope, items, into)
}

export function fetchNamed(
  read: Reader,
  tenant: string,
  execution: ExecutionView,
  into: Map<string, string>,
): Promise<string | null> {
  return fetchExecution(read, { tenant, execution: execution.execution }, execution, into)
}
