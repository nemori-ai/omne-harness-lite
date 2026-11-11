import type { Adoption, DurableEvidence } from './identity.ts'
import type { CommittedBatch } from './judgments.ts'
import type { Modes, WorkSnapshot, SessionCreation } from './values.ts'
import type { SessionPermissions } from './permission-values.ts'
import { decodeEntries, SESSION_INTERPRETER, type SessionEntry } from './entries.ts'
import { applyPermissionEvent } from './permission-state.ts'
import { batchEvidence } from './reduce.ts'
import { equalValue } from './session-validation.ts'

/** The two revision-4 releases preceding the relational permission projection. */
const predecessors = new Set([
  'sha256:3abcec48c42a0f45922018403bc73b3c57490af537ae8a4257980350fa7f5875',
  'sha256:8e67c6989d5680a5fe05c86b679528577c8e255c530ca58a4356b3e93deae192',
])
const preAssignments = 'sha256:3abcec48c42a0f45922018403bc73b3c57490af537ae8a4257980350fa7f5875'

export type SessionPermissionHistory = Readonly<{
  permissions: SessionPermissions
  mode: Readonly<{
    adopted: SessionCreation['modes']
    override: Readonly<{ value: Modes['permission']; source: DurableEvidence }> | null
  }>
  source: DurableEvidence
}>

function supported(value: Adoption): boolean {
  return (
    value?.owner === SESSION_INTERPRETER.owner &&
    value.name === SESSION_INTERPRETER.name &&
    value.revision === SESSION_INTERPRETER.revision &&
    (value.digest === SESSION_INTERPRETER.digest || predecessors.has(value.digest))
  )
}

function advance(
  state: SessionPermissionHistory | null,
  entry: SessionEntry,
  source: DurableEvidence,
  origin: DurableEvidence,
  snapshot: WorkSnapshot,
): SessionPermissionHistory {
  if (entry.kind === 'session.created') {
    if (
      state !== null ||
      !equalValue(entry.tenant, snapshot.tenant) ||
      entry.session !== snapshot.session ||
      !equalValue(entry.creation.modes, snapshot.creation.modes)
    )
      throw new Error('permission history creation does not match the Session')
    return {
      permissions: { revision: '0', assignments: [] },
      mode: { adopted: entry.creation.modes, override: null },
      source,
    }
  }
  if (state === null) throw new Error('permission history is missing creation')
  const permissions = applyPermissionEvent(state.permissions, entry, origin)
  if (permissions === state.permissions) return state
  const mode =
    entry.kind === 'session.mode-changed' && entry.declaration.kind === 'permission-mode'
      ? { ...state.mode, override: { value: entry.declaration.value, source: origin } }
      : state.mode
  return { permissions, mode, source }
}

function validateBatch(batch: CommittedBatch, previous: bigint, limit: bigint): bigint {
  const revision = BigInt(batch.revision)
  if (revision <= previous || revision > limit || batch.entries.length === 0)
    throw new Error('permission history batch order is invalid')
  const schema = batch.entries[0]!.schema
  for (const row of batch.entries) {
    if (
      !supported(row.schema) ||
      !equalValue(row.schema, schema) ||
      row.revision !== batch.revision
    )
      throw new Error('unsupported or mixed permission history interpretation')
    if (row.schema.digest === preAssignments && row.kind === 'session.permission-assigned')
      throw new Error('permission assignment predates its interpreter')
  }
  return revision
}

/** Rebuilds only permission state from complete original batches; it never reauthorizes history. */
export function rebuildSessionPermissions(
  snapshot: WorkSnapshot,
  batches: Iterable<CommittedBatch>,
):
  | Readonly<{ kind: 'rebuilt'; value: SessionPermissionHistory; snapshot: WorkSnapshot }>
  | Readonly<{ kind: 'invalid'; diagnostic: string }> {
  try {
    if (!supported(snapshot.interpreter))
      throw new Error('unsupported snapshot permission interpreter')
    let state: SessionPermissionHistory | null = null
    let previous = 0n
    for (const batch of batches) {
      previous = validateBatch(batch, previous, BigInt(snapshot.revision))
      const source = batchEvidence(batch, snapshot.session)
      const entries = decodeEntries(batch.entries, snapshot.initialization?.initialAdoption ?? null)
      for (const [index, entry] of entries.entries()) {
        if (!('ok' in entry))
          throw new Error('permission history contains an uninterpretable entry')
        state = advance(state, entry.ok, source, batch.entries[index]!.origin.source, snapshot)
      }
    }
    if (state === null) throw new Error('permission history is missing creation')
    if (snapshot.permissions !== undefined && !equalValue(snapshot.permissions, state.permissions))
      throw new Error('permission snapshot disagrees with its original history')
    return {
      kind: 'rebuilt',
      value: state,
      snapshot: { ...snapshot, permissions: state.permissions, interpreter: SESSION_INTERPRETER },
    }
  } catch (error) {
    return {
      kind: 'invalid',
      diagnostic: error instanceof Error ? error.message : 'invalid permission history',
    }
  }
}
