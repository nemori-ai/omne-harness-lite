import { collectDelivery, runGhRead, type GhRead } from '../delivery/github-read.ts'
import {
  parseConfig,
  record,
  text,
  type DeliveryCapture,
  type DeliveryConfig,
  type CapturedIssue,
  type Condition,
} from '../delivery/protocol.ts'
import { observeDelivery } from '../delivery/observe.ts'
import {
  conditionApplies,
  parseTaskBinding,
  readTaskBinding,
  type TaskBinding,
} from '../delivery/binding.ts'
import { blob } from './git.ts'
import type { Policy, Mode } from './policy.ts'
import { parseAudit, type PolicySource, type TaskAudit } from './context.ts'
import {
  array,
  fields,
  json,
  literal,
  section,
  sha,
  string,
  strings,
  canonical,
  digest,
  same,
  IntegrationError,
} from './parse.ts'

type CommonDecision = {
  schemaVersion: 1
  policyRevision: string
  responsible: string
  basis: string[]
}
export type Decision = CommonDecision &
  (
    | { action: 'dispatch'; task: TaskBinding; confirmations: Confirmation[] }
    | {
        action: 'publish'
        operation: string
        candidate: string
        expectedBase: string | null
        sources: string[]
        tasks: TaskAudit[]
        receiptDigest: string
        allowedRefs: string[]
        confirmations: Confirmation[]
        revalidations: Revalidation[]
      }
    | {
        action: 'adopt'
        policyCommit: string
        constructionHead: string
        constructionComplete: true
        legacyDigest: string
        bootstrapBasis: string
        checksDigest: string
      }
    | {
        action: 'policy-adopt'
        previous: string
        policyCommit: string
        handoffDigest: string
        checksDigest: string
      }
    | {
        action: 'track-bootstrap'
        track: string
        mainAnchor: string
        allowedRefs: string[]
        expectedAbsent: true
      }
  )
export type Confirmation = { issue: string; condition: string; digest: string; evidence: string }
export type Revalidation = { historical: string; current: string; evidence: string }
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
export function parseDecision(value: unknown): Decision {
  const v = record(value, 'decision')
  const common: CommonDecision = {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    policyRevision: string(v.policyRevision, 'policyRevision'),
    responsible: string(v.responsible, 'responsible'),
    basis: strings(v.basis, 'basis'),
  }
  if (common.basis.length === 0) throw new IntegrationError('unknown', 'Authority basis is missing')
  const commonKeys = ['schemaVersion', 'policyRevision', 'responsible', 'basis', 'action']
  switch (v.action) {
    case 'dispatch':
      fields(v, [...commonKeys, 'task', 'confirmations'], 'dispatch')
      return {
        ...common,
        action: 'dispatch',
        task: parseTaskBinding(v.task),
        confirmations: confirmations(v.confirmations),
      }
    case 'publish':
      fields(
        v,
        [
          ...commonKeys,
          'operation',
          'candidate',
          'expectedBase',
          'sources',
          'tasks',
          'receiptDigest',
          'allowedRefs',
          'confirmations',
          'revalidations',
        ],
        'publish',
      )
      return {
        ...common,
        action: 'publish',
        operation: string(v.operation, 'operation'),
        candidate: sha(v.candidate),
        expectedBase: v.expectedBase === null ? null : sha(v.expectedBase),
        sources: array(v.sources, 'sources').map(item => sha(item)),
        tasks: array(v.tasks, 'tasks').map(parseAudit),
        receiptDigest: string(v.receiptDigest, 'receiptDigest'),
        allowedRefs: strings(v.allowedRefs, 'allowedRefs'),
        confirmations: confirmations(v.confirmations),
        revalidations: array(v.revalidations, 'revalidations').map(item => {
          const r = fields(item, ['historical', 'current', 'evidence'], 'revalidation')
          return {
            historical: string(r.historical, 'historical'),
            current: string(r.current, 'current'),
            evidence: string(r.evidence, 'evidence'),
          }
        }),
      }
    case 'adopt':
      fields(
        v,
        [
          ...commonKeys,
          'policyCommit',
          'constructionHead',
          'constructionComplete',
          'legacyDigest',
          'bootstrapBasis',
          'checksDigest',
        ],
        'adopt',
      )
      return {
        ...common,
        action: 'adopt',
        policyCommit: sha(v.policyCommit),
        constructionHead: sha(v.constructionHead),
        constructionComplete: literal(v.constructionComplete, true, 'constructionComplete'),
        legacyDigest: string(v.legacyDigest, 'legacyDigest'),
        bootstrapBasis: string(v.bootstrapBasis, 'bootstrapBasis'),
        checksDigest: string(v.checksDigest, 'checksDigest'),
      }
    case 'policy-adopt':
      fields(
        v,
        [...commonKeys, 'previous', 'policyCommit', 'handoffDigest', 'checksDigest'],
        'policy-adopt',
      )
      return {
        ...common,
        action: 'policy-adopt',
        previous: sha(v.previous),
        policyCommit: sha(v.policyCommit),
        handoffDigest: string(v.handoffDigest, 'handoffDigest'),
        checksDigest: string(v.checksDigest, 'checksDigest'),
      }
    case 'track-bootstrap':
      fields(
        v,
        [...commonKeys, 'track', 'mainAnchor', 'allowedRefs', 'expectedAbsent'],
        'track-bootstrap',
      )
      return {
        ...common,
        action: 'track-bootstrap',
        track: string(v.track, 'track'),
        mainAnchor: sha(v.mainAnchor),
        allowedRefs: strings(v.allowedRefs, 'allowedRefs'),
        expectedAbsent: literal(v.expectedAbsent, true, 'expectedAbsent'),
      }
    default:
      throw new IntegrationError('unknown', 'Unsupported authority action')
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
export function currentCapture(config: DeliveryConfig, read: GhRead = runGhRead): DeliveryCapture {
  const capture = collectDelivery(config, read)
  if (
    capture.collection.errors.length > 0 ||
    capture.collection.issues !== 'complete' ||
    capture.collection.project !== 'complete' ||
    capture.issues.some(issue => !issue.commentsComplete || !issue.relationsComplete)
  )
    throw new IntegrationError(
      'unknown',
      'Current Issue, comment, relation or Project capture is incomplete',
    )
  return capture
}
export function captureDigest(capture: DeliveryCapture): string {
  return digest(
    canonical({
      repository: capture.repository,
      projectId: capture.projectId,
      issues: capture.issues,
    }),
  )
}
export function readAuthority(
  policy: Policy,
  url: string,
  capture: DeliveryCapture,
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
  if (
    !policy.owners.some(
      owner =>
        owner.login === user.login &&
        owner.nodeId === user.node_id &&
        owner.actions.includes(decision.action),
    )
  )
    throw new IntegrationError('refused', 'Comment actor is not a policy owner for this action')
  same(decision.responsible, user.login, 'Decision responsible actor mismatch')
  same(decision.policyRevision, policy.revision, 'Authority policy revision changed')
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
  capture: DeliveryCapture,
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
export function confirmConditions(
  config: DeliveryConfig,
  capture: DeliveryCapture,
  task: TaskBinding,
  phase: 'start' | 'integration',
  target: string,
  confirmed: Confirmation[],
  policy: Policy,
): void {
  const report = observeDelivery(config, capture)
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
    if (condition.phase !== phase || (phase === 'integration' && !conditionApplies(scope, target)))
      continue
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
export function revalidateTask(
  capture: DeliveryCapture,
  audit: TaskAudit,
  mode: Mode,
  revalidations: Revalidation[],
): TaskBinding {
  const current = currentTask(capture, audit.binding)
  const exact = canonical(current.binding) === canonical(audit.binding)
  if (!exact || current.issue.state === 'closed') {
    if (!['ri', 'joint', 'checkpoint'].includes(mode))
      throw new IntegrationError(
        'stale',
        'Original task revision or attempt is no longer current/open',
      )
    if (
      !revalidations.some(
        item =>
          item.historical === digest(canonical(audit)) &&
          item.current ===
            digest(
              canonical({
                binding: current.binding,
                state: current.issue.state,
                updatedAt: current.issue.updatedAt,
              }),
            ),
      )
    )
      throw new IntegrationError(
        'stale',
        'Historical unit requires exact owner revalidation against current Issue inputs',
      )
  }
  return current.binding
}
