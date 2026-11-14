import { describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import { serveOnce } from './fixtures/serve/harness.ts'
import { syntheticRow } from './fixtures/serve/index.ts'

describe('serve: a real consumer never gets a placeholder (DP1-C11, rule 4)', () => {
  it('a name that an s0-double row and a real row both inject stays unprovided, the real row is PENDING', async () => {
    const run = await serveOnce({
      entryObjects: [],
      distribution: {
        rows: [
          { id: 'agent-host', plugin: 'stubPlugin', config: {} },
          { id: 'fx-real-consumer', plugin: 'fxRealConsumer', config: {} },
        ],
      },
      plugins: {
        stubPlugin,
        fxRealConsumer: syntheticRow({ id: 'fx-real-consumer', injects: ['agentClock'] }),
      },
    })
    expect(run.of('entry-object').map(record => record['name'])).not.toContain('agentClock')
    expect(run.state('fx-real-consumer')).toMatchObject({
      state: 'PENDING',
      missing: ['agentClock'],
    })
    expect(run.result.exitCode).toBe(4)
  })
})
