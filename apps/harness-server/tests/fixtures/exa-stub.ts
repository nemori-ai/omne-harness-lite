import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'

export type ExaRequest = Readonly<{
  apiKey: string | undefined
  body: unknown
}>

export type ExaAnswer = Readonly<{ status: number; body: unknown }>

export type ExaScript = (request: ExaRequest & { index: number }) => ExaAnswer | Promise<ExaAnswer>

export function exaResult(title: string, url: string, highlight: string) {
  return { title, url, publishedDate: '2026-11-01', highlights: [highlight] }
}

export const exaResults = (results: readonly unknown[]): ExaAnswer => ({
  status: 200,
  body: { results },
})

export type ExaStub = Readonly<{
  url: string
  requests(): readonly ExaRequest[]
  answer(script: ExaScript): void
  close(): Promise<void>
}>

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export async function startExaStub(initial: ExaScript = () => exaResults([])): Promise<ExaStub> {
  const requests: ExaRequest[] = []
  let script = initial
  const server = createServer((request, response) => {
    void (async () => {
      const text = await readBody(request)
      let body: unknown
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
      const header = request.headers['x-api-key']
      const seen: ExaRequest = { apiKey: typeof header === 'string' ? header : undefined, body }
      const index = requests.length
      requests.push(seen)
      let answer: ExaAnswer
      try {
        answer = await script({ ...seen, index })
      } catch {
        answer = { status: 500, body: { error: 'stub script threw' } }
      }
      response.writeHead(answer.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(answer.body))
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${String(port)}/search`,
    requests: () => requests,
    answer: next => {
      script = next
    },
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
