// A hand-written SDK Transport over externally given web streams (the shape of our ProcessHandle:
// stdin WritableStream<Uint8Array>, stdout ReadableStream<Uint8Array>). Two drivers on top:
//  A) SDK Client (mode 'auto') over the custom transport: probe runs in place, no sibling spawn.
//  B) Raw JSON-RPC over the same transport class, no Client: discover, -32022, -32021, task, cancel.
//  C) Client 'auto' against a 2025-only server: fallback to initialize.
// Run: node --experimental-strip-types client-streams.ts
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, rmSync } from 'node:fs'
import { Client, ReadBuffer, serializeMessage, type Transport, type JSONRPCMessage } from '@modelcontextprotocol/client'

const here = dirname(fileURLToPath(import.meta.url))
const log = (label: string, v?: unknown) => console.error(`\n## ${label}\n` + (v === undefined ? '' : JSON.stringify(v, null, 2)))

/** What our ProcessHandle gives: web streams plus an exit promise. */
type ProcessLike = { stdin: WritableStream<Uint8Array>; stdout: ReadableStream<Uint8Array>; exited: Promise<void>; kill(): void }
function spawnServer(extra: string[] = []): ProcessLike {
  const child = spawn(process.execPath, ['--experimental-strip-types', join(here, 'server.ts'), ...extra], { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stderr.on('data', (d) => process.stderr.write(String(d).replace(/^/gm, '    | ')))
  return {
    stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    exited: new Promise((r) => child.once('exit', () => r())),
    kill: () => child.kill(),
  }
}

/** SDK Transport over given streams. Framing: one JSON object per line, '\n' terminated (serializeMessage). */
class StreamTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  readonly frames: Array<{ dir: 'out' | 'in'; raw: string }> = []
  #buf = new ReadBuffer()
  #writer: WritableStreamDefaultWriter<Uint8Array>
  #reader: ReadableStreamDefaultReader<Uint8Array>
  #closed = false
  #started = false
  constructor(proc: ProcessLike) {
    this.#writer = proc.stdin.getWriter()
    this.#reader = proc.stdout.getReader()
  }
  async start() {
    if (this.#started) return // the Client may start() once for the probe; keep it idempotent
    this.#started = true
    void this.#pump()
  }
  async #pump() {
    try {
      for (;;) {
        const { value, done } = await this.#reader.read()
        if (done) break
        this.frames.push({ dir: 'in', raw: Buffer.from(value).toString('utf8') })
        this.#buf.append(Buffer.from(value))
        for (;;) {
          let msg: JSONRPCMessage | null
          try {
            msg = this.#buf.readMessage()
          } catch (e) {
            this.onerror?.(e as Error) // a malformed line: report, keep reading
            continue
          }
          if (msg === null) break
          this.onmessage?.(msg)
        }
      }
    } catch (e) {
      this.onerror?.(e as Error)
    }
    this.#finish()
  }
  #finish() {
    if (this.#closed) return
    this.#closed = true
    this.onclose?.()
  }
  async send(message: JSONRPCMessage) {
    const line = serializeMessage(message)
    this.frames.push({ dir: 'out', raw: line })
    await this.#writer.write(new TextEncoder().encode(line))
  }
  async close() {
    // Closes our ends only. The process is stopped by whoever holds the handle (T5).
    try { await this.#writer.close() } catch {}
    try { await this.#reader.cancel() } catch {}
    this.#finish()
  }
}

// ---------- A) Client over custom transport ----------
rmSync(join(here, 'spawn-log.txt'), { force: true })
{
  const proc = spawnServer()
  const tr = new StreamTransport(proc)
  const client = new Client({ name: 'streams-client', version: '0.0.1' }, { versionNegotiation: { mode: 'auto' } })
  await client.connect(tr)
  log('A) Client over StreamTransport: era/version', { era: client.getProtocolEra(), v: client.getNegotiatedProtocolVersion() })
  const r = await client.callTool({ name: 'echo', arguments: { text: 'via streams' } })
  log('A) echo structuredContent', r.structuredContent)
  log('A) first 2 raw frames (out, in) — note the trailing \\n', tr.frames.slice(0, 2))
  await client.close()
  await new Promise((r) => setTimeout(r, 100))
  log('A) process alive after transport close? (stdin EOF makes this server exit by itself)', await Promise.race([proc.exited.then(() => 'exited'), new Promise((r) => setTimeout(() => r('alive'), 500))]))
  proc.kill()
  log('A) spawn-log (one line per server process)', readFileSync(join(here, 'spawn-log.txt'), 'utf8'))
}

// ---------- B) Raw JSON-RPC over the same transport ----------
{
  const proc = spawnServer()
  const tr = new StreamTransport(proc)
  const waiting = new Map<string | number, (m: any) => void>()
  const notes: any[] = []
  tr.onmessage = (m: any) => {
    if ('id' in m && (('result' in m) || ('error' in m))) waiting.get(m.id)?.(m), waiting.delete(m.id)
    else notes.push(m)
  }
  tr.onclose = () => log('B) onclose')
  await tr.start()
  const clientInfo = { name: 'raw-client', version: '0.0.1' }
  const env = (caps: object, version = '2026-07-28') => ({
    'io.modelcontextprotocol/protocolVersion': version,
    'io.modelcontextprotocol/clientInfo': clientInfo,
    'io.modelcontextprotocol/clientCapabilities': caps,
  })
  let n = 0
  const rpc = (method: string, params: any) => {
    const id = `r${++n}` // our own string ids: requestId is ours, not hidden
    const p = new Promise<any>((res) => waiting.set(id, res))
    void tr.send({ jsonrpc: '2.0', id, method, params } as any)
    return { id, answer: p }
  }
  const caps = { extensions: { 'io.modelcontextprotocol/tasks': {} } }
  log('B) server/discover raw answer', await rpc('server/discover', { _meta: env(caps) }).answer)
  log('B) -32022: unsupported version in envelope', await rpc('tools/list', { _meta: env(caps, '2099-01-01') }).answer)
  log('B) -32021: ask without elicitation capability', await rpc('tools/call', { name: 'ask', arguments: {}, _meta: env(caps) }).answer)
  log('B) tools/list raw page', (await rpc('tools/list', { _meta: env(caps) }).answer).result?.tools?.map((t: any) => t.name))
  const created = await rpc('tools/call', { name: 'slow', arguments: { ms: 200 }, _meta: env(caps) }).answer
  log('B) tools/call slow -> CreateTaskResult raw', created)
  const sent = rpc('tools/call', { name: 'slow', arguments: { ms: 1000, inline: true }, _meta: { ...env(caps), progressToken: 'p1' } })
  await new Promise((r) => setTimeout(r, 50))
  await tr.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: sent.id, reason: 'raw cancel', _meta: env(caps) } } as any)
  const raced = await Promise.race([sent.answer, new Promise((r) => setTimeout(() => r('no answer within 1.5s'), 1500))])
  log('B) cancelled inline call: answer?', raced)
  log('B) notifications seen', notes)
  log('B) no envelope at all after modern opening (sent last on purpose)', await rpc('tools/list', {}).answer)
  log('B) envelope again after that: is serverInfo stamped (modern) or not (legacy)?', (await rpc('tools/call', { name: 'echo', arguments: { text: 'x' }, _meta: env(caps) }).answer))
  log('B) a bad-shaped line from us -> server reply', await (async () => {
    const id = 'bad1'
    const p = new Promise<any>((res) => waiting.set(id, res))
    await tr.send({ jsonrpc: '2.0', id, method: 'tasks/get', params: { _meta: env(caps) } } as any) // missing taskId
    return p
  })())
  await tr.close()
  proc.kill()
}

// ---------- C) Client 'auto' against a 2025-only server ----------
{
  const proc = spawnServer(['--legacy'])
  const tr = new StreamTransport(proc)
  const client = new Client({ name: 'streams-client', version: '0.0.1' }, { versionNegotiation: { mode: 'auto', probe: { timeoutMs: 2000 } } as never })
  const t0 = Date.now()
  await client.connect(tr)
  log('C) legacy server: era/version/discover/serverVersion/caps', {
    ms: Date.now() - t0,
    era: client.getProtocolEra(),
    v: client.getNegotiatedProtocolVersion(),
    discover: client.getDiscoverResult(),
    serverVersion: client.getServerVersion(),
    caps: client.getServerCapabilities(),
  })
  log('C) frames on the wire (out methods)', tr.frames.filter((f) => f.dir === 'out').map((f) => JSON.parse(f.raw).method ?? 'response'))
  log('C) first inbound frame (answer to the probe)', tr.frames.find((f) => f.dir === 'in')?.raw)
  await client.close()
  proc.kill()
}
// ---------- D) process dies with a call in flight (no-answer) ----------
{
  const proc = spawnServer()
  const tr = new StreamTransport(proc)
  const client = new Client({ name: 'streams-client', version: '0.0.1' }, { versionNegotiation: { mode: 'auto' } })
  client.onclose = () => log('D) client.onclose fired')
  await client.connect(tr)
  const p = client.callTool({ name: 'slow', arguments: { ms: 2000, inline: true } })
  setTimeout(() => proc.kill('SIGKILL'), 100)
  try { await p } catch (e: any) { log('D) in-flight call after SIGKILL threw', { class: e?.constructor?.name, code: e?.code, message: e?.message }) }
  try { await client.callTool({ name: 'echo', arguments: { text: 'x' } }) } catch (e: any) { log('D) call after close threw', { class: e?.constructor?.name, code: e?.code, message: e?.message }) }
}
process.exit(0)
