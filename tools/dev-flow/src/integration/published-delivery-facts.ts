import { collaborationBlock } from '../delivery/collaboration-block.ts'
import {
  parseCollaborationComment,
  readCompleteComments,
  type CollaborationComment,
} from '../delivery/collaboration-read.ts'
import type { CommentReference } from '../delivery/collaboration-records.ts'
import { utcTime } from '../delivery/collaboration-values.ts'
import { REST_HEADERS, type GhRead } from '../delivery/github-read.ts'
import {
  FACTS_MARKER,
  parseDeliveryFacts,
  type AuthorityFacts,
  type DeliveryFacts,
} from './delivery-facts-record.ts'
import { digest, object, same, string, IntegrationError } from './parse.ts'

export type FactsDeployment = {
  repository: string
  projectId: string
  workflow: { id: number; path: string; ref: string; head: string }
  bot: { login: string; nodeId: string }
}
export type FactsReadDeployment = Omit<FactsDeployment, 'workflow'> & {
  workflows: readonly [FactsDeployment['workflow'], ...FactsDeployment['workflow'][]]
}
export type PublishedFacts = {
  authority: AuthorityFacts
  observations: { facts: DeliveryFacts; reference: CommentReference }[]
}

export class PublishedFactsMissing extends IntegrationError {
  readonly dispatch: Omit<AuthorityFacts, 'reviewer'>
  constructor(dispatch: Omit<AuthorityFacts, 'reviewer'>) {
    super('unknown', 'Published facts are missing for this dispatch')
    this.dispatch = dispatch
  }
}

function unknown(message: string): never {
  throw new IntegrationError('unknown', message)
}

/** The deployment comes from the adopted installation, never from ordinary command options. */
export function readPublishedDeliveryFacts(
  deployment: FactsReadDeployment,
  dispatchUrl: string,
  read: GhRead,
): PublishedFacts {
  const match =
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)#issuecomment-([1-9]\d*)$/.exec(
      dispatchUrl,
    )
  if (match === null || match[1] !== deployment.repository)
    unknown('Published facts dispatch repository mismatch')
  const issue = Number(match[2])
  if (!Number.isSafeInteger(issue)) unknown('Published facts Issue number is invalid')
  const prefix = `repos/${deployment.repository}`
  const get = (path: string) =>
    object(
      read(['api', '--method', 'GET', ...REST_HEADERS, `${prefix}/${path}`], 15_000),
      'published facts response',
    )
  const snapshot = readCompleteComments(deployment.repository, issue, read)
  const dispatch = snapshot.comments.find(comment => comment.url === dispatchUrl)
  if (dispatch === undefined) unknown('Published facts dispatch is missing')

  function commentIdentity(comment: CollaborationComment) {
    const raw = get(`issues/comments/${comment.id}`)
    same(
      parseCollaborationComment(raw, deployment.repository, issue),
      comment,
      'Published facts comment changed during read',
    )
    const user = object(raw.user, 'comment.user')
    return {
      login: comment.author,
      nodeId: string(user.node_id, 'comment.user.node_id'),
      type: comment.authorType,
    }
  }
  const actor = commentIdentity(dispatch)
  if (actor.type !== 'User') unknown('Published facts dispatch author is not a User')
  const expected = {
    url: dispatchUrl,
    author: actor.login,
    authorNodeId: actor.nodeId,
    bodySha256: digest(dispatch.body),
    updatedAt: dispatch.updatedAt,
  }

  function verifyRun(runId: number, comment: CollaborationComment) {
    const current = get(`actions/runs/${runId}`)
    const attempt = get(`actions/runs/${runId}/attempts/1`)
    function check(value: Record<string, unknown>) {
      const repository = object(value.repository, 'run.repository')
      const headRepository = object(value.head_repository, 'run.head_repository')
      const [workflow, ...ambiguous] = deployment.workflows.filter(
        candidate =>
          value.workflow_id === candidate.id &&
          value.path === candidate.path &&
          value.head_branch === candidate.ref &&
          value.head_sha === candidate.head,
      )
      if (
        value.id !== runId ||
        workflow === undefined ||
        ambiguous.length !== 0 ||
        value.event !== 'workflow_dispatch' ||
        value.run_attempt !== 1 ||
        repository.full_name !== deployment.repository ||
        headRepository.full_name !== deployment.repository
      )
        unknown('Published facts workflow provenance mismatch')
      if (value.status !== 'completed' || value.conclusion !== 'success')
        unknown('Published facts workflow is not successful')
      const created = utcTime(value.created_at, 'run.created_at')
      const started = utcTime(value.run_started_at, 'run.run_started_at')
      const ended = utcTime(value.updated_at, 'run.updated_at')
      if (
        Date.parse(created) > Date.parse(started) ||
        Date.parse(started) > Date.parse(ended) ||
        Date.parse(comment.createdAt) < Date.parse(started) ||
        Date.parse(comment.createdAt) > Date.parse(ended)
      )
        unknown('Published facts comment is outside its workflow attempt')
      return { created, started, ended, workflow: { ...workflow } }
    }
    same(check(current), check(attempt), 'Published facts workflow attempt changed')
    return { current, attempt }
  }

  const observations: PublishedFacts['observations'] = []
  const runs: {
    run: number
    comment: CollaborationComment
    observed: ReturnType<typeof verifyRun>
  }[] = []
  const candidates: {
    comment: CollaborationComment
    identity: ReturnType<typeof commentIdentity>
  }[] = []
  for (const comment of snapshot.comments) {
    if (comment.author !== deployment.bot.login) continue
    const hasFactsMarker = comment.body.includes('omne-delivery-facts:')
    if (!hasFactsMarker && comment.createdAt === comment.updatedAt) continue
    const identity = commentIdentity(comment)
    same(identity, { ...deployment.bot, type: 'Bot' }, 'Published facts Bot identity mismatch')
    if (comment.createdAt !== comment.updatedAt) unknown('Published facts comment was edited')
    if (!hasFactsMarker) continue
    const facts = parseDeliveryFacts(collaborationBlock(comment.body, FACTS_MARKER))
    if (facts.authority.url !== dispatchUrl) continue
    same(
      facts.authority,
      { ...expected, reviewer: facts.authority.reviewer },
      'Published facts dispatch identity mismatch',
    )
    if (facts.issue !== issue || facts.project.id !== deployment.projectId)
      unknown('Published facts Issue or Project mismatch')
    if (Date.parse(comment.createdAt) < Date.parse(dispatch.updatedAt))
      unknown('Published facts predate the dispatch revision')
    const observed = verifyRun(facts.run, comment)
    candidates.push({ comment, identity })
    runs.push({ run: facts.run, comment, observed })
    observations.push({
      facts,
      reference: { issue, commentId: comment.id, sha256: digest(comment.body) },
    })
  }
  if (observations.length === 0) {
    same(commentIdentity(dispatch), actor, 'Published facts dispatch account changed during read')
    same(
      readCompleteComments(deployment.repository, issue, read),
      snapshot,
      'Published facts collection changed during read',
    )
    throw new PublishedFactsMissing(expected)
  }
  const byNonce = new Set<string>(),
    byRun = new Set<number>()
  for (const { facts } of observations) {
    if (byNonce.has(facts.nonce) || byRun.has(facts.run))
      unknown('Published facts operation is duplicated')
    byNonce.add(facts.nonce)
    byRun.add(facts.run)
  }
  if (observations.some(item => !item.facts.authority.reviewer)) {
    if (observations.some(item => item.facts.authority.reviewer))
      unknown('Published facts qualification conflicts; a new dispatch is required')
    throw new IntegrationError('refused', 'Published facts do not qualify the dispatch author')
  }
  for (const { comment, identity } of candidates)
    same(commentIdentity(comment), identity, 'Published facts Bot account changed during read')
  for (const { run, comment, observed } of runs)
    same(verifyRun(run, comment), observed, 'Published facts workflow changed during read')
  same(commentIdentity(dispatch), actor, 'Published facts dispatch account changed during read')
  same(
    readCompleteComments(deployment.repository, issue, read),
    snapshot,
    'Published facts collection changed during read',
  )
  return { authority: { ...expected, reviewer: true }, observations }
}
