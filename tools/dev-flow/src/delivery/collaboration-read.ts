import { array, canonical, integer, object, string } from '../integration/parse.ts'
import { REST_HEADERS, type GhRead } from './github-read.ts'
import { InputError } from './protocol.ts'
import { decodeRecordComment } from './collaboration-comments.ts'
import type { CollaborationRecord, WaveIdentity } from './collaboration-records.ts'
import { utcTime } from './collaboration-values.ts'

export type CollaborationComment = {
  id: number
  issue: number
  author: string
  authorType: string
  body: string
  url: string
  createdAt: string
  updatedAt: string
}
export type RecordComment = CollaborationComment & { record: CollaborationRecord }
export type CommentSnapshot = {
  repo: string
  issue: number
  body: string
  state: 'open' | 'closed'
  updatedAt: string
  comments: CollaborationComment[]
}

function issueIdentity(
  value: unknown,
  repo: string,
  issue: number,
): {
  body: string
  state: 'open' | 'closed'
  updatedAt: string
  count: number
} {
  const v = object(value, 'Issue')
  if (
    v.number !== issue ||
    v.html_url !== `https://github.com/${repo}/issues/${issue}` ||
    'pull_request' in v
  )
    throw new InputError('collaboration-issue-identity-mismatch')
  if (typeof v.comments !== 'number' || !Number.isSafeInteger(v.comments) || v.comments < 0)
    throw new InputError('collaboration-comments-count-invalid')
  if (v.state !== 'open' && v.state !== 'closed')
    throw new InputError('collaboration-issue-state-invalid')
  return {
    body: v.body === null || v.body === '' ? '' : string(v.body, 'Issue.body'),
    state: v.state,
    updatedAt: utcTime(v.updated_at, 'Issue.updated_at'),
    count: v.comments,
  }
}

export function parseCollaborationComment(
  value: unknown,
  repo: string,
  issue: number,
): CollaborationComment {
  const v = object(value, 'comment'),
    user = object(v.user, 'comment.user')
  const id = integer(v.id, 'comment.id')
  if (
    v.issue_url !== `https://api.github.com/repos/${repo}/issues/${issue}` ||
    v.html_url !== `https://github.com/${repo}/issues/${issue}#issuecomment-${id}`
  )
    throw new InputError('collaboration-comment-identity-mismatch')
  return {
    id,
    issue,
    author: string(user.login, 'comment.user.login'),
    authorType: string(user.type, 'comment.user.type'),
    body: v.body === '' ? '' : string(v.body, 'comment.body'),
    url: v.html_url,
    createdAt: utcTime(v.created_at, 'comment.created_at'),
    updatedAt: utcTime(v.updated_at, 'comment.updated_at'),
  }
}

/** Reads every page and checks the Issue count and revision again before returning a snapshot. */
export function readCompleteComments(repo: string, issue: number, read: GhRead): CommentSnapshot {
  if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(repo))
    throw new InputError('collaboration-repo-invalid')
  integer(issue, 'issue')
  const endpoint = `repos/${repo}/issues/${issue}`
  const get = (path: string) => read(['api', '--method', 'GET', ...REST_HEADERS, path], 15_000)
  const before = issueIdentity(get(endpoint), repo, issue)
  const comments: CollaborationComment[] = [],
    ids = new Set<number>()
  for (let page = 1; ; page++) {
    const items = array(get(`${endpoint}/comments?per_page=100&page=${page}`), 'comment page')
    if (items.length > 100) throw new InputError('collaboration-comments-page-invalid')
    for (const item of items) {
      const comment = parseCollaborationComment(item, repo, issue)
      if (ids.has(comment.id)) throw new InputError('collaboration-comments-duplicate-page')
      ids.add(comment.id)
      comments.push(comment)
    }
    if (comments.length > before.count)
      throw new InputError('collaboration-comments-snapshot-changed')
    if (items.length < 100) break
  }
  const after = issueIdentity(get(endpoint), repo, issue)
  if (canonical(before) !== canonical(after))
    throw new InputError('collaboration-comments-snapshot-changed')
  if (comments.length !== after.count) throw new InputError('collaboration-comments-incomplete')
  return { repo, issue, body: after.body, state: after.state, updatedAt: after.updatedAt, comments }
}

export function recordComments(snapshot: CommentSnapshot): RecordComment[] {
  return snapshot.comments.flatMap(comment => {
    const record = decodeRecordComment(comment.body)
    return record === undefined ? [] : [{ ...comment, record }]
  })
}

export function recordContext(record: CollaborationRecord): WaveIdentity {
  return record.kind === 'request'
    ? record.input.context
    : record.kind === 'assignment'
      ? record.assignment.context
      : record.context
}
