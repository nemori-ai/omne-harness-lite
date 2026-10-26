import { writeFileSync } from 'node:fs'
import { conditionDigest, type Confirmation, type Decision } from '../integration/authority.ts'
import { blob, maybeBlob } from '../integration/git.ts'
import {
  array,
  branch,
  canonical,
  choice,
  fields,
  integer,
  IntegrationError,
  json,
  safePath,
  section,
  sha,
  string,
  strings,
} from '../integration/parse.ts'
import { parsePolicy, type Policy } from '../integration/policy.ts'
import { collectAdmission, observeAdmission, type AdmissionCapture } from './admission.ts'
import { attributeFindings, judgeAttributes, readCardAttributes } from './attributes.ts'
import {
  BINDING_MARKERS,
  deliveryRevision,
  parseRoute,
  parseTaskBinding,
  readTaskBinding,
  type TaskBindingV2,
} from './binding.ts'
import { fetchIssueCard, REST_HEADERS, type GhCommand } from './github-read.ts'
import { LINES_PATH, parseDeliveryLines, type DeliveryLines } from './lines.ts'
import { conditionCardsOf } from './observe.ts'
import {
  dispatchFieldGaps,
  parseConfig,
  record,
  text,
  type CapturedIssue,
  type DeliveryConfig,
} from './protocol.ts'

const TIMEOUT_MS = 15_000
const AUTHORITY_MARKER = 'omne-integration-authority:v1'

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
/** The comments of the card that already dispatch `attempt` at `revision`. */
function earlierDispatches(issue: CapturedIssue, revision: number, attempt: string): string[] {
  return issue.comments.flatMap(comment => {
    let raw: unknown
    try {
      raw = section(comment.body, AUTHORITY_MARKER)
    } catch {
      return []
    }
    if (typeof raw !== 'object' || raw === null || !('task' in raw)) return []
    const task: unknown = raw.task
    if (typeof task !== 'object' || task === null) return []
    return 'attempt' in task &&
      task.attempt === attempt &&
      'revision' in task &&
      task.revision === revision
      ? [comment.url]
      : []
  })
}
/**
 * Checks one dispatch against the live card and builds its version 2 binding with
 * `DISPATCH_PLACEHOLDER` as the dispatch URL. `capture` is an admission capture of the card;
 * `lines` and `policy` come from the task base, where `start` will read them; `actor` is the
 * login that will post the comment. Refuses, before any write, when the card is closed, when
 * the actor is not the responsible human, when the card lacks its dispatch fields or has
 * protocol deviations, when its attributes or revision are not valid, when a comment already
 * dispatches the same revision and attempt (unless `force`), when a start condition has no
 * evidence or evidence names an unknown condition, or when the binding would carry attribute
 * findings.
 */
export function planDispatch({
  spec,
  config,
  capture,
  lines,
  policy,
  actor,
  force = false,
}: {
  spec: DispatchSpec
  config: DeliveryConfig
  capture: AdmissionCapture
  lines: DeliveryLines
  policy: Pick<Policy, 'tracks'>
  actor: string
  force?: boolean
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
  if (line === undefined || nature === undefined || contractChange === undefined)
    refuse(
      judged.findings.length > 0
        ? judged.findings.map(finding => finding.message)
        : ['「身份与责任」lacks a valid 交付线, 性质 or 契约变更'],
    )
  const revision = deliveryRevision(issue.body)
  if (revision === undefined) refuse(['the card needs exactly one 交付修订 line'])
  const earlier = earlierDispatches(issue, revision, spec.attempt)
  if (earlier.length > 0 && !force)
    refuse([
      `revision ${revision} attempt ${spec.attempt} is already dispatched by ${earlier.join(', ')}; pass --force to dispatch it again`,
    ])
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
  if (binding.schemaVersion !== 2)
    throw new IntegrationError('invariant', 'A dispatch builds a version 2 binding')
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
  return `${prose.trimEnd()}\n\n\`\`\`json ${AUTHORITY_MARKER}\n${JSON.stringify(decision, null, 2)}\n\`\`\`\n`
}

/** The formal dispatch once its comment holds the authority block. */
export type PostedDispatch = { dispatch: string; binding: TaskBindingV2 }
/**
 * Reports a posted dispatch: first one `dispatch-posted` line to `report`, then the binding
 * into `out` when given. The URL is reported before the file write, so a failed write still
 * leaves it with the caller, and the error names it.
 */
export function recordPosted(
  posted: PostedDispatch,
  out: string | undefined,
  report: (line: string) => void,
): void {
  report(`${JSON.stringify({ kind: 'dispatch-posted', dispatch: posted.dispatch })}\n`)
  if (out === undefined) return
  try {
    writeFileSync(out, `${JSON.stringify(posted.binding, null, 2)}\n`)
  } catch {
    throw new IntegrationError(
      'unknown',
      `The dispatch ${posted.dispatch} was posted, but writing the binding to ${out} failed. Do not dispatch again; write the binding from the comment.`,
    )
  }
}
/**
 * Posts the dispatch comment for a checked plan: a placeholder comment first, then one edit
 * that makes it the formal dispatch whose binding names the comment's own URL. `onPosted`
 * receives the formal dispatch right after the edit, before the readback, so the caller keeps
 * the URL and binding even when the readback fails. A failure after the placeholder exists
 * names its URL; the tool does not retry or delete.
 */
export function postDispatch({
  repository,
  plan,
  basis,
  prose,
  call,
  onPosted = () => {},
}: {
  repository: string
  plan: DispatchPlan
  basis: readonly string[]
  prose: string
  call: GhCommand
  onPosted?: (posted: PostedDispatch) => void
}): PostedDispatch & { verified: boolean } {
  const number = plan.binding.issue.number
  let placeholder: Record<string, unknown>
  try {
    placeholder = record(
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
      'placeholder comment',
    )
  } catch {
    throw new IntegrationError(
      'unknown',
      'Posting the placeholder comment failed. Read the card before retrying. API output omitted.',
    )
  }
  const dispatch = text(placeholder.html_url, 'comment.html_url'),
    id = integer(placeholder.id, 'comment.id')
  const { binding, decision } = dispatchDecision(plan, dispatch, basis)
  const body = dispatchComment(prose, decision)
  const path = `repos/${repository}/issues/comments/${id}`
  try {
    call(['api', '--method', 'PATCH', ...REST_HEADERS, path, '-f', `body=${body}`], TIMEOUT_MS)
  } catch {
    throw new IntegrationError(
      'unknown',
      `Editing the placeholder ${dispatch} into the dispatch failed. Edit or delete it before dispatching again. API output omitted.`,
    )
  }
  onPosted({ dispatch, binding })
  let readback: Record<string, unknown>
  try {
    readback = record(
      call(['api', '--method', 'GET', ...REST_HEADERS, path], TIMEOUT_MS),
      'dispatch comment',
    )
  } catch {
    throw new IntegrationError(
      'unknown',
      `The dispatch ${dispatch} was posted, but reading it back failed. Check the comment; do not dispatch again. API output omitted.`,
    )
  }
  return { dispatch, binding, verified: readback.body === body }
}

const EXECUTION_HEADING = '### 分支、基线与task context'
const CLAIM_HEADING = '### 认领与派发'
/** The `[start, end)` line range of the unique subsection with `heading`, or undefined. */
function subsection(lines: readonly string[], heading: string): [number, number] | undefined {
  const starts = lines.flatMap((line, index) => (line.trim() === heading ? [index] : []))
  const start = starts[0]
  if (starts.length !== 1 || start === undefined) return undefined
  const after = lines.slice(start + 1).findIndex(line => /^#{2,3} /.test(line))
  return [start, after === -1 ? lines.length : start + 1 + after]
}
/**
 * The card body with the binding written into「分支、基线与task context」: one dispatch line
 * derived from the binding and the binding block replace the whole subsection. Inside
 *「认领与派发」the「派发情况」line, and with `worktree` the「工作树」line, are rewritten when
 * present; lines elsewhere are kept. Refuses a placeholder dispatch URL, a body without exactly
 * one such subsection, and a result whose unique binding does not read back equal to `binding`.
 */
export function bindBody(body: string, binding: TaskBindingV2, worktree?: string): string {
  if (binding.dispatch === DISPATCH_PLACEHOLDER)
    throw new IntegrationError(
      'input-error',
      'The binding still carries the placeholder dispatch URL; bind the binding that post wrote',
    )
  const lines = body.split('\n')
  const execution = subsection(lines, EXECUTION_HEADING)
  if (execution === undefined)
    throw new IntegrationError('input-error', `The body needs exactly one ${EXECUTION_HEADING}`)
  const [start, end] = execution
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
  const written = [...lines.slice(0, start), ...block, ...lines.slice(end)]
  const claim = subsection(written, CLAIM_HEADING)
  const rewritten = written.map((line, index) => {
    if (claim === undefined || index <= claim[0] || index >= claim[1]) return line
    if (/^- 派发情况[：:]/.test(line)) return `- 派发情况：已派发，见 ${binding.dispatch}。`
    if (worktree !== undefined && /^- 工作树[：:]/.test(line)) return `- 工作树：\`${worktree}\`。`
    return line
  })
  const result = rewritten.join('\n')
  const read = readTaskBinding(result, binding.issue)
  if (read === undefined || canonical(read) !== canonical(binding))
    throw new IntegrationError('input-error', 'The written binding does not read back unchanged')
  return result
}
/** A dry run returns the new body only; an applied run says whether the binding read back. */
export type BindResult = { body: string } & (
  | { applied: false }
  | { applied: true; verified: boolean }
)
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
}): BindResult {
  const number = binding.issue.number
  if (binding.issue.repository !== repository)
    throw new IntegrationError('input-error', 'The binding names another repository')
  const card = fetchIssueCard(repository, number, call)
  if (card.identity.id !== binding.issue.id)
    throw new IntegrationError('input-error', 'The binding names another Issue node')
  const body = bindBody(card.body, binding, worktree)
  if (dryRun) return { body, applied: false }
  try {
    call(
      [
        'api',
        '--method',
        'PATCH',
        ...REST_HEADERS,
        `repos/${repository}/issues/${number}`,
        '-f',
        `body=${body}`,
      ],
      TIMEOUT_MS,
    )
  } catch {
    throw new IntegrationError('unknown', 'Writing the card body failed. API output omitted.')
  }
  const after = fetchIssueCard(repository, number, call)
  const read = readTaskBinding(after.body, after.identity)
  return {
    body,
    applied: true,
    verified: read !== undefined && canonical(read) === canonical(binding),
  }
}
