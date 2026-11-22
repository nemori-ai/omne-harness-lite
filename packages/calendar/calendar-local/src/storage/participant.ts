import { calendarSnapshotSchema } from '@omne-harness/calendar-contract'
import type { CalendarDispositionCommand, CalendarPublicationReceipt } from '@omne-harness/calendar'
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import {
  acknowledgementBinding,
  authorityBinding,
  canonical,
  digest,
  operationRef,
} from './encoding.ts'
import { publicationDecision, savePublication } from './publication.ts'
import {
  AUTHORITY_FACT,
  PARTICIPANT,
  PROTOCOL,
  RESULT_FACT,
  candidateRowSchema,
  workerCommandSchema,
  type WorkerCommand,
} from './schema.ts'
import { readVersion, saveSnapshot, storedCommand } from './snapshots.ts'

function conflict(reason: string): ParticipantReply {
  return { kind: 'conflict', basis: { reason } }
}
function currentSnapshot(command: CalendarDispositionCommand, port: ParticipantPort) {
  return calendarSnapshotSchema
    .nullable()
    .parse(readVersion(port, command.address.calendarId, { kind: 'current' }))
}
function checkAuthority(input: WorkerCommand, port: ParticipantPort): boolean {
  const fact = z
    .strictObject({ decision: z.enum(['allowed', 'denied']), binding: z.json() })
    .parse(port.requireFact(AUTHORITY_FACT))
  const expected =
    input.action === 'disposition'
      ? authorityBinding(input.command)
      : acknowledgementBinding(input.acknowledgement)
  return fact.decision === 'allowed' && canonical(fact.binding) === canonical(expected)
}
function publish(
  command: CalendarDispositionCommand,
  port: ParticipantPort,
): CalendarPublicationReceipt | ParticipantReply {
  const current = currentSnapshot(command, port)
  if ((current?.publicationGeneration ?? 0) !== command.expectedGeneration)
    return conflict('generationConflict')
  const ref = operationRef(command.address)
  const receipt: CalendarPublicationReceipt = {
    operationRef: ref,
    address: command.address,
    fingerprint: command.expectedFingerprint,
    candidateRef: ref,
    disposition: command.disposition.kind === 'publish' ? 'published' : command.disposition.kind,
    current:
      current === null
        ? null
        : { versionId: current.versionId, publicationGeneration: current.publicationGeneration },
    outboxId: null,
  }
  if (command.disposition.kind !== 'publish') return receipt
  const decision = publicationDecision(command, command.disposition.snapshot, current, port)
  if (decision.kind === 'noChange') return { ...receipt, disposition: 'noChange' }
  if (decision.kind === 'conflict') return conflict(decision.reason)
  return savePublication(command, command.disposition.snapshot, receipt, port)
}
function disposition(command: CalendarDispositionCommand, port: ParticipantPort): ParticipantReply {
  const ref = operationRef(command.address)
  const stored = storedCommand(command)
  const previous = port.execute(
    'SELECT canonical_command, record FROM ca_candidates WHERE operation_ref = ?',
    [ref],
  ).rows[0]
  if (previous !== undefined) {
    if (previous[0] !== stored) return conflict('operationKeyConflict')
    return {
      kind: 'participated',
      response: {
        action: 'disposition',
        commandDigest: digest(command),
        receipt: candidateRowSchema.parse(JSON.parse(z.string().parse(previous[1]))).receipt,
      },
    }
  }
  const result = publish(command, port)
  if ('kind' in result) return result
  const snapshot =
    command.candidate.snapshot === null ? null : saveSnapshot(port, command.candidate.snapshot)
  port.execute(
    'INSERT INTO ca_candidates(operation_ref, calendar_id, fingerprint, snapshot_digest, canonical_command, record) VALUES (?, ?, ?, ?, ?, ?)',
    [
      ref,
      command.address.calendarId,
      command.expectedFingerprint,
      snapshot,
      stored,
      canonical({ candidateRef: ref, receipt: result }),
    ],
  )
  return {
    kind: 'participated',
    response: { action: 'disposition', commandDigest: digest(command), receipt: result },
  }
}
function acknowledge(
  input: Extract<WorkerCommand, { action: 'ackReaction' }>,
  port: ParticipantPort,
): ParticipantReply {
  const ack = input.acknowledgement
  const row = port.execute('SELECT operation_ref, handoff_ref FROM ca_outbox WHERE id = ?', [
    ack.id,
  ]).rows[0]
  if (row === undefined || row[0] !== ack.operationRef) return conflict('notFound')
  if (row[1] !== null && row[1] !== ack.handoffRef) return conflict('invalid')
  port.execute(
    'UPDATE ca_outbox SET handoff_ref = ? WHERE id = ? AND operation_ref = ? AND handoff_ref IS NULL',
    [ack.handoffRef, ack.id, ack.operationRef],
  )
  return { kind: 'participated', response: { action: 'ackReaction', acknowledgement: ack } }
}
export default {
  participant: PARTICIPANT,
  protocol: PROTOCOL,
  execute(facts, port) {
    const input = workerCommandSchema.safeParse(facts)
    if (!input.success) return conflict('invalid')
    const result = !checkAuthority(input.data, port)
      ? conflict('authorityRejected')
      : input.data.action === 'disposition'
        ? disposition(input.data.command, port)
        : acknowledge(input.data, port)
    if (result.kind === 'conflict' && input.data.action === 'disposition') {
      return {
        kind: 'conflict',
        basis: {
          ...z.record(z.string(), z.json()).parse(result.basis),
          operationRef: operationRef(input.data.command.address),
          fingerprint: input.data.command.expectedFingerprint,
          commandDigest: digest(input.data.command),
        },
      }
    }
    if (result.kind === 'conflict' && input.data.action === 'ackReaction') {
      return {
        kind: 'conflict',
        basis: {
          ...z.record(z.string(), z.json()).parse(result.basis),
          acknowledgementDigest: digest(input.data.acknowledgement),
        },
      }
    }
    if (result.kind === 'participated') port.provideFact(RESULT_FACT, result.response)
    return result
  },
} satisfies ParticipantModule
