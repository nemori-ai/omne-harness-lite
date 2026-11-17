// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

// More waits in a row than one save releases on the manual clock, so only time passing can end them.
const REFUSALS = 6
const NOT_INTERPRETED = {
  kind: 'unavailable',
  owner: 'session-history',
  diagnostic: 'the binding of the call is in Agent records Session has not interpreted yet',
} as const

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('a Run that waits on Session to interpret its records goes on when no save follows the wait', async () => {
  let commits = 0
  let refused = 0
  const w = await openW2World({
    model: admission =>
      admission.index === 0
        ? { parts: [toolCallBlock('tc-0')], reason: 'tool-suggestions' }
        : { parts: [replyText('done', 'the file is read')], reason: 'stop' },
    tool: index => ({ content: [replyText(`tool-${index}`, `the content of file ${index}`)] }),
    defaultDelayMs: 0,
    earlier: 'session',
    reception: 'routed',
    wrapAgentDependencies: dependencies => ({
      ...dependencies,
      journal: new Proxy(dependencies.journal, {
        get(target, member) {
          const value: unknown = Reflect.get(target, member, target)
          if (member !== 'commit') return typeof value === 'function' ? value.bind(target) : value
          const commit: typeof target.commit = async input => {
            commits += 1
            if (commits < 2 || refused === REFUSALS) return target.commit(input)
            refused += 1
            return { failure: NOT_INTERPRETED }
          }
          return commit
        },
      }),
    }),
  })
  worlds.push(w)
  await w.createSession('history-wait')
  await w.runRound(1, 'read the file', 60_000)
  expect(await w.lastOutcome()).toBe('completed')
  expect(refused).toBe(REFUSALS)
  expect(w.historyReleases()).toBeGreaterThan(0)
}, 120_000)
