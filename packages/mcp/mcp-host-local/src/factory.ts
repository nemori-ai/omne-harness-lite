import { FIRST_MODERN_PROTOCOL_VERSION, type ProtocolVersions } from '@omne-harness/mcp-contract'
import type { McpTransportFactory, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { metadataFetcher } from './authorization.ts'
import { HttpLine } from './http-line.ts'
import type { Line } from './line.ts'
import { checkOptions, type LocalTransportOptions } from './options.ts'
import { Session } from './session.ts'

const VERSIONS: ProtocolVersions = [FIRST_MODERN_PROTOCOL_VERSION]

const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }

const reportDefect = (defect: unknown): void => {
  queueMicrotask(() => {
    throw defect
  })
}

export function createLocalTransportFactory(options: LocalTransportOptions): McpTransportFactory {
  checkOptions(options)
  const fetchFn = options.fetch ?? globalThis.fetch
  const sessionOptions = {
    clientInfo: { name: options.clientInfo.name, version: options.clientInfo.version },
    versions: VERSIONS,
    fetchMetadata: metadataFetcher(fetchFn),
    reportDefect,
    maxLongRequests: options.maxLongRequests,
  }
  return {
    async open(material, signal) {
      if (signal.aborted) return { failure: NOT_SENT }
      const line: Line = new HttpLine(material.target, fetchFn)
      if (signal.aborted) {
        await line.close()
        return { failure: NOT_SENT }
      }
      return { ok: new Session(line, material, sessionOptions) }
    },
  }
}
