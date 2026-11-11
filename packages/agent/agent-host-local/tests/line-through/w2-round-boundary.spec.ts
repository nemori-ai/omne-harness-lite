// @module-tag slow
// Why slow: real SQLite Workers and a controlled in-flight commit.
import { setImmediate } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { openW2World, replyText, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('keeps a round open until its own visible terminal commit has answered', async () => {
  const release = Promise.withResolvers<void>()
  let terminals = 0
  let held = false
  let observed = false
  const world = await openW2World({
    earlier: 'session',
    model: input => ({ parts: [replyText(`r${input.index}`, 'answer')], reason: 'stop' }),
    wrapStorage: storage => ({
      ...storage,
      commit: async (request, options) => {
        const answer = await storage.commit(request, options)
        if (
          answer.kind === 'committed' &&
          request.commands.some(
            command =>
              command.participant === 'session' &&
              JSON.stringify(command.facts).includes('"kind":"ended"'),
          )
        ) {
          terminals += 1
          if (terminals === 2) {
            held = true
            await release.promise
          }
        }
        return answer
      },
    }),
  })
  worlds.push(world)
  await world.createSession('round-boundary')
  await world.runRound(1, 'first question')
  const readWork = world.probe.readWork.bind(world.probe)
  vi.spyOn(world.probe, 'readWork').mockImplementation(async input => {
    const answer = await readWork(input)
    if (held && 'ok' in answer && answer.ok.run.kind === 'terminal') observed = true
    return answer
  })
  let ended = false
  const second = world.runRound(2, 'second question').then(count => {
    ended = true
    return count
  })
  try {
    await world.until(() => held && observed)
    await setImmediate()
    expect(ended).toBe(false)
    expect(world.counters.rounds).toHaveLength(1)
  } finally {
    release.resolve()
    await second
  }
  expect(world.counters.rounds).toHaveLength(2)
  expect(await world.lastOutcome()).toBe('completed')
  expect(world.counters.rounds[1]?.storageCommitTotal).toBeGreaterThan(0)
})
