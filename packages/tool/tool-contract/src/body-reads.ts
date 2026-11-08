import type { CallAccess, ToolBodyId, ToolResultVersion } from './identity.ts'
import type { InvocationAccess } from './operations.ts'
import type { Reply, ToolBodyRepresentation } from './results.ts'
import type { JsonValue } from '@omne-harness/json-text'

export type ToolBodyReadRequest = Readonly<{
  result: ToolResultVersion
  bodyId: ToolBodyId
  after: string | null
  maxBytes: number
}>

type BodyPagePosition = Readonly<{
  result: ToolResultVersion
  bodyId: ToolBodyId
  bodyBytes: string
  expiresAt: string
  position: string
  next: string | null
}>

export type ToolBodyPage = BodyPagePosition &
  (
    | Readonly<{
        kind: 'text'
        text: string
        representation: Extract<ToolBodyRepresentation, { kind: 'text' }>
      }>
    | Readonly<{
        kind: 'json-document'
        text: string
        representation: Extract<ToolBodyRepresentation, { kind: 'json-document' }>
        completeness: 'complete' | 'fragment'
      }>
    | Readonly<{
        kind: 'json-lines'
        representation: Extract<ToolBodyRepresentation, { kind: 'json-lines' }>
        records: readonly JsonValue[]
      }>
  )

export interface ToolBodyReader<P> {
  read(input: CallAccess<P> & ToolBodyReadRequest): Reply<ToolBodyPage>
}

export interface ToolInvocationBodyReader<P> {
  read(input: InvocationAccess<P> & ToolBodyReadRequest): Reply<ToolBodyPage>
}
