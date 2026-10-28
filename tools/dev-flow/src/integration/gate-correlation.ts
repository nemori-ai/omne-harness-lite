import { REST_HEADERS, type GhRead } from '../delivery/github-read.ts'
import type { WorkflowEvidence } from '../delivery/collaboration-records.ts'
import { fullSha, parseWorkflow } from '../delivery/collaboration-values.ts'
import { InputError } from '../delivery/protocol.ts'
import { canonical, digest, integer, object, string } from './parse.ts'

export const PUBLISH_WORKFLOW = '.github/workflows/gate-publish.yml'
export const PUBLISH_REF = 'github-gate'
export type GateCorrelation = {
  repo: string
  pull: number
  candidateHead: string
  checkpoint: string
  workflow: WorkflowEvidence
  adoptedWorkflowHead: string
}

export function gateInputs(input: Pick<GateCorrelation, 'pull' | 'candidateHead' | 'checkpoint'>) {
  return {
    pr: String(integer(input.pull, 'pull')),
    head: fullSha(input.candidateHead, 'candidateHead'),
    checkpoint: input.checkpoint,
  }
}
export function gateRunName(
  input: Pick<GateCorrelation, 'pull' | 'candidateHead' | 'checkpoint'>,
): string {
  return `gate-publish:${input.pull}:${input.candidateHead}:${input.checkpoint}`
}

export function verifyGateRun(value: unknown, input: GateCorrelation) {
  const workflow = parseWorkflow(input.workflow)
  if (
    workflow.path !== PUBLISH_WORKFLOW ||
    workflow.ref !== PUBLISH_REF ||
    workflow.head !== fullSha(input.adoptedWorkflowHead, 'adoptedWorkflowHead') ||
    workflow.inputDigest !== digest(canonical(gateInputs(input)))
  )
    throw new InputError('reduce-gate-input-mismatch')
  const run = object(value, 'gate run')
  if (
    object(run.repository, 'repository').full_name !== input.repo ||
    run.id !== workflow.runId ||
    run.run_attempt !== workflow.runAttempt ||
    run.head_sha !== workflow.head ||
    run.head_branch !== PUBLISH_REF ||
    run.event !== 'workflow_dispatch' ||
    ![
      PUBLISH_WORKFLOW,
      `${PUBLISH_WORKFLOW}@${PUBLISH_REF}`,
      `${PUBLISH_WORKFLOW}@refs/heads/${PUBLISH_REF}`,
    ].includes(string(run.path, 'run.path')) ||
    run.display_title !== gateRunName(input)
  )
    throw new InputError('reduce-gate-run-mismatch')
  if (run.inputs !== undefined && canonical(run.inputs) !== canonical(gateInputs(input)))
    throw new InputError('reduce-gate-input-mismatch')
  const status = string(run.status, 'run.status')
  const conclusion = run.conclusion === null ? null : string(run.conclusion, 'run.conclusion')
  if (status === 'completed' && conclusion === null)
    throw new InputError('reduce-gate-conclusion-missing')
  return { runId: workflow.runId, runAttempt: workflow.runAttempt, status, conclusion }
}

/** Read-only. An approval requirement is a fact for the owner; it never calls deployment review. */
export function readGateRun(read: GhRead, input: GateCorrelation) {
  const path = `repos/${input.repo}/actions/runs/${input.workflow.runId}`
  const get = (endpoint: string) =>
    read(['api', '--method', 'GET', ...REST_HEADERS, endpoint], 15_000)
  verifyGateRun(get(path), input)
  return verifyGateRun(get(`${path}/attempts/${input.workflow.runAttempt}`), input)
}
