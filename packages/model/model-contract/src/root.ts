import type { Access } from '@omne-harness/legal-identity'
import type { Adoption, ConsumerRef } from '@omne-harness/exchange-refs'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type { ModelInvocationRef } from './reference.ts'
import type { DecisionAsk } from './decision-call.ts'
import type { ParameterAdoption, ReplayDeclaration } from './profile.ts'

declare const identity: unique symbol
export type Identity<K extends string> = string & { readonly [identity]: K }
export type ModelCallId = Identity<'ModelCallId'>
export type DispatchId = Identity<'ModelDispatchId'>
export type ModelInstanceId = Identity<'ModelInstanceId'>
export type ModelOperationId = Identity<'ModelOperationId'>
export type ResultVersion = Identity<'ModelResultVersion'>
export type OutputCursor = Identity<'ModelOutputCursor'>
export type ReadId = Identity<'ModelReadId'>
export type Revision = Identity<'ModelRevision'>
export type ProviderName = Identity<'ModelProviderName'>

export type ModelIdentityKey =
  | 'ModelCallId'
  | 'ModelDispatchId'
  | 'ModelInstanceId'
  | 'ModelOperationId'
  | 'ModelReadId'
  | 'ModelDiagnosticId'
  | 'ModelDiagnosticCursor'
  | 'ModelRevision'
  | 'ModelResultVersion'
  | 'ModelOutputCursor'
  | 'ModelProviderName'

export type ModelIdentityRejection<K extends ModelIdentityKey> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'prefix' | 'character' | 'leading-zero'
}>

export type { Adoption, ConsumerRef } from '@omne-harness/exchange-refs'
export type { Access } from '@omne-harness/legal-identity'
export type ActorRef = Readonly<{ owner: string; subject: string; revision: string }>
export type ModelReferenceAccess<P> = Access<P> & Readonly<{ reference: ModelInvocationRef }>
export type CallAccess<P> = Access<P> & Readonly<{ call: ModelCallId }>
export type Mutation<P> = CallAccess<P> & Readonly<{ operation: ModelOperationId }>
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]
export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return REASONING_EFFORTS.some(effort => effort === value)
}
export type Parameter =
  | Readonly<{ kind: 'temperature'; value: number }>
  | Readonly<{ kind: 'top-p'; value: number }>
  | Readonly<{ kind: 'max-output-tokens'; value: string }>
  | Readonly<{ kind: 'stop'; value: readonly string[] }>
  | Readonly<{
      kind: 'reasoning-effort'
      value: ReasoningEffort | 'none' | 'max'
      scale?: never
      basis?: never
    }>
  | Readonly<{
      kind: 'reasoning-effort'
      value: ReasoningEffort
      scale: 'unified'
      /** Present when the effort is the tenant's default for the model, not the session's choice. */
      basis?: 'preference'
    }>
  | Readonly<{ kind: 'seed'; value: string }>
  | Readonly<{ kind: 'frequency-penalty'; value: number }>
  | Readonly<{ kind: 'presence-penalty'; value: number }>
  | Readonly<{ kind: 'extension'; definition: Adoption; value: JsonValue }>
export type ToolDeclaration = Readonly<{
  name: string
  description: string
  argumentsSchema: JsonValue
}>
export type CredentialLayer =
  | Readonly<{ layer: 'tenant' }>
  | Readonly<{ layer: 'official' }>
  | Readonly<{ layer: 'none' }>
export type Supplier = Readonly<{
  adoption: Adoption
  provider: ProviderName
  model: string
  credential: CredentialLayer
}>
/** The context window of the profile a request was prepared on, as the profile said then. */
export type ContextWindow = Readonly<{ tokens: string; compactionTriggerPercent: string }>
/** What a fixed request of every kind states. */
export type RequestCommon = Readonly<{
  profile: Adoption
  suppliers: readonly [Supplier, ...Supplier[]]
  fallback: boolean
  retryPolicy: Adoption
  source: Adoption
}>
export type LlmRequest = Readonly<{
  kind: 'llm'
  contextWindow?: ContextWindow
  parameters: readonly Parameter[]
  system: readonly ContentBlock[]
  messages: readonly Message[]
  tools: readonly ToolDeclaration[]
  toolChoice: 'none' | 'auto' | 'required' | Readonly<{ name: string }>
  replay?: 'off'
  declarations: readonly [ReplayDeclaration, ...ReplayDeclaration[]]
  representation: Adoption
  parameterAdoptions: readonly ParameterAdoption[]
}>
export type DecisionsRequest = Readonly<{ kind: 'decisions'; ask: DecisionAsk }>
/** A live session: what it is told first, the conversation it continues, its voice, and how its media go. */
export type LiveRequest = Readonly<{
  kind: 'live'
  instructions: string
  history: readonly Message[]
  voice: string | null
  standby?: Readonly<{ idleSeconds: string }>
  media: Readonly<{ via: 'link'; audio: string }>
}>
export type LlmModelRequest = RequestCommon & LlmRequest
export type DecisionsModelRequest = RequestCommon & DecisionsRequest
export type LiveModelRequest = RequestCommon & LiveRequest
export type FixedModelRequest = LlmModelRequest | DecisionsModelRequest | LiveModelRequest
export type LlmRequestHead = Readonly<
  Omit<LlmModelRequest, 'system' | 'messages' | 'tools'> & {
    messageIds: readonly Message['id'][]
  }
>
export type DecisionsRequestHead = Readonly<Omit<DecisionsModelRequest, 'ask'>>
export type LiveRequestHead = Readonly<
  Omit<LiveModelRequest, 'instructions' | 'history'> & { messageIds: readonly Message['id'][] }
>
export type FixedRequestHead = LlmRequestHead | DecisionsRequestHead | LiveRequestHead
export type Admit<P> = Mutation<P> &
  Readonly<{
    request: FixedModelRequest
    consumer: ConsumerRef
  }>
