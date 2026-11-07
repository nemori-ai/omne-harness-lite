import type { CallAccess, ToolBodyId, ToolResultVersion } from './identity.ts'
import type { InvocationAccess } from './operations.ts'
import type { Reply, ToolBodyRepresentation } from './results.ts'

export type ToolBodyReadRequest = Readonly<{
  result: ToolResultVersion
  bodyId: ToolBodyId
  after: string | null
  maxBytes: number
}>

export type ToolBodyPage = Readonly<{
  kind: 'text'
  result: ToolResultVersion
  bodyId: ToolBodyId
  representation: Extract<ToolBodyRepresentation, { kind: 'text' }>
  bodyBytes: string
  expiresAt: string
  position: string
  text: string
  next: string | null
}>

export interface ToolBodyReader<P> {
  read(input: CallAccess<P> & ToolBodyReadRequest): Reply<ToolBodyPage>
}

export interface ToolInvocationBodyReader<P> {
  read(input: InvocationAccess<P> & ToolBodyReadRequest): Reply<ToolBodyPage>
}
