export const COLLABORATION_VERSION = 1 as const

export const RECORD_MARKERS = {
  request: 'integration-request',
  state: 'integration-state',
  release: 'reduce-release',
  delta: 'line-delta',
  consumption: 'line-state',
  assignment: 'line-assignment',
} as const

export type WaveIdentity = {
  repo: string
  milestone: number
  wave: number
  reduceIssue: number
  planRevision: number
}

export type Evidence = { url: string; sha256: string; description: string }
export type CommentReference = { issue: number; commentId: number; sha256: string }
export type TaskReference = { issue: number; revision: number; attempt: string; dispatch: string }
export type ReduceWriter = { login: string; epoch: string; authorization: string }
export type PullSnapshot = { number: number; head: string }

export type WorkflowEvidence = {
  path: string
  ref: string
  head: string
  runId: number
  runAttempt: number
  inputDigest: string
}

export type RequestInput = {
  context: WaveIdentity
  lineParent: number
  requestId: string
  previousRequestId: string | null
  tasks: [TaskReference, ...TaskReference[]]
  targetRef: string
  report: Evidence
  verification: Evidence[]
  stopped: { writers: string[]; evidence: Evidence; confirmed: true }
} & (
  | { outcome: 'ready'; pull: PullSnapshot; reason: null; remaining: [] }
  | {
      outcome: 'blocked' | 'failed'
      pull: PullSnapshot | null
      reason: string
      remaining: string[]
    }
)

export type RequestRecord = {
  schemaVersion: 1
  kind: 'request'
  input: RequestInput
  workflow: WorkflowEvidence
  registeredAt: string
}

export type Assignment = {
  context: WaveIdentity
  lineParent: number
  finalHead: string
  inputs: Evidence[]
  acceptance: Evidence[]
  toolRevision: string
  rolePolicyVersion: string
} & ({ mode: 'active'; tasks: [TaskReference, ...TaskReference[]] } | { mode: 'idle'; tasks: [] })

export type ActiveAssignment = Extract<Assignment, { mode: 'active' }>

export type Continuation =
  | { kind: 'active'; assignment: ActiveAssignment }
  | { kind: 'idle'; next: WaveIdentity; reason: string }
  | { kind: 'terminal'; reason: string; authorization: Evidence }

export type Disposition =
  | { action: 'takeover'; remainingOwner: string; waitReduceIssue: number; evidence: Evidence[] }
  | {
      action: 'redispatch'
      remainingOwner: string
      newRequestId: string
      assignment: ActiveAssignment
      delta: CommentReference
      oldWritersStopped: Evidence
      reduceWriteReleased: Evidence
      authorization: Evidence
    }
  | {
      action: 'rescope'
      remainingOwner: string
      continuation: Continuation
      authorization: Evidence
      consumerImpact: Evidence[]
    }

export type RequestStateRecord = {
  schemaVersion: 1
  kind: 'state'
  context: WaveIdentity
  lineParent: number
  requestId: string
  operationId: string
  revision: number
  previousRecordId: number | null
  writer: ReduceWriter
  state: 'claimed' | 'integrating' | 'merged' | 'blocked' | 'superseded' | 'reverted'
  requestHead: string | null
  candidateHead: string | null
  targetBase: string | null
  mergeCommit: string | null
  reason: string
  changes: Evidence[]
  verification: Evidence[]
  workflow: WorkflowEvidence | null
  disposition: Disposition | null
  recordedAt: string
}

export type LineDeltaRecord = {
  schemaVersion: 1
  kind: 'delta'
  context: WaveIdentity
  lineParent: number
  operationId: string
  revision: number
  previousRecordId: number | null
  writer: ReduceWriter
  finalHead: string
  integrationResults: CommentReference[]
  changes: Evidence[]
  externalChanges: Evidence[]
  migrations: Evidence[]
  toolRevision: string
  rolePolicyVersion: string
  continuation: Continuation
  recordedAt: string
} & ({ purpose: 'release'; newRequestId: null } | { purpose: 'redispatch'; newRequestId: string })

export type LineConsumptionRecord = {
  schemaVersion: 1
  kind: 'consumption'
  context: WaveIdentity
  lineParent: number
  operationId: string
  revision: number
  previousRecordId: number | null
  writer: string
  task: TaskReference
  consumedDelta: CommentReference
  consumedRevision: number
  recordedAt: string
}

export type ReleaseRecord = {
  schemaVersion: 1
  kind: 'release'
  context: WaveIdentity
  operationId: string
  writer: ReduceWriter
  finalHead: string
  expectedRequests: string[]
  results: CommentReference[]
  acceptance: Evidence
  lines: { lineParent: number; delta: CommentReference; continuation: Continuation }[]
  next: WaveIdentity | null
  recordedAt: string
}

export type LineAssignmentRecord = {
  schemaVersion: 1
  kind: 'assignment'
  operationId: string
  writer: ReduceWriter
  assignment: Assignment
  recordedAt: string
}

export type CollaborationRecord =
  | RequestRecord
  | RequestStateRecord
  | LineDeltaRecord
  | LineConsumptionRecord
  | ReleaseRecord
  | LineAssignmentRecord
