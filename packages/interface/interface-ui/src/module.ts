import { defaultBackoff, type Backoff } from '@omne-harness/client-assembly'
import {
  interfaceProtocol,
  type InspectionAsked,
  type InterfaceProtocol,
} from '@omne-harness/interface-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { answerRequests, type DrawPage } from './answer.ts'

export type InterfaceClient = ClientOf<InterfaceProtocol>
/** How the host application draws a page for the tenant whose request it is. */
export type DrawTenantPage = (
  asked: InspectionAsked,
  signal: AbortSignal,
  tenant: string,
) => ReturnType<DrawPage>
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>

export type InterfaceUiOptions = Readonly<{
  /** How the host application draws a page; without one every request is answered unsupported. */
  draw?: DrawTenantPage
  /** The name this client goes by on the server; one of its own making when none is given. */
  clientId?: () => string
  backoff?: Backoff
  sleep?: Sleep
}>

const pause: Sleep = (ms, signal) =>
  new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve(undefined)), {
      once: true,
    })
  })

const deniedEnd = (end: unknown): boolean => {
  const { kind, reason, outcome } = (end ?? {}) as Record<string, unknown>
  return (kind === 'ended' && reason === 'denied') || (kind === 'refused' && outcome === 'denied')
}

/** Keeps the observation of one tenant open, opening it again after a pause, until it is stopped or denied. */
async function serveTenant(
  client: InterfaceClient,
  text: string,
  id: string,
  options: InterfaceUiOptions,
  signal: AbortSignal,
): Promise<void> {
  const tenant = readTenantText(text)
  if (tenant === undefined) return
  const { backoff = defaultBackoff, sleep = pause, draw } = options
  const drawn: DrawPage | undefined = draw && ((asked, signal) => draw(asked, signal, text))
  for (let attempt = 0; !signal.aborted; attempt += 1) {
    const frames = client.observe['observe-requests']({ tenant, client: id }, { signal })
    let end: unknown
    const observed: AsyncIterator<InspectionAsked, unknown> = {
      next: async () => {
        const next = await frames.next()
        if (next.done === true) end = next.value
        return next
      },
    }
    try {
      await answerRequests(
        observed,
        drawn,
        (request, result) => client.deliver({ tenant, client: id, request, result }),
        signal,
      )
    } catch {}
    if (signal.aborted || deniedEnd(end)) return
    await sleep(backoff.delayMs(attempt), signal)
  }
}

/** Takes the requests of the tenant signed in while `interface/v1` is served, and answers each by asking the host to draw. */
export function createInterfaceUiModule(options: InterfaceUiOptions = {}) {
  return defineUiModule({
    name: 'interface-ui',
    needs: { inspections: needProtocol<InterfaceClient>(interfaceProtocol) },
    apply(shell, { inspections: client }) {
      const id = (options.clientId ?? (() => crypto.randomUUID()))()
      let serving: Readonly<{ tenant: string; stop: AbortController }> | undefined
      const follow = (): void => {
        const tenant = shell.login.state() === 'signed-in' ? shell.scope.get() : undefined
        if (tenant === serving?.tenant) return
        serving?.stop.abort()
        serving = undefined
        if (tenant === undefined) return
        const stop = new AbortController()
        serving = { tenant, stop }
        void serveTenant(client, tenant, id, options, stop.signal)
      }
      const unsubscribe = [shell.scope.subscribe(follow), shell.login.subscribe(follow)]
      follow()
      return () => {
        for (const each of unsubscribe) each()
        serving?.stop.abort()
      }
    },
  })
}
