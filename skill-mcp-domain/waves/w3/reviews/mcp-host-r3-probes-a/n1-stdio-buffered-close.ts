// N1: a peer that never reads stdin. Calls of 4 KB each fill the socket buffer to the child; the
// first one Node buffers in its own Writable (below its 16 KiB highWaterMark) is accepted: the web
// write resolves, the call departs, and the line counts no write in flight. Does close() return?
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { factory, race } from './common.ts'
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
const exited = new Promise<void>(r => child.once('exit', () => r()))
const handle = { stdin: Writable.toWeb(child.stdin!), stdout: Readable.toWeb(child.stdout!), stderr: new ReadableStream<string>({}), exited, stop: async () => { child.kill('SIGKILL'); await exited; return 'root-only' } }
const f = await factory()
const t = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 } as any, new AbortController().signal)).ok
const callOf = (n: number) => t.call({ action: 'a', args: { kind: 'object', entries: [{ key: 'p', value: { kind: 'string', value: 'x'.repeat(n) } }] } }, new AbortController().signal)
let calls = 0
for (;;) {
  calls += 1
  const c = callOf(4000)
  const r = await race(c, 500)
  if (!r.settled) { console.log('N1 call', calls, 'did not depart; stop'); break }
  if (child.stdin!.writableLength > 0) break
}
console.log('N1 calls departed:', calls, '| node stdin writableLength:', child.stdin!.writableLength, 'needDrain:', child.stdin!.writableNeedDrain)
const t0 = performance.now()
const closing = t.close()
console.log('N1 close() returned within 3s:', (await race(closing, 3000)).settled)
child.kill('SIGKILL'); await exited
console.log('N1 after SIGKILL: the same close() returned within 1s:', (await race(closing, 1000)).settled, 'elapsed ms', Math.round(performance.now() - t0))
process.exit(0)
