import { fork } from 'node:child_process'
import { once } from 'node:events'
import type { Authority } from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ExecutionEntry, LoopPorts } from '../../src/loop/coordinator.ts'

export function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

type Call = Readonly<{ kind: 'call'; id: number; path: string[]; args: unknown[] }>
type Hook = (call: Call, result: unknown) => Promise<void>

function isCall(value: object): value is Call {
  return (
    'kind' in value &&
    value.kind === 'call' &&
    'id' in value &&
    Number.isSafeInteger(value.id) &&
    'path' in value &&
    Array.isArray(value.path) &&
    value.path.every(v => typeof v === 'string') &&
    'args' in value &&
    Array.isArray(value.args)
  )
}

export function executor(
  ports: LoopPorts<string>,
  entry: Omit<ExecutionEntry<string>, 'ports' | 'evaluator' | 'idle'>,
  hooks: Readonly<{ before?: Hook; after?: Hook }> = {},
) {
  const child = fork(new URL('./executor.mjs', import.meta.url), [], {
    execArgv: [],
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const ready = deferred<void>()
  const accepted = deferred<unknown>()
  const exited = once(child, 'exit')
  const calls: Call[] = []
  const cancelledCalls: Call[] = []
  const completions: Promise<void>[] = []
  const output: string[] = []
  let done = deferred<unknown>()
  let idle = 0
  child.stdout?.on('data', value => output.push(String(value)))
  child.stderr?.on('data', value => output.push(String(value)))
  child.on('message', async message => {
    if (message === null || typeof message !== 'object' || !('kind' in message)) return
    if (message.kind === 'ready') {
      ready.resolve()
      return
    }
    if (message.kind === 'accepted' && 'value' in message) {
      accepted.resolve(message.value)
      return
    }
    if (message.kind === 'idle') {
      idle++
      return
    }
    if (message.kind === 'done' && 'value' in message) {
      done.resolve(message.value)
      return
    }
    if (message.kind === 'crash') {
      done.resolve(message)
      return
    }
    if (!isCall(message)) throw new Error('Invalid child IPC request')
    calls.push(structuredClone(message))
    const completed = deferred<void>()
    completions.push(completed.promise)
    try {
      await hooks.before?.(message, undefined)
      if (
        !child.connected ||
        child.killed ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        cancelledCalls.push(structuredClone(message))
        return
      }
      let owner: unknown = ports
      const method = message.path.at(-1)
      for (const key of message.path.slice(0, -1)) {
        if (owner === null || typeof owner !== 'object') throw new Error('Invalid IPC port')
        owner = Reflect.get(owner, key)
      }
      if (method === undefined || owner === null || typeof owner !== 'object')
        throw new Error('Missing IPC port')
      const action: unknown = Reflect.get(owner, method)
      if (typeof action !== 'function')
        throw new Error(`Unavailable IPC method ${message.path.join('.')}`)
      const args = message.args.map(input => {
        if (input === null || typeof input !== 'object' || !('tenant' in input)) return input
        if (typeof input.tenant !== 'string') throw new Error('Missing encoded IPC tenant')
        const decoded = tenantCodec.parse(input.tenant)
        const expected = tenantCodec.encode(entry.access.tenant)
        if (!decoded.ok || !expected.ok || input.tenant !== expected.value)
          throw new Error('Invalid IPC tenant')
        return { ...input, tenant: decoded.value }
      })
      const value: unknown = await Reflect.apply(action, owner, args)
      await hooks.after?.(message, value)
      if (child.connected) child.send({ kind: 'reply', id: message.id, value })
    } catch (error) {
      if (child.connected) child.send({ kind: 'reply', id: message.id, error: String(error) })
    } finally {
      completed.resolve()
    }
  })
  return {
    child,
    calls,
    cancelledCalls,
    output,
    accepted: accepted.promise,
    async joinCalls() {
      await Promise.all(completions)
    },
    get idle() {
      return idle
    },
    async drive(mode: 'accept' | 'continue' | 'run', authority?: Authority) {
      await ready.promise
      done = deferred<unknown>()
      const tenant = tenantCodec.encode(entry.access.tenant)
      if (!tenant.ok) throw new Error('Cannot encode original IPC tenant')
      child.send({ kind: 'drive', mode, authority, entry, tenant: tenant.value })
      return done.promise
    },
    async kill() {
      if (!child.kill('SIGKILL')) throw new Error('Executor SIGKILL failed')
      const [code, signal] = await exited
      return { pid: child.pid, code, signal }
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        child.disconnect()
        await exited
      }
    },
  }
}
