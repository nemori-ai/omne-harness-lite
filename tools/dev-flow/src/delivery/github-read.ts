import { execFileSync } from 'node:child_process'
import { readCardAttributes, type CardAttributes } from './attributes.ts'
import { array, InputError, milestoneOf, parseCapture, record, text } from './protocol.ts'
import type { CapturedIssue, DeliveryCapture, DeliveryConfig } from './protocol.ts'

/**
 * A `gh api` read that exited non-zero after GitHub answered. `gh api` writes the error
 * response JSON to stdout, carried here as `body`. It stays a failed read for every caller;
 * only the parent judgement inspects `body`. The message never contains API output.
 */
export class GhReadError extends Error {
  readonly body: unknown
  constructor(body: unknown) {
    super('gh read exited with an API error response. API output omitted.')
    this.name = 'GhReadError'
    this.body = body
  }
}
/** The request headers of a REST call: the JSON media type and the adopted API version. */
export const REST_HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
] as const
/**
 * One REST Issue response read as a card: the response object, its body and its attributes.
 * Refuses a pull request or an Issue other than `repository#number`.
 */
export function readIssueCard(
  value: unknown,
  repository: string,
  number: number,
): { issue: Record<string, unknown>; url: string; body: string; attributes: CardAttributes } {
  const issue = record(value, 'Issue'),
    url = `https://github.com/${repository}/issues/${number}`
  if ('pull_request' in issue || issue.number !== number || issue.html_url !== url)
    throw new InputError('Issue identity mismatch or pull request')
  const body = issue.body === null ? '' : text(issue.body, 'Issue.body')
  return {
    issue,
    url,
    body,
    attributes: readCardAttributes(body, {
      url,
      labels: array(issue.labels, 'Issue.labels').map(item =>
        text(record(item, 'label').name, 'label.name'),
      ),
      ...milestoneOf(issue),
    }),
  }
}
/** Runs one `gh` command and returns its parsed JSON stdout. */
export type GhCommand = (argv: readonly string[], timeoutMs: number) => unknown
/** A `GhCommand` that its callers use only for GET requests. */
export type GhRead = GhCommand
export const runGhCommand: GhCommand = (argv, timeoutMs) => {
  let stdout: string
  try {
    stdout = execFileSync('gh', [...argv], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
  } catch (error) {
    throw responseError(error) ?? error
  }
  return JSON.parse(stdout)
}
export const runGhRead: GhRead = runGhCommand
/** Only an ordinary non-zero exit with JSON on stdout carries a response body. */
function responseError(error: unknown): GhReadError | undefined {
  if (!(error instanceof Error)) return undefined
  const { status, signal, stdout } = error as Error & {
    status?: unknown
    signal?: unknown
    stdout?: unknown
  }
  if (
    typeof status !== 'number' ||
    status === 0 ||
    (signal !== null && signal !== undefined) ||
    typeof stdout !== 'string'
  )
    return undefined
  try {
    return new GhReadError(JSON.parse(stdout))
  } catch {
    return undefined
  }
}
export type ParentRead = { kind: 'parent'; url: string } | { kind: 'none' } | { kind: 'unknown' }
/**
 * Judges one `repos/{o}/{r}/issues/{n}/parent` read and fails closed. A returned Issue gives
 * its `html_url`. Only HTTP 404 with the exact message `No parent issue found` means no
 * parent. Any other outcome, including another 404 message, is unknown.
 */
export function judgeParent(read: () => unknown): ParentRead {
  let value: unknown
  try {
    value = read()
  } catch (error) {
    if (!(error instanceof GhReadError)) return { kind: 'unknown' }
    try {
      const body = record(error.body, 'parent error response')
      return body.status === '404' && body.message === 'No parent issue found'
        ? { kind: 'none' }
        : { kind: 'unknown' }
    } catch {
      return { kind: 'unknown' }
    }
  }
  try {
    return { kind: 'parent', url: text(record(value, 'parent Issue').html_url, 'parent.url') }
  } catch {
    return { kind: 'unknown' }
  }
}
const PROJECT_QUERY =
  'query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2{id fields(first:100){pageInfo{hasNextPage} nodes{... on ProjectV2SingleSelectField{id}}} items(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{content{... on Issue{id url}} fieldValues(first:100){pageInfo{hasNextPage} nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id}}}}}}}}}}'

export function collectDelivery(config: DeliveryConfig, read: GhRead = runGhRead): DeliveryCapture {
  const startedAt = new Date().toISOString(),
    errors: string[] = [],
    deadline = Date.now() + 120_000
  let requests = 0
  function request(argv: string[]): unknown {
    if (requests >= 200 || Date.now() >= deadline)
      throw new InputError('collection request or time limit reached')
    requests += 1
    return read(argv, Math.min(15_000, Math.max(1, deadline - Date.now())))
  }
  function rest(path: string): unknown {
    return request([
      'api',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2026-03-10',
      path,
    ])
  }
  function paged(path: string): { items: unknown[]; complete: boolean } {
    const items: unknown[] = []
    for (let page = 1; page <= 20; page += 1) {
      try {
        const result = array(
          rest(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`),
          'GitHub page',
        )
        items.push(...result)
        if (result.length < 100) return { items, complete: true }
      } catch {
        errors.push(`Read incomplete at ${path}, page ${page}. API output omitted.`)
        return { items, complete: false }
      }
    }
    errors.push(`Page limit reached at ${path}.`)
    return { items, complete: false }
  }
  const prefix = `repos/${config.repository}`,
    collected = paged(`${prefix}/issues?state=all&sort=created&direction=asc`),
    issues: CapturedIssue[] = []
  let issueComplete = collected.complete
  for (const raw of collected.items) {
    try {
      const i = record(raw, 'GitHub Issue')
      if ('pull_request' in i) continue
      const number = i.number
      if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1)
        throw new InputError('GitHub Issue number invalid')
      const commentsPage = paged(`${prefix}/issues/${number}/comments`),
        comments: CapturedIssue['comments'] = []
      let commentsComplete = commentsPage.complete
      for (const item of commentsPage.items) {
        try {
          const c = record(item, 'GitHub comment'),
            user = record(c.user, 'GitHub comment user')
          comments.push({
            url: text(c.html_url, 'comment.url'),
            author: text(user.login, 'comment.author'),
            body: text(c.body, 'comment.body'),
            updatedAt: text(c.updated_at, 'comment.updatedAt'),
          })
        } catch {
          commentsComplete = false
          errors.push(`Malformed comment on Issue ${number}. Raw content omitted.`)
        }
      }
      const dependencies = paged(`${prefix}/issues/${number}/dependencies/blocked_by`),
        blockedBy: string[] = []
      let relationsComplete = dependencies.complete,
        parentIssue: string | null = null
      for (const dependency of dependencies.items) {
        try {
          blockedBy.push(text(record(dependency, 'GitHub dependency').html_url, 'dependency.url'))
        } catch {
          relationsComplete = false
          errors.push(`Malformed dependency on Issue ${number}.`)
        }
      }
      const id = text(i.node_id, 'Issue.id'),
        parent = judgeParent(() => rest(`${prefix}/issues/${number}/parent`))
      if (parent.kind === 'parent') parentIssue = parent.url
      else if (parent.kind === 'unknown') {
        relationsComplete = false
        errors.push(`Parent relation unknown for Issue ${number}. API output omitted.`)
      }
      const state = i.state
      if (state !== 'open' && state !== 'closed') throw new InputError('GitHub Issue state invalid')
      issues.push({
        number,
        url: text(i.html_url, 'Issue.url'),
        id,
        state,
        updatedAt: text(i.updated_at, 'Issue.updatedAt'),
        body: i.body === null ? '' : text(i.body, 'Issue.body'),
        labels: array(i.labels, 'Issue.labels').map(item =>
          text(record(item, 'label').name, 'label.name'),
        ),
        comments,
        commentsComplete,
        relationsComplete,
        blockedBy,
        parentIssue,
        stage: null,
        ...milestoneOf(i),
      })
    } catch {
      issueComplete = false
      errors.push('Malformed Issue omitted. API output omitted.')
    }
  }
  let projectComplete = false
  if (config.project.id !== null && config.project.fields.stage !== null) {
    let cursor: string | null = null
    for (let page = 1; page <= 20; page += 1) {
      try {
        const argv = [
          'api',
          'graphql',
          '-f',
          `query=${PROJECT_QUERY}`,
          '-f',
          `id=${config.project.id}`,
          ...(cursor === null ? [] : ['-f', `cursor=${cursor}`]),
        ]
        const result = record(request(argv), 'Project query')
        if ('errors' in result) throw new InputError('GraphQL errors')
        const node = record(record(result.data, 'Project data').node, 'Project node')
        if (node.id !== config.project.id) throw new InputError('Project identity mismatch')
        const registeredFields = record(node.fields, 'Project fields')
        if (
          record(registeredFields.pageInfo, 'Project fields pageInfo').hasNextPage !== false ||
          !array(registeredFields.nodes, 'Project fields nodes').some(
            value => record(value, 'Project field').id === config.project.fields.stage,
          )
        )
          throw new InputError('configured Stage field is not confirmed on Project')
        const items = record(node.items, 'Project items'),
          pageInfo = record(items.pageInfo, 'Project pageInfo')
        let fieldsComplete = true
        for (const raw of array(items.nodes, 'Project nodes')) {
          const item = record(raw, 'Project item'),
            values = record(item.fieldValues, 'Project values')
          if (record(values.pageInfo, 'field pageInfo').hasNextPage !== false)
            fieldsComplete = false
          if (item.content === null) continue
          const content = record(item.content, 'Project content')
          if (typeof content.id !== 'string' || typeof content.url !== 'string') continue
          const issue = issues.find(i => i.id === content.id && i.url === content.url)
          if (issue === undefined) continue
          for (const rawValue of array(values.nodes, 'Project field values')) {
            const value = record(rawValue, 'Project field value')
            if (value.field === undefined) continue
            if (record(value.field, 'Project field').id === config.project.fields.stage)
              issue.stage = text(value.name, 'Project Stage')
          }
        }
        if (!fieldsComplete) {
          errors.push('Project field values are incomplete.')
          break
        }
        if (pageInfo.hasNextPage === false) {
          projectComplete = true
          break
        }
        cursor = text(pageInfo.endCursor, 'Project cursor')
        if (page === 20) errors.push('Project item page limit reached.')
      } catch {
        errors.push('Project read incomplete. API output omitted.')
        break
      }
    }
  } else errors.push('Project identity or Stage field ID is not configured.')
  return parseCapture({
    schemaVersion: 1,
    kind: 'github-delivery-capture',
    protocolVersion: 2,
    repository: config.repository,
    projectId: config.project.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    collection: {
      issues: issueComplete ? 'complete' : 'partial',
      project: projectComplete ? 'complete' : 'unknown',
      errors,
    },
    issues,
  })
}
