import { FIRST_MODERN_PROTOCOL_VERSION, type ProtocolVersions } from '@omne-harness/mcp-contract'
import type { McpTransportFactory, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { metadataFetcher } from './authorization.ts'
import { HttpLine } from './http-line.ts'
import type { Line } from './line.ts'
import { checkOptions, type LocalTransportOptions } from './options.ts'
import { Session, type Scheduler } from './session.ts'
import { StdioLine } from './stdio-line.ts'

const VERSIONS: ProtocolVersions = [FIRST_MODERN_PROTOCOL_VERSION]

const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }

const schedule: Scheduler = (delayMs, fire) => {
  const timer = setTimeout(fire, delayMs)
  return () => clearTimeout(timer)
}

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
    probeTimeoutMs: options.probeTimeoutMs,
    fetchMetadata: metadataFetcher(fetchFn),
    schedule,
    reportDefect,
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
      if (signal.aborted) {
        await line.close()
        return { failure: NOT_SENT }
      }
      return { ok: new Session(line, material, sessionOptions) }
    },
  }
}
