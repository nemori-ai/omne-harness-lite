// P3: a ProcessHandle whose stdin never acknowledges a write (the child stopped reading, pipe full).
import { factory, race } from './common.ts'
const log: string[] = []
let stdoutCtl: ReadableStreamDefaultController<Uint8Array>
const stdin = new WritableStream<Uint8Array>({ write: () => { log.push('write'); return new Promise(() => {}) }, close: () => { log.push('stdin-close') }, abort: () => { log.push('stdin-abort') } })
const stdout = new ReadableStream<Uint8Array>({ start: c => { stdoutCtl = c }, cancel: () => { log.push('stdout-cancel') } })
const stderr = new ReadableStream<string>({})
const handle = { stdin, stdout, stderr, exited: new Promise<void>(() => {}), stop: async () => ({ scope: 'tree' }) }
const f = await factory()
const t = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 }, new AbortController().signal)).ok
const ac = new AbortController()
const call = t.call({ action: 'echo', args: { kind: 'object', entries: [] } }, ac.signal)
await new Promise(r => setTimeout(r, 100))
ac.abort()
const c1 = await race(call, 1000)
console.log('P3 call settled 1s after its signal fired:', c1.settled)
const closing = t.close()
const r = await race(closing, 3000)
console.log('P3 close() settled within 3s:', r.settled, 'log:', log.join(','))
const c2 = await race(call, 500)
console.log('P3 call settled after close:', c2.settled)
process.exit(0)
