import { describe, expect, it } from 'vitest'

import { createPortFetch } from '../../src/port-fetch/client.ts'
import { type ElectronPortLike, fromElectronPort } from '../../src/port-fetch/ports.ts'
import { servePort } from '../../src/port-fetch/server.ts'

type Listener = (event: { data: unknown }) => void

/**
 * A port with Electron's `MessagePortMain` shape: `message` events wrap the data, nothing is
 * delivered before `start()`, messages are structured-cloned, and closing one side closes its peer.
 */
class FakeElectronPort implements ElectronPortLike {
  peer?: FakeElectronPort
  readonly #messageListeners = new Set<Listener>()
  readonly #closeListeners = new Set<Listener>()
  #started = false
  readonly #queue: unknown[] = []

  postMessage(message: unknown): void {
    this.peer?.receive(structuredClone(message))
  }

  on(event: 'message', listener: Listener): this
  on(event: 'close', listener: () => void): this
  on(event: 'message' | 'close', listener: Listener): this {
    ;(event === 'message' ? this.#messageListeners : this.#closeListeners).add(listener)
    return this
  }

  off(event: 'message', listener: Listener): this
  off(event: 'close', listener: () => void): this
  off(event: 'message' | 'close', listener: Listener): this {
    ;(event === 'message' ? this.#messageListeners : this.#closeListeners).delete(listener)
    return this
  }

  start(): void {
    this.#started = true
    for (const data of this.#queue.splice(0)) this.#emit(data)
  }

  close(): void {
    for (const listener of this.#closeListeners) listener({ data: undefined })
    if (this.peer) for (const listener of this.peer.#closeListeners) listener({ data: undefined })
  }

  receive(data: unknown): void {
    if (this.#started) this.#emit(data)
    else this.#queue.push(data)
  }

  #emit(data: unknown): void {
    queueMicrotask(() => {
      for (const listener of this.#messageListeners) listener({ data })
    })
  }
}

function electronLikeChannel(): [FakeElectronPort, FakeElectronPort] {
  const a = new FakeElectronPort()
  const b = new FakeElectronPort()
  a.peer = b
  b.peer = a
  return [a, b]
}

describe('fromElectronPort', () => {
  it('serves a request over Electron-shaped ports, starting them and unwrapping event.data', async () => {
    const [clientSide, serverSide] = electronLikeChannel()
    servePort(
      fromElectronPort(serverSide),
      request => new Response(`hello ${new URL(request.url).pathname}`),
    )
    const fetch = createPortFetch(fromElectronPort(clientSide))

    const response = await fetch(new Request('http://app.desktop/page'))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello /page')
  })

  it('fails pending requests when the port closes', async () => {
    const [clientSide, serverSide] = electronLikeChannel()
    servePort(fromElectronPort(serverSide), () => new Promise<Response>(() => {}))
    const fetch = createPortFetch(fromElectronPort(clientSide))

    const pending = fetch(new Request('http://app.desktop/slow'))
    await new Promise(resolve => setTimeout(resolve, 10))
    clientSide.close()

    await expect(pending).rejects.toThrow('The port closed')
  })
})
