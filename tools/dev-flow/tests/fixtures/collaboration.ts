import { canonical, digest } from '../../src/integration/parse.ts'
import { commentDigest, encodeRecordComment } from '../../src/delivery/collaboration-comments.ts'
import type {
  ActiveAssignment,
  Evidence,
  LineDeltaRecord,
  ReleaseRecord,
  RequestInput,
  RequestRecord,
  RequestStateRecord,
} from '../../src/delivery/collaboration-records.ts'

export const HEAD = 'a'.repeat(40)
export const BASE = 'b'.repeat(40)
export const FINAL = 'c'.repeat(40)
export const TOOL = 'd'.repeat(40)
export const UUID = '11111111-1111-4111-8111-111111111111'
export const NEXT_UUID = '22222222-2222-4222-8222-222222222222'
export const TIME = '2026-10-27T10:00:00.000Z'
export const context = {
  repo: 'owner/repo',
  milestone: 1,
  wave: 1,
  reduceIssue: 100,
  planRevision: 1,
}
export const next = { ...context, wave: 2, reduceIssue: 200, planRevision: 2 }
export const evidence: Evidence = {
  url: 'https://github.com/owner/repo/issues/100#issuecomment-9',
  sha256: 'e'.repeat(64),
  description: 'Frozen evidence fixture',
}
export const writer = { login: 'owner', epoch: UUID, authorization: evidence.url }
export const task = { issue: 11, revision: 1, attempt: '11-r1-a1', dispatch: evidence.url }

export function assignment(): ActiveAssignment {
  return {
    context: { ...next },
    lineParent: 10,
    finalHead: FINAL,
    mode: 'active',
    tasks: [{ ...task, issue: 21, attempt: '21-r1-a1' }],
    inputs: [{ ...evidence }],
    acceptance: [{ ...evidence }],
    toolRevision: TOOL,
    rolePolicyVersion: '820.1',
  }
}

export function requestInput(): RequestInput {
  return {
    context: { ...context },
    lineParent: 10,
    requestId: UUID,
    previousRequestId: null,
    tasks: [{ ...task }],
    targetRef: 'integration/legacy-refactor',
    report: { ...evidence },
    verification: [{ ...evidence }],
    stopped: { writers: ['line-owner-session'], evidence: { ...evidence }, confirmed: true },
    outcome: 'ready',
    pull: { number: 12, head: HEAD },
    reason: null,
    remaining: [],
  }
}

export function request(): RequestRecord {
  const input = requestInput()
  return {
    schemaVersion: 1,
    kind: 'request',
    input,
    workflow: {
      path: '.github/workflows/integration-request.yml',
      ref: 'github-gate',
      head: TOOL,
      runId: 30,
      runAttempt: 1,
      inputDigest: digest(canonical(input)),
    },
    registeredAt: TIME,
  }
}

export function state(): RequestStateRecord {
  return {
    schemaVersion: 1,
    kind: 'state',
    context: { ...context },
    lineParent: 10,
    requestId: UUID,
    operationId: NEXT_UUID,
    revision: 1,
    previousRecordId: null,
    writer: { ...writer },
    state: 'merged',
    requestHead: HEAD,
    candidateHead: FINAL,
    targetBase: BASE,
    mergeCommit: FINAL,
    reason: 'Integration verified',
    changes: [{ ...evidence }],
    verification: [{ ...evidence }],
    workflow: { ...request().workflow, path: '.github/workflows/gate-publish.yml', head: FINAL },
    disposition: null,
    recordedAt: TIME,
  }
}

export function delta(): LineDeltaRecord {
  return {
    schemaVersion: 1,
    kind: 'delta',
    purpose: 'release',
    newRequestId: null,
    context: { ...context },
    lineParent: 10,
    operationId: UUID,
    revision: 1,
    previousRecordId: null,
    writer: { ...writer },
    finalHead: FINAL,
    integrationResults: [
      { issue: 100, commentId: 23, sha256: commentDigest(encodeRecordComment(state())) },
    ],
    changes: [{ ...evidence }],
    externalChanges: [],
    migrations: [],
    toolRevision: TOOL,
    rolePolicyVersion: '820.1',
    continuation: { kind: 'active', assignment: assignment() },
    recordedAt: TIME,
  }
}

export function release(): ReleaseRecord {
  return {
    schemaVersion: 1,
    kind: 'release',
    context: { ...context },
    operationId: NEXT_UUID,
    writer: { ...writer },
    finalHead: FINAL,
    expectedRequests: [UUID],
    results: [{ issue: 100, commentId: 23, sha256: commentDigest(encodeRecordComment(state())) }],
    acceptance: { ...evidence },
    lines: [
      {
        lineParent: 10,
        delta: { issue: 10, commentId: 24, sha256: commentDigest(encodeRecordComment(delta())) },
        continuation: { kind: 'active', assignment: assignment() },
      },
    ],
    next: { ...next },
    recordedAt: TIME,
  }
}
