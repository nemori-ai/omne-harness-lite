import { fullSha, uuid } from '../delivery/collaboration-values.ts'
import { array, canonical, choice, fields, integer, literal, object, string } from './parse.ts'
import { InputError } from '../delivery/protocol.ts'

export const RELEASE_WORKFLOW = '.github/workflows/gate-release.yml'
export const RELEASE_REF = 'github-gate'
export type ReleaseRunInput = ReturnType<typeof parseReleaseRunInput>
export function parseReleaseRunInput(value: unknown) {
  const v = fields(
    value,
    [
      'schemaVersion',
      'repo',
      'operationId',
      'package',
      'commit',
      'issue',
      'dryRun',
      'workflowHead',
    ],
    'release-run',
  )
  const repo = string(v.repo, 'repo')
  if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(repo))
    throw new InputError('release-run-repo-invalid')
  const issue = integer(v.issue, 'issue')
  if (issue > 999999) throw new InputError('release-run-issue-invalid')
  if (typeof v.dryRun !== 'boolean') throw new InputError('release-run-dry-run-required')
  return {
    schemaVersion: literal(v.schemaVersion, 1, 'schemaVersion'),
    repo,
    operationId: uuid(v.operationId, 'operationId'),
    package: choice(v.package, ['repo-toolchain', 'repo-config'], 'package'),
    commit: fullSha(v.commit, 'commit'),
    issue,
    dryRun: v.dryRun,
    workflowHead: fullSha(v.workflowHead, 'workflowHead'),
  }
}
export function releaseInputs(input: ReleaseRunInput) {
  return {
    package: input.package,
    commit: input.commit,
    issue: String(input.issue),
    dry_run: String(input.dryRun),
  }
}
export function dispatchReceipt(value: unknown, repo: string) {
  const v = object(value, 'dispatch response')
  const runId = integer(v.workflow_run_id, 'workflow_run_id')
  const url = `https://github.com/${repo}/actions/runs/${runId}`
  if (
    v.run_url !== `https://api.github.com/repos/${repo}/actions/runs/${runId}` ||
    v.html_url !== url
  )
    throw new InputError('release-run-dispatch-receipt-mismatch')
  return { workflow_run_id: runId, run_url: v.run_url, html_url: url }
}
export function verifyReleaseRun(
  value: unknown,
  input: ReleaseRunInput,
  runId: number,
  workflowId: number,
) {
  const v = object(value, 'run')
  if (
    v.id !== runId ||
    v.run_attempt !== 1 ||
    v.workflow_id !== workflowId ||
    v.head_sha !== input.workflowHead ||
    v.head_branch !== RELEASE_REF ||
    v.event !== 'workflow_dispatch' ||
    object(v.repository, 'repository').full_name !== input.repo ||
    ![
      RELEASE_WORKFLOW,
      `${RELEASE_WORKFLOW}@${RELEASE_REF}`,
      `${RELEASE_WORKFLOW}@refs/heads/${RELEASE_REF}`,
    ].includes(string(v.path, 'path'))
  )
    throw new InputError('release-run-identity-mismatch')
  // The receipt binds all submitted inputs; title alone omits issue and cannot establish ownership.
  if (v.inputs !== undefined && canonical(v.inputs) !== canonical(releaseInputs(input)))
    throw new InputError('release-run-input-mismatch')
  const status = string(v.status, 'status')
  const conclusion = v.conclusion === null ? null : string(v.conclusion, 'conclusion')
  if (status === 'completed' && conclusion === null)
    throw new InputError('release-run-conclusion-missing')
  return { status, conclusion }
}
export function pendingReleaseEnvironment(value: unknown) {
  const environments = array(value, 'pending deployments')
    .map(item => {
      const v = object(item, 'pending deployment')
      const environment = object(v.environment, 'environment')
      return {
        id: integer(environment.id, 'environment.id'),
        name: string(environment.name, 'environment.name'),
        canApprove: v.current_user_can_approve === true,
      }
    })
    .filter(item => item.name === 'npm-release')
  if (environments.length > 1) throw new InputError('release-run-environment-conflict')
  return environments[0]
}

export function releaseApprovals(value: unknown) {
  return array(value, 'approvals').flatMap(item => {
    const approval = object(item, 'approval')
    if (approval.state !== 'approved') return []
    const environments = array(approval.environments, 'approval.environments').map(value =>
      object(value, 'environment'),
    )
    return environments
      .filter(environment => environment.name === 'npm-release')
      .map(environment => ({
        environmentId: integer(environment.id, 'environment.id'),
        reviewer: string(object(approval.user, 'approval.user').login, 'approval.user.login'),
        note: string(approval.comment, 'approval.comment'),
      }))
  })
}
