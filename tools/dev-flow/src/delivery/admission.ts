import { judgeParent, runGhRead, type GhRead } from './github-read.ts'
import { declaredIssueParents, observeDelivery } from './observe.ts'
import {
  array,
  InputError,
  milestoneOf,
  parseCapture,
  record,
  text,
  type CapturedIssue,
  type DeliveryConfig,
  type DeliveryReport,
} from './protocol.ts'

export type AdmissionScope = { task: string; authority: string }
/**
 * The task's Project state when a trusted source already read it: the item that proves
 * membership in the configured Project and the Stage snapshot. With it, admission skips its own
 * Project reads; the source is responsible for confirming the Stage field.
 */
export type AdmissionProject = { id: string; item: string; stage: string | null }
export type AdmissionCapture = {
  schemaVersion: 1
  kind: 'github-admission-capture'
  protocolVersion: 2
  repository: string
  projectId: string
  scope: AdmissionScope
  closure: string[]
  issues: CapturedIssue[]
  startedAt: string
  finishedAt: string
}

export function observeAdmission(
  config: DeliveryConfig,
  capture: AdmissionCapture,
  issue = capture.scope.task,
): Pick<DeliveryReport, 'cards' | 'findings'> {
  const report = observeDelivery(
    config,
    parseCapture({
      ...capture,
      kind: 'github-delivery-capture',
      collection: { issues: 'partial', project: 'unknown', errors: [] },
    }),
  )
  return {
    cards: report.cards.filter(card => card.issue === issue),
    findings: report.findings.filter(finding => finding.object === issue),
  }
}

function issueNumber(repository: string, url: string): number {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)$/.exec(url)
  const number = Number(match?.[2])
  if (match?.[1] !== repository || !Number.isSafeInteger(number))
    throw new InputError('Admission requires an exact same-repository Issue URL')
  return number
}
const MEMBERSHIPS =
  'query($id:ID!,$cursor:String){node(id:$id){... on Issue{id url projectItems(first:100,after:$cursor,includeArchived:true){pageInfo{hasNextPage endCursor} nodes{id project{id}}}}}}'
const FIELDS =
  'query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2{id fields(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{__typename ... on ProjectV2SingleSelectField{id}}}}}}'
const VALUES =
  'query($id:ID!,$cursor:String){node(id:$id){... on ProjectV2Item{id project{id} fieldValues(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{__typename ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id}}}}}}}}'

export function collectAdmission(
  config: DeliveryConfig,
  scope: AdmissionScope,
  read: GhRead = runGhRead,
  project?: AdmissionProject,
): AdmissionCapture {
  const taskNumber = issueNumber(config.repository, scope.task)
  const authority = /^(.*)#issuecomment-([1-9]\d*)$/.exec(scope.authority)
  if (authority?.[1] === undefined) throw new InputError('Unsupported admission authority URL')
  const authorityUrl = authority[1]
  issueNumber(config.repository, authorityUrl)
  const projectId = text(config.project.id, 'Project.id'),
    stageId = text(config.project.fields.stage, 'Project Stage field ID')
  const startedAt = new Date().toISOString(),
    deadline = Date.now() + 120_000,
    issues = new Map<string, CapturedIssue>(),
    closure = new Set([scope.task])
  let requests = 0
  /** Counts one request against the budgets and returns its timeout. */
  function slot(): number {
    if (requests >= 200 || Date.now() >= deadline)
      throw new InputError('Admission request or time limit reached')
    requests += 1
    return Math.min(15_000, Math.max(1, deadline - Date.now()))
  }
  function request(argv: string[]): unknown {
    const timeoutMs = slot()
    try {
      return read(argv, timeoutMs)
    } catch {
      throw new InputError('Admission GitHub read failed. API output omitted.')
    }
  }
  function restArgv(path: string): string[] {
    return [
      'api',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2026-03-10',
      `repos/${config.repository}/${path}`,
    ]
  }
  function rest(path: string): unknown {
    return request(restArgv(path))
  }
  /** The native parent URL, null when GitHub states there is none; anything else refuses. */
  function parentOf(number: number): string | null {
    const timeoutMs = slot(),
      parent = judgeParent(() => read(restArgv(`issues/${number}/parent`), timeoutMs))
    if (parent.kind === 'unknown')
      throw new InputError('Admission parent relation unknown. API output omitted.')
    return parent.kind === 'parent' ? parent.url : null
  }
  function paged(path: string): unknown[] {
    const items: unknown[] = []
    for (let page = 1; page <= 20; page += 1) {
      const result = array(rest(`${path}?per_page=100&page=${page}`), 'Admission page')
      items.push(...result)
      if (result.length < 100) return items
    }
    throw new InputError('Admission page limit reached')
  }
  function node(query: string, id: string, cursor: string | null = null): Record<string, unknown> {
    const result = record(
      request([
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `id=${id}`,
        ...(cursor === null ? [] : ['-f', `cursor=${cursor}`]),
      ]),
      'Admission query',
    )
    if ('errors' in result) throw new InputError('Admission GraphQL errors. API output omitted.')
    const value = record(record(result.data, 'Admission data').node, 'Admission node')
    if (value.id !== id) throw new InputError('Admission node identity mismatch')
    return value
  }
  function connection(
    query: string,
    id: string,
    name: string,
    validate: (value: Record<string, unknown>) => void,
  ): unknown[] {
    let cursor: string | null = null
    const items: unknown[] = [],
      cursors = new Set<string>()
    for (let page = 1; page <= 20; page += 1) {
      const value = node(query, id, cursor)
      validate(value)
      const result = record(value[name], name),
        pageInfo = record(result.pageInfo, 'pageInfo')
      items.push(...array(result.nodes, `${name}.nodes`))
      if (pageInfo.hasNextPage === false) return items
      if (pageInfo.hasNextPage !== true) throw new InputError('Admission page completeness unknown')
      cursor = text(pageInfo.endCursor, 'Admission cursor')
      if (cursor === '' || cursors.has(cursor))
        throw new InputError('Admission cursor did not advance')
      cursors.add(cursor)
    }
    throw new InputError('Admission page limit reached')
  }
  /**
   * A closed Issue other than the task settled its own prerequisites when it closed, so the
   * closure reads it as a leaf: the Issue itself, without its relations, condition table checks or
   * targets. The task is never a leaf because admission observes the task whatever its state.
   */
  function isLeaf(state: string, url: string): boolean {
    return state === 'closed' && url !== scope.task
  }
  function fetchIssue(url: string, includeRelations = true): CapturedIssue {
    const cached = issues.get(url)
    if (cached !== undefined) return cached
    if (issues.size >= 32) throw new InputError('Admission exceeds 32 required Issues')
    const number = issueNumber(config.repository, url),
      raw = record(rest(`issues/${number}`), 'Admission Issue')
    if ('pull_request' in raw || raw.number !== number || raw.html_url !== url)
      throw new InputError('Admission Issue identity mismatch or PR substitution')
    const id = text(raw.node_id, 'Issue.id')
    if (id === '' || [...issues.values()].some(issue => issue.id === id))
      throw new InputError('Admission Issue node identity is empty or duplicated')
    const state = raw.state
    if (state !== 'open' && state !== 'closed')
      throw new InputError('Admission Issue state invalid')
    const expand = includeRelations && !isLeaf(state, url)
    const comments = paged(`issues/${number}/comments`).map(item => {
      const c = record(item, 'Admission comment')
      return {
        url: text(c.html_url, 'comment.url'),
        author: text(record(c.user, 'comment.user').login, 'comment.author'),
        body: text(c.body, 'comment.body'),
        updatedAt: text(c.updated_at, 'comment.updatedAt'),
      }
    })
    const blockedBy = expand
      ? paged(`issues/${number}/dependencies/blocked_by`).map(item =>
          text(record(item, 'dependency').html_url, 'dependency.url'),
        )
      : []
    const parentIssue = expand ? parentOf(number) : null
    const issue: CapturedIssue = {
      number,
      url,
      id,
      state,
      updatedAt: text(raw.updated_at, 'Issue.updatedAt'),
      body: raw.body === null ? '' : text(raw.body, 'Issue.body'),
      labels: array(raw.labels, 'Issue.labels').map(item =>
        text(record(item, 'label').name, 'label.name'),
      ),
      comments,
      commentsComplete: true,
      relationsComplete: expand,
      blockedBy,
      parentIssue,
      stage: null,
      ...milestoneOf(raw),
    }
    issues.set(url, issue)
    return issue
  }
  function snapshot(): AdmissionCapture {
    return {
      schemaVersion: 1,
      kind: 'github-admission-capture',
      protocolVersion: 2,
      repository: config.repository,
      projectId,
      scope,
      closure: [...closure].sort(),
      issues: [...issues.values()].sort((a, b) => a.number - b.number),
      startedAt,
      finishedAt: new Date().toISOString(),
    }
  }
  const queue = [{ url: scope.task, depth: 0 }]
  for (const { url, depth } of queue) {
    const issue = fetchIssue(url)
    if (isLeaf(issue.state, url)) continue
    const observed = observeAdmission(config, snapshot(), url)
    if (
      observed.findings.some(
        finding =>
          finding.category === 'deviation' &&
          ([
            'conditions-missing',
            'conditions-table-invalid',
            'conditions-empty',
            'condition-invalid',
            'condition-duplicate',
            'condition-scope-invalid',
          ].includes(finding.code) ||
            (finding.code === 'section-duplicate' && finding.clause === '交付条件')),
      )
    )
      throw new InputError('Admission condition table cannot establish complete references')
    const parents = declaredIssueParents(issue.body)
    if (parents.length > 1) throw new InputError('Admission declared parent is ambiguous')
    const targets = [
      ...issue.blockedBy,
      ...(issue.parentIssue === null ? [] : [issue.parentIssue]),
      ...parents,
      ...observed.cards
        .flatMap(card => card.conditions.map(condition => condition.target))
        .filter(target => /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9]\d*$/.test(target)),
    ]
    for (const target of targets) {
      issueNumber(config.repository, target)
      if (closure.has(target)) continue
      if (depth >= 8) throw new InputError('Admission exceeds 8 dependency edge levels')
      closure.add(target)
      queue.push({ url: target, depth: depth + 1 })
    }
  }
  fetchIssue(authorityUrl, false)
  /** Confirms the Stage field, the task's unique membership and its Stage value over GraphQL. */
  function readProjectState(task: CapturedIssue): void {
    const fields = connection(FIELDS, projectId, 'fields', () => {})
    const singleSelectFields = fields.flatMap(item => {
      const field = record(item, 'Project field')
      return text(field.__typename, 'Project field type') === 'ProjectV2SingleSelectField'
        ? [text(field.id, 'Project field ID')]
        : []
    })
    if (!singleSelectFields.includes(stageId))
      throw new InputError('Configured Stage field is not confirmed on Project')
    const memberships = connection(MEMBERSHIPS, task.id, 'projectItems', value => {
      if (value.url !== task.url) throw new InputError('Project membership Issue identity mismatch')
    }).map(item => record(item, 'Project membership'))
    const matching = memberships.filter(
      item =>
        text(record(item.project, 'membership.project').id, 'membership.project.id') === projectId,
    )
    const membership = matching[0]
    if (matching.length !== 1 || membership === undefined)
      throw new InputError('Task Project membership is missing or ambiguous')
    const values = connection(
      VALUES,
      text(membership.id, 'membership.id'),
      'fieldValues',
      value => {
        if (record(value.project, 'item.project').id !== projectId)
          throw new InputError('Project item identity mismatch')
      },
    )
    let stageSeen = false
    for (const item of values) {
      const value = record(item, 'Project value')
      if (text(value.__typename, 'Project value type') !== 'ProjectV2ItemFieldSingleSelectValue')
        continue
      if (text(record(value.field, 'value.field').id, 'value.field.id') !== stageId) continue
      if (stageSeen) throw new InputError('Task Stage value is duplicated')
      stageSeen = true
      task.stage = text(value.name, 'Task Stage')
    }
  }
  const task = issues.get(scope.task)
  if (task === undefined || task.number !== taskNumber)
    throw new InputError('Admission task was not read')
  if (project === undefined) readProjectState(task)
  else {
    if (project.id !== projectId) throw new InputError('Project facts belong to another Project')
    if (project.item.trim() === '') throw new InputError('Project facts membership is empty')
    task.stage = project.stage
  }
  const result = snapshot()
  observeAdmission(config, result)
  return result
}
