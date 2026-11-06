// P8b: writes nobody waits for (notifications/cancelled on a legacy connection) and stdio writes
// raced against the line's closing signal: do abort listeners pile up on the session's teardown
// signal or the stdio line's closing signal?
import { getEventListeners } from 'node:events'
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { factory, server, material } from './common.ts'
const warnings: string[] = []
process.on('warning', w => warnings.push(w.name + ': ' + w.message.slice(0, 90)))
const s = await server((req, body, res) => { res.writeHead(202).end() })
const f = await factory()
const t = (await f.open(material(s.url), new AbortController().signal)).ok as any
t.connection = { kind: 'legacy', version: '2025-11-25' }
for (let i = 0; i < 50; i++) await t.cancelRequest('r' + i)
await new Promise(r => setTimeout(r, 300))
console.log('P8b HTTP: abort listeners on teardown after 50 notifications/cancelled:', getEventListeners(t.teardown.signal, 'abort').length)
await t.close(); s.close()
const child = spawn(process.execPath, ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
const exited = new Promise<void>(r => child.once('exit', () => r()))
const handle = { stdin: Writable.toWeb(child.stdin!), stdout: Readable.toWeb(child.stdout!), stderr: new ReadableStream<string>({}), exited, stop: async () => { child.kill('SIGKILL'); await exited; return 'root-only' } }
const u = (await f.open({ kind: 'stdio', process: handle, generation: 1, instructionsByteLimit: 1000 } as any, new AbortController().signal)).ok as any
for (let i = 0; i < 50; i++) await u.cancelRequest('r' + i)
await new Promise(r => setTimeout(r, 300))
console.log('P8b stdio: abort listeners on the line closing signal after 50 writes:', getEventListeners(u.line.closing.signal, 'abort').length, '| on teardown:', getEventListeners(u.teardown.signal, 'abort').length)
console.log('P8b warnings:', warnings.join(' | ') || 'none')
await u.close(); child.kill('SIGKILL'); await exited
process.exit(0)
