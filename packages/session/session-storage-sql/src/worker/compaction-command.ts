import { tenantCodec } from '@omne-harness/legal-identity'
import {
  commandDigest,
  decideCompactionCommit,
  projectCompactionCommit,
  type SessionCommand,
  type SessionFailure,
} from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import { decodeValue, encodeValue } from '../codec.ts'
import { modelViewPrefix } from '../model-view-identity.ts'
import {
  advanceTail,
  batchReceipt,
  insertOperation,
  maintainModelView,
  storeEvidence,
  writeEntries,
} from './commit-write.ts'
import { readCompactionWindow } from './compaction-window.ts'
import { writeSessionList } from './session-list.ts'
import { readCompactionState, writeCompactionState } from './state-rows.ts'
import { assignPositions, big, definite, oneRow, packed, text } from './support.ts'

const stopped = (failure: SessionFailure): ParticipantReply => ({
  kind: 'conflict',
  basis: { failure: encodeValue(failure) },
})

export function runCompactionCommand(
  port: ParticipantPort,
  command: Extract<SessionCommand, { kind: 'commitDerived' }>,
  evidence: string | null,
  at: string | null,
): ParticipantReply {
  const encoded = tenantCodec.encode(command.input.tenant)
  if (!encoded.ok)
    return stopped({ kind: 'invalid', field: 'tenant', reason: 'not minted by legal-identity' })
  const tenant = encoded.value
  const { session, operation } = command.input
  const scope = [tenant, session]
  const digest = commandDigest(command)
  const held = oneRow(
    port,
    'SELECT input_digest, form, result FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [...scope, operation],
  )
  if (held !== undefined) {
    if (text(held['input_digest']) !== digest || text(held['form']) !== 'batch')
      return stopped({ kind: 'conflict', operation })
    return {
      kind: 'participated',
      response: {
        result: encodeValue(decodeValue(JSON.parse(packed(held['result'])) as JsonValue)),
        recovered: true,
      },
    }
  }
  const journal = oneRow(
    port,
    'SELECT tail, commit_seq, epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    scope,
  )
  if (journal === undefined) return stopped({ kind: 'denied', action: command.kind })
  const tail = big(journal['tail'])
  const previous = readCompactionState(port, tenant, session, tail)
  if (previous === 'behind')
    return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }
  const epoch = text(journal['epoch'])
  const compactionEpoch = `${modelViewPrefix(tenant, session)}${epoch}`
  let context = null
  if (command.input.value.kind === 'compaction' && command.input.value.epoch === compactionEpoch) {
    const window = readCompactionWindow(port, {
      tenant,
      session,
      epoch,
      upper: null,
      coverTo: command.input.value.message.covers.to,
    })
    if (window.kind === 'behind')
      return definite('read-bound', 'the compaction index does not cover the session')
    if (window.kind === 'invalid-bounds')
      return stopped({
        kind: 'invalid',
        field: 'value.message.covers',
        reason: 'outside the current compaction window',
      })
    if (window.kind === 'context') context = window.value
  }
  const decision = decideCompactionCommit(
    previous.state,
    command,
    { compaction: context, compactionEpoch },
    context?.open ?? [],
  )
  if (decision.kind === 'rejected') return stopped(decision.failure)
  if (decision.kind !== 'entries')
    return { kind: 'failed', diagnostic: 'unexpected compaction decision' }
  const participation = command.input.participation
  const current = previous.execution?.values.at(-1)
  if (participation === undefined || current === undefined)
    return definite('missing-row', 'compaction without its current execution')
  const revision = String(tail + 1n)
  const seq = big(journal['commit_seq']) + 1n
  const entries = assignPositions(port, { tenant, session }, revision, decision.entries)
  const receipt = batchReceipt({ tenant, session, operation, seq, revision, entries })
  const projected = projectCompactionCommit(previous.state, current, {
    revision: receipt.revision,
    entries,
  })
  if (typeof projected === 'string') return definite('quarantined', projected)
  const indexed = writeEntries(port, tenant, session, entries)
  if (indexed !== null) return indexed
  const nextEpoch = maintainModelView(port, tenant, session, epoch, entries)
  if (nextEpoch === null)
    return definite('read-bound', 'the model view epoch exceeds the read bound of a compaction')
  writeCompactionState(port, { tenant, session, covered: BigInt(revision) }, previous, projected)
  const protectedHead = port.execute(
    'UPDATE sl_compaction_head SET covered = ? WHERE tenant = ? AND session = ? AND covered = ?',
    [BigInt(revision), tenant, session, tail],
  )
  if (protectedHead.changes !== 1n)
    return definite('missing-row', 'the compaction protection head changed')
  writeSessionList(port, {
    tenant,
    session,
    seq,
    at,
    previous: previous.state,
    snapshot: projected.state,
    entries,
  })
  const result = JSON.stringify(encodeValue(receipt))
  insertOperation(port, {
    tenant,
    session,
    operation,
    digest,
    form: 'batch',
    revision: BigInt(revision),
    receipt: result,
    result,
  })
  storeEvidence(port, { tenant, session, operation }, evidence)
  const moved = advanceTail(port, { tenant, session, tail, revision, seq, epoch: nextEpoch })
  if (moved !== null) return moved
  return {
    kind: 'participated',
    response: {
      result: encodeValue(receipt),
      recovered: false,
      batch: {
        tenant,
        session,
        revision,
        source: encodeValue(receipt.source),
        kinds: [...new Set(entries.map(entry => entry.kind))],
      },
    },
  }
}
