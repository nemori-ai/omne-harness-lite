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
import { parseCollaborationComment, type CollaborationComment } from './collaboration-read.ts'
import type { VerifiedCollaborationAuthority } from './collaboration-authority.ts'
import type { CommentReference, Evidence } from './collaboration-records.ts'
import { RESPONSIBILITY_FIELD } from './collaboration-scope.ts'
import { evidenceList, fullSha, hash256, nonempty, parseReference } from './collaboration-values.ts'
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

export const ACCEPTANCE_SOURCES_PATH = 'docs/engineering/collaboration-acceptance-sources.json'
export const RESPONSIBILITY_MARKER = 'omne-collaboration-responsibility:v1'
export const RESPONSIBILITY_REVOCATION = 'omne-collaboration-responsibility-revocation:v1'
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
  const v = fields(collaborationJson(file.text), ['schemaVersion', 'entries'], 'acceptance sources')
  literal(v.schemaVersion, 1, 'acceptance sources.schemaVersion')
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
  return { [adopted]: true, source, entries }
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
  if (entry === undefined) throw new InputError('collaboration-acceptance-source-not-adopted')
  const comment = snapshot.comments.find(item => item.id === entry.authorization.commentId)
  if (comment === undefined || commentDigest(comment.body) !== entry.authorization.sha256)
    throw new InputError('collaboration-acceptance-source-missing-or-edited')
  const author = readCommentAccount(binding.issue.repository, comment, read)
  if (author.nodeId !== entry.authorNodeId)
    throw new InputError('collaboration-acceptance-source-author')
  const responsibility = parseAcceptanceResponsibility(comment.body)
  same(responsibility.issue, binding.issue, 'Responsibility issue mismatch')
  same(responsibility.revision, entry.revision, 'Responsibility revision mismatch')
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
    if (
      reference.issue !== entry.authorization.issue ||
      reference.commentId !== entry.authorization.commentId
    )
      continue
    same(reference, entry.authorization, 'Responsibility revocation source conflict')
    if (candidate.createdAt !== candidate.updatedAt)
      throw new InputError('collaboration-acceptance-revocation-edited')
    if (asOf !== undefined && Date.parse(candidate.createdAt) > Date.parse(asOf)) continue
    const revoker = readCommentAccount(binding.issue.repository, candidate, read)
    if (
      ![responsibility.owner, responsibility.acceptor].some(
        account => canonical(account) === canonical(revoker),
      )
    )
      throw new InputError('collaboration-acceptance-revocation-author-unknown')
    throw new InputError('collaboration-acceptance-responsibility-revoked')
  }
  return { ...responsibility, [verified]: true, authorization: entry.authorization, comment }
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
  if (entry === undefined) throw new InputError('collaboration-acceptance-source-not-adopted')
  same(
    entry.authorization,
    declared.authorization,
    'Accepted responsibility source differs from dispatch',
  )
  const responsibility = readAdoptedResponsibility(authority, sources, entry.authorization, read)
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
