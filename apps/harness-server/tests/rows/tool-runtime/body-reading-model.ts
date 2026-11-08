import type { GatewayScript } from '../../fixtures/model-gateway.ts'

const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected an object')
  return Object.fromEntries(Object.entries(value))
}

const toolText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) throw new Error('expected tool content')
  return value
    .map(part => {
      const text = object(part)['text']
      if (typeof text !== 'string') throw new Error('expected text content')
      return text
    })
    .join('\n')
}

export function bodyReadingModel(shellScript: string, final: string) {
  const requests: string[] = []
  const tools: string[] = []
  const reads: { kind: string; reference: string; after: string | null }[] = []
  const errors: string[] = []
  let ended = false
  const script: GatewayScript = ({ index, body }) => {
    requests.push(body)
    let call: { name: string; arguments: string } | undefined
    let model = 'unknown'
    try {
      const request = object(JSON.parse(body))
      if (typeof request['model'] === 'string') model = request['model']
      if (index >= 39) throw new Error('body traversal exceeded 40 model rounds')
      if (index === 0) {
        call = {
          name: 'Shell',
          arguments: JSON.stringify({ command: 'execute', params: { script: shellScript } }),
        }
      } else {
        const messages = request['messages']
        if (!Array.isArray(messages)) throw new Error('missing messages')
        const latest = messages.map(object).findLast(message => message['role'] === 'tool')
        if (latest === undefined) throw new Error('missing latest tool message')
        const text = toolText(latest['content'])
        tools.push(text)
        if (text.includes('Body traversal ended.')) {
          ended = true
        } else {
          const usages = [...text.matchAll(/Tools\(command="read_result", params=(\{[^\n]*\})\)/gu)]
          const params = usages
            .map(match => object(JSON.parse(match[1] ?? '')))
            .find(value => value['kind'] === 'body')
          if (params === undefined) throw new Error('latest tool reply has no callable body usage')
          const reference = params['reference']
          const after = params['after']
          if (typeof reference !== 'string' || !(after === null || typeof after === 'string'))
            throw new Error('invalid body usage')
          if (reads.some(read => read.reference === reference && read.after === after))
            throw new Error('repeated body cursor')
          reads.push({ kind: 'body', reference, after })
          call = { name: 'Tools', arguments: JSON.stringify({ command: 'read_result', params }) }
        }
      }
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : String(cause))
    }
    const events =
      call === undefined
        ? [
            { model, provider: 'OpenAI', choices: [{ delta: { content: final } }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
          ]
        : [
            {
              model,
              provider: 'OpenAI',
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: `body_read_${index}`,
                        type: 'function',
                        function: call,
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
  return { script, requests, tools, reads, errors, ended: () => ended }
}
