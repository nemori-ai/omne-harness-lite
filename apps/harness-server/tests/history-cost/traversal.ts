// The scripted model of one history-cost call: it asks `Tools` to execute the payload tool once,
// then follows the read instructions of the result. An inline result ends the call when the body
// arrives whole; an offloaded one is read page by page until `Body traversal ended.`, checking that
// every page continues the original bytes. A seeding call (`readBody: false`) stops at the first
// body read instruction, so its body stays unread and the result settles with it offloaded.
import { createHash } from 'node:crypto'
import type { GatewayScript } from '../fixtures/model-gateway.ts'

type Read = Readonly<{ command: 'read_result'; params: Record<string, unknown> }>

type State = {
  phase: 'execute' | 'result' | 'body'
  readBody: boolean
  completed: boolean
  bytes: number
  pages: number
  requests: number
  errors: string[]
  cursors: Set<string>
  lastRead: Read | undefined
  digest: string | null
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function createTraversal(input: Readonly<{ body: string; pageBytes: number }>) {
  const original = Buffer.from(input.body)
  const digest = createHash('sha256').update(original).digest('hex')
  let state: State | undefined
  let sequence = 0

  const start = (readBody: boolean) => {
    check(state === undefined || state.completed || state.errors.length > 0, 'a call is running')
    state = {
      phase: 'execute',
      readBody,
      completed: false,
      bytes: 0,
      pages: 0,
      requests: 0,
      errors: [],
      cursors: new Set(),
      lastRead: undefined,
      digest: null,
    }
  }

  const next = (current: State, parts: readonly string[]): Read | undefined => {
    const text = parts.join('\n')
    check(!/^ERROR:|sourceTerminal\s*:\s*failed/mu.test(text), text.slice(0, 300))
    if (current.phase === 'body') {
      check(parts.length >= 2, 'a body page has a status block and a text block')
      const position = /^position\s*:\s*(\d+)$/mu.exec(parts[0] ?? '')?.[1]
      check(Number(position) === current.bytes, 'body position must be contiguous')
      const page = Buffer.from(parts.at(-1) ?? '')
      check(page.length > 0 && page.length <= input.pageBytes, 'body page byte budget')
      check(
        page.equals(original.subarray(current.bytes, current.bytes + page.length)),
        'body bytes changed',
      )
      current.bytes += page.length
      current.pages += 1
      if (text.includes('Body traversal ended.')) {
        check(current.bytes === original.length, 'body ended before all bytes arrived')
        current.completed = true
        current.digest = digest
        return undefined
      }
    } else if (parts.includes(input.body)) {
      current.bytes = original.length
      current.completed = true
      current.digest = digest
      return undefined
    }
    const pending: unknown = text.startsWith('{') ? JSON.parse(text) : null
    if (typeof pending === 'object' && pending !== null) {
      const following: unknown = Reflect.get(pending, 'next')
      if (
        typeof following === 'object' &&
        following !== null &&
        Reflect.get(following, 'command') === 'read_result'
      )
        return following as Read
      if (Reflect.get(pending, 'kind') === 'pending' && current.lastRead !== undefined)
        return current.lastRead
    }
    const usages = [...text.matchAll(/Tools\(command="read_result", params=(\{[^\n]*\})\)/gu)].map(
      match => JSON.parse(match[1] ?? '{}') as Record<string, unknown>,
    )
    const bodyRead = usages.find(value => value['kind'] === 'body')
    if (bodyRead !== undefined) {
      if (!current.readBody) {
        current.completed = true
        return undefined
      }
      const key = JSON.stringify([bodyRead['reference'], bodyRead['after']])
      check(!current.cursors.has(key), 'body cursor repeated')
      current.cursors.add(key)
      current.phase = 'body'
      return { command: 'read_result', params: bodyRead }
    }
    const forwarded = usages.find(value =>
      ['forwarding', 'invocation', 'result'].includes(String(value['kind'])),
    )
    check(forwarded !== undefined, `missing read instruction: ${text.slice(0, 300)}`)
    return { command: 'read_result', params: forwarded }
  }

  const script: GatewayScript = ({ body: requestBody }) => {
    const request = JSON.parse(requestBody) as {
      model?: string
      messages: { role: string; content: string | { text?: string }[] }[]
    }
    let args: Read | { command: 'execute'; params: Record<string, unknown> } | undefined
    const current = state
    try {
      check(current !== undefined, 'start the model before sending input')
      current.requests += 1
      check(current.requests <= 64, 'one call exceeded 64 model requests')
      if (current.phase === 'execute') {
        current.phase = 'result'
        args = { command: 'execute', params: { name: 'W3LargeBody', command: null, arguments: {} } }
      } else {
        const latest = request.messages.findLast(message => message.role === 'tool')
        check(latest !== undefined, 'missing tool reply')
        const parts =
          typeof latest.content === 'string'
            ? [latest.content]
            : latest.content.map(part => part.text ?? '')
        const read = next(current, parts)
        if (read !== undefined) current.lastRead = read
        args = read
      }
    } catch (error) {
      current?.errors.push(String(error).slice(0, 1000))
      args = undefined
    }
    const delta =
      args === undefined
        ? { content: current?.completed === true ? 'HISTORY_COST_DONE' : 'HISTORY_COST_FAILED' }
        : {
            tool_calls: [
              {
                index: 0,
                id: `history_cost_${String((sequence += 1))}`,
                type: 'function',
                function: { name: 'Tools', arguments: JSON.stringify(args) },
              },
            ],
          }
    const events = [
      { model: request.model ?? 'unknown', provider: 'OpenAI', choices: [{ delta }] },
      { choices: [{ delta: {}, finish_reason: args === undefined ? 'stop' : 'tool_calls' }] },
    ]
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: `${events.map(value => `data: ${JSON.stringify(value)}\n\n`).join('')}data: [DONE]\n\n`,
    }
  }

  const result = () => {
    check(state !== undefined, 'no call ran')
    const { completed, bytes, pages, requests, errors } = state
    return { completed, bytes, pages, requests, errors, digest: state.digest }
  }

  return { start, script, result, digest }
}
