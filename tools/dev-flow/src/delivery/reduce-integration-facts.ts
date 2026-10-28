import { array, integer, object, same, string } from '../integration/parse.ts'
import { readGateRun } from '../integration/gate-correlation.ts'
import type { RequestInput, RequestStateRecord } from './collaboration-records.ts'
import { fullSha } from './collaboration-values.ts'
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'

/** API 2026-03-10 omits merge_commit_sha; only a merged event identifies the actual merge. */
function readMergedCommit(get: (path: string) => unknown, repo: string, pull: number): string {
  const ids = new Set<number>()
  let commit: string | undefined
  for (let page = 1; ; page++) {
    const events = array(get(`issues/${pull}/events?per_page=100&page=${page}`), 'merge events')
    if (events.length > 100) throw new InputError('reduce-merge-events-page-invalid')
    for (const raw of events) {
      const event = object(raw, 'merge event')
      const id = integer(event.id, 'event.id')
      if (ids.has(id)) throw new InputError('reduce-merge-events-duplicate')
      ids.add(id)
      if (event.event !== 'merged') continue
      if (commit !== undefined) throw new InputError('reduce-merge-event-conflict')
      const sha = fullSha(event.commit_id, 'merged event.commit_id')
      if (
        event.url !== `https://api.github.com/repos/${repo}/issues/events/${id}` ||
        event.commit_url !== `https://api.github.com/repos/${repo}/commits/${sha}`
      )
        throw new InputError('reduce-merge-event-identity')
      commit = sha
    }
    if (events.length < 100) break
  }
  if (commit === undefined) throw new InputError('reduce-merge-event-missing')
  return commit
}

export function readCandidateFacts(read: GhRead, request: RequestInput) {
  if (request.pull === null) throw new InputError('reduce-pull-required')
  const get = (path: string) =>
    read(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${request.context.repo}/${path}`],
      15_000,
    )
  const pull = object(get(`pulls/${request.pull.number}`), 'pull')
  const head = object(pull.head, 'pull.head'),
    base = object(pull.base, 'pull.base')
  if (
    pull.number !== request.pull.number ||
    pull.html_url !== `https://github.com/${request.context.repo}/pull/${request.pull.number}` ||
    object(base.repo, 'pull.base.repo').full_name !== request.context.repo ||
    base.ref !== request.targetRef
  )
    throw new InputError('reduce-pull-identity-mismatch')
  const ref = object(
    get(`git/ref/heads/${request.targetRef.split('/').map(encodeURIComponent).join('/')}`),
    'ref',
  )
  if (ref.ref !== `refs/heads/${request.targetRef}`)
    throw new InputError('reduce-target-ref-mismatch')
  return {
    head: fullSha(head.sha, 'pull.head.sha'),
    targetHead: fullSha(object(ref.object, 'ref.object').sha, 'ref.sha'),
    merged: pull.merged === true,
    state: string(pull.state, 'pull.state'),
    mergeCommit:
      pull.merged === true
        ? readMergedCommit(get, request.context.repo, request.pull.number)
        : null,
  }
}

export function verifyMergedFacts(
  read: GhRead,
  request: RequestInput,
  record: RequestStateRecord,
  workflowHead: string,
  checkpoint: string,
) {
  if (
    record.workflow === null ||
    record.candidateHead === null ||
    request.pull === null ||
    record.mergeCommit === null
  )
    throw new InputError('reduce-merge-evidence-missing')
  const run = readGateRun(read, {
    repo: request.context.repo,
    pull: request.pull.number,
    candidateHead: record.candidateHead,
    checkpoint,
    workflow: record.workflow,
    adoptedWorkflowHead: workflowHead,
  })
  if (run.status !== 'completed' || run.conclusion !== 'success')
    throw new InputError('reduce-gate-not-successful')
  const facts = readCandidateFacts(read, request)
  if (!facts.merged || facts.state !== 'closed') throw new InputError('reduce-pull-not-merged')
  same(facts.head, record.candidateHead, 'reduce-external-head-conflict')
  same(facts.mergeCommit, record.mergeCommit, 'reduce-merge-commit-mismatch')
  const compare = object(
    read(
      [
        'api',
        '--method',
        'GET',
        ...REST_HEADERS,
        `repos/${request.context.repo}/compare/${record.mergeCommit}...${facts.targetHead}`,
      ],
      15_000,
    ),
    'merge reachability',
  )
  if (compare.status !== 'ahead' && compare.status !== 'identical')
    throw new InputError('reduce-merge-not-reachable')
  return { run, facts }
}
