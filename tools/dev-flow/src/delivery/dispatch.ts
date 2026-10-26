import { conditionDigest, type Confirmation, type Decision } from '../integration/authority.ts'
import {
  array,
  branch,
  choice,
  fields,
  integer,
  IntegrationError,
  safePath,
  sha,
  string,
  strings,
  canonical,
  json,
} from '../integration/parse.ts'
import { blob, maybeBlob } from '../integration/git.ts'
import { parsePolicy, type Policy } from '../integration/policy.ts'
import { collectAdmission, observeAdmission, type AdmissionCapture } from './admission.ts'
import { attributeFindings, judgeAttributes, readCardAttributes } from './attributes.ts'
import {
  BINDING_MARKERS,
  parseRoute,
  parseTaskBinding,
  readTaskBinding,
  type TaskBindingV2,
} from './binding.ts'
import { readIssueCard, REST_HEADERS, type GhCommand } from './github-read.ts'
import { LINES_PATH, parseDeliveryLines, type DeliveryLines } from './lines.ts'
import { conditionCardsOf } from './observe.ts'
import { parseConfig, text, type CapturedIssue, type DeliveryConfig } from './protocol.ts'

const TIMEOUT_MS = 15_000

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
 * What the dispatcher decides for one attempt. Card facts (revision, attributes, milestone,
 * condition IDs and digests) are read from the live card, never taken from this input.
 */
export type DispatchSpec = {
  issue: number
  attempt: string
  responsible: string
  branch: string
  taskBase: string
  writeScope: string[]
  route: TaskBindingV2['route']
  completionTarget: TaskBindingV2['completionTarget']
  basis: string[]
  /** Evidence for each start condition; the digest is computed from the card's current row. */
  confirmations: { condition: string; evidence: string }[]
}
const SPEC_FIELDS = [
  'issue',
  'attempt',
  'responsible',
  'branch',
  'taskBase',
  'writeScope',
  'route',
  'completionTarget',
  'basis',
  'confirmations',
] as const
export function parseDispatchSpec(value: unknown): DispatchSpec {
  const v = fields(value, SPEC_FIELDS, 'dispatch spec')
  for (const key of SPEC_FIELDS)
    if (!(key in v)) throw new IntegrationError('input-error', `dispatch spec.${key} is required`)
  const writeScope = array(v.writeScope, 'writeScope').map(item => safePath(item, 'writeScope'))
  if (writeScope.length === 0) throw new IntegrationError('input-error', 'writeScope is empty')
  const basis = strings(v.basis, 'basis')
  if (basis.length === 0) throw new IntegrationError('input-error', 'basis is empty')
  return {
    issue: integer(v.issue, 'issue'),
    attempt: string(v.attempt, 'attempt'),
    responsible: string(v.responsible, 'responsible'),
    branch: branch(v.branch),
    taskBase: sha(v.taskBase, 'taskBase'),
    writeScope,
    route: parseRoute(v.route),
    completionTarget: choice(v.completionTarget, ['track', 'main', 'stable'], 'completionTarget'),
    basis,
    confirmations: array(v.confirmations, 'confirmations').map(item => {
      const c = fields(item, ['condition', 'evidence'], 'confirmation')
      return {
        condition: string(c.condition, 'confirmation.condition'),
        evidence: string(c.evidence, 'confirmation.evidence'),
      }
    }),
  }
}

/**
 * The admission capture of a card before its dispatch comment exists. Admission reads the
 * authority's Issue only, not the comment, so the card itself stands in as the authority Issue.
 * The capture also confirms the card's single membership in the configured Project.
 */
export function cardAdmission(
  config: DeliveryConfig,
  number: number,
  read: GhCommand,
): AdmissionCapture {
  const task = `https://github.com/${config.repository}/issues/${number}`
  try {
    return collectAdmission(config, { task, authority: `${task}#issuecomment-1` }, read)
  } catch (error) {
    throw new IntegrationError(
      'unknown',
      error instanceof Error ? error.message : 'Card admission read failed',
    )
  }
}

const POLICY_PATH = 'docs/engineering/integration-policy.json'
const BINDING_SOURCE = 'tools/dev-flow/src/delivery/binding.ts'
/**
 * The policy, delivery config and line table committed at the task base, where `start` will
 * read them. Refuses a task base whose dev-flow cannot read a version 2 binding. The task base
 * must be a local commit of `root`; fetch it first.
 */
export function taskBaseInputs(
  root: string,
  taskBase: string,
): { policy: Policy; config: DeliveryConfig; lines: DeliveryLines } {
  const policy = parsePolicy(json(blob(root, taskBase, POLICY_PATH).text, POLICY_PATH))
  const config = parseConfig(
    json(blob(root, taskBase, policy.deliveryConfig).text, policy.deliveryConfig),
  )
  if (config.repository !== policy.repository)
    throw new IntegrationError('input-error', 'Policy and delivery repository differ')
  const source = maybeBlob(root, taskBase, BINDING_SOURCE)
  if (source === null || !source.text.includes(BINDING_MARKERS[2]))
    refuse([`dev-flow at ${taskBase} cannot read a version 2 binding`])
  return {
    policy,
    config,
    lines: parseDeliveryLines(json(blob(root, taskBase, LINES_PATH).text, LINES_PATH)),
  }
}

/** Stands in for the dispatch comment URL until the comment exists. */
export const DISPATCH_PLACEHOLDER = 'https://github.com/dispatch-comment-not-yet-posted'

/** The checks and the binding of one dispatch, before any platform write. */
export type DispatchPlan = { binding: TaskBindingV2; confirmations: Confirmation[] }
function refuse(problems: readonly string[]): never {
  throw new IntegrationError('refused', `Dispatch refused: ${problems.join('; ')}`)
}
/**
 * Checks one dispatch against the live card and builds its version 2 binding with
 * `DISPATCH_PLACEHOLDER` as the dispatch URL. `capture` is an admission capture of the card;
 * `lines` and `policy` come from the task base, where `start` will read them; `actor` is the
 * login that will post the comment. Refuses, before any write, when the card lacks its
 * dispatch fields or has protocol deviations, when its attributes are not valid, when a start
 * condition has no evidence or evidence names an unknown condition, when the binding would
 * carry attribute findings, or when the actor is not the responsible human.
 */
export function planDispatch({
  spec,
  config,
  capture,
  lines,
  policy,
  actor,
}: {
  spec: DispatchSpec
  config: DeliveryConfig
  capture: AdmissionCapture
  lines: DeliveryLines
  policy: Pick<Policy, 'tracks'>
  actor: string
}): DispatchPlan {
  const url = `https://github.com/${config.repository}/issues/${spec.issue}`
  const issue = capture.issues.find(item => item.url === url)
  if (issue === undefined) throw new IntegrationError('unknown', 'The card was not read')
  if (issue.state !== 'open') refuse(['the card is closed'])
  if (actor !== spec.responsible)
    refuse([`the comment would be posted by ${actor}, but responsible is ${spec.responsible}`])
  const gaps = dispatchFieldGaps(issue)
  if (gaps.length > 0) refuse(gaps.map(gap => `the card lacks ${gap}`))
  const observed = observeAdmission(config, capture, url)
  const deviations = observed.findings.filter(finding => finding.category === 'deviation')
  if (deviations.length > 0)
    refuse(deviations.map(finding => `deviation ${finding.code} at ${finding.clause}`))
  const card = readCardAttributes(issue.body, issue)
  const judged = judgeAttributes(card, lines)
  const { line, nature, contractChange } = judged.attributes
  if (judged.findings.length > 0 || line === undefined || nature === undefined)
    refuse(judged.findings.map(finding => finding.message))
  if (contractChange === undefined) refuse(['契约变更 is missing'])
  const conditions = observed.cards[0]?.conditions ?? []
  const known = new Set(conditions.map(condition => condition.id))
  const unknown = spec.confirmations.filter(item => !known.has(item.condition))
  if (unknown.length > 0)
    refuse(unknown.map(item => `confirmation names unknown condition ${item.condition}`))
  const confirmations: Confirmation[] = []
  const missing: string[] = []
  for (const condition of conditions) {
    if (condition.phase !== 'start') continue
    const evidence = spec.confirmations.find(item => item.condition === condition.id)
    if (evidence === undefined) missing.push(`start condition ${condition.id} has no evidence`)
    else
      confirmations.push({
        issue: url,
        condition: condition.id,
        digest: conditionDigest(condition),
        evidence: evidence.evidence,
      })
  }
  if (missing.length > 0) refuse(missing)
  const revision = revisionOf(issue.body)
  const binding = parseTaskBinding({
    schemaVersion: 2,
    issue: { repository: config.repository, id: issue.id, number: spec.issue, url },
    revision,
    attempt: spec.attempt,
    responsible: spec.responsible,
    branch: spec.branch,
    route: spec.route,
    completionTarget: spec.completionTarget,
    taskBase: spec.taskBase,
    writeScope: spec.writeScope,
    dispatch: DISPATCH_PLACEHOLDER,
    conditions: conditions.map(condition => condition.id),
    authorization: spec.basis,
    line,
    nature,
    contractChange,
    milestone: issue.milestone ?? null,
  })
  if (binding.schemaVersion !== 2) throw new IntegrationError('invariant', 'binding version')
  const findings = attributeFindings({
    binding,
    card,
    conditionCards: conditionCardsOf(
      conditions,
      new Map(capture.issues.map(item => [item.url, item])),
    ),
    lines,
    registry: policy,
  })
  if (findings.length > 0) refuse(findings.map(finding => `${finding.code}: ${finding.message}`))
  return { binding, confirmations }
}
function revisionOf(body: string): number {
  const revisions = [...body.matchAll(/^\s*-\s+交付修订[：:]\s*([1-9]\d*)\s*$/gm)]
  const revision = Number(revisions[0]?.[1])
  if (revisions.length !== 1 || !Number.isSafeInteger(revision))
    refuse(['the card needs exactly one 交付修订 line'])
  return revision
}

/** The binding with the real dispatch comment URL, and the decision that comment carries. */
export function dispatchDecision(
  plan: DispatchPlan,
  dispatch: string,
  basis: readonly string[],
): { binding: TaskBindingV2; decision: Decision } {
  const binding: TaskBindingV2 = { ...plan.binding, dispatch }
  return {
    binding,
    decision: {
      schemaVersion: 1,
      responsible: binding.responsible,
      basis: [...basis],
      action: 'dispatch',
      task: binding,
      confirmations: plan.confirmations,
    },
  }
}
/** The dispatch comment: the dispatcher's text, then the authority block that `start` reads. */
export function dispatchComment(prose: string, decision: Decision): string {
  return `${prose.trimEnd()}\n\n\`\`\`json omne-integration-authority:v1\n${JSON.stringify(decision, null, 2)}\n\`\`\`\n`
}

/**
 * Posts the dispatch comment for a checked plan: a placeholder comment first, then one edit
 * that makes it the formal dispatch whose binding names the comment's own URL. Reads the
 * comment back and compares the decision. A failure after the placeholder exists names the
 * placeholder URL so the dispatcher can edit or delete it; the tool does not retry.
 */
export function postDispatch({
  repository,
  plan,
  basis,
  prose,
  call,
}: {
  repository: string
  plan: DispatchPlan
  basis: readonly string[]
  prose: string
  call: GhCommand
}): { dispatch: string; binding: TaskBindingV2; verified: boolean } {
  const number = plan.binding.issue.number
  let posted: Record<string, unknown>
  try {
    posted = record(
      call(
        [
          'api',
          '--method',
          'POST',
          ...REST_HEADERS,
          `repos/${repository}/issues/${number}/comments`,
          '-f',
          'body=dispatch placeholder (edited once into the formal dispatch)',
        ],
        TIMEOUT_MS,
      ),
    )
  } catch {
    throw new IntegrationError(
      'unknown',
      'Posting the placeholder comment failed. API output omitted.',
    )
  }
  const dispatch = text(posted.html_url, 'comment.html_url'),
    id = integer(posted.id, 'comment.id')
  const { binding, decision } = dispatchDecision(plan, dispatch, basis)
  const body = dispatchComment(prose, decision)
  try {
    call(
      [
        'api',
        '--method',
        'PATCH',
        ...REST_HEADERS,
        `repos/${repository}/issues/comments/${id}`,
        '-f',
        `body=${body}`,
      ],
      TIMEOUT_MS,
    )
  } catch {
    throw new IntegrationError(
      'unknown',
      `Editing the placeholder ${dispatch} into the dispatch failed. Edit or delete it before dispatching again. API output omitted.`,
    )
  }
  const readback = record(
    call(
      ['api', '--method', 'GET', ...REST_HEADERS, `repos/${repository}/issues/comments/${id}`],
      TIMEOUT_MS,
    ),
  )
  return { dispatch, binding, verified: readback.body === body }
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new IntegrationError('unknown', 'GitHub returned no object')
  return value as Record<string, unknown>
}

const EXECUTION_HEADING = '### 分支、基线与task context'
/**
 * The card body with the binding written into「分支、基线与task context」: one dispatch line
 * derived from the binding and the binding block replace the whole subsection. In「认领与派发」
 * the「派发情况」line, and with `worktree` the「工作树」line, are rewritten when present.
 * Refuses a body without exactly one such subsection, and a result whose unique binding does
 * not read back equal to `binding`.
 */
export function bindBody(body: string, binding: TaskBindingV2, worktree?: string): string {
  const lines = body.split('\n')
  const starts = lines.flatMap((line, index) => (line.trim() === EXECUTION_HEADING ? [index] : []))
  const start = starts[0]
  if (starts.length !== 1 || start === undefined)
    throw new IntegrationError('input-error', `The body needs exactly one ${EXECUTION_HEADING}`)
  const after = lines.slice(start + 1).findIndex(line => /^#{2,3} /.test(line))
  const end = after === -1 ? lines.length : start + 1 + after
  const block = [
    EXECUTION_HEADING,
    '',
    `正式派发：${binding.dispatch}（revision ${binding.revision} / attempt \`${binding.attempt}\`，taskBase \`${binding.taskBase}\`）。`,
    '',
    `\`\`\`json ${BINDING_MARKERS[2]}`,
    JSON.stringify(binding, null, 2),
    '```',
    '',
  ]
  const rewritten = [...lines.slice(0, start), ...block, ...lines.slice(end)].map(line =>
    /^- 派发情况[：:]/.test(line)
      ? `- 派发情况：已派发，见 ${binding.dispatch}。`
      : worktree !== undefined && /^- 工作树[：:]/.test(line)
        ? `- 工作树：\`${worktree}\`。`
        : line,
  )
  const result = rewritten.join('\n')
  const read = readTaskBinding(result, binding.issue)
  if (read === undefined || canonical(read) !== canonical(binding))
    throw new IntegrationError('input-error', 'The written binding does not read back unchanged')
  return result
}
/**
 * Writes the binding into the card body and reads it back. `dryRun` returns the new body
 * without writing.
 */
export function bindCard({
  repository,
  binding,
  worktree,
  dryRun,
  call,
}: {
  repository: string
  binding: TaskBindingV2
  worktree?: string | undefined
  dryRun: boolean
  call: GhCommand
}): { body: string; applied: boolean; verified?: boolean } {
  const number = binding.issue.number,
    path = `repos/${repository}/issues/${number}`
  if (binding.issue.repository !== repository)
    throw new IntegrationError('input-error', 'The binding names another repository')
  const read = () =>
    readIssueCard(
      call(['api', '--method', 'GET', ...REST_HEADERS, path], TIMEOUT_MS),
      repository,
      number,
    )
  const card = read()
  if (text(card.issue.node_id, 'Issue.node_id') !== binding.issue.id)
    throw new IntegrationError('input-error', 'The binding names another Issue node')
  const body = bindBody(card.body, binding, worktree)
  if (dryRun) return { body, applied: false }
  try {
    call(['api', '--method', 'PATCH', ...REST_HEADERS, path, '-f', `body=${body}`], TIMEOUT_MS)
  } catch {
    throw new IntegrationError('unknown', 'Writing the card body failed. API output omitted.')
  }
  const after = readTaskBinding(read().body, binding.issue)
  return {
    body,
    applied: true,
    verified: after !== undefined && canonical(after) === canonical(binding),
  }
}
