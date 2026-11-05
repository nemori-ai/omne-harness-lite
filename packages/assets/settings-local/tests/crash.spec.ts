import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { command, context, openWorld } from './world.ts'

it('recovers confirmed facts after a writer process is killed without disposing storage', async () => {
  const prepared = await openWorld()
  await prepared.close()
  const child = fork(fileURLToPath(new URL('./crash-child.ts', import.meta.url)), [prepared.root], {
    execArgv: [],
    silent: true,
    env: { ...process.env, NO_COLOR: '1' },
  })
  let diagnostics = ''
  child.stderr?.on('data', chunk => {
    diagnostics += String(chunk)
  })
  try {
    const result = await Promise.race([
      once(child, 'message').then(([message]) => message),
      once(child, 'exit').then(([code, signal]) => {
        throw new Error(`Child exited ${code}/${signal}: ${diagnostics}`)
      }),
    ])
    expect(result).toEqual({
      kind: 'committed',
      operationId: 'operation-1',
      revision: 1,
      changed: true,
    })
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    const recovered = await openWorld({ root: prepared.root })
    try {
      expect(recovered.counts()).toEqual([1, 1, 1])
      expect(await recovered.backend.readState(context, command().target)).toMatchObject({
        kind: 'state',
        state: { revision: 1 },
      })
      expect(
        await recovered.backend.getOperation(context, {
          target: command().target,
          operationId: 'operation-1',
        }),
      ).toEqual(result)
      expect(await recovered.backend.commit(context, command())).toEqual(result)
      expect(recovered.counts()).toEqual([1, 1, 1])
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
