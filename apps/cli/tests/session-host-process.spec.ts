import { afterEach, expect, it } from 'vitest'
import { fork, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { sendSessionHostRequest } from '../src/session-host-client.ts'
import { parseSessionHostRequest } from '../src/session-host-protocol.ts'
const homes: string[] = [],
  children: ChildProcess[] = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exit = once(child, 'exit', { signal: AbortSignal.timeout(5000) })
    child.kill('SIGTERM')
    await exit
  }
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true })
})
const binding = {
  formatVersion: 1,
  centerId: 'a'.repeat(32),
  tenant: { organization: 'team', account: 'owner' },
}
const packet = {
  format: 'omne-session-host/1',
  binding,
  command: 'createSession',
  input: {
    operationKey: 'process-original-create',
    definition: { category: 'agent_definition', name: 'controlled-transport-definition' },
    executionType: 'interactive',
    mode: 'never',
    collaboration: 'co-work',
  },
}
const policy = { maxResponseBytes: 32768, timeoutMs: 5000 }
function nextMessage(child: ChildProcess, kind: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      remove()
      reject(new Error(`child did not report ${kind}`))
    }, 10000)
    const remove = () => {
      clearTimeout(timer)
      child.off('message', message)
      child.off('exit', exited)
    }
    const exited = () => {
      remove()
      reject(new Error(`child exited before ${kind}`))
    }
    const message = (value: unknown) => {
      if (value && typeof value === 'object' && 'kind' in value && value.kind === kind) {
        remove()
        resolve(value)
      }
    }
    child.on('message', message)
    child.once('exit', exited)
  })
}
function checked(value: unknown) {
  const request = parseSessionHostRequest(value)
  if (!request) throw new Error('invalid process fixture request')
  return request
}
it('completes the original real SQLite creation and recognizes its receipt after a separate client process exits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'omne-host-process-'))
  homes.push(home)
  const host = fork(fileURLToPath(new URL('./session-host-worker.ts', import.meta.url)), [], {
    execArgv: ['--experimental-strip-types'],
    env: { ...process.env, OMNE_TEST_HOST_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  children.push(host)
  let stderr = ''
  host.stderr?.on('data', chunk => {
    stderr += String(chunk)
  })
  await nextMessage(host, 'ready').catch(error => {
    throw new AggregateError([error, new Error(stderr)], 'actual host start failed')
  })
  const initializing = nextMessage(host, 'initializing')
  const code = `import { sendSessionHostRequest } from ${JSON.stringify(new URL('../dist/session-host-client.js', import.meta.url).href)}; await sendSessionHostRequest({home:process.env.OMNE_TEST_HOST_HOME,request:JSON.parse(process.env.OMNE_TEST_HOST_REQUEST),policy:{maxResponseBytes:32768,timeoutMs:10000}})`
  const client = spawn(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', code],
    {
      env: {
        ...process.env,
        OMNE_TEST_HOST_HOME: home,
        OMNE_TEST_HOST_REQUEST: JSON.stringify(packet),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )
  children.push(client)
  await initializing
  const clientExit = once(client, 'exit', { signal: AbortSignal.timeout(5000) })
  client.kill('SIGTERM')
  expect(await clientExit).toEqual([null, 'SIGTERM'])
  expect(host.exitCode).toBeNull()
  const receiptRequest = checked({
    format: packet.format,
    binding,
    command: 'readReceipt',
    operation: {
      tenant: binding.tenant,
      principal: 'owner',
      operation: 'createSession',
      operationKey: packet.input.operationKey,
      session: null,
    },
  })
  expect(await sendSessionHostRequest({ home, request: receiptRequest, policy })).toMatchObject({
    kind: 'reply',
    result: { kind: 'absent' },
  })
  const closed = nextMessage(host, 'closed'),
    hostExit = once(host, 'exit', { signal: AbortSignal.timeout(10000) })
  host.send('release')
  const replay = await sendSessionHostRequest({ home, request: checked(packet), policy })
  expect(replay).toMatchObject({
    kind: 'reply',
    result: {
      kind: 'created',
      receipt: {
        operation: receiptRequest.command === 'readReceipt' ? receiptRequest.operation : undefined,
      },
    },
  })
  expect(await sendSessionHostRequest({ home, request: receiptRequest, policy })).toMatchObject({
    kind: 'reply',
    result: { kind: 'present' },
  })
  const foreign = checked({ ...packet, binding: { ...binding, centerId: 'b'.repeat(32) } })
  expect(await sendSessionHostRequest({ home, request: foreign, policy })).toMatchObject({
    kind: 'reply',
    result: { failure: 'denied' },
  })
  host.send('close')
  await closed
  expect(await hostExit).toEqual([0, null])
  expect(stderr).toBe('')
}, 30000)
