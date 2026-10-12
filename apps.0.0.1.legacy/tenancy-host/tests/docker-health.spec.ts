import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { main } from '../src/index.ts'

const healthModule = new URL('../deploy/docker/health.mjs', import.meta.url)
const ready = {
  reachable: true,
  centerId: '3f9c1e0a7b2d4c6e8f0a1b2c3d4e5f60',
  version: '0.1.0',
  startedAt: '2026-09-23T08:00:00Z',
  storageReachable: true,
  deploymentKeyPresent: true,
  deploymentKeyComplete: true,
  clockSane: true,
  defectCount: 0,
  deploymentParameters: {
    unactivatedRetention: 604800000,
    invitationTtlDefault: 1209600000,
    affiliationRequestTtlDefault: 1209600000,
    copyNoticeTtlDefault: 604800000,
    sharingInvitationTtlDefault: 604800000,
  },
}

async function opsSocket(run: (directory: string, server: Server) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'omne-health-'))
  const server = createServer({ allowHalfOpen: true })
  try {
    await new Promise<void>(resolve =>
      server.listen(join(directory, 'governance-center-ops.sock'), resolve),
    )
    await run(directory, server)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
}

function response(value: unknown): string {
  const body = JSON.stringify(value)
  return `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
}

it('requires the full health body and rejects partial, malformed, or unhealthy replies', () => {
  const script = new URL('../deploy/docker/health.mjs', import.meta.url).pathname
  const evaluate = `import { fullHealthIsReady } from ${JSON.stringify(`file://${script}`)};
    const ready = { reachable:true, storageReachable:true, clockSane:true,
      deploymentKeyPresent:true, deploymentKeyComplete:true, defectCount:0 };
    process.stdout.write(JSON.stringify([
      fullHealthIsReady(JSON.stringify(ready) + '\\n'),
      fullHealthIsReady(JSON.stringify({ ...ready, storageReachable:false }) + '\\n'),
      fullHealthIsReady(JSON.stringify({ ...ready, defectCount:1 }) + '\\n'),
      fullHealthIsReady(JSON.stringify({ reachable:true }) + '\\n'),
      fullHealthIsReady('not-json\\n'),
      fullHealthIsReady(JSON.stringify(ready) + '\\nextra\\n')
    ]))`
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', evaluate], {
    encoding: 'utf8',
  })
  expect(JSON.parse(output)).toEqual([true, false, false, false, false, false])
})

it('uses the packaged public main and its real ops socket request for full health', async () => {
  const { runHealthProbe } = await import(healthModule.href)
  await opsSocket(async (directory, server) => {
    const request = new Promise<string>(resolve => {
      server.once('connection', socket => {
        const chunks: Buffer[] = []
        socket.on('data', chunk => chunks.push(chunk))
        socket.once('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'))
          socket.end(response(ready))
        })
      })
    })
    expect(await runHealthProbe({ socketDirectory: directory })).toBe(true)
    expect((await request).split('\r\n\r\n')[1]).toBe(
      '{"opsVersion":"1","operation":"full-health","payload":{}}',
    )
  })
})

it('expires an unanswered public-main socket read through the existing abort path', async () => {
  const { runHealthProbe } = await import(healthModule.href)
  await opsSocket(async (directory, server) => {
    let peer: Socket | undefined
    server.once('connection', socket => {
      peer = socket
      socket.resume()
    })
    try {
      const started = performance.now()
      expect(
        await runHealthProbe({
          socketDirectory: directory,
          deadlineMs: 100,
          loadCommand: async () => main,
        }),
      ).toBe(false)
      expect(peer).toBeDefined()
      expect(performance.now() - started).toBeLessThan(2_000)
      if (peer === undefined) throw new Error('ops socket was not connected')
      const socket = peer
      socket.on('error', () => {})
      const writeError = await new Promise<Error | undefined>(resolve =>
        socket.write('late response', error => resolve(error ?? undefined)),
      )
      expect(writeError).toMatchObject({ code: expect.stringMatching(/^(EPIPE|ECONNRESET)$/) })
    } finally {
      peer?.destroy()
    }
  })
})

it('rejects malformed, unhealthy, oversized and unsuccessful command output', async () => {
  const { runHealthProbe } = await import(healthModule.href)
  const unicodeReady = `${JSON.stringify({ ...ready, version: 'é' })}\n`
  const outputs = [
    { text: 'not-json\n', exit: 0 },
    { text: `${JSON.stringify({ ...ready, clockSane: false })}\n`, exit: 0 },
    { text: `${JSON.stringify(ready)}\n`, exit: 1 },
    { text: `${JSON.stringify(ready)}\n`, exit: 0, maxOutputBytes: 1 },
    { text: unicodeReady, exit: 0, maxOutputBytes: unicodeReady.length },
  ]
  for (const output of outputs) {
    expect(
      await runHealthProbe({
        maxOutputBytes: output.maxOutputBytes,
        loadCommand:
          async () => async (_argv: readonly string[], io: { stdout: (text: string) => void }) => {
            io.stdout(output.text)
            return output.exit
          },
      }),
    ).toBe(false)
  }
  expect(
    await runHealthProbe({
      loadCommand: async () => {
        throw new Error('distribution unavailable')
      },
    }),
  ).toBe(false)
})

it('does not start a request after slow module loading, even before the timer callback runs', async () => {
  const { runHealthProbe } = await import(healthModule.href)
  let calls = 0
  const result = await runHealthProbe({
    deadlineMs: 5,
    loadCommand: async () => {
      const until = performance.now() + 20
      while (performance.now() < until) {
        // Block this test turn so the monotonic deadline check runs before the timer callback.
      }
      return async () => {
        calls++
        return 0
      }
    },
  })
  expect(result).toBe(false)
  expect(calls).toBe(0)

  const lateResult = await runHealthProbe({
    deadlineMs: 5,
    loadCommand:
      async () => async (_argv: readonly string[], io: { stdout: (text: string) => void }) => {
        io.stdout(`${JSON.stringify(ready)}\n`)
        await new Promise(resolve => setTimeout(resolve, 20))
        return 0
      },
  })
  expect(lateResult).toBe(false)
})

it('has no child process path in the production health probe', () => {
  const source = readFileSync(healthModule, 'utf8')
  expect(source).not.toMatch(/node:child_process|execFile|spawn\(/)
})
