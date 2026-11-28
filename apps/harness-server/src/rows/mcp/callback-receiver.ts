import { createServer, type Server } from 'node:http'
import type { CallbackQuery, CallbackOutcome } from '@omne-harness/mcp-authorization'
import type { CallbackReceiver } from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'

export type CallbackReceiverOptions = Readonly<{
  port: number
  answer(query: CallbackQuery): Promise<CallbackOutcome>
  /** Whether a begun connection still waits; when none does, the receiver closes. */
  awaiting(): boolean
  now(): number
}>

const PAGE = (text: string) =>
  `<!doctype html><html lang="zh"><meta charset="utf-8"><title>omne</title><p>${text}</p></html>`
const CONNECTED = PAGE('连上了，可以关掉这一页了。')
const NOT_CONNECTED = PAGE('没有连上。回到 omne 再连一次。')

function queryOf(url: URL): CallbackQuery {
  const read = (name: string) => url.searchParams.get(name) ?? undefined
  const fields = {
    state: read('state'),
    code: read('code'),
    error: read('error'),
    iss: read('iss'),
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

/** Listens on the loopback address while a begun connection may still come back; the page says only connected or not. */
export function createCallbackReceiver(
  options: CallbackReceiverOptions,
): CallbackReceiver & Readonly<{ close(): Promise<void>; listening(): boolean }> {
  let server: Server | undefined
  let leases: number[] = []
  let timer: NodeJS.Timeout | undefined
  let starting: Promise<boolean> | undefined
  const address = `http://127.0.0.1:${String(options.port)}/callback`

  async function close(): Promise<void> {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    const closing = server
    server = undefined
    leases = []
    if (closing !== undefined) await new Promise(resolve => closing.close(resolve))
  }

  function arm(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(settle, Math.max(0, Math.max(...leases) - options.now()))
    timer.unref()
  }

  // After a callback, or when the last lease runs out: close when nothing waits any more.
  function settle(): void {
    const now = options.now()
    leases = leases.filter(until => until > now)
    if (leases.length === 0 || !options.awaiting()) void close()
    else arm()
  }

  async function serve(url: URL): Promise<string> {
    const outcome = await options.answer(queryOf(url)).catch(() => 'unknown' as const)
    return outcome === 'connected' ? CONNECTED : NOT_CONNECTED
  }

  function listen(): Promise<boolean> {
    const made = createServer((request, response) => {
      const url = new URL(request.url ?? '/', address)
      if (request.method !== 'GET' || url.pathname !== '/callback') {
        response.writeHead(404).end()
        return
      }
      void serve(url).then(page => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
        settle()
      })
    })
    return new Promise(resolve => {
      made.once('error', () => resolve(false))
      made.listen(options.port, '127.0.0.1', () => {
        server = made
        resolve(true)
      })
    })
  }

  return {
    async open(until) {
      if (server === undefined) {
        starting ??= listen().finally(() => {
          starting = undefined
        })
        if (!(await starting)) return fail('unavailable')
      }
      leases.push(until)
      arm()
      return succeed(address)
    },
    close,
    listening: () => server !== undefined,
    address: () => address,
  }
}
