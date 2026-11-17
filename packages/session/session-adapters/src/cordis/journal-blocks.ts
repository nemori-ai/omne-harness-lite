import type { CursorMembers, ExecutionView, PassageBlock, PassageIndex } from '../journal/index.ts'
import { blobRowDigest } from './journal-batch.ts'
import { readBlob, type Reader } from './journal-read.ts'

/** Reads one block by its row digest: its payload, null when the Journal holds none, or unavailable. */
export type BlockRead = (row: string) => Promise<string | null | 'unavailable'>

export const blockReadOf =
  (read: Reader, tenant: string): BlockRead =>
  row =>
    readBlob(read, tenant, row)

async function fetchBlobClosure(
  read: BlockRead,
  digests: Iterable<string>,
  into: Map<string, string>,
): Promise<string | null> {
  for (const digest of digests) {
    if (into.has(digest)) continue
    const payload = await read(digest)
    if (payload === null || payload === 'unavailable') return digest
    into.set(digest, payload)
  }
  return null
}

const HEX_DIGEST = /^[0-9a-f]{64}$/

function refsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return into
  if (value instanceof Map) {
    for (const member of value.values()) refsIn(member, into)
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) refsIn(item, into)
    return into
  }
  const record = value as Record<string, unknown>
  if (
    typeof record['digest'] === 'string' &&
    HEX_DIGEST.test(record['digest']) &&
    typeof record['size'] === 'number'
  )
    into.add(record['digest'])
  for (const member of Object.values(record)) refsIn(member, into)
  return into
}

function listedDigests(payload: string): string[] {
  const value = JSON.parse(payload) as unknown
  if (!Array.isArray(value)) return []
  return value.flatMap(item =>
    Array.isArray(item) && typeof item[1] === 'string' && HEX_DIGEST.test(item[1]) ? [item[1]] : [],
  )
}

type CandidateCursor = Readonly<{ members?: Partial<CursorMembers> }>

/**
 * Reads the blocks the executions name, then the blocks those name, level by level.
 * Answers the row of the first block that is not readable, or null when all are held.
 */
export async function fetchNamed(
  read: BlockRead,
  executions: Iterable<ExecutionView>,
  into: Map<string, string>,
): Promise<string | null> {
  const views = [...executions]
  const payloads = (digests: readonly string[]): string[] =>
    digests.flatMap(digest => into.get(blobRowDigest(digest)) ?? [])
  const held = <Block>(digests: readonly string[]): Block[] =>
    payloads(digests).map(payload => JSON.parse(payload) as Block)
  // A candidate keeps the cursor of the step it was established on; after later steps only that cursor block names the member blocks of that step.
  const cursors = () =>
    held<CandidateCursor>(
      views.flatMap(view => view.finish.candidates.map(candidate => candidate.cursor.digest)),
    )
  const lists = () =>
    payloads(
      views.flatMap(view => [...view.finish.lists.values()].map(list => list.issued.listed.digest)),
    )
  const calls = () =>
    held<PassageIndex>(
      [
        ...views.map(view => view.cursor.passages),
        ...cursors().map(cursor => cursor.members?.passages),
      ].flatMap(index => index?.digest ?? []),
    ).flatMap(index => index.map(call => call.digest))
  const levels: readonly (() => readonly string[])[] = [
    () => views.flatMap(view => [...refsIn(view)]),
    () => [...lists().flatMap(listedDigests), ...cursors().flatMap(cursor => [...refsIn(cursor)])],
    calls,
    () => held<PassageBlock>(calls()).map(call => call.declaration.digest),
  ]
  for (const level of levels) {
    const missing = await fetchBlobClosure(read, new Set(level().map(blobRowDigest)), into)
    if (missing !== null) return missing
  }
  return null
}
