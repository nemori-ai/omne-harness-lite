// The extension author protocol: types of docs/public-api/extensions.md, the single place that
// declares them. Judgments live in judge-extensions.ts and judge-output.ts.
import type { JsonValue } from '@omne-harness/json-text'
import type { Message } from '@omne-harness/message'
import type * as M from '@omne-harness/model-contract'
import type {
  ActionId,
  Adoption,
  AgentExecutionId,
  AgentInstant,
  CardRoundId,
  Evidence,
  PassageId,
} from './identity.ts'
import type { CardAnswer, Subject } from './passages.ts'

export const POSITIONS = [
  'execution_started',
  'before_compaction',
  'after_compaction',
  'before_model_call',
  'after_model_call',
  'before_action',
  'after_action',
  'before_terminal',
  'after_terminal',
] as const
export type Position = (typeof POSITIONS)[number]
export type Dimension =
  | Readonly<{ ending: 'complete_reply' | 'failure' }>
  | Readonly<{ scope: 'each' | 'batch' }>
export const POWERS = ['observe', 'rewrite', 'veto'] as const
export type Power = (typeof POWERS)[number]
export type ErrorPolicy = 'ignore' | 'record' | 'treat_as_veto'
export type UnavailabilityPolicy = 'skip' | 'veto'
export type ExtensionImplementationDeclaration =
  | Readonly<{ kind: 'builtin'; builtinName: string }>
  | Readonly<{
      kind: 'command'
      host: 'claude_code' | 'codex'
      dialect: string
      event: string
      command: string
      matcher?: string
      timeout?: string
    }>
export type LoopExtensionDeclaration = Readonly<{
  name: string
  position: Position
  dimension?: Dimension
  power: Power
  needs?: readonly [string, ...string[]]
  implementation: ExtensionImplementationDeclaration
  onError?: ErrorPolicy
  unavailability?: UnavailabilityPolicy
}>

export type ExtensionInput = Readonly<{
  position: Position
  dimension?: Dimension
  subject: Subject
  earlier: readonly Conclusion[]
  execution: AgentExecutionId
  passage: PassageId
}>

export type ExtensionOutput =
  | Readonly<{ kind: 'observed' }>
  | Readonly<{ kind: 'inject'; message: Message & Readonly<{ role: 'system_reminder' }> }>
  | Readonly<{ kind: 'rewrite'; subject: Subject }>
  | Readonly<{ kind: 'select_model'; route: string; reason?: string }>
  | Readonly<{ kind: 'veto'; reason: string }>
  | Readonly<{ kind: 'stop'; terminal?: 'cancelled' | 'failed'; reason: string }>
  | Readonly<{
      kind: 'retry'
      plan: Readonly<{ supplier: M.Supplier; notBefore: AgentInstant | null; basis: Adoption }>
    }>
  | Readonly<{ kind: 'ask'; card: DecisionCardDraft }>
export type DecisionCardDraft = Readonly<{
  explanation: string
  options: readonly [CardOption, ...CardOption[]]
  about: Readonly<{ position: Position; action?: ActionId }>
  proposedRewrite?: Readonly<{ option: CardOption['id']; effectiveArguments: string }>
}>
export type CardOption = Readonly<{ id: string; label: string; effect?: JsonValue }>

export type ActionIdentity =
  | Readonly<{ position: 'before_action'; action: ActionId; call?: never }>
  | Readonly<{
      position: 'after_action'
      dimension: Readonly<{ scope: 'each' }>
      action: ActionId
      call?: never
    }>
  | Readonly<{
      position: 'after_action'
      dimension: Readonly<{ scope: 'batch' }>
      action?: never
      call?: never
    }>
  | Readonly<{
      position: 'after_model_call'
      dimension: Readonly<{ ending: 'complete_reply' }>
      action?: never
      call?: never
    }>
  | Readonly<{
      position: 'after_model_call'
      dimension: Readonly<{ ending: 'failure' }>
      action?: never
      call: M.ModelCallId
    }>
  | Readonly<{
      position: Exclude<Position, 'before_action' | 'after_action' | 'after_model_call'>
      action?: never
      call?: never
    }>
export type Conclusion = ActionIdentity &
  Readonly<{
    passage: PassageId
    extension: string
    implementation: Adoption
    power: Power
    at: AgentInstant
  }> &
  (
    | Readonly<{
        output: ExtensionOutput
        skipped?: never
        error?: never
        unavailability?: never
      }>
    | Readonly<{
        skipped: 'unavailable'
        unavailability: UnavailabilityPolicy | 'fallback'
        output?: never
        error?: never
      }>
    | Readonly<{
        skipped: 'errored'
        error: string
        output: Extract<ExtensionOutput, { kind: 'observed' | 'veto' }>
        unavailability?: never
      }>
  )

export type ExtensionInvocationMode =
  | Readonly<{ kind: 'fresh' }>
  | Readonly<{ kind: 'replay'; binding: ExtensionReplayBinding }>
export type ExtensionReplayBinding = Readonly<{
  passage: PassageId
  rounds: readonly Readonly<{
    round: CardRoundId
    cards: readonly Readonly<{
      identity: string
      card: Evidence
      response: Readonly<{ evidence: Evidence; answer: CardAnswer }> | null
    }>[]
  }>[]
  control: 'valid' | 'replayInconsistent' | 'unavailable'
}>
export type ExtensionInvocationResult =
  | Readonly<{ kind: 'output'; value: unknown }>
  | Readonly<{
      kind: 'errored'
      error: string
      classification?: 'ordinary' | 'nonzero_exit' | 'timeout' | 'bad_output'
    }>
  | Readonly<{ kind: 'notStartedUnavailable' }>
  | Readonly<{ kind: 'replayInconsistent' }>
  | Readonly<{ kind: 'controlUnavailable' }>
export interface LoopExtensionImplementation {
  readonly implementation: Adoption
  invoke(
    input: ExtensionInput,
    signal: AbortSignal,
    mode: ExtensionInvocationMode,
  ): Promise<ExtensionInvocationResult>
}
