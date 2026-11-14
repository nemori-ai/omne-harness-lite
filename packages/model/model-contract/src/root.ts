import type { Access } from '@omne-harness/legal-identity'
import type { Adoption, ConsumerRef } from '@omne-harness/exchange-refs'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type { ModelInvocationRef } from './reference.ts'
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
export type Parameter =
  | Readonly<{ kind: 'temperature'; value: number }>
  | Readonly<{ kind: 'top-p'; value: number }>
  | Readonly<{ kind: 'max-output-tokens'; value: string }>
  | Readonly<{ kind: 'stop'; value: readonly string[] }>
  | Readonly<{ kind: 'reasoning-effort'; value: 'none' | 'low' | 'medium' | 'high' | 'max' }>
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
export type FixedModelRequest = Readonly<{
  profile: Adoption
  suppliers: readonly [Supplier, ...Supplier[]]
  fallback: boolean
  retryPolicy: Adoption
  parameters: readonly Parameter[]
  system: readonly ContentBlock[]
  messages: readonly Message[]
  tools: readonly ToolDeclaration[]
  toolChoice: 'none' | 'auto' | 'required' | Readonly<{ name: string }>
  replay?: 'off'
  declarations: readonly [ReplayDeclaration, ...ReplayDeclaration[]]
  representation: Adoption
  parameterAdoptions: readonly ParameterAdoption[]
  source: Adoption
}>
export type FixedRequestHead = Readonly<
  Omit<FixedModelRequest, 'system' | 'messages' | 'tools'> & {
    messageIds: readonly Message['id'][]
  }
>
export type Admit<P> = Mutation<P> &
  Readonly<{
    request: FixedModelRequest
    consumer: ConsumerRef
  }>
