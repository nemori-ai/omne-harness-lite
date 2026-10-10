import type { JsonNumber, ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type {
  ExecutionRef,
  ExecutionOrigin,
  SelectedTool,
  InvocationInput,
  SubmissionResult,
  RuntimeAccess,
  ExecutionSubmission,
  ToolRuntimeOperations,
} from './tool-execution.ts'
import type {
  ToolOriginalIssueIdentity,
  ToolOriginalIssueClaim,
  ToolOriginalIssueStage,
  ToolOriginalIssueConsumeStage,
} from './original-issue.ts'
import type { ToolTerminalRecord } from './result-custody.ts'
import type { ToolJournalHistory } from './journal-history.ts'
import type { ToolJournalPayload, DeliveryBasis } from './tool-journal.ts'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { ToolRuntimeDependencies, ToolRuntimeConfig } from './runtime-provider.ts'

interface PreparedToolRequest {
  readonly access: RuntimeAccess
  readonly ref: ExecutionRef
  readonly origin: ExecutionOrigin
  readonly call: ToolCallBlock
  readonly source: SourceToken
  readonly afterAction: Pick<DeliveryBasis, 'pass' | 'selectedChain'>
  readonly admissionToken?: ExecutionSubmission['admissionToken']
}

export type PreparedToolExecution = PreparedToolRequest &
  (
    | {
        readonly selected: SelectedTool
        readonly args: InvocationInput['args']
        readonly adoption?: never
        readonly notExecutable?: never
      }
    | {
        readonly selected?: never
        readonly args?: never
        readonly adoption: string
        readonly notExecutable: 'unparseable' | 'no_such_entry'
      }
  )

export type ToolPoolControls = Pick<ToolRuntimeOperations, 'acquire' | 'stop' | 'answer'>

declare const toolExecutionJob: unique symbol

export interface ToolExecutionJob {
  readonly [toolExecutionJob]: true
}

export interface ToolObligationReader<Ref> {
  readonly next: () => Promise<
    | {
        readonly kind: 'page'
        readonly refs: readonly [Ref, ...Ref[]]
      }
    | {
        readonly kind: 'end' | 'unavailable'
      }
  >
}

export interface ToolExecutionObligations<Ref> {
  readonly withObligations: <T>(
    input: {
      readonly tenant: TenantId
      readonly limit: number
    },
    use: (reader: ToolObligationReader<Ref>) => Promise<T>,
  ) => Promise<
    | {
        readonly kind: 'used'
        readonly value: T
      }
    | {
        readonly kind: 'unavailable' | 'denied'
      }
  >
}

export interface ToolExecutionRecords extends ToolExecutionObligations<ExecutionRef> {
  readonly readOriginalIn: (
    unit: StorageUnit,
    ref: ExecutionRef,
  ) => Promise<
    | {
        readonly kind: 'found'
        readonly history: ToolJournalHistory
      }
    | {
        readonly kind: 'absent' | 'invalidSource' | 'unavailable'
      }
  >
  readonly stageOriginalIn: (
    unit: StorageUnit,
    job: ToolExecutionJob,
  ) => Promise<ToolOriginalIssueStage>
  readonly stageConsumeIn: (
    unit: StorageUnit,
    claim: ToolOriginalIssueClaim,
  ) => Promise<ToolOriginalIssueConsumeStage>
  readonly terminalIn: (
    unit: StorageUnit,
    original: ToolOriginalIssueIdentity,
  ) => Promise<
    | {
        readonly kind: 'found'
        readonly terminal: ToolTerminalRecord
      }
    | {
        readonly kind: 'absent' | 'invalidSource' | 'unavailable'
      }
  >
  readonly stageTransitionIn: (
    unit: StorageUnit,
    job: ToolExecutionJob,
    records: readonly Exclude<
      ToolJournalPayload,
      {
        readonly kind: 'execution_intended' | 'execution_started' | 'delivery_confirmed'
      }
    >[],
  ) => Promise<
    | {
        readonly kind: 'staged' | 'recognized'
        readonly positions: readonly JsonNumber[]
      }
    | {
        readonly kind: 'invalidSource' | 'conflict' | 'unavailable'
      }
  >
  readonly stageConfirmationIn: (
    unit: StorageUnit,
    job: ToolExecutionJob,
    input: {
      readonly message: NonNullable<ToolJournalHistory['confirmed']>['value']['message']
      readonly position: JsonNumber
    },
  ) => Promise<
    | {
        readonly kind: 'staged' | 'recognized'
        readonly positions: readonly JsonNumber[]
      }
    | {
        readonly kind: 'invalidSource' | 'conflict' | 'unavailable'
      }
  >
}

export type ToolSubmitResult =
  | SubmissionResult
  | {
      readonly kind: 'recognized'
      readonly execution: ExecutionRef
    }
  | {
      readonly kind: 'unknownCommit'
      readonly original: ExecutionRef
    }

export interface ToolPoolAdmission extends ToolPoolControls {
  readonly submit: (request: PreparedToolExecution) => Promise<ToolSubmitResult>
}

export interface ToolPoolInstance {
  readonly operations: ToolPoolAdmission
  readonly ready: Promise<void>
  readonly idle: () => Promise<void>
  readonly close: () => Promise<void>
}

export type ToolPoolConstruction = Pick<
  ToolRuntimeDependencies,
  | 'recovery'
  | 'authorization'
  | 'admission'
  | 'implementations'
  | 'context'
  | 'environments'
  | 'results'
  | 'invoke'
  | 'clock'
> & {
  readonly records: ToolExecutionRecords
  readonly config: ToolRuntimeConfig
}
