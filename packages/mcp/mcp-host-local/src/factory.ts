// The transport factory: opens the line that the material names and hands over a session. It
// sends nothing and calls no credential handle (contract T9): `open` only starts the readers of a
// stdio process, and it re-checks the signal before it answers.
import { FIRST_MODERN_PROTOCOL_VERSION } from '@omne-harness/mcp-contract'
import type { McpTransportFactory, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { metadataFetcher } from './authorization.ts'
import { HttpLine } from './http-line.ts'
import type { Line } from './line.ts'
import { checkOptions, type LocalTransportOptions } from './options.ts'
import { Session } from './session.ts'
import { StdioLine } from './stdio-line.ts'

/** The modern revisions this transport speaks on `server/discover`, highest first. */
const VERSIONS: readonly string[] = [FIRST_MODERN_PROTOCOL_VERSION]

const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }

export function createLocalTransportFactory(options: LocalTransportOptions): McpTransportFactory {
  checkOptions(options)
  const fetchFn = options.fetch ?? globalThis.fetch
  const sessionOptions = {
    clientInfo: { name: options.clientInfo.name, version: options.clientInfo.version },
    versions: VERSIONS,
    probeTimeoutMs: options.probeTimeoutMs,
    fetchMetadata: metadataFetcher(fetchFn),
  }
  return {
    async open(material, signal) {
      if (signal.aborted) return { failure: NOT_SENT }
      let line: Line
      if (material.kind === 'stdio') {
        const stdio = new StdioLine(material.process)
        await stdio.ready()
        line = stdio
      } else line = new HttpLine(material.target, fetchFn)
      // The caller may have given up while the line was being opened (T9): nothing is handed over.
      if (signal.aborted) {
        await line.close()
        return { failure: NOT_SENT }
      }
      return { ok: new Session(line, material, sessionOptions) }
    },
  }
}
