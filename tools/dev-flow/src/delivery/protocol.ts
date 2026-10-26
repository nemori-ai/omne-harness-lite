import { parseTaskBinding, parseConditionScope, type TaskBinding } from './binding.ts'
export const workKinds = [
  'feature',
  'bug',
  'refactor',
  'performance',
  'maintenance',
  'investigation',
] as const
export const phases = ['start', 'integration', 'acceptance'] as const
export const conditionKinds = ['issue-result', 'adopted-source', 'decision', 'capability'] as const
export type Phase = (typeof phases)[number]
export type Completeness = 'complete' | 'partial' | 'unknown'
export type IssueIdentity = {
  readonly repository: string
  readonly id: string
  readonly url: string
  readonly number: number
}
export type DeliveryConfig = {
  schemaVersion: 2
  kind: 'github-delivery-config'
  protocolVersion: 2
  enabled: boolean
  repository: string
  mode: 'manual-single-dispatcher'
  project: {
    owner: string
    number: number | null
    id: string | null
    url: string | null
    /**
     * Project field IDs. Stage is the built-in Status field and `iteration` is the Wave field.
     * The six board fields are optional in the file and null when absent.
     */
    fields: {
      stage: string | null
      priority: string | null
      iteration: string | null
      line: string | null
      kind: string | null
      dispatchedAt: string | null
      deliveredAt: string | null
      acceptedAt: string | null
      cycleDays: string | null
    }
    /** Single select option IDs by option name; an absent map is empty. */
    options: {
      stage: Record<string, string>
      line: Record<string, string>
      kind: Record<string, string>
    }
  }
  creationHandoffIssue: string | null
  writers: { stage: string | null; body: string | null }
  /**
   * The board writes of dev-flow, or null when the file has no `board` entry. Only the shape is
   * parsed here; delivery/board.ts judges which writes an event may enable.
   */
  board: { timeZone: string; events: Record<string, string[]> } | null
}
export type CapturedIssue = {
  number: number
  url: string
  id: string
  state: 'open' | 'closed'
  updatedAt: string
  body: string
  labels: string[]
  comments: { url: string; author: string; body: string; updatedAt: string }[]
  commentsComplete: boolean
  relationsComplete: boolean
  blockedBy: string[]
  parentIssue: string | null
  stage: string | null
  /** The milestone title, null without one; absent in captures that did not read it. */
  milestone?: string | null
}
export type DeliveryCapture = {
  schemaVersion: 1
  kind: 'github-delivery-capture'
  repository: string
  projectId: string | null
  protocolVersion: 2
  startedAt: string
  finishedAt: string
  collection: { issues: Completeness; project: Completeness; errors: string[] }
  issues: CapturedIssue[]
}
export type Condition = {
  id: string
  kind: (typeof conditionKinds)[number]
  target: string
  phase: Phase
  predicate: string
  evidence: string
  scope?: string
}
export const findingCategories = ['deviation', 'unknown', 'uncovered', 'attribute'] as const
export type Finding = {
  id: string
  /** `attribute` holds report-only card attribute findings; they never block delivery. */
  category: (typeof findingCategories)[number]
  code: string
  object: string
  clause: string
  revision: number | null
  source: string
  message: string
}
export type CardObservation = {
  integrationBinding?: TaskBinding | null
  issue: string
  number: number
  revision: number | null
  level: 'delivery' | 'subtask' | null
  workKind: (typeof workKinds)[number] | null
  state: 'open' | 'closed'
  stage: string | null
  conditions: Condition[]
  declaredDecisions: {
    kind: string
    revision: number | null
    source: string
    decider: string
    scope: string
  }[]
  acceptance: 'unknown'
  dispatchPermission: 'not-provided'
  coverage: 'declared-requires-review'
  execution: 'requires-review'
}
export type DeliveryReport = {
  schemaVersion: 5
  kind: 'github-delivery-report'
  protocolVersion: 2
  repository: string
  projectId: string | null
  enabled: boolean
  startedAt: string
  finishedAt: string
  scope: 'all-repository-issues'
  completeness: DeliveryCapture['collection']
  cards: CardObservation[]
  findings: Finding[]
  graph: {
    completeness: 'known-subgraph-only'
    cycles: { phases: string[]; conditions: string[] }[]
  }
  stock: { deviation: number; unknown: number; uncovered: number; attribute: number }
  delta: { introduced: string[]; resolved: string[]; remaining: string[]; notComparable: string[] }
}
export class InputError extends Error {
  override name = 'DeliveryInputError'
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new InputError(`${path} must be an object`)
  return value
}
/** The value of the card's single label with `prefix`; undefined without exactly one. */
export function singleLabel(labels: readonly string[], prefix: string): string | undefined {
  const values = labels.filter(label => label.startsWith(prefix))
  return values.length === 1 ? values[0]?.slice(prefix.length) : undefined
}
/**
 * The dispatch fields a card must carry before `start` admits it and before a dispatch is
 * posted: exactly one `kind:` label, exactly one `line:` label and a milestone. Returns one
 * entry per gap; an empty list means the card is complete. A milestone the capture did not
 * read (`undefined`) is not judged.
 */
export function dispatchFieldGaps(issue: Pick<CapturedIssue, 'labels' | 'milestone'>): string[] {
  const gaps: string[] = []
  for (const prefix of ['kind:', 'line:']) {
    const count = issue.labels.filter(label => label.startsWith(prefix)).length
    if (count !== 1) gaps.push(`exactly one ${prefix} label (found ${count})`)
  }
  if (issue.milestone === null) gaps.push('a milestone')
  return gaps
}
/**
 * The `milestone` entry of a captured Issue from a raw GitHub Issue: the title, null when the
 * Issue has none, and no entry when the response does not carry the field.
 */
export function milestoneOf(raw: Record<string, unknown>): Pick<CapturedIssue, 'milestone'> {
  if (!('milestone' in raw)) return {}
  return {
    milestone:
      raw.milestone === null
        ? null
        : nullable(record(raw.milestone, 'Issue.milestone').title, 'milestone.title'),
  }
}
export function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new InputError(`${path} must be a string`)
  return value
}
function nonempty(value: unknown, path: string): string {
  const result = text(value, path)
  if (result.trim() === '') throw new InputError(`${path} must not be empty`)
  return result
}
export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new InputError(`${path} must be an array`)
  return value
}
export function nullable(value: unknown, path: string): string | null {
  return value === null ? null : nonempty(value, path)
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new InputError(`${path} must be a boolean`)
  return value
}
function positive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new InputError(`${path} must be a positive integer`)
  return value
}
export function oneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string,
): T[number] {
  const result = values.find(item => item === value)
  if (result === undefined) throw new InputError(`${path} has an unsupported value`)
  return result
}
function literal<const T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new InputError(`${path} must be ${expected}`)
  return expected
}
function date(value: unknown, path: string): string {
  const result = text(value, path)
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      result,
    )
  if (match === null || !Number.isFinite(Date.parse(result)))
    throw new InputError(`${path} must be an ISO timestamp`)
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3])
  const calendar = new Date(0)
  calendar.setUTCFullYear(year, month - 1, day)
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    Number(match[8] ?? 0) > 23 ||
    Number(match[9] ?? 0) > 59
  )
    throw new InputError(`${path} has an invalid calendar date or time`)
  return result
}
function strings(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => text(item, `${path}[${index}]`))
}
/** An optional field ID: absent and null both read as null. */
function optionalField(f: Record<string, unknown>, key: string): string | null {
  return f[key] === undefined ? null : nullable(f[key], `fields.${key}`)
}
/** An optional map from option name to option ID; absent reads as empty. */
function optionMap(value: unknown, path: string): Record<string, string> {
  if (value === undefined) return {}
  return Object.fromEntries(
    Object.entries(record(value, path)).map(([name, id]) => [
      name,
      nonempty(id, `${path}.${name}`),
    ]),
  )
}
function boardEntry(value: unknown): DeliveryConfig['board'] {
  if (value === undefined || value === null) return null
  const b = record(value, 'config.board'),
    events = record(b.events, 'config.board.events')
  return {
    timeZone: nonempty(b.timeZone, 'config.board.timeZone'),
    events: Object.fromEntries(
      Object.entries(events).map(([event, names]) => [
        event,
        strings(names, `config.board.events.${event}`),
      ]),
    ),
  }
}
export function parseConfig(value: unknown): DeliveryConfig {
  const v = record(value, 'config'),
    p = record(v.project, 'config.project'),
    f = record(p.fields, 'config.project.fields'),
    o = p.options === undefined ? undefined : record(p.options, 'config.project.options'),
    w = record(v.writers, 'config.writers')
  const repository = nonempty(v.repository, 'config.repository')
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(repository) ||
    ['.', '..'].includes(repository.split('/')[1] ?? '')
  )
    throw new InputError('config.repository must be a GitHub owner/name without traversal segments')
  const owner = nonempty(p.owner, 'config.project.owner')
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner))
    throw new InputError('config.project.owner is invalid')
  if ('sourceCutovers' in v) throw new InputError('config.sourceCutovers is retired')
  return {
    schemaVersion: literal(v.schemaVersion, 2, 'config.schemaVersion'),
    kind: literal(v.kind, 'github-delivery-config', 'config.kind'),
    protocolVersion: literal(v.protocolVersion, 2, 'config.protocolVersion'),
    repository,
    enabled: boolean(v.enabled, 'config.enabled'),
    mode: literal(v.mode, 'manual-single-dispatcher', 'config.mode'),
    project: {
      owner,
      number: p.number === null ? null : positive(p.number, 'project.number'),
      id: nullable(p.id, 'project.id'),
      url: nullable(p.url, 'project.url'),
      fields: {
        stage: nullable(f.stage, 'fields.stage'),
        priority: nullable(f.priority, 'fields.priority'),
        iteration: nullable(f.iteration, 'fields.iteration'),
        line: optionalField(f, 'line'),
        kind: optionalField(f, 'kind'),
        dispatchedAt: optionalField(f, 'dispatchedAt'),
        deliveredAt: optionalField(f, 'deliveredAt'),
        acceptedAt: optionalField(f, 'acceptedAt'),
        cycleDays: optionalField(f, 'cycleDays'),
      },
      options: {
        stage: optionMap(o?.stage, 'config.project.options.stage'),
        line: optionMap(o?.line, 'config.project.options.line'),
        kind: optionMap(o?.kind, 'config.project.options.kind'),
      },
    },
    creationHandoffIssue: nullable(v.creationHandoffIssue, 'creationHandoffIssue'),
    writers: { stage: nullable(w.stage, 'writers.stage'), body: nullable(w.body, 'writers.body') },
    board: boardEntry(v.board),
  }
}
export function parseCapture(value: unknown): DeliveryCapture {
  const v = record(value, 'capture'),
    c = record(v.collection, 'capture.collection')
  const repository = nonempty(v.repository, 'capture.repository')
  const issues = array(v.issues, 'capture.issues').map((item, index): CapturedIssue => {
    const p = `issues[${index}]`,
      i = record(item, p),
      number = positive(i.number, `${p}.number`),
      url = nonempty(i.url, `${p}.url`)
    if (url !== `https://github.com/${repository}/issues/${number}`)
      throw new InputError(`${p}.url does not match repository and number`)
    return {
      number,
      url,
      id: nonempty(i.id, `${p}.id`),
      state: oneOf(i.state, ['open', 'closed'], `${p}.state`),
      updatedAt: date(i.updatedAt, `${p}.updatedAt`),
      body: text(i.body, `${p}.body`),
      labels: strings(i.labels, `${p}.labels`),
      comments: array(i.comments, `${p}.comments`).map((value, n) => {
        const r = record(value, `${p}.comments[${n}]`)
        return {
          url: nonempty(r.url, 'comment.url'),
          author: nonempty(r.author, 'comment.author'),
          body: text(r.body, 'comment.body'),
          updatedAt: date(r.updatedAt, 'comment.updatedAt'),
        }
      }),
      commentsComplete: boolean(i.commentsComplete, `${p}.commentsComplete`),
      relationsComplete: boolean(i.relationsComplete, `${p}.relationsComplete`),
      blockedBy: strings(i.blockedBy, `${p}.blockedBy`),
      parentIssue: nullable(i.parentIssue, `${p}.parentIssue`),
      stage: nullable(i.stage, `${p}.stage`),
      ...('milestone' in i ? { milestone: nullable(i.milestone, `${p}.milestone`) } : {}),
    }
  })
  if (
    new Set(issues.map(i => i.url)).size !== issues.length ||
    new Set(issues.map(i => i.id)).size !== issues.length
  )
    throw new InputError('capture contains duplicate issue identities')
  const startedAt = date(v.startedAt, 'capture.startedAt'),
    finishedAt = date(v.finishedAt, 'capture.finishedAt')
  if (Date.parse(finishedAt) < Date.parse(startedAt))
    throw new InputError('capture.finishedAt precedes startedAt')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'capture.schemaVersion'),
    kind: literal(v.kind, 'github-delivery-capture', 'capture.kind'),
    protocolVersion: literal(v.protocolVersion, 2, 'capture.protocolVersion'),
    repository,
    projectId: nullable(v.projectId, 'capture.projectId'),
    startedAt,
    finishedAt,
    collection: {
      issues: oneOf(c.issues, ['complete', 'partial', 'unknown'], 'collection.issues'),
      project: oneOf(c.project, ['complete', 'partial', 'unknown'], 'collection.project'),
      errors: strings(c.errors, 'collection.errors'),
    },
    issues,
  }
}
export function bindCapture(config: DeliveryConfig, capture: DeliveryCapture): void {
  if (
    config.repository !== capture.repository ||
    config.protocolVersion !== capture.protocolVersion ||
    config.project.id !== capture.projectId
  )
    throw new InputError(
      'config and capture repository, protocolVersion and projectId must match exactly',
    )
}
export function parseBaseline(value: unknown): DeliveryReport {
  const v = record(value, 'baseline'),
    s = record(v.stock, 'baseline.stock'),
    d = record(v.delta, 'baseline.delta'),
    g = record(v.graph, 'baseline.graph')
  if (v.schemaVersion !== 5) throw new InputError('unsupported baseline schemaVersion')
  const version = v.schemaVersion
  const capture = parseCapture({
    ...v,
    schemaVersion: 1,
    kind: 'github-delivery-capture',
    collection: v.completeness,
    issues: [],
  })
  literal(v.scope, 'all-repository-issues', 'baseline.scope')
  boolean(v.enabled, 'baseline.enabled')
  const cards = array(v.cards, 'baseline.cards').map((item, index): CardObservation => {
    const card = record(item, `baseline.cards[${index}]`)
    if ('aliases' in card || 'scenarios' in card)
      throw new InputError(`baseline.cards[${index}] contains retired aliases or scenarios`)
    const conditions = array(card.conditions, 'card.conditions').map((item): Condition => {
      const c = record(item, 'condition')
      return {
        id: nonempty(c.id, 'condition.id'),
        kind: oneOf(c.kind, conditionKinds, 'condition.kind'),
        target: text(c.target, 'condition.target'),
        phase: oneOf(c.phase, phases, 'condition.phase'),
        predicate: text(c.predicate, 'condition.predicate'),
        evidence: text(c.evidence, 'condition.evidence'),
        scope: parseConditionScope(c.scope, text(c.phase, 'condition.phase')),
      }
    })
    const declaredDecisions = array(card.declaredDecisions, 'card.declaredDecisions').map(item => {
      const d = record(item, 'decision')
      return {
        kind: text(d.kind, 'decision.kind'),
        revision: d.revision === null ? null : positive(d.revision, 'decision.revision'),
        source: nonempty(d.source, 'decision.source'),
        decider: text(d.decider, 'decision.decider'),
        scope: text(d.scope, 'decision.scope'),
      }
    })
    return {
      integrationBinding:
        card.integrationBinding === null ? null : parseTaskBinding(card.integrationBinding),
      issue: nonempty(card.issue, 'card.issue'),
      number: positive(card.number, 'card.number'),
      revision: card.revision === null ? null : positive(card.revision, 'card.revision'),
      level: card.level === null ? null : oneOf(card.level, ['delivery', 'subtask'], 'card.level'),
      workKind: card.workKind === null ? null : oneOf(card.workKind, workKinds, 'card.workKind'),
      state: oneOf(card.state, ['open', 'closed'], 'card.state'),
      stage: nullable(card.stage, 'card.stage'),
      conditions,
      declaredDecisions,
      acceptance: literal(card.acceptance, 'unknown', 'card.acceptance'),
      dispatchPermission: literal(
        card.dispatchPermission,
        'not-provided',
        'card.dispatchPermission',
      ),
      coverage: literal(card.coverage, 'declared-requires-review', 'card.coverage'),
      execution: literal(card.execution, 'requires-review', 'card.execution'),
    }
  })
  if (
    new Set(cards.map(c => c.issue)).size !== cards.length ||
    cards.some(c => c.issue !== `https://github.com/${capture.repository}/issues/${c.number}`)
  )
    throw new InputError('baseline card identities are invalid or duplicate')
  const findings = array(v.findings, 'baseline.findings').map((item, index): Finding => {
    const f = record(item, `baseline.findings[${index}]`)
    return {
      id: nonempty(f.id, 'finding.id'),
      category: oneOf(f.category, findingCategories, 'finding.category'),
      code: nonempty(f.code, 'finding.code'),
      object: text(f.object, 'finding.object'),
      clause: text(f.clause, 'finding.clause'),
      revision: f.revision === null ? null : positive(f.revision, 'finding.revision'),
      source: text(f.source, 'finding.source'),
      message: text(f.message, 'finding.message'),
    }
  })
  if (findings.some(f => f.id !== JSON.stringify([f.category, f.code, f.object, f.clause])))
    throw new InputError('baseline finding identity is invalid')
  if (new Set(findings.map(f => f.id)).size !== findings.length)
    throw new InputError('baseline has duplicate finding ids')
  for (const category of findingCategories)
    if (s[category] !== findings.filter(f => f.category === category).length)
      throw new InputError('baseline stock does not match findings')
  for (const key of ['introduced', 'resolved', 'remaining', 'notComparable'])
    strings(d[key], `baseline.delta.${key}`)
  literal(g.completeness, 'known-subgraph-only', 'baseline.graph.completeness')
  const cycles = array(g.cycles, 'baseline.graph.cycles').map(item => {
    const c = record(item, 'cycle')
    return {
      phases: strings(c.phases, 'cycle.phases'),
      conditions: strings(c.conditions, 'cycle.conditions'),
    }
  })
  return {
    schemaVersion: version,
    protocolVersion: capture.protocolVersion,
    repository: capture.repository,
    projectId: capture.projectId,
    startedAt: capture.startedAt,
    finishedAt: capture.finishedAt,
    kind: literal(v.kind, 'github-delivery-report', 'baseline.kind'),
    enabled: boolean(v.enabled, 'baseline.enabled'),
    scope: 'all-repository-issues',
    completeness: capture.collection,
    cards,
    findings,
    graph: { completeness: 'known-subgraph-only', cycles },
    stock: {
      deviation: findings.filter(f => f.category === 'deviation').length,
      unknown: findings.filter(f => f.category === 'unknown').length,
      uncovered: findings.filter(f => f.category === 'uncovered').length,
      attribute: findings.filter(f => f.category === 'attribute').length,
    },
    delta: {
      introduced: strings(d.introduced, 'delta.introduced'),
      resolved: strings(d.resolved, 'delta.resolved'),
      remaining: strings(d.remaining, 'delta.remaining'),
      notComparable: strings(d.notComparable, 'delta.notComparable'),
    },
  }
}

/** A calendar date `YYYY-MM-DD` that exists. */
export function calendarDate(value: string, path: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = match === null ? null : new Date(`${value}T00:00:00Z`)
  if (date === null || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new InputError(`${path} must be a calendar date YYYY-MM-DD`)
  return value
}
/** The calendar date of `now` in the IANA time zone `zone`, as `YYYY-MM-DD`. */
export function calendarDay(zone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: 'year' | 'month' | 'day') => {
    const found = parts.find(item => item.type === type)
    if (found === undefined) throw new InputError(`Cannot format the ${type} in ${zone}`)
    return found.value
  }
  return calendarDate(`${part('year')}-${part('month')}-${part('day')}`, 'calendar day')
}
/** Whole days from `from` to `to`, both calendar dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}
/** An Issue number argument, `N` or `#N`; undefined when it is not a safe positive integer. */
export function issueNumberArgument(value: string): number | undefined {
  if (!/^#?[1-9]\d*$/.test(value)) return undefined
  const number = Number(value.replace('#', ''))
  return Number.isSafeInteger(number) ? number : undefined
}
