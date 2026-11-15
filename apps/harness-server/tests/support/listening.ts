import { connect, createServer } from 'node:net'

export const TELEMETRY_ROW_CONFIG = Object.freeze({
  implementation: 'node',
  outlet: { kind: 'stdout' },
  budgets: {
    maxRecordBytes: 65_536,
    maxQueueItems: 1024,
    maxQueueBytes: 1_048_576,
    maxOpenSegments: 16,
    maxLogTextLength: 4096,
    summaryIntervalMs: 1000,
  },
})

function releasedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

async function fetchWouldConnect(port: number): Promise<boolean> {
  const failure: unknown = await fetch(`http://127.0.0.1:${port}/`).then(
    () => undefined,
    (error: unknown) => error,
  )
  const cause = failure instanceof Error ? failure.cause : undefined
  return (
    typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ECONNREFUSED'
  )
}

export async function freePort(): Promise<number> {
  for (;;) {
    const port = await releasedPort()
    if (await fetchWouldConnect(port)) return port
  }
}

export function connectable(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host, port, timeout: 1000 }, () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export async function until(
  ready: () => boolean | Promise<boolean>,
  what: string,
  ms = 5000,
): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(10)
  }
}
