/** @module-tag slow */
// Slow: the contract's terminal suite on the macOS provider, with real gates, PTYs and Bash 3.2.
// Two acquisitions of one provider are the two subjects; the controlled leg is a shell loop that
// ends when its own file appears, and closing a terminal is confirmed only once both sessions are
// empty. The
// tests run only on macOS with `OMNE_HOST_MACOS=1`; elsewhere they are skipped.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  runConformanceCase,
  terminalFacilityConformance,
  type TerminalConformanceAcquisition,
} from '@omne-harness/execution-environment-contract/testing'
import {
  acquisitionLedger,
  cleanup,
  enabled,
  freshScope,
  hostProvider,
  leaseOf,
  operationBase,
  workDirectory,
} from './fixture.ts'

afterEach(cleanup)

async function acquisition(provider: ReturnType<typeof hostProvider>, cwd: string): Promise<TerminalConformanceAcquisition> {
  const lease = await leaseOf(provider, acquisitionLedger().ledger, { scope: freshScope(), terminal: true })
  const facility = lease.facility('terminal')
  if (facility === undefined) throw new Error('terminal facility missing')
  let count = 0
  const request = () => ({ ...operationBase, requestId: `terminal-${++count}` })
  return {
    facility,
    createRequest: { ...request(), cwd, env: { PATH: '/usr/bin:/bin' } },
    request,
    executeRequest: terminal => ({ ...request(), terminal, script: 'printf ok' }),
  }
}

for (const test of terminalFacilityConformance({
  waitMs: 30_000,
  async subject() {
    const provider = hostProvider(undefined)
    const cwd = await workDirectory('omne-terminal-suite-')
    const acquisitions = [await acquisition(provider, cwd), await acquisition(provider, cwd)] as const
    const finishing = new Map<object, string>()
    let legs = 0
    return {
      acquisitions,
      control: {
        // The controlled leg runs until its own file appears; `finish` writes it and the leg exits.
        async start(a, terminal) {
          const done = join(cwd, `done-${++legs}`)
          const answer = await a.facility.execute({
            ...a.request(),
            terminal,
            script: `while [ ! -e ${done} ]; do sleep 0.05; done`,
          })
          if (answer.kind !== 'done') throw new Error(JSON.stringify(answer))
          finishing.set(answer.value, done)
          return answer.value
        },
        async finish(process) {
          const done = finishing.get(process)
          if (done !== undefined) await writeFile(done, '')
          await process.result
        },
        stopMode: 'forced',
        stopAnswer: 'confirmed',
        closeAnswer: 'confirmed',
      },
    }
  },
}))
  it(`macOS terminal ${test.name}`, { timeout: 60_000 }, async ctx => {
    if (!enabled) return ctx.skip()
    expect(await runConformanceCase(test)).toMatchObject({ status: 'pass' })
  })
