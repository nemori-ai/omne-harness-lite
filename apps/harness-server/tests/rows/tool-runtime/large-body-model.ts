import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import { LARGE_TOOL } from './large-body-author.ts'

export function largeBodyModel(final: string, readBody = false) {
  const requests: string[] = []
  const replies: string[] = []
  const errors: string[] = []
  let completed = false
  let lastRead: unknown
  const script: GatewayScript = ({ index, body }) => {
    requests.push(body)
    const request = JSON.parse(body) as {
      model: string
      messages: { role: string; content: string | { text: string }[] }[]
    }
    let args: unknown
    try {
      if (index > 199) throw new Error('forwarded result did not complete in 200 rounds')
      if (index === 0) {
        args = { command: 'execute', params: { name: LARGE_TOOL, command: null, arguments: {} } }
      } else {
        const latest = request.messages.findLast(message => message.role === 'tool')
        if (latest === undefined) throw new Error('missing tool reply')
        const text =
          typeof latest.content === 'string'
            ? latest.content
            : latest.content.map(block => block.text).join('\n')
        replies.push(text)
        if (
          readBody
            ? text.includes('Body traversal ended.')
            : text.includes('W3-BEGIN') && text.includes('W3-END') && text.includes('bodyReference')
        ) {
          completed = true
        } else {
          const status = text.startsWith('{')
            ? (JSON.parse(text) as { kind?: string; next?: { command: string; params: unknown } })
            : null
          if (status?.next?.command === 'read_result') {
            args = status.next
          } else if (status?.kind === 'pending' && lastRead !== undefined) {
            args = lastRead
          } else {
            const usages = [
              ...text.matchAll(/Tools\(command="read_result", params=(\{[^\n]*\})\)/gu),
            ]
            const candidates = usages.map(match => JSON.parse(match[1] ?? '') as { kind: string })
            const next =
              (readBody ? candidates.find(value => value.kind === 'body') : undefined) ??
              candidates.find(
                value =>
                  value.kind === 'forwarding' ||
                  value.kind === 'invocation' ||
                  value.kind === 'result',
              )
            if (next === undefined)
              throw new Error(`no recovery instruction: ${text.slice(0, 400)}`)
            args = { command: 'read_result', params: next }
          }
          lastRead = args
        }
      }
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : String(cause))
    }
    const events =
      args === undefined
        ? [
            { model: request.model, provider: 'OpenAI', choices: [{ delta: { content: final } }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
          ]
        : [
            {
              model: request.model,
              provider: 'OpenAI',
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `large-${index}`,
                        type: 'function',
                        function: { name: 'Tools', arguments: JSON.stringify(args) },
                      },
                    ],
                  },
                },
              ],
            },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
          ]
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
    }
  }
  return { script, requests, replies, errors, completed: () => completed }
}
