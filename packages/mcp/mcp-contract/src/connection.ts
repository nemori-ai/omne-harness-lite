// The rules a transport applies by its connection (SPEC T2, T5), once for every transport: the
// connection as those rules see it, whether it speaks a legacy revision, whether the listing
// headers are checked, and how a request is cancelled.
import { isModernProtocolVersion } from './revisions.ts'
import type { TransportMaterial } from './transport.ts'

/**
 * The connection as the T2 and T5 rules see it: the material, the revision the connection
 * negotiated (undefined before `discover` read an answer), and the legacy HTTP+SSE mode (T3).
 */
export type ConnectionView = Readonly<{
  kind: TransportMaterial['kind']
  version: string | undefined
  mode?: 'sse'
}>

/** A connection speaks a legacy revision once it negotiated one that is not modern (T3). */
export function isLegacyConnection(connection: ConnectionView): boolean {
  return connection.version !== undefined && !isModernProtocolVersion(connection.version)
}

/**
 * T2: the `x-mcp-header` declarations of a listing are checked on Streamable HTTP on the modern
 * revision only; stdio, a legacy revision and the legacy HTTP+SSE mode are not checked.
 */
export function checksListingHeaders(connection: ConnectionView): boolean {
  return (
    connection.kind === 'streamable-http' &&
    connection.mode !== 'sse' &&
    !isLegacyConnection(connection)
  )
}

/**
 * T5: stdio, Streamable HTTP on a legacy revision and the legacy HTTP+SSE mode cancel a request
 * with `notifications/cancelled`; Streamable HTTP on the modern revision ends its answer stream.
 */
export function cancelsByNotification(connection: ConnectionView): boolean {
  return connection.kind === 'stdio' || connection.mode === 'sse' || isLegacyConnection(connection)
}
