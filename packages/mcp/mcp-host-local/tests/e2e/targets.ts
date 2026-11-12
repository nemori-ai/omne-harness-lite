// The targets of the e2e journey: how each reference server is started, which protocol revision
// the journey expects on it, and which tool and arguments each step calls. The tool names and
// arguments come from the server's own sources and its `tools/list`.
import type { ConnectionTarget } from '@omne-harness/mcp-contract'
import { everythingHttp } from '../fixtures/sdk/everything.ts'

export type TargetId = 'E-http' | 'E-sse'

export type Call = Readonly<{ tool: string; args: unknown }>

/** What a target offers to the steps. A step that needs a call the target lacks stops with an error. */
export type TargetCalls = Readonly<{
  /** S1: a tool name the listing must contain. */
  known: string
  /** S2: a read-only call that the server answers as a result. */
  readOnly: Call & Readonly<{ text: string }>
  /** S3: a call that the server answers with `isError: true`. */
  toolError: Call
  /** S4: a call that asks for input; `answer` is the `inputResponses` of the retry. */
  input?: Readonly<{ call: Call; answer: unknown; expectedText: string }>
  /** S5: a call that the server answers with a task; `answer` goes to `provideTaskInput`. */
  task?: Readonly<{ call: Call; answer: unknown }>
  /** S6: a call that runs long enough to be cancelled and sends a progress notification early. */
  long?: Call
}>

export type StartedTarget = Readonly<{
  target: ConnectionTarget
  /** The protocol revision the journey expects the connection to negotiate. */
  revision: string
  calls: TargetCalls
  close(): Promise<void>
}>

export type Target = Readonly<{
  id: TargetId
  title: string
  /** The step numbers the journey must run on this target, in order. */
  steps: readonly string[]
  start(): Promise<StartedTarget>
}>

/** One progress notification per second, so that S6 sees the request arrive in a second. */
const LONG_CALL: Call = {
  tool: 'trigger-long-running-operation',
  args: { duration: 60, steps: 60 },
}

const EVERYTHING_CALLS: TargetCalls = {
  known: 'echo',
  readOnly: { tool: 'echo', args: { message: 'hi' }, text: 'Echo: hi' },
  // `echo` needs a `message`: the server answers the input validation error as a tool error.
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

/** The legacy revision has no task extension and no form input in this client (S4 and S5 do not apply). */
const EVERYTHING_LEGACY_CALLS: TargetCalls = {
  known: EVERYTHING_CALLS.known,
  readOnly: EVERYTHING_CALLS.readOnly,
  toolError: EVERYTHING_CALLS.toolError,
  long: LONG_CALL,
}

const ALL_STEPS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']

export const TARGETS: readonly Target[] = [
  {
    id: 'E-http',
    steps: ALL_STEPS,
    title: 'server-everything 2.1.0 on Streamable HTTP, revision 2026-07-28',
    async start() {
      const server = await everythingHttp('streamableHttp')
      return {
        target: server.target,
        revision: '2026-07-28',
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
        target: server.target,
        revision: '2025-11-25',
        calls: EVERYTHING_LEGACY_CALLS,
        close: () => server.close(),
      }
    },
  },
]
