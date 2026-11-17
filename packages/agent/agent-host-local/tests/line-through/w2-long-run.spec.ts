// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const ROUNDS = 40
const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('a Run of 40 tool rounds completes when the receivers write through the routed journal', async () => {
  const w = await openW2World({
    model: admission =>
      admission.index < ROUNDS
        ? { parts: [toolCallBlock(`tc-${admission.index}`)], reason: 'tool-suggestions' }
        : { parts: [replyText('done', 'every file read')], reason: 'stop' },
    tool: index => ({ content: [replyText(`tool-${index}`, `the content of file ${index}`)] }),
    defaultDelayMs: 0,
    earlier: 'session',
    reception: 'routed',
    maxRunSteps: 1000,
  })
  worlds.push(w)
  await w.createSession('long-run')
  await w.runRound(1, `read the ${ROUNDS} files one by one`, 600_000)
  expect(await w.lastOutcome()).toBe('completed')
  expect(w.tools.invoke.calls).toHaveLength(ROUNDS)
}, 900_000)
