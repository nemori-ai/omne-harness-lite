import type { ConnectionTarget } from '@omne-harness/mcp-contract'
import { everythingHttp } from '../fixtures/sdk/everything.ts'

export type TargetId = 'E-http' | 'E-sse'

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
  target: ConnectionTarget
  revision: string
  calls: TargetCalls
  close(): Promise<void>
}>

export type Target = Readonly<{
  id: TargetId
  title: string
  steps: readonly string[]
  start(): Promise<StartedTarget>
}>

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

const ALL_STEPS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']

export const TARGETS: readonly Target[] = [
  {
    id: 'E-http',
    steps: ALL_STEPS,
    title: 'server-everything 2.3.1 on Streamable HTTP, revision 2026-07-28',
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
    title: 'server-everything 2.3.1 on legacy HTTP+SSE, revision 2025-11-25',
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
