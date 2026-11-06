import { StdioLine } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/stdio-line.ts'
let n = 0
const stdin = new WritableStream<Uint8Array>({
  write() { n += 1; return n === 1 ? Promise.resolve() : new Promise(() => {}) },
}, { highWaterMark: 1 })
const stdout = new ReadableStream<Uint8Array>({ start() {} })
const stderr = new ReadableStream<string>({ start() {} })
const handle: any = { stdin, stdout, stderr, exited: new Promise(() => {}), stop: async () => 'tree-confirmed' }
const line = new StdioLine(handle)
const never = new AbortController().signal
const a = line.send({ text: '{"small":1}', headers: new Headers() }, never)
const b = line.send({ text: '{"big":2}', headers: new Headers() }, never)
console.log('a', await a)
const t0 = performance.now()
const closed = line.close().then(() => 'closed')
const r = await Promise.race([closed, new Promise(r => setTimeout(() => r('still waiting after 2s'), 2000))])
console.log(r, Math.round(performance.now() - t0), 'ms')
process.exit(0)
