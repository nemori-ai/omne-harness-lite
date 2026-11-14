import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { defaultLimits } from '../limits.ts'
import type { CallReport, ObserveEnd, Transport } from './transport.ts'

function copy(value: JsonValue): JsonValue {
  const read = readJsonText(writeJsonText(value), defaultLimits)
  if (read.kind !== 'ok') throw new TypeError('in-process transport: a value did not cross as JSON')
  return read.value
}

export function createInProcessTransport(peer: Transport): Transport {
  return {
    async call(request): Promise<CallReport> {
      const report = await peer.call({ ...request, body: copy(request.body) })
      return report.kind === 'answered' ? { ...report, body: copy(report.body) } : report
    },
    async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
      const stream = peer.observe({ ...request, open: copy(request.open) })
      try {
        for (;;) {
          const next = await stream.next()
          if (next.done === true) return next.value
          yield copy(next.value)
        }
      } finally {
        await stream.return({ kind: 'aborted' })
      }
    },
  }
}
