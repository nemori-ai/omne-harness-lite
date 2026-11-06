// P5: one stdout chunk: a short line, then a line above 16 MiB, then the answer to server/discover (r1).
import { factory } from './common.ts'
let out!: ReadableStreamDefaultController<Uint8Array>
const enc = new TextEncoder()
const stdin = new WritableStream<Uint8Array>({ write: () => { queueMicrotask(() => {
  const answer = JSON.stringify({ jsonrpc: '2.0', id: 'r1', result: { supportedVersions: ['2026-07-28'], capabilities: {} } })
  out.enqueue(enc.encode('{"a":1}\n"' + 'x'.repeat(16_777_216 + 10) + '"\n' + answer + '\n'))
}) } })
const handle = { stdin, stdout: new ReadableStream<Uint8Array>({ start: c => { out = c } }), stderr: new ReadableStream<string>({}), exited: new Promise<void>(() => {}), stop: async () => 'root-only' }
const f = await factory({ probeTimeoutMs: 5000 })
const t = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 } as any, new AbortController().signal)).ok
const d = await t.discover()
console.log('P5 discover():', 'ok' in d ? 'ok identity ' + d.ok.protocolVersion : JSON.stringify(d.failure))
const l = await t.listActions()
console.log('P5 next request after the >16 MiB line:', 'ok' in l ? 'ok' : JSON.stringify(l.failure))
await t.close(); process.exit(0)
