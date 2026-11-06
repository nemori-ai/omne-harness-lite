// Q1: two calls in flight on stdio; the first (small) write completes while the second (1 MiB) is
// still blocked on a full pipe of a peer that never reads stdin. Does close() return?
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { factory, race } from './common.ts'
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
const exited = new Promise<void>(r => child.once('exit', () => r()))
const handle = { stdin: Writable.toWeb(child.stdin!), stdout: Readable.toWeb(child.stdout!), stderr: new ReadableStream<string>({}), exited, stop: async () => { child.kill('SIGKILL'); await exited; return 'root-only' } }
const f = await factory()
const t = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 } as any, new AbortController().signal)).ok
const small = t.call({ action: 'a', args: { kind: 'object', entries: [] } }, new AbortController().signal)
const big = 'x'.repeat(1 << 20)
const large = t.call({ action: 'b', args: { kind: 'object', entries: [{ key: 'a', value: { kind: 'string', value: big } }] } }, new AbortController().signal)
console.log('Q1 small call returned within 1s:', (await race(small, 1000)).settled)
console.log('Q1 large call returned within 1s:', (await race(large, 1000)).settled)
const t0 = performance.now()
const closing = t.close()
const closed = await race(closing, 3000)
console.log('Q1 close() returned within 3s:', closed.settled)
child.kill('SIGKILL'); await exited
console.log('Q1 after SIGKILL: the same close() returned within 1s:', (await race(closing, 1000)).settled, 'elapsed ms', Math.round(performance.now() - t0))
process.exit(0)
