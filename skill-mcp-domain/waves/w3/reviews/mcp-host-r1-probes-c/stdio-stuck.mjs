// Probe: a stdio peer that never reads stdin; a large call fills the pipe. Does call() return
// after its signal fires, and does close() return?
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
const root = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/dist/index.js'
const { createLocalTransportFactory } = await import(root)
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['pipe', 'pipe', 'pipe'] })
const exited = new Promise(r => child.once('exit', () => r()))
const handle = {
  stdin: Writable.toWeb(child.stdin), stdout: Readable.toWeb(child.stdout),
  stderr: new ReadableStream({ start() {} }), exited,
  async stop() { child.kill('SIGKILL'); await exited; return 'root-only' },
}
const factory = createLocalTransportFactory({ clientInfo: { name: 'p', version: '0' }, probeTimeoutMs: 300 })
const transport = (await factory.open({ kind: 'stdio', process: handle, generation: 'g1', instructionsByteLimit: 1000 }, new AbortController().signal)).ok
const big = 'x'.repeat(4 * 1024 * 1024)
const args = { kind: 'object', entries: [{ key: 'blob', value: { kind: 'string', value: big } }] }
const controller = new AbortController()
setTimeout(() => controller.abort(), 200)
const race = (p, ms, label) => Promise.race([p.then(v => `${label} returned`), new Promise(r => setTimeout(() => r(`${label} still pending after ${ms} ms`), ms))])
const t0 = performance.now()
console.log(await race(transport.call({ action: 'echo', args }, controller.signal), 2000, 'call() (signal fired at 200 ms)'))
console.log(await race(transport.close(), 2000, 'close()'))
child.kill('SIGKILL'); await exited
console.log('after the process was killed, total ms', Math.round(performance.now() - t0))
process.exit(0)
