import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { stored } from './business-world.ts'
import { openPreparedServiceWorld } from './prepared-service-world.ts'

it('recovers confirmed facts after a writer process is killed without disposing storage', async () => {
  const first = await openPreparedServiceWorld()
  await first.close()
  const { scopeRef } = first.command.target
  const child = fork(
    fileURLToPath(new URL('./crash-child.ts', import.meta.url)),
    [first.root, scopeRef],
    { execArgv: [], silent: true, env: { ...process.env, NO_COLOR: '1' } },
  )
  let diagnostics = ''
  child.stderr?.on('data', chunk => {
    diagnostics += String(chunk)
  })
  try {
    const { result, operation } = await Promise.race([
      once(child, 'message').then(([message]) => message),
      once(child, 'exit').then(([code, signal]) => {
        throw new Error(`Child exited ${code}/${signal}: ${diagnostics}`)
      }),
    ])
    expect(result).toMatchObject({ kind: 'committed', revision: 1, changed: true })
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    const recovered = await openPreparedServiceWorld(undefined, { root: first.root, scopeRef })
    try {
      const counts = () => {
        const { operations, changes, terminals } = stored(first.root)
        return [operations, changes, terminals]
      }
      expect(counts()).toEqual([1, 1, 1])
      expect(stored(first.root).state).toMatchObject({ state: { revision: 1 } })
      expect(await recovered.service.getOperation(recovered.context, operation)).toEqual(result)
      // The same command after the restart is recognized as the original operation.
      expect(await recovered.service.prepareChange(recovered.context, recovered.command)).toEqual(
        result,
      )
      expect(counts()).toEqual([1, 1, 1])
    } finally {
      await recovered.close()
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      await exited
    }
  }
}, 15000)
