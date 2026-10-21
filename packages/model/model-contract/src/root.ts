// Declarations of the public-api chapter "根入口的值与请求".
import type { TenantId } from '@omne-harness/legal-identity'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Message } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type { CredentialId } from './credential.ts'
import type { ModelInvocationRef } from './reference.ts'
import type { ParameterAdoption } from './profile.ts'

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
  | 'ModelCredentialId'

export type ModelIdentityRejection<K extends ModelIdentityKey> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'prefix' | 'character' | 'leading-zero'
}>

export type Adoption = Readonly<{
  owner: string
  name: string
  revision: string
  digest: string
}>
export type ConsumerRef = Readonly<{
  owner: string
  work: string
  position: string
  purpose: string
}>
export type ActorRef = Readonly<{ owner: string; subject: string; revision: string }>
export type Access<P> = Readonly<{ principal: P; tenant: TenantId }>
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
export type Supplier = Readonly<{
  adoption: Adoption
  recipient: string
  model: string
  credential: Readonly<{ kind: 'tenant'; id: CredentialId }> | Readonly<{ kind: 'factory' }>
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
  /** `'off'` turns replay off for every dispatch of this request. */
  replay?: 'off'
  representation: Adoption
  parameterAdoptions: readonly ParameterAdoption[]
  source: Adoption
}>
export type ResultCapacity = Readonly<{
  bytes: string
  blocks: string
  attachmentBytes: string
}>
export type Admit<P> = Mutation<P> &
  Readonly<{
    request: FixedModelRequest
    consumer: ConsumerRef
    capacity: ResultCapacity
  }>
