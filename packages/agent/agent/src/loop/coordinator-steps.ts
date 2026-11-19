import type {
  AgentCheckpoint,
  AgentEventBody,
  AgentOperationId,
  JournalCommitState,
  PendingCall,
  CallerCommit,
  ConsumerRef,
  ConsumptionId,
  ActionId,
  EffectIntent,
  DurableEvidence,
  Failure,
  FinishCandidateContent,
  HandoffChange,
  HandoffOutcome,
  InputBatch,
  ModelReplyAdmission,
  Preparation,
  RuntimeConditions,
  SelectedModel,
  StepId,
} from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentConfiguration } from '../construction.ts'
import { type Label } from './nodes.ts'
import { type ModelResult } from './model-result.ts'

// The steps of the execution coordinator: what one node writes and returns.

export type ReadyPreparation = Extract<Preparation, { kind: 'ready' }>
export type ModelPendingCall = Extract<PendingCall, { kind: 'model' }>
export type OpenState = JournalCommitState
export type CommitEvent = Exclude<AgentEventBody, { kind: 'ended' | 'entry' }>

export type Write = Readonly<{
  checkpoint?: Partial<Omit<AgentCheckpoint, 'position'>>
  state?: OpenState
  finish?: FinishCandidateContent
  events?: readonly CommitEvent[]
  effects?: readonly EffectIntent[]
  replyAdmission?: ModelReplyAdmission
  handoff?: HandoffChange
  caller?: CallerCommit
  operation?: AgentOperationId
  recordsFact?: true
}>

export function historyCaller(
  jointCommits: AgentConfiguration['jointCommits'],
  fixed: HandoffOutcome,
): CallerCommit {
  const { request, decision, record } = fixed
  if (request.kind !== 'execution' || decision.kind !== 'prepared') return { kind: 'none' }
  const source = request.source
  switch (source.kind) {
    case 'model-reply':
      return { kind: 'none' }
    case 'context-transition':
      return jointCommits.includes('context-transition')
        ? { kind: 'context-transition', value: source.transition, admission: decision.admission }
        : { kind: 'none' }
    case 'tool-result':
    case 'action-denied':
    case 'reminder':
      return jointCommits.includes('message')
        ? {
            kind: 'message',
            message: decision.message,
            source: record,
            admission: decision.admission,
          }
        : { kind: 'none' }
  }
}

export type Step = Readonly<{ on: Label; commit: Write | null }>

export type Handler = () => Promise<Outcome<Step, Failure>>

export type Iteration = {
  step: StepId
  batch: InputBatch | null
  action: ActionId
  consumption: ConsumptionId
  position: ConsumerRef
  conditions: RuntimeConditions | null
  selected: SelectedModel | null
  preparation: Preparation | null
  ready: ReadyPreparation | null
  pending: ModelPendingCall | null
  lost: DurableEvidence | null
  result: ModelResult | null
  admission: 'new' | 'unknown' | 'accepted'
}

export const step = (on: Label, commit: Write | null = {}): Outcome<Step, Failure> =>
  succeed({ on, commit })

export function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`coordinator defect: ${what} is not set`)
  return value
}
