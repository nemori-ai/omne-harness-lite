import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { recordHostGateEntry } from './native-evidence.ts'

/** Executed only inside the named scope. User effects require the sole GO writer. */
async function gate() {
  const unit = process.argv[2],
    chunkBytes = Number(process.argv[3])
  if (!unit || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1)
    throw new Error('Invalid gate input')
  const cgroup = await readFile('/proc/self/cgroup', 'utf8')
  if (!cgroup.includes(`/${unit}`)) throw new Error('Gate scope identity mismatch')
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  await recordHostGateEntry({ unit, boot })
  let writable = true
  process.stdout.on('error', () => {
    writable = false
  })
  const send = (value: unknown) => {
    if (writable) process.stdout.write(JSON.stringify(value) + '\n')
  }
  send({ kind: 'ready' })
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const first = await input[Symbol.asyncIterator]().next()
  input.close()
  if (first.done) return
  const message = JSON.parse(first.value) as {
    kind: string
    executable: string
    args: string[]
    cwd: string
    env: Record<string, string>
    stdin?: string
  }
  if (message.kind !== 'go') return
  const child = spawn(message.executable, message.args, {
    cwd: message.cwd,
    env: message.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const forward = (stream: 'stdout' | 'stderr', data: Buffer) => {
    for (let offset = 0; offset < data.byteLength; offset += chunkBytes)
      send({
        kind: 'output',
        stream,
        data: data.subarray(offset, offset + chunkBytes).toString('base64'),
      })
    if (process.stdout.writableNeedDrain) {
      child.stdout.pause()
      child.stderr.pause()
    }
  }
  process.stdout.on('drain', () => {
    child.stdout.resume()
    child.stderr.resume()
  })
  child.stdout.on('data', (data: Buffer) => forward('stdout', data))
  child.stderr.on('data', (data: Buffer) => forward('stderr', data))
  child.stdin.on('error', () => {
    /* A child can intentionally close its input. */
  })
  child.stdin.end(message.stdin === undefined ? undefined : Buffer.from(message.stdin, 'base64'))
  child.on('error', () => send({ kind: 'failed' }))
  child.on('close', (code, signal) => {
    send({ kind: 'completed', code, signal })
    process.stdin.destroy()
  })
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  void gate().catch(() => {
    process.exitCode = 1
  })
}
