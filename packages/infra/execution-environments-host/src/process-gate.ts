import { readFile, writeFile, open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { spawn } from 'node-pty'
import { recordHostGateEntry } from './native-evidence.ts'
import { createHostResourceDirectory } from './resource-directory.ts'
import { captureCommandFrame } from './native-frames.ts'
import { forwardPtyOutput } from './pty-output.ts'

async function readReceipt(path: string, maximum: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 1024) throw new Error('Invalid command receipt')
    const frame = captureCommandFrame(await file.readFile('utf8'), maximum)
    if (frame?.kind !== 'completed') throw new Error('No target completion')
    return frame
  } finally {
    await file.close()
  }
}

interface Command {
  kind: string
  executable: string
  args: string[]
  cwd: string
  env: Record<string, string>
  stdin?: string
}
async function prepareTarget(message: Command, coordinate: { unit: string; boot: string }) {
  const directory = await createHostResourceDirectory(coordinate)
  const receipt = directory + '/receipt',
    request = directory + '/request',
    stdin = message.stdin === undefined ? undefined : directory + '/input'
  if (stdin !== undefined)
    await writeFile(stdin, Buffer.from(message.stdin!, 'base64'), { flag: 'wx', mode: 0o600 })
  await writeFile(
    request,
    JSON.stringify({
      executable: message.executable,
      args: message.args,
      cwd: message.cwd,
      input: stdin,
      receipt,
      env: { ...message.env, PWD: message.cwd, TERM: message.env.TERM ?? 'xterm' },
    }),
    { flag: 'wx', mode: 0o600 },
  )
  return { request, receipt }
}

/** Executed only inside the named scope. User effects require the sole GO writer. */
async function gate() {
  const unit = process.argv[2],
    chunkBytes = Number(process.argv[3]),
    cols = Number(process.argv[4]),
    rows = Number(process.argv[5])
  if (!unit || [chunkBytes, cols, rows].some(size => !Number.isSafeInteger(size) || size < 1))
    throw new Error('Invalid gate input')
  if (!(await readFile('/proc/self/cgroup', 'utf8')).includes(`/${unit}`))
    throw new Error('Gate scope identity mismatch')
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  await recordHostGateEntry({ unit, boot })
  let writable = true
  process.stdout.on('error', () => {
    writable = false
  })
  const send = (value: unknown) => writable && process.stdout.write(JSON.stringify(value) + '\n')
  send({ kind: 'ready' })
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
  const first = await input[Symbol.asyncIterator]().next()
  input.close()
  if (first.done) return
  const message = JSON.parse(first.value) as Command
  if (message.kind !== 'go') return
  const { request, receipt } = await prepareTarget(message, { unit, boot })
  const terminal = spawn(
    process.execPath,
    [fileURLToPath(new URL('./command-launcher.js', import.meta.url)), request],
    { cwd: message.cwd, env: {}, cols, rows, encoding: null },
  )
  const transport = forwardPtyOutput(terminal, chunkBytes, send)
  let invalid = false
  terminal.onData((data: unknown) => {
    if (Buffer.isBuffer(data)) transport.output(data)
    else invalid = true
  })
  terminal.onExit(() => {
    void (async () => {
      // node-pty has a finite exit drain window; a paused transport is not full completion.
      if (invalid || transport.paused()) throw new Error('PTY transport incomplete')
      send(await readReceipt(receipt, chunkBytes))
      process.stdin.destroy()
    })().catch(() => {
      send({ kind: 'failed' })
      process.stdin.destroy()
    })
  })
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  void gate().catch(() => {
    process.exitCode = 1
  })
}
