import { accessProtocol } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'

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
