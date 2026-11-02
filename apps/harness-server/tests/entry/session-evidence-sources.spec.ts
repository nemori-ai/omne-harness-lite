// 证据桥的两个来源入口对象（`sessionProductionSource`、`sessionCustodySource`）：根上的真实入口对象，定义的子类；
// 入口没有生产事实与保管事实的来源，所以每次 `prepare` 答 `unavailable`、`owner` 是该键、诊断点名来源，不给任何守卫。
// 装了它们之后真实的 `session-ad10` 行 ACTIVE；`create` 只问采用来源，所以不受影响。
import { describe, expect, it } from 'vitest'
import type { SessionCommand } from '@omne-harness/session-contract'
import {
  SessionCustodySourceService,
  SessionProductionSourceService,
  sessionCustodySourceKey,
  sessionProductionSourceKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  sessionCustodySource,
  sessionProductionSource,
} from '../../src/entry/session-evidence-sources.ts'
import { fixtureEnv, got } from './support.ts'

/** 一条只有种类的命令：来源在读任何字段之前就答不可用，形状不进判断。 */
const command = (kind: string) => ({ kind, input: {} }) as unknown as SessionCommand

async function installed() {
  const fixture = fixtureEnv([])
  await fixture.install(sessionProductionSource)
  await fixture.install(sessionCustodySource)
  return {
    production: got(fixture.root.get(sessionProductionSourceKey), 'sessionProductionSource'),
    custody: got(fixture.root.get(sessionCustodySourceKey), 'sessionCustodySource'),
  }
}

describe('the evidence source entry objects', () => {
  it('are real root objects, subclasses of the two definitions', async () => {
    const { production, custody } = await installed()
    expect(sessionProductionSource).toMatchObject({
      name: sessionProductionSourceKey,
      implementation: 'real',
    })
    expect(sessionCustodySource).toMatchObject({
      name: sessionCustodySourceKey,
      implementation: 'real',
    })
    expect(production).toBeInstanceOf(SessionProductionSourceService)
    expect(custody).toBeInstanceOf(SessionCustodySourceService)
  })

  it('answer every command unavailable with their own key as owner and a diagnostic that names the source, never a guard', async () => {
    const { production, custody } = await installed()
    for (const kind of ['receive', 'preserveResult', 'completeInitialization']) {
      const answer = await production.prepare(command(kind) as never)
      expect(answer).toEqual({
        failure: {
          kind: 'unavailable',
          owner: sessionProductionSourceKey,
          diagnostic: expect.stringContaining('production'),
        },
      })
    }
    for (const kind of ['preserveResult', 'completeConsumption', 'completeExternalConsumption']) {
      const answer = await custody.prepare(command(kind) as never)
      expect(answer).toEqual({
        failure: {
          kind: 'unavailable',
          owner: sessionCustodySourceKey,
          diagnostic: expect.stringContaining('custody'),
        },
      })
    }
  })
})
