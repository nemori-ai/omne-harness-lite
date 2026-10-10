import { execFileSync } from 'node:child_process'
import { array, InputError, parseCapture, record, text } from './protocol.ts'
import type { CapturedIssue, DeliveryCapture, DeliveryConfig } from './protocol.ts'

export type GhRead = (argv: readonly string[], timeoutMs: number) => unknown
export const runGhRead: GhRead = (argv, timeoutMs) => {
  const stdout = execFileSync('gh', [...argv], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  return JSON.parse(stdout)
}
const PARENT_QUERY = 'query($id:ID!){node(id:$id){... on Issue{id parent{url}}}}'
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
      const id = text(i.node_id, 'Issue.id')
      try {
        const result = record(
          request(['api', 'graphql', '-f', `query=${PARENT_QUERY}`, '-f', `id=${id}`]),
          'parent query',
        )
        if ('errors' in result) throw new InputError('GraphQL errors')
        const node = record(record(result.data, 'parent data').node, 'parent node')
        if (node.id !== id) throw new InputError('parent query identity mismatch')
        parentIssue =
          node.parent === null ? null : text(record(node.parent, 'parent').url, 'parent.url')
      } catch {
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
    protocolVersion: 1,
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
