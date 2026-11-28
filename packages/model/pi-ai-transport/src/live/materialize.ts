import type {
  MaterializationReceipt,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type {
  LiveSession,
  MaterializedLiveTransport,
  MaterializeFailure,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { CheckedConfig, CheckedRoute } from '../config.ts'
import { canonicalDigest } from '../canonical-json.ts'
import type { PiLiveSend } from '../send.ts'
import { openLiveSession, type LiveSocket, type LiveSocketFactory } from './session.ts'

// Node's own WebSocket takes the headers in its second argument; the DOM typing it carries does not say so.
type NodeSocketConstructor = new (
  url: URL,
  init: Readonly<{ headers: Readonly<Record<string, string>> }>,
) => LiveSocket
const nodeSocket: LiveSocketFactory = (url, headers) =>
  new (WebSocket as unknown as NodeSocketConstructor)(url, { headers })

const gone = (): LiveSession => ({
  facts: {
    [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
  },
  input: { send: () => 'closed', media: () => 'dropped', close: () => {} },
})

// One connection seat per live session, consumed by its one open in the send boundary's synchronous window where
// the credential is readable; the seat is freed when its socket is gone, or at close if it never opened.
export async function materializeLive(
  input: Readonly<{
    config: CheckedConfig
    route: CheckedRoute
    supplier: Supplier
    send: PiLiveSend
    signal: AbortSignal
  }>,
): Promise<Outcome<MaterializedLiveTransport, MaterializeFailure>> {
  const { config, route, supplier, send, signal } = input
  const reservation = await config.network.capacity.reserve(signal)
  if (reservation === undefined) return { failure: unavailable(signal.aborted) }
  const receipt: MaterializationReceipt = Object.freeze({
    supplier: supplier.adoption,
    representation: send.representation,
    payloadDigest: canonicalDigest(send.start),
  })
  return {
    ok: {
      receipt,
      open(openSignal) {
        const seat = reservation.consume()
        if (!('ok' in seat)) return gone()
        const secrets = config.credential.read()
        const secret = route.auth === null ? null : secrets?.get(route.auth.item)
        if (secrets === undefined || secret === undefined) {
          seat.ok.release()
          return gone()
        }
        return openLiveSession({
          url: route.url,
          headers: secret === null ? {} : { authorization: `Bearer ${secret}` },
          start: send.start,
          accounting: route.accounting,
          socket: config.liveSocket ?? nodeSocket,
          signal: openSignal,
          ended: () => seat.ok.release(),
        })
      },
      async close() {
        reservation.release()
      },
    },
  }
}

function unavailable(cancelled: boolean): TransportFailure {
  const diagnostic = cancelled ? 'cancelled' : 'network-closed'
  return { kind: 'unavailable', dependency: 'connection-capacity', diagnostic }
}
