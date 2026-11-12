// The transport factory: opens the line to the target of the material and hands over a session.
// It sends nothing and calls no credential handle (contract T9), and it re-checks the signal
// before it answers.
import { FIRST_MODERN_PROTOCOL_VERSION, type ProtocolVersions } from '@omne-harness/mcp-contract'
import type { McpTransportFactory, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { metadataFetcher } from './authorization.ts'
import { HttpLine } from './http-line.ts'
import type { Line } from './line.ts'
import { checkOptions, type LocalTransportOptions } from './options.ts'
import { Session } from './session.ts'

/** The modern revisions this transport speaks on `server/discover`, highest first. */
const VERSIONS: ProtocolVersions = [FIRST_MODERN_PROTOCOL_VERSION]

const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }

/**
 * The default defect outlet: the defect is thrown outside any promise, so the host's
 * uncaught-exception handling sees it instead of a rejection nobody hears.
 */
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
  }
  return {
    async open(material, signal) {
      if (signal.aborted) return { failure: NOT_SENT }
      const line: Line = new HttpLine(material.target, fetchFn)
      // The caller may have given up while the line was being opened (T9): nothing is handed over.
      if (signal.aborted) {
        await line.close()
        return { failure: NOT_SENT }
      }
      return { ok: new Session(line, material, sessionOptions) }
    },
  }
}
