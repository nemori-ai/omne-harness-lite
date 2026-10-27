import {
  canonical,
  choice,
  fields,
  integer,
  literal,
  same,
  string,
  strings,
} from '../integration/parse.ts'
import { parseIssueIdentity, type TaskBinding } from './binding.ts'
import { bodyFields } from './body.ts'
import { collaborationBlock } from './collaboration-block.ts'
import { commentDigest, decodeRecordComment } from './collaboration-comments.ts'
import { parseReleaseSubject } from './collaboration-parse.ts'
import {
  readCollaborationAuthority,
  recordAuthorityFor,
  type CollaborationAuthorityInput,
  type VerifiedCollaborationAuthority,
} from './collaboration-authority.ts'
import {
  parseAccountIdentity,
  readAcceptanceResponsibility,
  readAdoptedResponsibility,
  readCommentAccount,
  type AccountIdentity,
  type AdoptedAcceptanceSources,
} from './collaboration-acceptance-source.ts'
import {
  readCompleteComments,
  readReferencedComment,
  recordComments,
  type CollaborationComment,
} from './collaboration-read.ts'
import { orderedRecords } from './collaboration-sequence.ts'
import { validateRecordAuthority } from './collaboration-trust.ts'
import { evidenceList, nonempty, parseReference, utcTime, uuid } from './collaboration-values.ts'
import type {
  CommentReference,
  Evidence,
  ReleaseSubject,
  WaveIdentity,
} from './collaboration-records.ts'
import type { GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export const ACCEPTANCE_MARKER = 'omne-collaboration-acceptance:v1'
const verified = Symbol('verified release acceptance')
export type ReleaseAcceptanceDecision = {
  schemaVersion: 1
  issue: TaskBinding['issue']
  revision: number
  attempt: string
  operationId: string
  decision: 'accept' | 'partial' | 'cancel' | 'revoke'
  decider: AccountIdentity
  authorization: CommentReference
  subject: ReleaseSubject
  basis: Evidence[]
  remaining: string[]
  previous: CommentReference | null
  recordedAt: string
}
export type VerifiedReleaseAcceptance = {
  readonly [verified]: true
  decision: ReleaseAcceptanceDecision
  reference: CommentReference
}

function parseDecision(value: unknown): ReleaseAcceptanceDecision {
  const v = fields(
    value,
    [
      'schemaVersion',
      'issue',
      'revision',
      'attempt',
      'operationId',
      'decision',
      'decider',
      'authorization',
      'subject',
      'basis',
      'remaining',
      'previous',
      'recordedAt',
    ],
    'release acceptance',
  )
  const issue = parseIssueIdentity(v.issue),
    subject = parseReleaseSubject(v.subject)
  if (issue.repository !== subject.context.repo || issue.number !== subject.context.reduceIssue)
    throw new InputError('collaboration-acceptance-subject-issue')
  const decision = choice(v.decision, ['accept', 'partial', 'cancel', 'revoke'], 'decision')
  const remaining = strings(v.remaining, 'remaining')
  if (decision === 'accept' && remaining.length > 0)
    throw new InputError('collaboration-acceptance-incomplete')
  if (decision === 'partial' && remaining.length === 0)
    throw new InputError('collaboration-partial-remaining-missing')
  const attempt = string(v.attempt, 'acceptance.attempt')
  if (!attempt || /[\r\n\0]/.test(attempt))
    throw new InputError('collaboration-acceptance-attempt-invalid')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'acceptance.schemaVersion'),
    issue,
    revision: integer(v.revision, 'acceptance.revision'),
    attempt,
    operationId: uuid(v.operationId, 'acceptance.operationId'),
    decision,
    decider: parseAccountIdentity(v.decider),
    authorization: parseReference(v.authorization),
    subject,
    basis: nonempty(evidenceList(v.basis), 'acceptance.basis'),
    remaining,
    previous: v.previous === null ? null : parseReference(v.previous),
    recordedAt: utcTime(v.recordedAt, 'acceptance.recordedAt'),
  }
}

export function encodeReleaseAcceptance(value: ReleaseAcceptanceDecision): string {
  const d = parseDecision(value)
  return [
    `- 操作标识：${d.operationId}`,
    `- 决定：${d.decision}`,
    `- 对象与交付修订：${d.issue.url} revision=${d.revision} attempt=${d.attempt}`,
    `- 决定者、身份及权限依据：${canonical({ decider: d.decider, authorization: d.authorization })}`,
    `- 日期：${d.recordedAt}`,
    `- 范围：${d.decision} ${commentDigest(canonical(d.subject))}`,
    `- 所核依据：${canonical(d.basis)}`,
    `- 成果与证据：${canonical(d.subject)}`,
    `- 不含与剩余责任：${canonical(d.remaining)}`,
    `- 前项关系：${canonical(d.previous)}`,
    '',
    `\`\`\`json ${ACCEPTANCE_MARKER}`,
    canonical(d),
    '```',
    '',
  ].join('\n')
}

export function parseReleaseAcceptance(body: string): ReleaseAcceptanceDecision {
  const decision = parseDecision(collaborationBlock(body, ACCEPTANCE_MARKER))
  if (body !== encodeReleaseAcceptance(decision))
    throw new InputError('collaboration-acceptance-prose-conflict')
  return decision
}

function readDecisionChain(authority: VerifiedCollaborationAuthority, read: GhRead) {
  const { binding, snapshot } = authority
  const chain: { comment: CollaborationComment; decision: ReleaseAcceptanceDecision }[] = []
  const operations = new Map<string, string>()
  let aliases = new Set<number>()
  for (const comment of [...snapshot.comments].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id,
  )) {
    if (!comment.body.includes('```json omne-collaboration-acceptance:')) {
      if (
        bodyFields(comment.body)
          .get('决定')
          ?.some(value => /^(accept|partial|cancel|revoke)(?:\b|／)/.test(value))
      )
        throw new InputError('collaboration-acceptance-unprojected-decision')
      continue
    }
    const decision = parseReleaseAcceptance(comment.body)
    same(decision.issue, binding.issue, 'Acceptance decision belongs to another issue')
    same(
      readCommentAccount(snapshot.repo, comment, read),
      decision.decider,
      'Acceptance author differs from decider',
    )
    if (comment.createdAt !== comment.updatedAt)
      throw new InputError('collaboration-acceptance-decision-edited')
    const existing = operations.get(decision.operationId)
    if (existing !== undefined) {
      if (existing !== comment.body || chain.at(-1)?.decision.operationId !== decision.operationId)
        throw new InputError('collaboration-acceptance-operation-conflict')
      aliases.add(comment.id)
      continue
    }
    const previous = chain.at(-1)
    if (
      previous === undefined
        ? decision.previous !== null
        : decision.previous === null ||
          decision.previous.issue !== snapshot.issue ||
          !aliases.has(decision.previous.commentId) ||
          decision.previous.sha256 !== commentDigest(previous.comment.body)
    )
      throw new InputError('collaboration-acceptance-chain-incomplete')
    operations.set(decision.operationId, comment.body)
    aliases = new Set([comment.id])
    chain.push({ comment, decision })
  }
  return { chain, aliases }
}

function readSubjectReferences(
  subject: ReleaseSubject,
  authority: VerifiedCollaborationAuthority,
  acceptedAt: string,
  input: ReleaseAcceptanceReadInput,
): void {
  const read = input.read
  const authorities = new Map([[input.reduceIssue, authority]])
  const grantsFor = (context: WaveIdentity) => {
    let known = authorities.get(context.reduceIssue)
    if (known === undefined) {
      let config = input.relatedAuthority?.(context)
      if (config === undefined) {
        if (input.adoptedFacts !== undefined)
          throw new InputError('collaboration-related-authority-facts-missing')
        config = { policy: input.policy }
      }
      if (config.policy.repository !== context.repo)
        throw new InputError('collaboration-related-authority-repository')
      known = readCollaborationAuthority({ ...config, reduceIssue: context.reduceIssue, read })
      authorities.set(context.reduceIssue, known)
    }
    return recordAuthorityFor(known, context)
  }
  const grants = grantsFor(subject.context)
  const evidenceReads: { reference: CommentReference; comment: CollaborationComment }[] = []
  same(
    [...grants.participants].sort((a, b) => a - b),
    subject.lines.map(line => line.lineParent).sort((a, b) => a - b),
    'Acceptance omits participating lines',
  )
  const get = (reference: CommentReference) => {
    const comment = readReferencedComment(subject.context.repo, reference, read)
    evidenceReads.push({ reference, comment })
    if (Date.parse(comment.updatedAt) > Date.parse(acceptedAt))
      throw new InputError('collaboration-acceptance-evidence-after-decision')
    const record = decodeRecordComment(comment.body)
    if (record === undefined) throw new InputError('collaboration-acceptance-evidence-not-record')
    validateRecordAuthority({ ...comment, record }, grants, read)
    return record
  }
  const requestIds: string[] = []
  const all = recordComments(authority.snapshot)
  for (const reference of subject.results) {
    const record = get(reference)
    if (
      record.kind !== 'state' ||
      (record.state !== 'merged' &&
        !(
          record.state === 'superseded' &&
          (record.disposition?.action === 'rescope' || record.disposition?.action === 'redispatch')
        ))
    )
      throw new InputError('collaboration-acceptance-result-pending')
    const stream = all.flatMap(comment => {
      const candidate = comment.record
      if (
        candidate.kind !== 'state' ||
        candidate.requestId !== record.requestId ||
        candidate.lineParent !== record.lineParent
      )
        return []
      if (
        candidate.revision <= record.revision &&
        Date.parse(comment.updatedAt) > Date.parse(acceptedAt)
      )
        throw new InputError('collaboration-acceptance-evidence-after-decision')
      validateRecordAuthority(comment, recordAuthorityFor(authority, candidate.context), read)
      return [{ ...comment, record: candidate }]
    })
    same(orderedRecords(stream).at(-1)?.record, record, 'Acceptance result is no longer current')
    requestIds.push(record.requestId)
  }
  same(
    requestIds.sort(),
    [...subject.expectedRequests].sort(),
    'Acceptance request set differs from results',
  )
  for (const line of subject.lines) {
    const delta = get(line.delta)
    if (
      delta.kind !== 'delta' ||
      delta.purpose !== 'release' ||
      delta.lineParent !== line.lineParent ||
      delta.finalHead !== subject.finalHead
    )
      throw new InputError('collaboration-acceptance-delta-mismatch')
    same(delta.continuation, line.continuation, 'Acceptance continuation differs from delta')
    const snapshot = readCompleteComments(subject.context.repo, line.lineParent, read)
    const prefix = recordComments(snapshot).flatMap(comment => {
      const record = comment.record
      if (
        record.kind !== 'delta' ||
        record.context.repo !== subject.context.repo ||
        record.context.milestone !== subject.context.milestone ||
        record.lineParent !== line.lineParent ||
        record.revision > delta.revision
      )
        return []
      if (Date.parse(comment.updatedAt) > Date.parse(acceptedAt))
        throw new InputError('collaboration-acceptance-evidence-after-decision')
      validateRecordAuthority(comment, grantsFor(record.context), read)
      return [{ ...comment, record }]
    })
    same(orderedRecords(prefix).at(-1)?.record, delta, 'Acceptance delta history is incomplete')
    same(
      snapshot,
      readCompleteComments(subject.context.repo, line.lineParent, read),
      'Acceptance delta history changed during read',
    )
    for (const reference of delta.integrationResults)
      if (!subject.results.some(item => canonical(item) === canonical(reference)))
        throw new InputError('collaboration-acceptance-delta-result-conflict')
  }
  for (const [issue, resolved] of authorities)
    same(
      resolved.snapshot,
      readCompleteComments(subject.context.repo, issue, read),
      'Acceptance authority changed during reference reads',
    )
  for (const { reference, comment } of evidenceReads)
    same(
      comment,
      readReferencedComment(subject.context.repo, reference, read),
      'Acceptance evidence changed during read',
    )
}

export type ReleaseAcceptanceReadInput = CollaborationAuthorityInput & {
  sources: AdoptedAcceptanceSources
  reference: CommentReference
  subject: ReleaseSubject
  relatedAuthority?: (
    context: WaveIdentity,
  ) => Omit<CollaborationAuthorityInput, 'read' | 'reduceIssue'>
}

/** Verifies the adopted responsibility and exact decision. Assembly readiness and Issue closure are separate gates. */
export function readReleaseAcceptance(
  input: ReleaseAcceptanceReadInput,
): VerifiedReleaseAcceptance {
  const authority = readCollaborationAuthority(input)
  const responsibility = readAcceptanceResponsibility(authority, input.sources, input.read)
  const subject = parseReleaseSubject(input.subject)
  same(subject.context, authority.scope.context, 'Acceptance context differs from current dispatch')
  const reference = parseReference(input.reference)
  if (reference.issue !== input.reduceIssue)
    throw new InputError('collaboration-acceptance-reference-issue')
  const { chain, aliases } = readDecisionChain(authority, input.read)
  for (const [index, item] of chain.entries()) {
    const grant = readAdoptedResponsibility(
      authority,
      input.sources,
      item.decision.authorization,
      input.read,
      item.comment.createdAt,
    )
    same(item.decision.decider, grant.acceptor, 'Acceptance decision has no adopted authority')
    const previous = chain[index - 1]?.decision
    if (previous !== undefined && item.decision.revision < previous.revision)
      throw new InputError('collaboration-acceptance-revision-regressed')
    if (
      grant.revision !== item.decision.revision &&
      !(item.decision.decision === 'revoke' && previous?.revision === grant.revision)
    )
      throw new InputError('collaboration-acceptance-grant-revision-mismatch')
    if (Date.parse(item.comment.createdAt) < Date.parse(grant.comment.updatedAt))
      throw new InputError('collaboration-acceptance-predates-authorization')
  }
  const last = chain.at(-1)
  if (
    last === undefined ||
    !aliases.has(reference.commentId) ||
    reference.sha256 !== commentDigest(last.comment.body)
  )
    throw new InputError('collaboration-acceptance-reference-not-current')
  if (last.decision.decision !== 'accept')
    throw new InputError('collaboration-release-not-accepted')
  same(
    last.decision.revision,
    authority.binding.revision,
    'Acceptance revision differs from current binding',
  )
  same(
    last.decision.attempt,
    authority.binding.attempt,
    'Acceptance attempt differs from current binding',
  )
  same(
    last.decision.authorization,
    responsibility.authorization,
    'Acceptance source differs from current responsibility',
  )
  same(last.decision.subject, subject, 'Accepted release subject differs from requested release')
  readSubjectReferences(subject, authority, last.comment.createdAt, input)
  same(
    responsibility,
    readAcceptanceResponsibility(authority, input.sources, input.read),
    'Current acceptance responsibility changed during read',
  )
  same(
    authority.snapshot,
    readCompleteComments(subject.context.repo, input.reduceIssue, input.read),
    'Acceptance changed during read',
  )
  return { [verified]: true, decision: last.decision, reference }
}
