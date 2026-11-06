import http from 'node:http'
export const SRC = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/index.ts'
export async function factory(extra: object = {}) {
  const { createLocalTransportFactory } = await import('HOSTSRC')
  return createLocalTransportFactory({ clientInfo: { name: 'probe', version: '1' }, probeTimeoutMs: 300, ...extra })
}
export function server(handler: (req: http.IncomingMessage, body: any, res: http.ServerResponse) => void): Promise<{ url: string; close(): void; srv: http.Server }> {
  const srv = http.createServer((req, res) => {
    let data = ''
    req.on('data', c => (data += c))
    req.on('end', () => {
      let body: any
      try { body = data ? JSON.parse(data) : undefined } catch { body = data }
      handler(req, body, res)
    })
  })
  return new Promise(r => srv.listen(0, '127.0.0.1', () => {
    const a = srv.address() as any
    r({ url: `http://127.0.0.1:${a.port}/mcp`, srv, close: () => { srv.closeAllConnections(); srv.close() } })
  }))
}
export const race = <T>(p: Promise<T>, ms: number) => Promise.race([p.then(v => ({ settled: true as const, v })), new Promise<{ settled: false }>(r => setTimeout(() => r({ settled: false }), ms))])
export const material = (url: string, credential?: any) => ({ kind: 'streamable-http', target: url, generation: 1, instructionsByteLimit: 1000, ...(credential ? { credential } : {}) })
