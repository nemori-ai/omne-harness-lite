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

/** The key of the body an author writes its running output into. */
export const OUTPUT_BODY_KEY = 'output'

/** Where to read the output body of a call from: after a byte position, at most so many bytes. */
export type ToolOutputReadRequest = Readonly<{ after: string | null; maxBytes: number }>

/** None written, or one part: byte offsets; `through` starts the next read, `total` is kept. */
export type CallOutput =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'open' | 'sealed'
      from: string
      through: string
      total: string
      text: string
    }>

export interface ToolBodyReader<P> {
  read(input: CallAccess<P> & ToolBodyReadRequest): Reply<ToolBodyPage>
}

export interface ToolInvocationBodyReader<P> {
  read(input: InvocationAccess<P> & ToolBodyReadRequest): Reply<ToolBodyPage>
}
