// The in-process transport (#1249 spec 已定 17): for tests. The peer answers in the same process;
// every body, opening and frame crosses as JSON text, so the two sides share no value.
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { defaultLimits } from '../limits.ts'
import type { CallReport, ObserveEnd, Transport } from './transport.ts'

function copy(value: JsonValue): JsonValue {
  const read = readJsonText(writeJsonText(value), defaultLimits)
  if (read.kind !== 'ok') throw new TypeError('in-process transport: a value did not cross as JSON')
  return read.value
}

/** A transport whose peer is `peer`, called in this process with copies of every value. */
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
        // The caller stopped early: close the peer's stream. Closing one that ended does nothing.
        await stream.return({ kind: 'aborted' })
      }
    },
  }
}
