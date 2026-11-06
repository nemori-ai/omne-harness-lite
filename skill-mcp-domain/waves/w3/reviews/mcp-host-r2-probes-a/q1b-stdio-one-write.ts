// Q1b: control for Q1: only the 1 MiB call, same peer. Does close() return?
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { factory, race } from './common.ts'
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
const exited = new Promise<void>(r => child.once('exit', () => r()))
const handle = { stdin: Writable.toWeb(child.stdin!), stdout: Readable.toWeb(child.stdout!), stderr: new ReadableStream<string>({}), exited, stop: async () => { child.kill('SIGKILL'); await exited; return 'root-only' } }
const f = await factory()
const t = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 } as any, new AbortController().signal)).ok
const big = 'x'.repeat(1 << 20)
const large = t.call({ action: 'b', args: { kind: 'object', entries: [{ key: 'a', value: { kind: 'string', value: big } }] } }, new AbortController().signal)
await race(large, 500)
console.log('Q1b close() returned within 3s:', (await race(t.close(), 3000)).settled)
child.kill('SIGKILL'); await exited
process.exit(0)
