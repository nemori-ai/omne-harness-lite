// Real-reader rounds for the Google revision 4 mechanism tests. Each stream is served by a
// local TLS host and read by the production reader through a transport bound to the V4
// candidate meter, so every detail entry a test plans with was produced by the reader.
import type { ServerOptions } from 'node:https'
import {
  invokeModel,
  type InvocationOutcome,
  type ModelInvocationResult,
  type PlanInput,
} from '@omne-harness-lite/model-request-runtime'
import { createPiAiTransport } from '../src/transport.ts'
import type { InputMeter } from '../src/input-meter.ts'
import {
  googleHistoryDefinition,
  googleHistoryMeter,
  googleHistoryTool,
} from './fixtures/google/history.ts'
import {
  appendGoogleRound,
  googleThreeRoundInput,
  type GoogleEffort,
} from './fixtures/google/three-round.ts'
import { fixture, policy } from './support.ts'

export const refused = {
  rejected: 'invalidInput',
  reason: 'input_size_unavailable',
  metrics: ['maxInputTokens'],
} as const

/** First-round request at the V4 binding, with the 2026-09-30 single lookup tool. */
export function googleHistoryRequest(modelId: string, effort: GoogleEffort = 'high'): PlanInput {
  return {
    ...googleThreeRoundInput(modelId, effort, true, googleHistoryDefinition(modelId)),
    tools: [googleHistoryTool],
  }
}

export function completed(result: InvocationOutcome): ModelInvocationResult {
  if (!('outcome' in result) || result.outcome !== 'complete')
    throw new Error(`expected a complete local reply: ${JSON.stringify(result)}`)
  return result
}

/** Append a reply, answering every complete tool call with a fixed result. */
export function followUp(
  request: PlanInput,
  reply: ModelInvocationResult,
  round: number,
): PlanInput {
  const calls = reply.blocks.flatMap(block =>
    block.kind === 'tool_call' && block.complete ? [block.callId] : [],
  )
  return appendGoogleRound(request, reply, {
    round,
    text: `Round ${round}: which code was found?`,
    ...(calls.length ? { toolResults: calls.map(callId => ({ callId, text: 'CEDAR=7' })) } : {}),
  })
}

export interface GoogleHost {
  readonly modelId: string
  readonly meter: InputMeter
  readonly transport: ReturnType<typeof createPiAiTransport>
  readonly requests: readonly { readonly body: string }[]
  /** Serve `sse` for the next HTTP request, replacing any unconsumed reply. */
  serve(sse: string): void
  invoke(request: PlanInput): Promise<InvocationOutcome>
  close(): Promise<void>
}

export async function openGoogleHost(tls: ServerOptions, modelId: string): Promise<GoogleHost> {
  const queue: string[] = []
  const definition = googleHistoryDefinition(modelId)
  const host = await fixture(
    tls,
    res => {
      const next = queue.shift()
      if (next === undefined) {
        res.writeHead(500)
        res.end('{"error":{"message":"unexpected local HTTP"}}')
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(next)
    },
    {},
    undefined,
    [definition],
  )
  const meter = googleHistoryMeter(modelId)
  const transport = createPiAiTransport({
    ...host.options,
    definitions: [definition],
    inputMeters: [meter],
  })
  return {
    modelId,
    meter,
    transport,
    requests: host.requests,
    // One reply per invocation; a reply left unconsumed by a failed test never leaks forward.
    serve: sse => {
      queue.length = 0
      queue.push(sse)
    },
    invoke: request =>
      invokeModel({
        ...request,
        transport,
        credential: 'google-local-credential',
        signal: new AbortController().signal,
        policy: policy(),
      }).outcome,
    close: async () => {
      await transport.close()
      await host.close()
    },
  }
}
