// The reader records of one execution projected from the folded view and the content blocks
// (session-adapters SPEC "事实族存储"): what the K-23 bridge rebuilds from its `core.*` facts,
// derived from the fact family instead. The projection is field by field, so that its parity with
// the writer's records can be measured one field at a time (tests/journal-records-parity.spec.ts):
// `projectExecution` answers the fields it derives, `fieldsDiff` names the fields that equal the
// writer's, differ from them, or are not derived yet. A field derived here no longer needs the
// bridge; the bridge is removed once every field is.
import type {
  AcceptedInput,
  AgentOperationId,
  CommandReceipt,
  ControlRecord,
  DurableEvidence,
  ExecutionState,
  ResultResponsibility,
  TerminalObservation,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { canonical } from './canonical.ts'
import {
  batchEvidence,
  checkpointOf,
  type BlobStore,
  type ExecutionView,
  type Mint,
  type OperationEntry,
  type PublishedBatch,
} from '../journal/index.ts'
import type { AdmissionRecord, MemoryExecution } from './journal.ts'
import { revisionOf } from './journal-values.ts'

/** Every field of the reader record, in the order the bridge serializes them. */
export const EXECUTION_FIELDS = [
  'id',
  'tenant',
  'revision',
  'state',
  'checkpoint',
  'attachments',
  'inputs',
  'inputRevisions',
  'events',
  'retainedFrom',
  'acknowledged',
  'acknowledgedAt',
  'controls',
  'results',
  'resultRevisions',
  'effects',
  'observations',
  'stageReceipts',
  'observed',
  'admissions',
  'admissionLedger',
  'entries',
  'handoffs',
  'custodyAttempts',
  'finishing',
  'serial',
] as const satisfies readonly (keyof MemoryExecution)[]

export type ExecutionField = (typeof EXECUTION_FIELDS)[number]

/** What the projection reads besides the view: the blocks, the tenant, and the batch mint. */
export type ProjectionContext = Readonly<{
  tenant: TenantId
  blobs: BlobStore
  mint: Mint
}>

/** The operation entries of the execution by the publication of their batch (recognitions apart). */
function opsByPub(view: ExecutionView): Map<number, [AgentOperationId, OperationEntry]> {
  const out = new Map<number, [AgentOperationId, OperationEntry]>()
  for (const [op, entry] of view.ops) if (entry.target === null) out.set(entry.pub, [op, entry])
  return out
}

/** The receipt of the batch at `pub`, as `append` derived it when the batch was written. */
function receiptAt(
  view: ExecutionView,
  byPub: ReadonlyMap<number, [AgentOperationId, OperationEntry]>,
  mint: Mint,
  pub: number,
): CommandReceipt | undefined {
  const found = byPub.get(pub)
  if (found === undefined) return undefined
  const [operation, entry] = found
  return {
    operation,
    execution: view.execution,
    revision: revisionOf(entry.revision),
    evidence: batchEvidence(
      mint,
      { execution: view.execution, pub, envelope: { digest: entry.digest } } as PublishedBatch,
      entry.revision,
    ),
    state: 'applied',
  }
}

/** The publication a batch evidence names, or null for another evidence. */
function pubOf(evidence: DurableEvidence): number | null {
  const found = /\/pub\/(\d+)$/u.exec(evidence.record)
  return found === null ? null : Number(found[1])
}

/**
 * The value a reference names. A `blobOf` pair (`[digest, value]`, which the core's `open` still
 * writes for the accepted message, K-23) carries its value; a reference is looked up by digest.
 */
function blob<T>(blobs: BlobStore, ref: unknown): T {
  if (Array.isArray(ref) && ref.length === 2 && typeof ref[0] === 'string') {
    const kept = blobs.get(ref[0])
    return (kept === undefined ? ref[1] : kept) as T
  }
  const digest = (ref as { digest?: unknown } | null)?.digest
  const value = typeof digest === 'string' ? blobs.get(digest) : undefined
  if (value === undefined)
    throw new TypeError(`the projection has no content block ${String(digest)}`)
  return value as T
}

/** The state of the execution as the reader records keep it (the settling intent apart). */
function stateOf(view: ExecutionView): MemoryExecution['state'] {
  const ended = view.finish.ended
  if (ended !== null)
    return { kind: 'ended', conclusion: ended.conclusion, disposition: ended.disposition }
  const last = view.attachments.at(-1)
  if (last?.status === 'detached' && last.handoff !== null)
    return { kind: 'suspended', handoff: last.handoff }
  if (view.finish.current !== null) return { kind: 'settling' }
  // A wait entered after the last attachment, and no cursor move after it, is the state.
  const waits = view.waits
  const moved = Math.max(0, ...Object.values(view.cursorMoved))
  if (waits !== null && waits.pub > (last?.pub ?? 0) && waits.pub >= moved)
    return { kind: 'waiting', waits: waits.waits }
  if (last !== undefined && last.pub > moved && view.attachments.length > 1)
    return { kind: 'reconciling' }
  return { kind: 'advancing' }
}

/**
 * The reader record of `view`, field by field. A field this projection does not derive yet is
 * absent; `fieldsDiff` reports it as missing.
 */
export function projectExecution(
  view: ExecutionView,
  context: ProjectionContext,
): Partial<MemoryExecution> {
  const byPub = opsByPub(view)
  const receipt = (pub: number) => receiptAt(view, byPub, context.mint, pub)
  const projected: Partial<MemoryExecution> = {
    id: view.execution,
    tenant: context.tenant,
    revision: view.revision,
    state: stateOf(view) as MemoryExecution['state'],
    attachments: view.attachments.map(item => ({
      authority: item.authority,
      status: item.status,
      handoff: item.handoff,
      handoffRevision: item.handoffRevision,
    })),
    inputs: view.inputs.map((item): AcceptedInput => ({
      id: item.input,
      content: blob(context.blobs, item.message),
      source: item.source,
      priority: item.priority,
    })),
    inputRevisions: new Map(view.inputs.map(item => [item.input, item.revision])),
    retainedFrom: 1,
    acknowledged: view.acknowledged,
    acknowledgedAt: view.acknowledgedAt,
    controls: [...view.controls.values()].map(
      item =>
        ({
          operation: item.control,
          command: item.command,
          toolInvocation: item.toolInvocation,
          toolOperation: item.toolOperation,
          stages: item.stages,
        }) as unknown as ControlRecord,
    ),
    // A responsibility is on record once `recordResult` reached a stage; a reception alone is not.
    results: [...view.results.values()]
      .filter(item => Object.keys(item.stages).length > 0)
      .map((item): ResultResponsibility => ({
        result: {
          producer: { kind: item.result.producer, call: item.result.call } as never,
          version: item.result.version,
          delivery: item.result.delivery,
          source: item.result.source,
        },
        consumption: item.consumption,
        custody: item.stages.custody ?? null,
        completion: item.stages.processed ?? null,
        release:
          item.stages.released === undefined
            ? { kind: 'pending' }
            : { kind: 'confirmed', receipt: item.stages.released },
      })),
    effects: [...view.intents.values()].map(item => ({
      action: item.action,
      pending: item.pending,
      authority: item.authority,
    })),
    observations: view.observations.map((item): TerminalObservation => ({
      terminal: item.terminal,
      passage: item.passage,
      implementation: item.implementation,
      observed: item.observed,
    })),
    observed: new Map(
      view.observations.flatMap(item => {
        const found = receipt(item.pub)
        return found === undefined ? [] : [[item.passage, found]]
      }),
    ),
    stageReceipts: new Map(
      [...view.controls.values()].flatMap(control =>
        Object.entries(control.stages).flatMap(([stage, fact]) => {
          const pub = fact === undefined ? null : pubOf(fact.source)
          const found = pub === null ? undefined : receipt(pub)
          return found === undefined
            ? []
            : [[JSON.stringify([control.control, stage]), found] as [string, CommandReceipt]]
        }),
      ),
    ),
    admissions: view.admissions.map((item): AdmissionRecord => ({
      fact: item.fact,
      publication: item.publication,
      basis: item.basis,
      present: true,
    })),
    entries: view.events.flatMap(event => {
      if (event.fact.kind === 'result.received')
        return [blob<MemoryExecution['entries'][number]>(context.blobs, event.fact.custody)]
      if (event.fact.kind === 'fence.started')
        return [
          {
            kind: 'start-fence' as const,
            operation: event.fact.operation as never,
            guard: event.fact.guard,
            fence: event.fact.fence,
          },
        ]
      return []
    }),
  }
  try {
    projected.checkpoint = checkpointOf(view, context.blobs)
  } catch {
    // An execution whose cursor was never moved whole (no checkpoint yet): the field stays absent.
  }
  return projected
}

export type FieldsDiff = Readonly<{
  equal: ExecutionField[]
  differ: ExecutionField[]
  missing: ExecutionField[]
}>

const text = (value: unknown): string =>
  canonical(value instanceof Map ? [...value.entries()].sort() : value)

/** Compares the writer's record with a projection, field by field, by canonical text. */
export function fieldsDiff(
  expected: MemoryExecution,
  actual: Partial<MemoryExecution>,
): FieldsDiff {
  const equal: ExecutionField[] = []
  const differ: ExecutionField[] = []
  const missing: ExecutionField[] = []
  for (const field of EXECUTION_FIELDS) {
    if (!(field in actual)) {
      missing.push(field)
      continue
    }
    ;(text(expected[field]) === text(actual[field]) ? equal : differ).push(field)
  }
  return { equal, differ, missing }
}

/** The two texts of one differing field, for a report. */
export function fieldTexts(
  expected: MemoryExecution,
  actual: Partial<MemoryExecution>,
  field: ExecutionField,
): Readonly<{ expected: string; actual: string }> {
  return { expected: text(expected[field]), actual: text(actual[field]) }
}

export type { ExecutionState }
