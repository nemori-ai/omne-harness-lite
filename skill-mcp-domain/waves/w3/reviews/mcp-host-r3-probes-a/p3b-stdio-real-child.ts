// P3b: a real child that never reads stdin; a 1 MiB tools/call fills the pipe; then close() as the mcp teardown does before stop().
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { factory, race } from './common.ts'
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
const exited = new Promise<void>(r => child.once('exit', () => r()))
const handle = { stdin: Writable.toWeb(child.stdin!), stdout: Readable.toWeb(child.stdout!), stderr: new ReadableStream<string>({}), exited, stop: async () => { child.kill('SIGKILL'); await exited; return 'root-only' } }
const f = await factory()
const t = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 } as any, new AbortController().signal)).ok
const ac = new AbortController()
const big = 'x'.repeat(1 << 20)
const call = t.call({ action: 'echo', args: { kind: 'object', entries: [{ key: 'a', value: { kind: 'string', value: big } }] } }, ac.signal)
await new Promise(r => setTimeout(r, 300)); ac.abort()
console.log('P3b call settled 1s after signal:', (await race(call, 1000)).settled)
const closed = await race(t.close(), 3000)
console.log('P3b close() settled within 3s (teardown would stop() only after this):', closed.settled)
child.kill('SIGKILL'); await exited
console.log('P3b after SIGKILL: close settled', (await race(t.close(), 1000)).settled)
process.exit(0)
