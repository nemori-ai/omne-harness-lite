// 占位规则第 4 条（DP1-C11）：真实消费者永不占位。
// 一个 S0 替身行与一个真实行同时 inject 同一个无提供者、不在注册表的名字：名字不得出现在 `entry-object` 记录里，
// 真实行停在 PENDING。没有这条用例时，`run.ts` 的 `!wantedByReal.has(name)` 删去后全部用例仍绿。
import { describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import { serveOnce } from './fixtures/serve/harness.ts'
import { syntheticRow } from './fixtures/serve/index.ts'

describe('serve: a real consumer never gets a placeholder (DP1-C11, rule 4)', () => {
  it('a name that an s0-double row and a real row both inject stays unprovided, the real row is PENDING', async () => {
    // `agent-host` 是 S0 替身行，它 inject `agentClock`（不受信）；没有行提供它，注册表也没有它。
    const run = await serveOnce({
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
