import type {
  AgentCheckpoint,
  AgentExecutionId,
  AgentOperationId,
} from '@omne-harness/agent-contract'
import {
  decodeExecutionRecordFacts,
  EXECUTION_RECORD_HANDLERS,
} from '@omne-harness/session-storage-sql/participants'
import {
  selectCurrentExecution,
  currentRows,
  executionFromRows,
  type CurrentRow,
  type CurrentExecution,
} from '../journal/current.ts'
import {
  advances,
  eventKindOf,
  type ExecutionView,
  type OperationEntry,
  type PublishedBatch,
} from '../journal/index.ts'
import { readEvents, splitBatch, type Reader, type Scope, type OpenRead } from './journal-read.ts'

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value)

export async function readChangedExecutions(
  read: Reader,
  scope: Scope,
  since: number,
): Promise<OpenRead> {
  let after = String(since)
  let published: string | null = null
  const executions: string[] = []
  for (;;) {
    const result = await read(EXECUTION_RECORD_HANDLERS.changedExecutions, { ...scope, after })
    const page = result.kind === 'read' ? result.output : null
    if (
      !object(page) ||
      page['kind'] !== 'changed' ||
      !count(page['published']) ||
      !Array.isArray(page['executions']) ||
      !page['executions'].every(item => typeof item === 'string') ||
      !(page['next'] === null || count(page['next']))
    )
      return { kind: 'unavailable', diagnostic: 'changed executions are not readable' }
    if (published !== null && published !== page['published'])
      return { kind: 'unavailable', diagnostic: 'changed executions moved while reading' }
    published = page['published']
    executions.push(...page['executions'])
    if (page['next'] === null) return { kind: 'read', published: Number(published), executions }
    if (BigInt(page['next']) <= BigInt(after))
      return { kind: 'unavailable', diagnostic: 'changed executions page did not advance' }
    after = page['next']
  }
}

async function rowsOf(read: Reader, scope: Scope, execution: AgentExecutionId) {
  const rows: CurrentRow[] = []
  let after: string | null = null
  let published: string | null = null
  let covered: string | null = null
  let revision: string | null = null
  for (;;) {
    const output = await read(EXECUTION_RECORD_HANDLERS.current, { ...scope, execution, after })
    if (output.kind !== 'read' || !object(output.output))
      throw new Error('current execution is not readable')
    const page = output.output
    if (page['kind'] === 'denied') return null
    if (
      page['kind'] !== 'current' ||
      !count(page['published']) ||
      !count(page['covered']) ||
      !count(page['revision']) ||
      !Array.isArray(page['rows']) ||
      !(page['next'] === null || typeof page['next'] === 'string')
    )
      throw new Error('current execution is missing or malformed')
    if (
      published !== null &&
      (published !== page['published'] ||
        covered !== page['covered'] ||
        revision !== page['revision'])
    )
      throw new Error('current execution moved while reading')
    published = page['published']
    covered = page['covered']
    revision = page['revision']
    for (const row of page['rows']) {
      if (!object(row) || typeof row['key'] !== 'string' || typeof row['value'] !== 'string')
        throw new Error('malformed current execution member')
      rows.push({ key: row['key'], value: row['value'] })
    }
    if (page['next'] === null) break
    if (after !== null && page['next'] <= after)
      throw new Error('current execution page did not advance')
    after = page['next']
  }
  const view = executionFromRows(execution, rows)
  if (String(view.head) !== covered || String(view.revision) !== revision)
    throw new Error('current execution projection does not cover its head')
  return { view, published: Number(published) }
}

function referencedPublications(view: CurrentExecution): Set<number> {
  const pubs = new Set([
    view.head,
    view.acknowledgedPublication,
    ...Object.values(view.cursorMoved),
  ])
  const visit = (value: unknown): void => {
    if (value instanceof Map) {
      for (const item of value.values()) visit(item)
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else if (object(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (key === 'pub' && typeof item === 'number') pubs.add(item)
        if (key === 'record' && typeof item === 'string') {
          const prefix = `/${view.execution}/pub/`
          const at = item.lastIndexOf(prefix)
          const suffix = at < 0 ? '' : item.slice(at + prefix.length)
          if (/^[1-9][0-9]*$/u.test(suffix)) pubs.add(Number(suffix))
        }
        visit(item)
      }
    }
  }
  visit(view)
  pubs.delete(0)
  return pubs
}

export async function readCurrentExecution(
  read: Reader,
  scope: Scope,
  execution: AgentExecutionId,
  output?: Readonly<{ after: string; limit: number }>,
  originalKeys: readonly string[] = [],
): Promise<
  | Readonly<{ kind: 'read'; published: number; view: ExecutionView }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
> {
  try {
    const current = await rowsOf(read, scope, execution)
    if (current === null) return { kind: 'absent' }
    let { view } = current
    const { published } = current
    if (originalKeys.length > 0) {
      const original = await read(EXECUTION_RECORD_HANDLERS.members, {
        ...scope,
        execution,
        keys: [...originalKeys],
      })
      const page = original.kind === 'read' ? original.output : null
      if (
        !object(page) ||
        page['kind'] !== 'members' ||
        page['revision'] !== String(view.revision) ||
        !Array.isArray(page['rows'])
      )
        throw new Error('original result members are unreadable or moved')
      const rows = new Map(currentRows(view))
      for (const item of page['rows']) {
        if (
          !object(item) ||
          typeof item['key'] !== 'string' ||
          typeof item['value'] !== 'string' ||
          !originalKeys.includes(item['key'])
        )
          throw new Error('invalid original result member')
        rows.set(item['key'], item['value'])
      }
      view = executionFromRows(
        execution,
        [...rows].map(([key, value]) => ({ key, value })),
      )
    }
    const unread = await readEvents(
      read,
      scope,
      execution,
      output?.after ?? String(view.acknowledged),
      output?.limit,
    )
    if (
      unread.kind !== 'read' ||
      Number(unread.revision) !== view.revision ||
      Number(unread.emittedThrough) !== view.emitted
    )
      throw new Error('current execution output does not match the projection')
    const pubs = referencedPublications(view)
    for (const event of unread.events) pubs.add(Number(event.published))
    const batches = new Map<number, PublishedBatch>()
    for (const pub of pubs) {
      const result = await read(EXECUTION_RECORD_HANDLERS.facts, {
        ...scope,
        after: '0',
        at: String(pub),
      })
      if (result.kind !== 'read') throw new Error('current execution publication is unreadable')
      const page = decodeExecutionRecordFacts(result.output)
      if (
        page?.kind !== 'facts' ||
        page.batches.length !== 1 ||
        page.batches[0]?.published !== String(pub)
      )
        throw new Error('current execution publication is missing')
      const split = splitBatch(scope, page.batches[0]!)
      if (split === 'malformed') throw new Error('the Agent publication does not decode')
      if (split.batch === null || split.batch.execution !== execution)
        throw new Error('current execution publication does not belong to this execution')
      batches.set(pub, split.batch)
    }
    const ops = new Map<AgentOperationId, OperationEntry>()
    const reached = new Map<number, AgentOperationId>()
    for (const batch of [...batches.values()].sort((a, b) => a.pub - b.pub)) {
      const recognized = batch.facts.find(fact => fact.kind === 'op.recognized')
      const target = recognized?.kind === 'op.recognized' ? recognized.target : null
      const original = target === null ? undefined : ops.get(target)
      if (target !== null && original === undefined)
        throw new Error('current execution has no original recognition')
      ops.set(batch.envelope.op, {
        execution,
        digest: batch.envelope.digest,
        pub: batch.pub,
        revision: original?.revision ?? batch.envelope.rev,
        target,
        recalls: recognized?.kind === 'op.recognized' && recognized.recalls === true,
        kinds: batch.envelope.kinds,
      })
      if (advances(batch)) reached.set(batch.envelope.rev, batch.envelope.op)
    }
    const events = unread.events.map(event => {
      const batch = batches.get(Number(event.published))!
      const fact = batch.facts[event.ord - 1]
      if (fact === undefined) throw new Error('current output has no original fact')
      const attachment = view.attachments.findLast(item => item.pub <= batch.pub)?.authority ?? null
      const kind = eventKindOf(fact)
      if (kind === null) throw new Error('output fact is not an event')
      return {
        eseq: Number(event.sequence),
        kind,
        pub: batch.pub,
        ord: event.ord,
        revision: batch.envelope.rev,
        attachment,
        fact,
      }
    })
    return { kind: 'read', published, view: { ...view, events, ops, reached } }
  } catch (error) {
    return { kind: 'unavailable', diagnostic: String(error) }
  }
}

export function keepCurrentExecution(
  view: ExecutionView,
  checkpoint?: AgentCheckpoint,
): ExecutionView {
  const current = selectCurrentExecution(view, checkpoint)
  const pubs = referencedPublications(current)
  const events = view.events.filter(event => event.eseq > view.acknowledged)
  for (const event of events) pubs.add(event.pub)
  const ops = new Map([...view.ops].filter(([, value]) => pubs.has(value.pub)))
  for (const value of ops.values())
    if (value.target !== null && !ops.has(value.target)) {
      const target = view.ops.get(value.target)
      if (target === undefined) throw new Error('missing original recognition')
      ops.set(value.target, target)
    }
  return {
    ...current,
    events,
    ops,
    reached: new Map([...view.reached].filter(([, op]) => ops.has(op))),
  }
}
