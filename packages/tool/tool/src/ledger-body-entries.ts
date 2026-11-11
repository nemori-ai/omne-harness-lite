// The ledger's authority over one body of a call (BodyLifecycle `status`): `opened` at the writer's
// begin, `sealed` once the store holds the manifest, `linked` by the result commit, `orphaned` by the
// settlement that did not link it, `reclaimed` by the sweep. Expiry is not kept here: the result's
// body descriptor and the due index hold it, so one decision lives in one place.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Attachment,
  DurableEvidence,
  ToolBodyId,
  ToolBodyRepresentation,
  ToolCallId,
  ToolFailure,
  ToolOperationId,
  ToolResultVersion,
  ToolRevision,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  type ToolBodyManifest,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { canonicalJson, digestOf, mintEvidence, sameFactValue } from './evidence.ts'
import { currentBodyExecution } from './ledger-body-admission.ts'
import type {
  CallRecord,
  LedgerRecord,
  LedgerWrite,
  OperationRecord,
  TenantId,
} from './ledger-store.ts'
import type { BodyEntryRecord } from './ledger-body-records.ts'

export type { BodyEntryRecord, BodyEntryState } from './ledger-body-records.ts'

/** What the body deciders read of a call domain snapshot. */
export type BodyView = Readonly<{
  bodies: ReadonlyMap<string, BodyEntryRecord>
  call: CallRecord | null
  operations: ReadonlyMap<string, OperationRecord>
}>

/** A decision in the shape the ledger's transactions take. */
type BodyDecision<T> =
  | Readonly<{ kind: 'reply'; outcome: Outcome<T, ToolFailure> }>
  | Readonly<{ kind: 'commit'; writes: readonly LedgerWrite[]; value: T }>

const put = (record: LedgerRecord): LedgerWrite => ({ kind: 'put', record })
import type { BodyPolicy } from './result-offloading.ts'

/** The storage name of a body's content reference. A reference here is never a native resource. */
export const bodyStorage = '@omne-harness/tool/body'

export function bodyEntryKey(bodyId: ToolBodyId): string {
  return `body:${bodyId}`
}

/** One identity per (execution, key): a new generation writes a new body, never the same one. */
export function bodyIdentity(start: ToolStartRecord | null, key: string): ToolBodyId {
  const digest = digestOf({ start: start?.operation ?? null, key }).slice('sha256:'.length)
  const decoded = decodeToolBodyId(`body:${digest}`)
  if ('failure' in decoded) throw new Error('ledger minted an illegal body identity')
  return decoded.ok
}

export function sealedManifest(entry: BodyEntryRecord): ToolBodyManifest | null {
  return entry.state.kind === 'sealed' || entry.state.kind === 'linked'
    ? entry.state.manifest
    : null
}

export function bodySource(bodyId: ToolBodyId, manifest: ToolBodyManifest): Attachment {
  return {
    storage: bodyStorage,
    key: canonicalJson({ body: bodyId }),
    mediaType: 'application/octet-stream',
    bytes: String(manifest.bytes),
    digest: `sha256:${manifest.digest}`,
  }
}

/** The sealed body of this call that `source` names, if any. */
export function entryBySource(snapshot: BodyView, source: Attachment): BodyEntryRecord | null {
  for (const entry of snapshot.bodies.values()) {
    const manifest = sealedManifest(entry)
    if (manifest !== null && sameFactValue(bodySource(entry.bodyId, manifest), source)) return entry
  }
  return null
}

/** A body reference is a temporary custody of this call, never a native resource of a result. */
export function checkBodyReferences(references: readonly Attachment[]): Outcome<void, ToolFailure> {
  return references.some(reference => reference.storage === bodyStorage)
    ? invalid('content.ref', 'temporary-body-source-is-not-a-native-resource')
    : succeed(undefined)
}

/**
 * The precondition of `Begin`, `Renew` and `LedgerSeal`: the call is not settled and, for an author
 * body, the writing execution is the current one.
 */
export function bodyWritable(
  snapshot: BodyView,
  start: ToolStartRecord | null,
): ToolFailure | null {
  const call = snapshot.call
  if (call === null) return { kind: 'invalid', field: 'call', reason: 'unknown-call' }
  if (call.state.phase === 'settled') return { kind: 'invalid', field: 'call', reason: 'settled' }
  if (
    start !== null &&
    ((call.state.phase !== 'starting' && call.state.phase !== 'running') ||
      !currentBodyExecution(call, start))
  )
    return { kind: 'invalid', field: 'start', reason: 'not-current-execution' }
  return null
}

export type BeginBodyInput = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  source: DurableEvidence
  start: ToolStartRecord | null
  key: string
  representation: ToolBodyRepresentation
  policy: BodyPolicy
}>

const reply = <T>(outcome: Outcome<T, ToolFailure>): BodyDecision<Outcome<T, ToolFailure>> => ({
  kind: 'reply',
  outcome: succeed(outcome),
})

/** Model `Begin`: commit `opened`. The same operation with the same input is recognised. */
export function beginBodyEntry(
  snapshot: BodyView,
  mint: Readonly<{ revision: ToolRevision }>,
  input: BeginBodyInput,
): BodyDecision<Outcome<BodyEntryRecord, ToolFailure>> {
  const bodyId = bodyIdentity(input.start, input.key)
  const inputDigest = digestOf({
    start: input.start,
    source: input.source,
    key: input.key,
    representation: input.representation,
  })
  const known = snapshot.bodies.get(bodyId)
  if (known !== undefined)
    return reply(
      known.operation === input.operation && known.inputDigest === inputDigest
        ? succeed(known)
        : fail({ kind: 'conflict', operation: input.operation }),
    )
  const refusal = bodyWritable(snapshot, input.start)
  if (refusal !== null) return reply(fail(refusal))
  if (snapshot.operations.has(input.operation))
    return reply(fail({ kind: 'conflict', operation: input.operation }))
  const record: BodyEntryRecord = {
    bodyId,
    key: input.key,
    start: input.start,
    operation: input.operation,
    source: input.source,
    inputDigest,
    policy: input.policy,
    representation: input.representation,
    custody: mintEvidence(
      'body-write',
      { tenant: input.tenant, call: input.call, operation: input.operation },
      mint.revision,
      inputDigest,
    ),
    state: { kind: 'opened' },
  }
  return {
    kind: 'commit',
    value: succeed(record),
    writes: [put({ kind: 'body-entry', body: record })],
  }
}

/** Model `LedgerSeal`: after the store sealed the bytes; refused once the call is settled. */
export function sealBodyEntry(
  snapshot: BodyView,
  bodyId: ToolBodyId,
  manifest: ToolBodyManifest,
): BodyDecision<Outcome<BodyEntryRecord, ToolFailure>> {
  const known = snapshot.bodies.get(bodyId)
  if (known === undefined) return reply(invalid('body', 'unknown-body'))
  const sealed = sealedManifest(known)
  if (sealed !== null)
    return reply(
      sameFactValue(sealed, manifest)
        ? succeed(known)
        : fail({ kind: 'conflict', operation: known.operation }),
    )
  if (known.state.kind !== 'opened') return reply(invalid('body', known.state.kind))
  const refusal = bodyWritable(snapshot, known.start)
  if (refusal !== null) return reply(fail(refusal))
  const record: BodyEntryRecord = { ...known, state: { kind: 'sealed', manifest } }
  return {
    kind: 'commit',
    value: succeed(record),
    writes: [put({ kind: 'body-entry', body: record })],
  }
}

export type LinkedBody = Readonly<{
  bodyId: ToolBodyId
  result: ToolResultVersion
  expiresAt: ToolInstant
}>

/**
 * The body part of model `Settle`: the referenced body must be `sealed`; it becomes `linked` and is
 * scheduled at its expiry. Every other `opened` or `sealed` body of the call becomes `orphaned` and
 * is scheduled at `orphanDue` (the settler's now + G). A result that references an unsealed body
 * settles as `invalid` with `body-not-sealed`.
 */
export function settleBodyEntries(
  snapshot: BodyView,
  linked: LinkedBody | null,
  orphanDue: ToolInstant,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const link = linked === null ? succeed([]) : linkWrites(snapshot, linked)
  if ('failure' in link) return link
  const orphans = [...snapshot.bodies.values()]
    .filter(entry => entry.bodyId !== linked?.bodyId)
    .filter(entry => entry.state.kind === 'opened' || entry.state.kind === 'sealed')
    .flatMap(entry => [
      put({ kind: 'body-entry', body: { ...entry, state: { kind: 'orphaned' } } }),
      { kind: 'schedule' as const, key: bodyEntryKey(entry.bodyId), dueAt: orphanDue },
    ])
  return succeed([...link.ok, ...orphans])
}

/** The referenced body, `sealed`, becomes `linked` to the result and is due at its expiry. */
function linkWrites(
  snapshot: BodyView,
  linked: LinkedBody,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const entry = snapshot.bodies.get(linked.bodyId)
  const manifest = entry === undefined ? null : sealedManifest(entry)
  if (entry === undefined || manifest === null || entry.state.kind !== 'sealed')
    return invalid('original.source', 'body-not-sealed')
  return succeed([
    put({
      kind: 'body-entry',
      body: { ...entry, state: { kind: 'linked', result: linked.result, manifest } },
    }),
    { kind: 'schedule', key: bodyEntryKey(entry.bodyId), dueAt: linked.expiresAt },
  ])
}
