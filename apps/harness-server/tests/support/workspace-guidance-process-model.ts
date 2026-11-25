import type { GatewayAnswer } from '../fixtures/model-gateway.ts'

type Call = Readonly<{ id: string; tool: string; arguments: string }>

/** The external scripted endpoint answers in chat terms; model-gateway renders the requested wire API. */
export function processModelReply(
  body: string,
  calls: readonly Call[],
  text = 'done',
): GatewayAnswer {
  const serving = {
    model: (JSON.parse(body) as { model?: string }).model ?? 'm',
    provider: 'OpenAI',
  }
  const events =
    calls.length === 0
      ? [
          { ...serving, choices: [{ delta: { content: text } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]
      : [
          {
            ...serving,
            choices: [
              {
                delta: {
                  tool_calls: calls.map((call, index) => ({
                    index,
                    id: call.id,
                    type: 'function',
                    function: { name: call.tool, arguments: call.arguments },
                  })),
                },
              },
            ],
          },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]
  return {
    status: 200,
    contentType: 'text/event-stream',
    body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
  }
}

export function processFillerText(ordinal: number): string {
  return `FILLER_OS_${ordinal}_START` + ' z'.repeat(120000) + ` FILLER_OS_${ordinal}_END`
}
