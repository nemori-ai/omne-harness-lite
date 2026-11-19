// The read-only question an OpenRouter route answers after the fact: what one request cost, by the
// identity its response header carried. It generates nothing; the secret goes into the header only.
import { request, type RequestOptions } from 'node:https'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { CostLookupAnswer } from '@omne-harness/model-contract/provider'
import { plainDecimal } from './chat-completions/decimal.ts'
import type { ExchangeResources } from './http.ts'

export type CostLookupInput = Readonly<{
  /** The generation endpoint; the request id goes into its query. */
  url: URL
  request: string
  secret: string
  costUnit: string
  timeoutMs: number
  maxBodyBytes: number
}>

const JSON_LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxItems: 10_000,
  maxMembers: 10_000,
  maxStringLength: 65_536,
  maxNumberLength: 64,
}

const unavailable = (diagnostic: string): CostLookupAnswer => ({ kind: 'unavailable', diagnostic })

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

/** A known `total_cost` is the cost; a generation the upstream does not know, or knows no cost of, missed. */
export function answerOf(body: string, costUnit: string): CostLookupAnswer {
  const read = readJsonText(body, { ...JSON_LIMITS, maxBytes: Math.max(body.length * 4, 1) })
  if (read.kind !== 'ok') return unavailable('body-not-json')
  const total = member(member(read.value, 'data'), 'total_cost')
  if (total === undefined || total.kind === 'null') return { kind: 'missed' }
  const lexeme = total.kind === 'number' ? plainDecimal(total.lexeme) : null
  if (lexeme === null) return unavailable('cost-not-a-number')
  return { kind: 'found', cost: [{ state: 'known', lexeme, unit: costUnit, source: 'billable' }] }
}

export function lookupGenerationCost(
  resources: ExchangeResources,
  input: CostLookupInput,
  signal: AbortSignal,
): Promise<CostLookupAnswer> {
  if (resources.closed || signal.aborted) return Promise.resolve(unavailable('stopped'))
  const url = new URL(input.url)
  url.searchParams.set('id', input.request)
  return new Promise(resolve => {
    let settled = false
    const finish = (answer: CostLookupAnswer) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      resolve(answer)
    }
    const options: RequestOptions = {
      method: 'GET',
      agent: resources.agent,
      ...(resources.tls === undefined ? {} : { ca: resources.tls.ca }),
      headers: { authorization: `Bearer ${input.secret}`, accept: 'application/json' },
      timeout: input.timeoutMs,
    }
    const req = request(url, options, res => {
      const status = res.statusCode ?? 0
      if (status === 404) {
        res.resume()
        return finish({ kind: 'missed' })
      }
      if (status !== 200) {
        res.resume()
        return finish(unavailable(`status-${status}`))
      }
      const chunks: Buffer[] = []
      let bytes = 0
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength
        if (bytes > input.maxBodyBytes) {
          req.destroy()
          return finish(unavailable('body-too-large'))
        }
        chunks.push(chunk)
      })
      res.on('end', () => finish(answerOf(Buffer.concat(chunks).toString('utf8'), input.costUnit)))
      res.on('error', () => finish(unavailable('body-read')))
    })
    const abort = () => {
      req.destroy()
      finish(unavailable('stopped'))
    }
    signal.addEventListener('abort', abort, { once: true })
    req.on('timeout', () => {
      req.destroy()
      finish(unavailable('timeout'))
    })
    req.on('error', () => finish(unavailable('network')))
    req.end()
  })
}
