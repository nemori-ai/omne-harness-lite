// @module-tag slow
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { LAB_MARKER } from '../src/state-instance.ts'
import {
  bodyOf,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  startServer,
  writeOperator,
  type Scratch,
  type ServerHandle,
} from './r9/support.ts'

let scratch: Scratch | undefined
let server: ServerHandle | undefined
afterEach(async () => {
  await server?.kill().catch(() => {})
  scratch?.remove()
})

it(
  'AS-18: after a clean stop, a kill and a failed start, the server holds the same sessions with the same history',
  { timeout: 240_000 },
  async () => {
    const made = (scratch = newScratch('restart-same-'))
    const port = await freePort()
    const operatorPath = join(made.base, 'operator.json')
    writeOperator(operatorPath, operatorLayer({ storageRoot: made.storageRoot, port }))
    const home = join(made.base, 'omne-home')
    mkdirSync(home)
    const omne = async (...args: string[]) => {
      const run = await runOmne({
        args,
        home,
        server: `http://127.0.0.1:${String(port)}`,
        cwd: made.base,
        credential: 'restart-pw-1',
      })
      if (run.status !== 0) throw new Error(`omne ${args.join(' ')}: ${run.stdout}${run.stderr}`)
      return run
    }
    const start = async () =>
      (server = await startServer({ stateRoot: made.stateRoot, operatorPath, port }))

    await start()
    await omne('register', '--login-identifier', 'restart')
    await omne('login', '--login-identifier', 'restart')
    const sessions: string[] = []
    for (let n = 0; n < 2; n += 1) {
      const id = String(bodyOf(await omne('create-session', '--definition', 'coding'))['session'])
      sessions.push(id)
      // No model answers here: the input is accepted and kept, and its run ends failed. Both are facts in the log.
      await omne('send-input', '--session', id, '--text', `kept across restarts ${String(n)}`)
    }
    for (const id of sessions)
      await expect
        .poll(async () => (await omne('read-history', '--session', id)).stdout, { timeout: 60_000 })
        .toMatch(/run\.terminal/)
    /** What a person can read of the state: which sessions there are, and the whole history of each. */
    const read = async () => ({
      listed: (bodyOf(await omne('list-sessions'))['sessions'] as { session: string }[])
        .map(each => each.session)
        .sort(),
      histories: Object.fromEntries(
        await Promise.all(
          sessions.map(
            async id => [id, (await omne('read-history', '--session', id)).stdout] as const,
          ),
        ),
      ),
    })
    // The log is read once it is quiet: a fact that lands after the run's end is still a fact before the stop.
    let before = await read()
    for (let quiet = 0; quiet < 2;) {
      await new Promise(done => setTimeout(done, 500))
      const again = await read()
      quiet = JSON.stringify(again) === JSON.stringify(before) ? quiet + 1 : 0
      before = again
    }
    expect(before.listed).toEqual([...sessions].sort())
    for (const [n, id] of sessions.entries())
      expect(before.histories[id]).toContain(`kept across restarts ${String(n)}`)

    expect((await server?.stop())?.code).toBe(0)
    await start()
    expect(await read()).toEqual(before)

    await server?.kill()
    await start()
    expect(await read()).toEqual(before)
    expect((await server?.stop())?.code).toBe(0)

    // A start that fails: a release instance refuses the directory of a lab instance with 3.
    writeFileSync(join(made.stateRoot, LAB_MARKER), '{"instance":"lab","version":1}\n')
    await expect(start()).rejects.toThrow(/serve exited with 3 before startup/)
    rmSync(join(made.stateRoot, LAB_MARKER))
    await start()
    expect(await read()).toEqual(before)
    expect((await server?.stop())?.code).toBe(0)
  },
)
