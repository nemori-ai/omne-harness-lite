// Client over the SDK's StdioClientTransport. Run: node --experimental-strip-types client-stdio.ts
import { Client, SdkError, ProtocolError } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import * as z from 'zod/v4'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const log = (label: string, v?: unknown) => console.error(`\n## ${label}\n` + (v === undefined ? '' : JSON.stringify(v, null, 2)))
const errInfo = (e: unknown) =>
  e instanceof SdkError || e instanceof ProtocolError
    ? { class: e.constructor.name, code: (e as any).code, message: e.message, data: (e as any).data }
    : { other: String(e) }

const TASKS_EXT = 'io.modelcontextprotocol/tasks'
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--experimental-strip-types', join(here, 'server.ts')],
  stderr: 'pipe',
})
transport.stderr?.on('data', (d) => process.stderr.write(String(d).replace(/^/gm, '    | ')))

// Raw tap: see every inbound frame and outbound frame the Client exchanges.
const wire: Array<{ dir: 'out' | 'in'; msg: any }> = []
const origSend = transport.send.bind(transport)
transport.send = async (m) => {
  wire.push({ dir: 'out', msg: m })
  return origSend(m)
}

const client = new Client(
  { name: 'w2-spike-client', version: '0.0.1' },
  {
    capabilities: { elicitation: { form: {} }, extensions: { [TASKS_EXT]: {} } } as never,
    versionNegotiation: { mode: 'auto' },
  },
)
// Auto-fulfilment of input_required goes through the SAME elicitation handler.
let elicitCalls = 0
client.setRequestHandler('elicitation/create', async (req) => {
  elicitCalls++
  log('elicitation handler got', req.params)
  return { action: 'accept', content: { name: 'Ada' } }
})

const t0 = Date.now()
// Inbound tap: intercept whatever onmessage the Client installs.
let inner: ((m: any, extra?: any) => void) | undefined
Object.defineProperty(transport, 'onmessage', {
  configurable: true,
  get: () => (inner ? (m: any, extra?: any) => { wire.push({ dir: 'in', msg: m }); inner!(m, extra) } : undefined),
  set: (f) => { inner = f },
})
await client.connect(transport)
log('connect ms', Date.now() - t0)
log('era / negotiated version', { era: client.getProtocolEra(), version: client.getNegotiatedProtocolVersion(), pid: transport.pid })
log('getDiscoverResult()', client.getDiscoverResult())
log('getServerCapabilities()', client.getServerCapabilities())
log('getServerVersion()', client.getServerVersion())
log('getInstructions()', client.getInstructions())

// listTools: single page with explicit cursor (undefined cursor -> aggregate), then aggregate.
const page = await client.listTools({ cursor: undefined as never })
log('listTools({cursor:undefined}) keys / nextCursor / ttlMs', { keys: Object.keys(page), nextCursor: page.nextCursor, ttlMs: (page as any).ttlMs, n: page.tools.length })
const all = await client.listTools(undefined, { cacheMode: 'bypass' })
log('listTools() aggregate', { names: all.tools.map((t) => t.name), keys: Object.keys(all), echo: all.tools.find((t) => t.name === 'echo') })
try {
  const p2 = await client.listTools({ cursor: 'bogus' })
  log('listTools({cursor:"bogus"})', p2)
} catch (e) {
  log('listTools({cursor:"bogus"}) threw', errInfo(e))
}

// echo with progress
const progress: unknown[] = []
const echo = await client.callTool({ name: 'echo', arguments: { text: 'hi' } }, { onprogress: (p) => progress.push(p) })
log('callTool(echo)', { result: echo, progress })

// ask, auto-fulfilled
const ask = await client.callTool({ name: 'ask', arguments: {} })
log('callTool(ask) auto-fulfil', { result: ask, elicitCalls })

// ask, manual: allowInputRequired
const ir: any = await client.callTool({ name: 'ask', arguments: {} }, { allowInputRequired: true } as never)
log('callTool(ask, allowInputRequired) first round', ir)
const retry = await client.callTool(
  { name: 'ask', arguments: {}, inputResponses: { who: { action: 'accept', content: { name: 'Bob' } } }, requestState: ir.requestState } as never,
  { allowInputRequired: true } as never,
)
log('callTool(ask) manual retry', retry)

// slow: task. The Client funnel cannot read resultType 'task'.
let createTask: any
try {
  const r = await client.callTool({ name: 'slow', arguments: { ms: 300 } })
  log('callTool(slow) unexpectedly resolved', r)
} catch (e) {
  log('callTool(slow) threw', errInfo(e))
  createTask = [...wire].reverse().find((w) => w.dir === 'in' && w.msg.result?.resultType === 'task')?.msg
  log('raw CreateTaskResult from tap', createTask)
}
const TaskSchema = z.object({ taskId: z.string(), status: z.string() }).loose()
if (createTask) {
  const taskId = createTask.result.task.taskId
  for (let i = 0; i < 20; i++) {
    const g = await client.request({ method: 'tasks/get', params: { taskId } }, TaskSchema)
    if (i === 0 || g.status !== 'working') log(`tasks/get #${i}`, g)
    if (g.status !== 'working') break
    await new Promise((r) => setTimeout(r, 50))
  }
  // cancel a second task
  const before = wire.length
  try {
    await client.callTool({ name: 'slow', arguments: { ms: 5000 } })
  } catch {}
  const t2 = wire.slice(before).find((w) => w.dir === 'in' && w.msg.result?.resultType === 'task')?.msg.result.task.taskId
  const c = await client.request({ method: 'tasks/cancel', params: { taskId: t2 } }, z.object({}).loose())
  log('tasks/cancel ack', c)
  log('tasks/get after cancel', await client.request({ method: 'tasks/get', params: { taskId: t2 } }, TaskSchema))
  const u = await client.request({ method: 'tasks/update', params: { taskId: t2, inputResponses: { q1: { action: 'accept', content: { x: 1 } } } } }, z.object({}).loose())
  log('tasks/update ack', u)
  log('tasks/update outbound frame', wire.filter((w) => w.dir === 'out' && w.msg.method === 'tasks/update').at(-1)?.msg)
  try {
    await client.request({ method: 'tasks/get', params: { taskId: 'nope' } }, TaskSchema)
  } catch (e) {
    log('tasks/get unknown task threw', errInfo(e))
  }
  try {
    await client.request({ method: 'tasks/result', params: { taskId } }, z.object({}).loose())
  } catch (e) {
    log('tasks/result on modern era threw', errInfo(e))
  }
}

// cancel of an in-flight request on stdio: abort the signal
const ac = new AbortController()
const before = wire.length
const pending = client.callTool({ name: 'slow', arguments: { ms: 500, inline: true } }, { signal: ac.signal })
setTimeout(() => ac.abort('user-cancel'), 10)
try {
  await pending
} catch (e) {
  log('aborted call threw', errInfo(e))
}
await new Promise((r) => setTimeout(r, 50))
log('wire frames for aborted call (out)', wire.slice(before).filter((w) => w.dir === 'out').map((w) => w.msg))

log('sample outbound request with auto _meta envelope', wire.find((w) => w.dir === 'out' && w.msg.method === 'tools/call')?.msg)
log('sample inbound result _meta', wire.find((w) => w.dir === 'in' && w.msg.result?._meta)?.msg.result._meta)
await client.close()
log('closed; child pid was', transport.pid)
