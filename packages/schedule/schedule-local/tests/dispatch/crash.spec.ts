// @module-tag slow
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, watch } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { dispatchWorld, everyMinute, MINUTE, START } from './world.ts'

test.each(['in-transaction', 'after-commit'])(
  'SIGKILL %s of an admission leaves the slot disposed zero times or once, and the next round makes it exactly once',
  { tags: ['slow'], timeout: 120_000 },
  async phase => {
    const first = await dispatchWorld()
    const id = await first.create(everyMinute(), 'crash')
    const prepared = first.dispatcher()
    await prepared.round()
    await prepared.close()
    const root = first.world.root
    await first.close()
    const marker = join(root, 'inside-admission')
    const child = fork(
      fileURLToPath(new URL('./crash-child.ts', import.meta.url)),
      [root, marker, phase],
      {
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    )
    let stderr = ''
    child.stderr?.on('data', chunk => (stderr += String(chunk)))
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Crash point not reached: ${stderr}`)),
          60_000,
        )
        const finish = () => {
          clearTimeout(timer)
          observer.close()
          resolve()
        }
        const observer = watch(root, () => {
          if (phase === 'in-transaction' && existsSync(marker)) finish()
        })
        child.once('message', () => {
          if (phase === 'after-commit') finish()
        })
        child.once('exit', () => {
          clearTimeout(timer)
          observer.close()
          reject(new Error(`Child exited before the crash point: ${stderr}`))
        })
      })
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit')
        child.kill('SIGKILL')
        await exited
      }
    }
    const recovered = await dispatchWorld({ root, wall: START + MINUTE + 20_000 })
    try {
      const made = phase === 'in-transaction' ? 0 : 1
      expect(recovered.receipts(id)).toHaveLength(made)
      expect(recovered.jobs(id)).toHaveLength(made)
      expect(recovered.view(id)).toMatchObject({ eligibleConsumed: made, acceptedJobCount: made })
      const again = recovered.dispatcher()
      await again.round()
      await again.round()
      expect(recovered.receipts(id).map(item => item.at)).toEqual([
        new Date(START + MINUTE).toISOString(),
      ])
      expect(recovered.jobs(id)).toHaveLength(1)
      expect(recovered.view(id)).toMatchObject({ eligibleConsumed: 1, acceptedJobCount: 1 })
      await again.close()
    } finally {
      await recovered.close()
    }
  },
)
