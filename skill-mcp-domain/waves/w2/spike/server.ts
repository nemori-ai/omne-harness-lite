// Spike server: echo (outputSchema + structuredContent), ask (input_required elicit + requestState),
// slow (a task: the SDK has no task runtime on 2026-07-28, so the handler hand-builds
// `resultType: 'task'` and the tasks/* methods are registered as custom-schema handlers).
// Run: node --experimental-strip-types server.ts   (stdio; log to stderr only)
import { McpServer, inputRequired, acceptedContent, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server'
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { appendFileSync } from 'node:fs'
import * as z from 'zod/v4'

const log = (...a: unknown[]) => console.error('[server]', ...a)
const TASKS_EXT = 'io.modelcontextprotocol/tasks'

type TaskRec = {
  taskId: string
  status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  lastUpdatedAt: string
  ttl: number
  pollInterval: number
  result?: unknown
  error?: unknown
  inputRequests?: unknown
  timer?: NodeJS.Timeout
}
// Module level: serveStdio builds one McpServer per connection AND one per discarded discover probe.
const tasks = new Map<string, TaskRec>()
let seq = 0
const now = () => new Date().toISOString()
const view = (t: TaskRec) => {
  const { timer: _t, ...rest } = t
  return rest
}
const lookup = (taskId: string) => {
  const t = tasks.get(taskId)
  if (!t) throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Task not found or expired: ${taskId}`, { taskId })
  return t
}

export function build(): McpServer {
  const server = new McpServer(
    { name: 'w2-spike-server', version: '0.0.1' },
    {
      capabilities: { tools: {}, extensions: { [TASKS_EXT]: {} } } as never,
      instructions: 'Spike server. echo, ask, slow.',
    },
  )

  server.registerTool(
    'echo',
    {
      description: 'Echo the text back',
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ echoed: z.string(), length: z.number() }),
    },
    async ({ text }, ctx) => {
      const token = ctx.mcpReq._meta?.progressToken
      if (token !== undefined) {
        await ctx.mcpReq.notify({ method: 'notifications/progress', params: { progressToken: token, progress: 1, total: 1, message: 'echoing' } })
      }
      const out = { echoed: text, length: text.length }
      return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out }
    },
  )

  const confirmSchema = z.object({ name: z.string() })
  server.registerTool('ask', { description: 'Ask for a name via form elicitation', inputSchema: z.object({}) }, async (_args, ctx) => {
    const state = ctx.mcpReq.requestState()
    const answer = acceptedContent(ctx.mcpReq.inputResponses, 'who', confirmSchema)
    log('ask round', { state, inputResponses: ctx.mcpReq.inputResponses })
    if (answer === undefined || state !== 'ask-round-1') {
      return inputRequired({
        inputRequests: { who: inputRequired.elicit({ message: 'Your name?', requestedSchema: confirmSchema }) },
        requestState: 'ask-round-1',
      })
    }
    return { content: [{ type: 'text', text: `hello ${answer.name}` }] }
  })

  server.registerTool('slow', { description: 'Runs as a task', inputSchema: z.object({ ms: z.number(), inline: z.boolean().optional() }) }, async ({ ms, inline }, ctx) => {
    const declared = (ctx.mcpReq.envelope as any)?.['io.modelcontextprotocol/clientCapabilities']?.extensions?.[TASKS_EXT]
    log('slow: client tasks extension declared =', declared !== undefined, 'envelope keys', Object.keys(ctx.mcpReq.envelope ?? {}))
    if (declared === undefined || inline === true) {
      const sig = ctx.mcpReq.signal
      sig.addEventListener('abort', () => log('slow inline: ctx.mcpReq.signal aborted, reason =', String(sig.reason)))
      // Without the extension the call runs inline.
      await new Promise((r) => setTimeout(r, ms))
      return { content: [{ type: 'text', text: `slept ${ms} inline` }] }
    }
    const taskId = `task-${++seq}`
    const t: TaskRec = { taskId, status: 'working', createdAt: now(), lastUpdatedAt: now(), ttl: 60_000, pollInterval: 50 }
    t.timer = setTimeout(() => {
      if (t.status !== 'working') return
      t.status = 'completed'
      t.lastUpdatedAt = now()
      t.result = { resultType: 'complete', content: [{ type: 'text', text: `slept ${ms}` }] }
    }, ms)
    tasks.set(taskId, t)
    // Hand-built: McpServer's typed return has no CreateTaskResult; the 2026 encode seam
    // passes a non-'complete' resultType through verbatim for tools/call.
    // `content: []` is needed: McpServer validates every non-input_required tools/call result
    // against CallToolResult (content required) before the encode seam.
    return { resultType: 'task', task: view(t), content: [] } as never
  })

  const TaskIdParams = z.object({ taskId: z.string() }).loose()
  server.server.setRequestHandler('tasks/get', { params: TaskIdParams }, async ({ taskId }) => {
    const t = lookup(taskId)
    return view(t) as never
  })
  server.server.setRequestHandler(
    'tasks/update',
    // The protocol layer LIFTS `inputResponses`/`requestState` off every inbound params object
    // before dispatch, so the handler reads them from ctx.mcpReq, not from params.
    { params: TaskIdParams },
    async (params, ctx) => {
      lookup(params.taskId)
      log('tasks/update params =', JSON.stringify(params), 'ctx.mcpReq.inputResponses =', JSON.stringify(ctx.mcpReq.inputResponses))
      return {} as never
    },
  )
  server.server.setRequestHandler('tasks/cancel', { params: TaskIdParams }, async ({ taskId }) => {
    const t = lookup(taskId)
    if (t.status === 'working' || t.status === 'input_required') {
      clearTimeout(t.timer)
      t.status = 'cancelled'
      t.lastUpdatedAt = now()
    }
    return {} as never
  })
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  log('starting pid', process.pid)
  appendFileSync(new URL('./spawn-log.txt', import.meta.url), `${process.pid} ${process.argv.slice(2).join(' ')}\n`)
  if (process.argv.includes('--legacy')) {
    // Hand-wired McpServer.connect(StdioServerTransport): a 2025-era-only server.
    await build().connect(new StdioServerTransport())
  } else {
    serveStdio(() => build(), { onerror: (e) => log('onerror', e.message) })
  }
}
