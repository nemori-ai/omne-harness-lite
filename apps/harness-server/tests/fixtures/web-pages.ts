// A local HTTP server with one HTML page for the release-tree Web tests. It listens on 127.0.0.1
// only; the release Web fetch reads it and no test reaches the outside network.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export const PAGE_TITLE_MARKER = 'MARKER-web-fixture-heading'
export const PAGE_BODY_MARKER = 'MARKER-web-fixture-paragraph'
export const PAGE_HTML = `<!doctype html>
<html><head><title>Fixture</title><script>alert('never run')</script></head>
<body><h1>${PAGE_TITLE_MARKER}</h1><p>${PAGE_BODY_MARKER} with <a href="/other">a link</a>.</p></body></html>`

export type WebPages = Readonly<{
  /** The `http:` URL of the HTML page. */
  pageUrl: string
  /** How many requests reached the server, with their methods. */
  requests(): readonly string[]
  close(): Promise<void>
}>

export async function startWebPages(): Promise<WebPages> {
  const methods: string[] = []
  const server = createServer((request, response) => {
    methods.push(request.method ?? '')
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(PAGE_HTML)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  return {
    pageUrl: `http://127.0.0.1:${String(port)}/page.html`,
    requests: () => methods,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
