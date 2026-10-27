import { canonical, integer } from '../integration/parse.ts'
import { readCollaborationAuthority, recordAuthorityFor } from './collaboration-authority.ts'
import { commentDigest } from './collaboration-comments.ts'
import { readCompleteComments, recordComments } from './collaboration-read.ts'
import type { LineConsumptionRecord, LineDeltaRecord } from './collaboration-records.ts'
import { orderedRecords, type SequencedComment } from './collaboration-sequence.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import type { RecordWriteInput } from './collaboration-write.ts'
import type { GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export type LineReadInput = {
  repo: string
  parent: number
  milestone: number
  read: GhRead
  authority: RecordWriteInput['authority']
}

export function readLineRecords(input: LineReadInput) {
  integer(input.parent, 'parent')
  integer(input.milestone, 'milestone')
  const snapshot = readCompleteComments(input.repo, input.parent, input.read)
  const deltas: SequencedComment<LineDeltaRecord>[] = []
  const states: SequencedComment<LineConsumptionRecord>[] = []
  const grants = new Map<string, ReturnType<typeof recordAuthorityFor>>()
  for (const comment of recordComments(snapshot)) {
    const record = comment.record
    if (record.kind !== 'delta' && record.kind !== 'consumption') continue
    if (record.context.repo !== input.repo || record.lineParent !== input.parent)
      throw new InputError('line-record-context-mismatch')
    if (record.context.milestone !== input.milestone) continue
    const key = canonical(record.context)
    let authority = grants.get(key)
    if (authority === undefined) {
      const config = input.authority(record.context)
      if (config.policy.repository !== input.repo)
        throw new InputError('line-authority-repo-mismatch')
      authority = recordAuthorityFor(
        readCollaborationAuthority({
          ...config,
          reduceIssue: record.context.reduceIssue,
          read: input.read,
        }),
        record.context,
      )
      grants.set(key, authority)
    }
    validateRecordAuthority(comment, authority, input.read)
    if (record.kind === 'delta') deltas.push({ ...comment, record })
    else states.push({ ...comment, record })
  }
  const orderedDeltas = orderedRecords(deltas)
  const orderedStates = orderedRecords(states)
  let consumed = 0
  for (const state of orderedStates) {
    validateConsumption(state.record, deltas)
    if (state.record.consumedRevision < consumed) throw new InputError('line-consumption-rewind')
    consumed = state.record.consumedRevision
  }
  if (canonical(snapshot) !== canonical(readCompleteComments(input.repo, input.parent, input.read)))
    throw new InputError('line-snapshot-changed')
  return {
    deltas: orderedDeltas,
    deltaAliases: deltas,
    states: orderedStates,
    comments: snapshot.comments,
  }
}

export function validateConsumption(
  record: LineConsumptionRecord,
  deltas: readonly SequencedComment<LineDeltaRecord>[],
): void {
  const delta = deltas.find(item => item.id === record.consumedDelta.commentId)
  if (
    delta === undefined ||
    delta.issue !== record.consumedDelta.issue ||
    delta.record.revision !== record.consumedRevision ||
    commentDigest(delta.body) !== record.consumedDelta.sha256 ||
    canonical(delta.record.context) !== canonical(record.context)
  )
    throw new InputError('line-consumed-delta-mismatch')
}

/** A read never advances consumption. The cursor names an actual comment, not an event. */
export function lineInbox(input: LineReadInput & { since?: number }) {
  const records = readLineRecords(input)
  const revision = records.states.at(-1)?.record.consumedRevision ?? 0
  if (input.since !== undefined && input.since !== 0) {
    integer(input.since, 'since')
    const cursor = records.comments.find(item => item.id === input.since)
    if (cursor === undefined) throw new InputError('line-cursor-not-comment')
  }
  return {
    consumedRevision: revision,
    deltas: records.deltas.filter(
      item => item.record.revision > revision && item.id > (input.since ?? 0),
    ),
  }
}
