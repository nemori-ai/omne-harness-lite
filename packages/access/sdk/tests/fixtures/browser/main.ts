// The browser consumer of the client core (#1249 C15). It imports only `@omne-harness/sdk/core`
// and the common contract, so the `source` condition compiles the client core and its
// dependencies with the DOM library and without Node types. SPEC.md「浏览器夹具」 gives the
// bundle command and the browser run.
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'

/** Subscribes to the availability at `origin` and returns its first frame as one line. */
export async function firstAvailability(origin: string): Promise<string> {
  const access = createClient(accessProtocol, createHttpProtocolTransport({ origin }))
  const controller = new AbortController()
  const frames = access.observe.availability({}, { signal: controller.signal })
  const first = await frames.next()
  controller.abort()
  return first.done === true ? `ended: ${JSON.stringify(first.value)}` : JSON.stringify(first.value)
}

const origin = new URLSearchParams(location.search).get('origin') ?? location.origin
void firstAvailability(origin).then(
  line => {
    document.body.textContent = line
  },
  (error: unknown) => {
    document.body.textContent = `error: ${String(error)}`
  },
)
