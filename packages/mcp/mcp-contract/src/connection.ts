import { isModernProtocolVersion } from './revisions.ts'

export type ConnectionView = Readonly<{
  kind: 'streamable-http'
  version: string | undefined
  mode: 'streamable' | 'sse'
}>

export function isLegacyConnection(connection: ConnectionView): boolean {
  return connection.version !== undefined && !isModernProtocolVersion(connection.version)
}

export function checksListingHeaders(connection: ConnectionView): boolean {
  return connection.mode !== 'sse' && !isLegacyConnection(connection)
}

export function cancelsByNotification(connection: ConnectionView): boolean {
  return connection.mode === 'sse' || isLegacyConnection(connection)
}
