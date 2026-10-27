import type { PolicySource } from '../integration/context.ts'
import { blob } from '../integration/git.ts'
import {
  array,
  canonical,
  digest,
  fields,
  integer,
  literal,
  object,
  same,
  string,
} from '../integration/parse.ts'
import { parseIssueIdentity, type TaskBinding } from './binding.ts'
import { bodyFields } from './body.ts'
import { collaborationBlock } from './collaboration-block.ts'
import { collaborationJson } from './collaboration-json.ts'
import { commentDigest } from './collaboration-comments.ts'
import {
  parseCollaborationComment,
  readCompleteComments,
  type CollaborationComment,
  type CommentSnapshot,
} from './collaboration-read.ts'
import type { VerifiedCollaborationAuthority } from './collaboration-authority.ts'
import type { CommentReference, Evidence } from './collaboration-records.ts'
import { RESPONSIBILITY_FIELD } from './collaboration-scope.ts'
import { evidenceList, fullSha, hash256, nonempty, parseReference } from './collaboration-values.ts'
import { fetchIssueCard, REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export const ACCEPTANCE_SOURCES_PATH = 'docs/engineering/collaboration-acceptance-sources.json'
export const RESPONSIBILITY_MARKER = 'omne-collaboration-responsibility:v1'
export const RESPONSIBILITY_REVOCATION = 'omne-collaboration-responsibility-revocation:v1'
export const MILESTONE_MANDATE_MARKER = 'omne-collaboration-milestone-mandate:v1'
const adopted = Symbol('adopted acceptance sources')
const verified = Symbol('verified acceptance responsibility')
export type AccountIdentity = { login: string; nodeId: string }
export type AcceptanceSourceAdoption = {
  issue: TaskBinding['issue']
  revision: number
  authorization: CommentReference
  authorNodeId: string
}
export type AdoptedAcceptanceSources = {
  readonly [adopted]: true
  source: PolicySource
  entries: AcceptanceSourceAdoption[]
  mandates: Pick<AcceptanceSourceAdoption, 'issue' | 'authorization' | 'authorNodeId'>[]
}
export type MilestoneMandate = {
  schemaVersion: 1
  repository: string
  milestone: number
  owner: AccountIdentity
  acceptor: AccountIdentity
  declarationAuthor: AccountIdentity
  basis: Evidence[]
}
export type AcceptanceResponsibility = {
  schemaVersion: 1
  issue: TaskBinding['issue']
  revision: number
  fieldSha256: string
  owner: AccountIdentity
  acceptor: AccountIdentity
  basis: Evidence[]
}
export type VerifiedAcceptanceResponsibility = AcceptanceResponsibility & {
  readonly [verified]: true
  authorization: CommentReference
  comment: CollaborationComment
}

export function parseAccountIdentity(value: unknown): AccountIdentity {
  const v = fields(value, ['login', 'nodeId'], 'account')
  return { login: string(v.login, 'account.login'), nodeId: string(v.nodeId, 'account.nodeId') }
}

/** The caller selects an already authorized adoption commit. A candidate HEAD is not adoption. */
export function readAcceptanceSources(
  root: string,
  source: PolicySource,
): AdoptedAcceptanceSources {
  if (source.path !== ACCEPTANCE_SOURCES_PATH)
    throw new InputError('collaboration-acceptance-source-path')
  const file = blob(root, fullSha(source.commit, 'source.commit'), ACCEPTANCE_SOURCES_PATH)
  if (file.oid !== source.blob || digest(file.text) !== source.digest)
    throw new InputError('collaboration-acceptance-source-changed')
  return parseAcceptanceSources(file.text, source)
}

function parseAcceptanceSources(text: string, source: PolicySource): AdoptedAcceptanceSources {
  const raw = object(collaborationJson(text), 'acceptance sources')
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)
    throw new InputError('collaboration-acceptance-source-version')
  const v = fields(
    raw,
    raw.schemaVersion === 1
      ? ['schemaVersion', 'entries']
      : ['schemaVersion', 'entries', 'mandates'],
    'acceptance sources',
  )
  const entries = array(v.entries, 'acceptance sources.entries').map(value => {
    const entry = fields(value, ['issue', 'revision', 'authorization', 'authorNodeId'], 'adoption')
    const issue = parseIssueIdentity(entry.issue)
    const authorization = parseReference(entry.authorization)
    if (authorization.issue !== issue.number)
      throw new InputError('collaboration-acceptance-source-card-mismatch')
    return {
      issue,
      revision: integer(entry.revision, 'adoption.revision'),
      authorization,
      authorNodeId: string(entry.authorNodeId, 'adoption.authorNodeId'),
    }
  })
  const keys = entries.map(entry =>
    canonical([entry.issue.repository, entry.issue.number, entry.revision]),
  )
  if (new Set(keys).size !== keys.length)
    throw new InputError('collaboration-acceptance-source-conflict')
  const mandates =
    raw.schemaVersion === 1
      ? []
      : array(v.mandates, 'acceptance sources.mandates').map(value => {
          const entry = fields(
            value,
            ['issue', 'authorization', 'authorNodeId'],
            'mandate adoption',
          )
          const issue = parseIssueIdentity(entry.issue),
            authorization = parseReference(entry.authorization)
          if (authorization.issue !== issue.number)
            throw new InputError('collaboration-acceptance-source-card-mismatch')
          return {
            issue,
            authorization,
            authorNodeId: string(entry.authorNodeId, 'mandate adoption.authorNodeId'),
          }
        })
  const mandateKeys = mandates.map(entry =>
    canonical([entry.issue.repository, entry.authorization.issue, entry.authorization.commentId]),
  )
  if (new Set(mandateKeys).size !== mandateKeys.length)
    throw new InputError('collaboration-acceptance-source-conflict')
  return { [adopted]: true, source, entries, mandates }
}

/** Reads the already adopted immutable source through REST on hosts without its Git objects. */
export function readAcceptanceSourcesRest(
  repo: string,
  source: PolicySource,
  read: GhRead,
): AdoptedAcceptanceSources {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || source.path !== ACCEPTANCE_SOURCES_PATH)
    throw new InputError('collaboration-acceptance-source-path')
  const commit = fullSha(source.commit, 'source.commit')
  const value = object(
    read(
      [
        'api',
        '--method',
        'GET',
        ...REST_HEADERS,
        `repos/${repo}/contents/${ACCEPTANCE_SOURCES_PATH}?ref=${commit}`,
      ],
      15_000,
    ),
    'acceptance source',
  )
  if (
    value.type !== 'file' ||
    value.path !== ACCEPTANCE_SOURCES_PATH ||
    value.sha !== source.blob ||
    value.encoding !== 'base64'
  )
    throw new InputError('collaboration-acceptance-source-changed')
  const text = Buffer.from(string(value.content, 'acceptance source.content'), 'base64').toString(
    'utf8',
  )
  if (digest(text) !== source.digest)
    throw new InputError('collaboration-acceptance-source-changed')
  return parseAcceptanceSources(text, source)
}

export function parseMilestoneMandate(body: string): MilestoneMandate {
  const v = fields(
    collaborationBlock(body, MILESTONE_MANDATE_MARKER),
    ['schemaVersion', 'repository', 'milestone', 'owner', 'acceptor', 'declarationAuthor', 'basis'],
    'milestone mandate',
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'mandate.schemaVersion'),
    repository: string(v.repository, 'mandate.repository'),
    milestone: integer(v.milestone, 'mandate.milestone'),
    owner: parseAccountIdentity(v.owner),
    acceptor: parseAccountIdentity(v.acceptor),
    declarationAuthor: parseAccountIdentity(v.declarationAuthor),
    basis: nonempty(evidenceList(v.basis), 'mandate.basis'),
  }
}

export function parseAcceptanceResponsibility(body: string): AcceptanceResponsibility {
  const v = fields(
    collaborationBlock(body, RESPONSIBILITY_MARKER),
    ['schemaVersion', 'issue', 'revision', 'fieldSha256', 'owner', 'acceptor', 'basis'],
    'acceptance responsibility',
  )
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'responsibility.schemaVersion'),
    issue: parseIssueIdentity(v.issue),
    revision: integer(v.revision, 'responsibility.revision'),
    fieldSha256: hash256(v.fieldSha256, 'responsibility.fieldSha256'),
    owner: parseAccountIdentity(v.owner),
    acceptor: parseAccountIdentity(v.acceptor),
    basis: nonempty(evidenceList(v.basis), 'responsibility.basis'),
  }
}

export function readCommentAccount(
  repo: string,
  captured: CollaborationComment,
  read: GhRead,
): AccountIdentity {
  const raw = object(
    read(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repo}/issues/comments/${captured.id}`],
      15_000,
    ),
    'comment',
  )
  const comment = parseCollaborationComment(raw, repo, captured.issue)
  same(comment, captured, 'Collaboration authorization comment changed')
  if (comment.authorType !== 'User')
    throw new InputError('collaboration-acceptance-author-not-user')
  const user = object(raw.user, 'comment.user')
  return { login: comment.author, nodeId: string(user.node_id, 'comment.user.node_id') }
}

function responsibilityRevoked(
  snapshot: CommentSnapshot,
  authorization: CommentReference,
  principals: readonly AccountIdentity[],
  read: GhRead,
  asOf?: string,
): boolean {
  let revoked = false
  for (const candidate of snapshot.comments) {
    if (!candidate.body.includes('```json omne-collaboration-responsibility-revocation:')) continue
    const v = fields(
      collaborationBlock(candidate.body, RESPONSIBILITY_REVOCATION),
      ['schemaVersion', 'authorization', 'basis'],
      'responsibility revocation',
    )
    literal(v.schemaVersion, 1, 'revocation.schemaVersion')
    const reference = parseReference(v.authorization)
    nonempty(evidenceList(v.basis), 'revocation.basis')
    if (reference.issue !== authorization.issue || reference.commentId !== authorization.commentId)
      continue
    same(reference, authorization, 'Responsibility revocation source conflict')
    if (candidate.createdAt !== candidate.updatedAt)
      throw new InputError('collaboration-acceptance-revocation-edited')
    if (asOf !== undefined && Date.parse(candidate.createdAt) > Date.parse(asOf)) continue
    const revoker = readCommentAccount(snapshot.repo, candidate, read)
    if (!principals.some(account => canonical(account) === canonical(revoker)))
      throw new InputError('collaboration-acceptance-revocation-author-unknown')
    revoked = true
  }
  return revoked
}

function requireMatchingMandate(
  authority: VerifiedCollaborationAuthority,
  sources: AdoptedAcceptanceSources,
  responsibility: AcceptanceResponsibility,
  declarationAuthor: AccountIdentity,
  read: GhRead,
  asOf?: string,
): boolean {
  const matching: MilestoneMandate[] = []
  const snapshots: CommentSnapshot[] = []
  let revoked = false
  for (const entry of sources.mandates) {
    if (entry.issue.repository !== authority.binding.issue.repository) continue
    const snapshot =
      entry.issue.number === authority.snapshot.issue
        ? authority.snapshot
        : readCompleteComments(entry.issue.repository, entry.issue.number, read)
    snapshots.push(snapshot)
    same(
      fetchIssueCard(entry.issue.repository, entry.issue.number, read).identity,
      entry.issue,
      'Mandate source issue mismatch',
    )
    const comment = snapshot.comments.find(item => item.id === entry.authorization.commentId)
    if (
      comment === undefined ||
      commentDigest(comment.body) !== entry.authorization.sha256 ||
      comment.createdAt !== comment.updatedAt
    )
      throw new InputError('collaboration-mandate-source-missing-or-edited')
    const author = readCommentAccount(snapshot.repo, comment, read)
    if (author.nodeId !== entry.authorNodeId)
      throw new InputError('collaboration-mandate-source-author')
    const mandate = parseMilestoneMandate(comment.body)
    same(mandate.repository, entry.issue.repository, 'Mandate repository differs from source')
    if (mandate.milestone !== authority.scope.context.milestone) continue
    if (asOf !== undefined && Date.parse(comment.createdAt) > Date.parse(asOf)) continue
    if (
      snapshot.milestone !== mandate.milestone ||
      authority.snapshot.milestone !== mandate.milestone
    )
      throw new InputError('collaboration-mandate-native-milestone-mismatch')
    if (
      responsibilityRevoked(
        snapshot,
        entry.authorization,
        [mandate.owner, mandate.acceptor],
        read,
        asOf,
      )
    ) {
      revoked = true
      continue
    }
    matching.push(mandate)
  }
  if (matching.length > 1) throw new InputError('collaboration-mandate-conflict')
  const mandate = matching[0]
  if (mandate === undefined && revoked) throw new InputError('collaboration-mandate-revoked')
  if (mandate !== undefined) {
    same(
      [responsibility.owner, responsibility.acceptor, declarationAuthor],
      [mandate.owner, mandate.acceptor, mandate.declarationAuthor],
      'Responsibility differs from adopted milestone mandate',
    )
    if (asOf === undefined) {
      same(
        authority.binding.responsible,
        mandate.owner.login,
        'Current reduce owner differs from milestone mandate',
      )
      const dispatch = authority.snapshot.comments.find(
        item => item.url === authority.binding.dispatch,
      )
      if (dispatch === undefined) throw new InputError('collaboration-mandate-dispatch-missing')
      same(
        readCommentAccount(authority.snapshot.repo, dispatch, read),
        mandate.owner,
        'Current reduce owner account differs from milestone mandate',
      )
    }
  }
  for (const snapshot of snapshots)
    same(
      readCompleteComments(snapshot.repo, snapshot.issue, read),
      snapshot,
      'Milestone mandate source changed during read',
    )
  return mandate !== undefined
}

export function readAdoptedResponsibility(
  authority: VerifiedCollaborationAuthority,
  sources: AdoptedAcceptanceSources,
  reference: CommentReference,
  read: GhRead,
  asOf?: string,
): VerifiedAcceptanceResponsibility {
  const { binding, snapshot } = authority
  const entry = sources.entries.find(
    item =>
      canonical(item.issue) === canonical(binding.issue) &&
      canonical(item.authorization) === canonical(reference),
  )
  if (entry === undefined && sources.mandates.length === 0)
    throw new InputError('collaboration-acceptance-source-not-adopted')
  if (reference.issue !== binding.issue.number)
    throw new InputError('collaboration-acceptance-source-card-mismatch')
  const comment = snapshot.comments.find(item => item.id === reference.commentId)
  if (comment === undefined || commentDigest(comment.body) !== reference.sha256)
    throw new InputError('collaboration-acceptance-source-missing-or-edited')
  const author = readCommentAccount(binding.issue.repository, comment, read)
  const responsibility = parseAcceptanceResponsibility(comment.body)
  same(responsibility.issue, binding.issue, 'Responsibility issue mismatch')
  const revisionSource = sources.entries.find(
    item =>
      canonical(item.issue) === canonical(binding.issue) &&
      item.revision === responsibility.revision,
  )
  if (revisionSource !== undefined)
    same(revisionSource.authorization, reference, 'Adopted responsibility source conflicts')
  const mandated = requireMatchingMandate(authority, sources, responsibility, author, read, asOf)
  if (entry === undefined) {
    if (!mandated) throw new InputError('collaboration-acceptance-source-not-adopted')
    if (comment.createdAt !== comment.updatedAt)
      throw new InputError('collaboration-acceptance-source-missing-or-edited')
  } else {
    if (author.nodeId !== entry.authorNodeId)
      throw new InputError('collaboration-acceptance-source-author')
    same(responsibility.revision, entry.revision, 'Responsibility revision mismatch')
  }
  if (
    responsibilityRevoked(
      snapshot,
      reference,
      [responsibility.owner, responsibility.acceptor],
      read,
      asOf,
    )
  )
    throw new InputError('collaboration-acceptance-responsibility-revoked')
  return { ...responsibility, [verified]: true, authorization: reference, comment }
}

export function readAcceptanceResponsibility(
  authority: VerifiedCollaborationAuthority,
  sources: AdoptedAcceptanceSources,
  read: GhRead,
): VerifiedAcceptanceResponsibility {
  const { binding, scope, snapshot } = authority
  const declared = scope.acceptanceResponsibility
  if (declared === null) throw new InputError('collaboration-acceptance-responsibility-missing')
  const entry = sources.entries.find(
    item =>
      canonical(item.issue) === canonical(binding.issue) && item.revision === binding.revision,
  )
  if (entry !== undefined)
    same(
      entry.authorization,
      declared.authorization,
      'Accepted responsibility source differs from dispatch',
    )
  const responsibility = readAdoptedResponsibility(authority, sources, declared.authorization, read)
  same(
    responsibility.revision,
    binding.revision,
    'Responsibility revision differs from current binding',
  )
  same(
    [responsibility.owner.login, responsibility.acceptor.login],
    [declared.owner, declared.acceptor],
    'Responsibility names differ from dispatch',
  )
  const sourceField = bodyFields(snapshot.body).get(RESPONSIBILITY_FIELD)
  if (
    sourceField?.length !== 1 ||
    digest(sourceField[0] ?? '') !== responsibility.fieldSha256 ||
    responsibility.fieldSha256 !== declared.fieldSha256
  )
    throw new InputError('collaboration-acceptance-responsibility-changed')
  return responsibility
}
