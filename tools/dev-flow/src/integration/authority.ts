import {
  collectAdmission,
  observeAdmission,
  type AdmissionCapture,
  type AdmissionScope,
} from '../delivery/admission.ts'
import { runGhRead, type GhRead } from '../delivery/github-read.ts'
import {
  InputError,
  parseConfig,
  record,
  text,
  type DeliveryCapture,
  type DeliveryConfig,
  type CapturedIssue,
  type Condition,
} from '../delivery/protocol.ts'
import { parseTaskBinding, readTaskBinding, type TaskBinding } from '../delivery/binding.ts'
import { blob } from './git.ts'
import type { Policy } from './policy.ts'
import type { PolicySource } from './context.ts'
import {
  array,
  fields,
  json,
  literal,
  section,
  string,
  strings,
  canonical,
  digest,
  same,
  IntegrationError,
} from './parse.ts'

/** The only authority this tool reads: a dispatch decision for one task. */
export type Decision = {
  schemaVersion: 1
  responsible: string
  basis: string[]
  action: 'dispatch'
  task: TaskBinding
  confirmations: Confirmation[]
}
export type Confirmation = { issue: string; condition: string; digest: string; evidence: string }
function confirmations(value: unknown): Confirmation[] {
  return array(value, 'confirmations').map(item => {
    const v = fields(item, ['issue', 'condition', 'digest', 'evidence'], 'confirmation')
    return {
      issue: string(v.issue, 'issue'),
      condition: string(v.condition, 'condition'),
      digest: string(v.digest, 'digest'),
      evidence: string(v.evidence, 'evidence'),
    }
  })
}
function parseDecision(value: unknown): Decision {
  const v = record(value, 'decision')
  const schemaVersion = literal(v.schemaVersion, 1, 'schemaVersion')
  const responsible = string(v.responsible, 'responsible')
  const basis = strings(v.basis, 'basis')
  if (basis.length === 0) throw new IntegrationError('unknown', 'Authority basis is missing')
  if (v.action !== 'dispatch') throw new IntegrationError('unknown', 'Unsupported authority action')
  fields(
    v,
    ['schemaVersion', 'responsible', 'basis', 'action', 'task', 'confirmations'],
    'dispatch',
  )
  return {
    schemaVersion,
    responsible,
    basis,
    action: 'dispatch',
    task: parseTaskBinding(v.task),
    confirmations: confirmations(v.confirmations),
  }
}
export function deliveryConfig(root: string, policy: Policy, source: PolicySource): DeliveryConfig {
  const config = parseConfig(
    json(blob(root, source.commit, policy.deliveryConfig).text, 'delivery config'),
  )
  if (!config.enabled) throw new IntegrationError('refused', 'GitHub delivery is not enabled')
  same(config.repository, policy.repository, 'Policy and delivery repository differ')
  if (config.project.id === null || config.writers.stage === null || config.writers.body === null)
    throw new IntegrationError('unknown', 'Project or single writers are not configured')
  return config
}
export function currentAdmission(
  config: DeliveryConfig,
  scope: AdmissionScope,
  read: GhRead = runGhRead,
): AdmissionCapture {
  try {
    return collectAdmission(config, scope, read)
  } catch (error) {
    throw new IntegrationError(
      'unknown',
      error instanceof InputError
        ? error.message
        : 'Current admission inputs are incomplete or unsupported',
    )
  }
}
export function admissionDigest(capture: AdmissionCapture): string {
  return digest(
    canonical({
      repository: capture.repository,
      projectId: capture.projectId,
      scope: capture.scope,
      closure: capture.closure,
      issues: capture.issues,
    }),
  )
}
const DISPATCH_ENVIRONMENT = 'publish'
const API_HEADERS = [
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2026-03-10',
]
/** A user or team named as required reviewer of the publish environment may dispatch. */
function isDispatchReviewer(policy: Policy, actor: Record<string, unknown>, read: GhRead): boolean {
  const login = string(actor.login, 'authority author login'),
    nodeId = string(actor.node_id, 'authority author node_id')
  let environment: Record<string, unknown>
  try {
    environment = record(
      read(
        [
          'api',
          '--method',
          'GET',
          ...API_HEADERS,
          `repos/${policy.repository}/environments/${DISPATCH_ENVIRONMENT}`,
        ],
        policy.timeouts.networkMs,
      ),
      'environment',
    )
  } catch {
    throw new IntegrationError('unknown', `Cannot read the ${DISPATCH_ENVIRONMENT} environment`)
  }
  const rules = array(environment.protection_rules, 'protection_rules').map(item =>
    record(item, 'protection rule'),
  )
  const reviewers = rules
    .filter(rule => rule.type === 'required_reviewers')
    .flatMap(rule => array(rule.reviewers, 'reviewers').map(item => record(item, 'reviewer')))
  if (reviewers.length === 0)
    throw new IntegrationError(
      'unknown',
      `The ${DISPATCH_ENVIRONMENT} environment has no required reviewers`,
    )
  for (const entry of reviewers) {
    const reviewer = record(entry.reviewer, 'reviewer')
    if (entry.type === 'User' && reviewer.login === login && reviewer.node_id === nodeId)
      return true
    if (entry.type === 'Team') {
      const org = policy.repository.split('/')[0],
        slug = string(reviewer.slug, 'team slug')
      try {
        const membership = record(
          read(
            [
              'api',
              '--method',
              'GET',
              ...API_HEADERS,
              `orgs/${org}/teams/${slug}/memberships/${login}`,
            ],
            policy.timeouts.networkMs,
          ),
          'team membership',
        )
        if (membership.state === 'active') return true
      } catch {
        // An unreadable or absent membership never grants dispatch.
      }
    }
  }
  return false
}
export function readAuthority(
  policy: Policy,
  url: string,
  capture: Pick<DeliveryCapture, 'issues'>,
  read: GhRead = runGhRead,
): Decision {
  const match =
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)#issuecomment-([1-9]\d*)$/.exec(url)
  if (match === null || match[1] !== policy.repository)
    throw new IntegrationError('unknown', 'Unsupported authority URL')
  const issue = capture.issues.find(item => item.number === Number(match[2]))
  if (issue === undefined)
    throw new IntegrationError('unknown', 'Authority Issue is not in the complete Issue capture')
  const raw = record(
    read(
      [
        'api',
        '--method',
        'GET',
        '-H',
        'Accept: application/vnd.github+json',
        '-H',
        'X-GitHub-Api-Version: 2026-03-10',
        `repos/${policy.repository}/issues/comments/${match[3]}`,
      ],
      policy.timeouts.networkMs,
    ),
    'authority comment',
  )
  const user = record(raw.user, 'authority author')
  same(raw.html_url, url, 'Authority comment URL mismatch')
  same(
    raw.issue_url,
    `https://api.github.com/repos/${policy.repository}/issues/${match[2]}`,
    'Authority comment belongs to another Issue',
  )
  const observed = issue.comments.find(comment => comment.url === url)
  if (observed === undefined)
    throw new IntegrationError('unknown', 'Authority comment missing from complete capture')
  same(
    [observed.body, observed.author, observed.updatedAt],
    [raw.body, user.login, raw.updated_at],
    'Authority comment changed during capture',
  )
  const decision = parseDecision(section(text(raw.body, 'body'), 'omne-integration-authority:v1'))
  // Dispatch follows the reviewers who confirm trunk publication.
  if (!isDispatchReviewer(policy, user, read))
    throw new IntegrationError(
      'refused',
      `Comment actor is not a reviewer of the ${DISPATCH_ENVIRONMENT} environment`,
    )
  same(decision.responsible, user.login, 'Decision responsible actor mismatch')
  for (const comment of issue.comments) {
    const revocation = section(comment.body, 'omne-integration-revocation:v1')
    if (revocation === undefined) continue
    const v = fields(revocation, ['schemaVersion', 'decisions', 'basis'], 'revocation')
    literal(v.schemaVersion, 1, 'revocation.schemaVersion')
    string(v.basis, 'revocation.basis')
    if (strings(v.decisions, 'revocation.decisions').includes(url))
      throw new IntegrationError(
        'unknown',
        'Authority has a revocation declaration requiring owner review',
      )
  }
  return decision
}
export function currentTask(
  capture: Pick<DeliveryCapture, 'issues'>,
  historical: TaskBinding,
): { binding: TaskBinding; issue: CapturedIssue } {
  const issue = capture.issues.find(
    item => item.url === historical.issue.url && item.id === historical.issue.id,
  )
  if (issue === undefined) throw new IntegrationError('unknown', 'Task Issue identity was not read')
  const binding = readTaskBinding(issue.body, historical.issue)
  if (binding === undefined) throw new IntegrationError('unknown', 'Task binding is missing')
  return { binding, issue }
}
/** Every start-phase condition of the card needs a current confirmation in the dispatch decision. */
export function confirmConditions(
  config: DeliveryConfig,
  capture: AdmissionCapture,
  task: TaskBinding,
  target: string,
  confirmed: Confirmation[],
  policy: Policy,
): void {
  const report = observeAdmission(config, capture)
  if (report.findings.some(f => f.object === task.issue.url && f.category === 'deviation'))
    throw new IntegrationError('unknown', 'Task card has protocol deviations')
  const card = report.cards.find(card => card.issue === task.issue.url)
  if (card === undefined) throw new IntegrationError('unknown', 'Task card was not observed')
  same(
    [...task.conditions].sort(),
    card.conditions.map(condition => condition.id).sort(),
    'Binding condition IDs differ from card conditions',
  )
  for (const condition of card.conditions) {
    const scope = condition.scope ?? 'all'
    if (
      scope.startsWith('refs/heads/integration/') &&
      !policy.tracks.some(track => `refs/heads/${track.branch}` === scope)
    )
      throw new IntegrationError('unknown', `Condition ${condition.id} names an unregistered track`)
    if (condition.phase !== 'start') continue
    if (
      !confirmed.some(
        item =>
          item.issue === task.issue.url &&
          item.condition === condition.id &&
          item.digest === conditionDigest(condition),
      )
    )
      throw new IntegrationError(
        'unknown',
        `Condition ${condition.id} lacks a current owner confirmation for ${target}`,
      )
  }
}
export function conditionDigest(condition: Condition): string {
  return digest(canonical(condition))
}
