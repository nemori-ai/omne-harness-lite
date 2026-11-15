import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect } from 'node:net'
import { rm } from 'node:fs/promises'
import type { Adoption } from './assembly.ts'
import { everythingHttp } from '../fixtures/sdk/everything.ts'

export type TargetId = 'E-stdio' | 'E-http' | 'E-sse' | 'F' | 'P'

export type Call = Readonly<{ tool: string; args: unknown }>

export type TargetCalls = Readonly<{
  known: string
  readOnly: Call & Readonly<{ text: string }>
  toolError: Call
  input?: Readonly<{ call: Call; answer: unknown; expectedText: string }>
  task?: Readonly<{ call: Call; answer: unknown }>
  long?: Call
}>

export type StartedTarget = Readonly<{
  adoption: Adoption
  revision: string
  released: 'root-only' | 'no-process'
  calls: TargetCalls
  close(): Promise<void>
}>

export type Target = Readonly<{
  id: TargetId
  title: string
  steps: readonly string[]
  unavailable?: string
  start(): Promise<StartedTarget>
}>

const NODE_MODULES = '../../node_modules/@modelcontextprotocol/'
const EVERYTHING_BIN = fileURLToPath(
  new URL(`${NODE_MODULES}server-everything/dist/index.js`, import.meta.url),
)
const FILESYSTEM_BIN = fileURLToPath(
  new URL(`${NODE_MODULES}server-filesystem/dist/index.js`, import.meta.url),
)
const FETCH_BIN = fileURLToPath(
  new URL('../../../../../.venv/bin/mcp-server-fetch', import.meta.url),
)

export const FETCH_MISSING =
  'mcp-server-fetch not installed: run uv sync --locked --group mcp-fixtures'

const LONG_CALL: Call = {
  tool: 'trigger-long-running-operation',
  args: { duration: 60, steps: 60 },
}

const EVERYTHING_CALLS: TargetCalls = {
  known: 'echo',
  readOnly: { tool: 'echo', args: { message: 'hi' }, text: 'Echo: hi' },
  toolError: { tool: 'echo', args: {} },
  input: {
    call: { tool: 'trigger-elicitation-request', args: {} },
    answer: { form: { action: 'accept', content: { name: 'omne' } } },
    expectedText: '- Name: omne',
  },
  task: {
    call: { tool: 'simulate-research-query', args: { topic: 'python', ambiguous: true } },
    answer: { clarification: { action: 'accept', content: { interpretation: 'programming' } } },
  },
  long: LONG_CALL,
}

const EVERYTHING_LEGACY_CALLS: TargetCalls = {
  known: EVERYTHING_CALLS.known,
  readOnly: EVERYTHING_CALLS.readOnly,
  toolError: EVERYTHING_CALLS.toolError,
  long: LONG_CALL,
}

async function closedPort(): Promise<number> {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 40_000)
    const listening = await new Promise<boolean>(resolve => {
      const socket = connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
    })
    if (!listening) return port
  }
}

async function pageServer(): Promise<Readonly<{ url: string; close(): Promise<void> }>> {
  const server: Server = createServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.setHeader('content-type', 'text/plain')
      response.end('User-agent: *\nAllow: /\n')
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end('<html><body><h1>Hi</h1></body></html>')
  })
  const port = await closedPort()
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

const ALL_STEPS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']

export const TARGETS: readonly Target[] = [
  {
    id: 'E-stdio',
    steps: ALL_STEPS,
    title: 'server-everything 2.1.0 on stdio, revision 2026-07-28',
    async start() {
      return {
        adoption: {
          transport: 'stdio',
          launch: { command: process.execPath, args: [EVERYTHING_BIN, 'stdio'] },
        },
        revision: '2026-07-28',
        released: 'root-only',
        calls: EVERYTHING_CALLS,
        close: async () => undefined,
      }
    },
  },
  {
    id: 'E-http',
    steps: ALL_STEPS,
    title: 'server-everything 2.1.0 on Streamable HTTP, revision 2026-07-28',
    async start() {
      const server = await everythingHttp('streamableHttp')
      return {
        adoption: { transport: 'streamable-http', target: server.target },
        revision: '2026-07-28',
        released: 'no-process',
        calls: EVERYTHING_CALLS,
        close: () => server.close(),
      }
    },
  },
  {
    id: 'E-sse',
    steps: ['S1', 'S2', 'S3', 'S6', 'S7'],
    title: 'server-everything 2.1.0 on legacy HTTP+SSE, revision 2025-11-25',
    async start() {
      const server = await everythingHttp('sse')
      return {
        adoption: { transport: 'streamable-http', target: server.target },
        revision: '2025-11-25',
        released: 'no-process',
        calls: EVERYTHING_LEGACY_CALLS,
        close: () => server.close(),
      }
    },
  },
  {
    id: 'F',
    steps: ['S1', 'S2', 'S3', 'S7'],
    title: 'server-filesystem 2.1.0 on stdio, revision 2026-07-28',
    async start() {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-e2e-fs-')))
      writeFileSync(join(root, 'a.txt'), 'hello')
      return {
        adoption: {
          transport: 'stdio',
          launch: { command: process.execPath, args: [FILESYSTEM_BIN, root] },
        },
        revision: '2026-07-28',
        released: 'root-only',
        calls: {
          known: 'read_text_file',
          readOnly: { tool: 'read_text_file', args: { path: join(root, 'a.txt') }, text: 'hello' },
          toolError: { tool: 'read_text_file', args: { path: join(root, 'missing.txt') } },
        },
        close: () => rm(root, { recursive: true, force: true }),
      }
    },
  },
  {
    id: 'P',
    steps: ['S1', 'S2', 'S3', 'S7'],
    title: 'mcp-server-fetch 2026.10.28 (Python) on stdio, revision 2026-07-28',
    ...(existsSync(FETCH_BIN) ? {} : { unavailable: FETCH_MISSING }),
    async start() {
      const pages = await pageServer()
      const unreachable = await closedPort()
      return {
        adoption: {
          transport: 'stdio',
          launch: { command: FETCH_BIN, args: ['--allow-private-ips', '--no-readability-js'] },
        },
        revision: '2026-07-28',
        released: 'root-only',
        calls: {
          known: 'fetch',
          readOnly: { tool: 'fetch', args: { url: `${pages.url}/page` }, text: '# Hi' },
          toolError: { tool: 'fetch', args: { url: `http://127.0.0.1:${unreachable}/` } },
        },
        close: () => pages.close(),
      }
    },
  },
]
