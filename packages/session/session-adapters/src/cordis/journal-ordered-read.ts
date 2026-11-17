import {
  decodeExecutionRecordFacts,
  EXECUTION_RECORD_HANDLERS,
} from '@omne-harness/session-storage-sql/participants'
import type { FactBody, PublishedBatch } from '../journal/index.ts'
import { splitBatch, type Reader, type Scope } from './journal-read.ts'

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value)

export async function readOrderedFacts(
  read: Reader,
  scope: Scope,
  execution: string,
  query: Readonly<{
    collection: 'entries' | 'inputs' | 'admissions'
    after: string
    limit: number
    through?: string
  }>,
) {
  const output = await read(EXECUTION_RECORD_HANDLERS.ordered, { ...scope, execution, ...query })
  const page = output.kind === 'read' ? output.output : null
  if (object(page) && page['kind'] === 'invalid') return { kind: 'invalid' as const }
  if (
    !object(page) ||
    page['kind'] !== 'ordered' ||
    !count(page['revision']) ||
    !count(page['total']) ||
    !Array.isArray(page['rows']) ||
    page['rows'].length > query.limit ||
    !(page['next'] === null || count(page['next']))
  )
    throw new Error('ordered facts are unavailable')
  const batches = new Map<string, PublishedBatch>()
  const items: { sequence: string; fact: FactBody }[] = []
  let after = BigInt(query.after)
  for (const row of page['rows']) {
    if (
      !object(row) ||
      !count(row['sequence']) ||
      BigInt(row['sequence']) !== after + 1n ||
      !count(row['published']) ||
      typeof row['ord'] !== 'number' ||
      !Number.isSafeInteger(row['ord']) ||
      row['ord'] < 1
    )
      throw new Error('ordered facts contain a gap or invalid identity')
    let batch = batches.get(row['published'])
    if (batch === undefined) {
      const original = await read(EXECUTION_RECORD_HANDLERS.facts, {
        ...scope,
        after: '0',
        at: row['published'],
      })
      const facts = original.kind === 'read' ? decodeExecutionRecordFacts(original.output) : null
      if (
        facts?.kind !== 'facts' ||
        facts.batches.length !== 1 ||
        facts.batches[0]?.published !== row['published']
      )
        throw new Error('the original ordered publication is unavailable')
      const found = splitBatch(scope, facts.batches[0])
      if (found === 'malformed' || found.batch === null || found.batch.execution !== execution)
        throw new Error('the ordered fact names another execution')
      batch = found.batch
      batches.set(row['published'], batch)
    }
    const fact = batch.facts[row['ord'] - 1]
    if (fact === undefined) throw new Error('the ordered fact is absent from its publication')
    items.push({ sequence: row['sequence'], fact })
    after = BigInt(row['sequence'])
  }
  return {
    kind: 'read' as const,
    revision: page['revision'],
    total: page['total'],
    next: page['next'],
    items,
  }
}
