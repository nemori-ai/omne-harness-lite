// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import { intakeAccess, ok } from './world.ts'
import { openW2World, replyText, toolCallBlock, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const LATER_STEPS = 4

it('a backgrounded call hands its outcome back to the conversation after the Run moved on', async () => {
  const finished = Promise.withResolvers<void>()
  const w = await openW2World({
    // Step 0 starts the call that moves to the background. The Run takes more steps before the
    // call ends, and goes on after its outcome is back.
    model: admission => {
      if (admission.index === LATER_STEPS) finished.resolve()
      return admission.index <= LATER_STEPS
        ? { parts: [toolCallBlock(`tc-${admission.index}`)], reason: 'tool-suggestions' }
        : { parts: [replyText('done', 'all read')], reason: 'stop' }
    },
    tool: index =>
      index === 0
        ? {
            content: [replyText('built', 'the build passed')],
            background: true,
            hold: finished.promise,
          }
        : { content: [replyText(`tool-${index}`, `file ${index}`)] },
    defaultDelayMs: 0,
    earlier: 'session',
    reception: 'routed',
  })
  worlds.push(w)
  await w.createSession('w2-background')
  await w.runRound(1, 'build in the background and read the files', 120_000)

  // The outcome is kept at the place the call was made from, steps after its placeholder.
  expect(await w.toolPushes[0]).toHaveProperty('ok')
  // Session reads what was kept and takes the outcome as an input of the conversation.
  const calls = async () => ok(await w.probe.readWork(intakeAccess)).backgroundCalls
  await w.until(async () => (await calls())?.[0]?.settled === 'input')
  expect(await calls()).toMatchObject([{ source: 'launched', settled: 'input' }])
  expect(await w.lastOutcome()).toBe('completed')
}, 180_000)

it('a backgrounded call that ends after its Run ended still hands its outcome back', async () => {
  const finished = Promise.withResolvers<void>()
  const w = await openW2World({
    model: admission =>
      admission.index === 0
        ? { parts: [toolCallBlock('tc-0')], reason: 'tool-suggestions' }
        : { parts: [replyText(`done-${admission.index}`, 'done')], reason: 'stop' },
    tool: () => ({
      content: [replyText('built', 'the build passed')],
      background: true,
      hold: finished.promise,
    }),
    defaultDelayMs: 0,
    earlier: 'session',
    reception: 'routed',
  })
  worlds.push(w)
  await w.createSession('w2-background-ended')
  await w.runRound(1, 'build in the background', 120_000)
  expect(await w.lastOutcome()).toBe('completed')
  const runs = w.endedRuns().length

  finished.resolve()
  // Kept at the place of an execution that has ended, and taken by the conversation as an input:
  // it wakes a Run of its own.
  expect(await w.toolPushes[0]).toHaveProperty('ok')
  const calls = async () => ok(await w.probe.readWork(intakeAccess)).backgroundCalls
  await w.until(async () => (await calls())?.[0]?.settled === 'input')
  await w.until(() => w.endedRuns().length > runs)
  expect(w.endedRuns().at(-1)).toMatchObject({ outcome: 'completed' })
}, 180_000)

it('a result version that comes late for a call the Run is done with is kept', async () => {
  const later = Promise.withResolvers<void>()
  const w = await openW2World({
    model: admission => {
      if (admission.index === LATER_STEPS) later.resolve()
      return admission.index <= LATER_STEPS
        ? { parts: [toolCallBlock(`tc-${admission.index}`)], reason: 'tool-suggestions' }
        : { parts: [replyText('done', 'all read')], reason: 'stop' }
    },
    tool: index => ({
      content: [replyText(`tool-${index}`, `file ${index}`)],
      ...(index === 0 ? { late: later.promise } : {}),
    }),
    defaultDelayMs: 0,
    earlier: 'session',
    reception: 'routed',
  })
  worlds.push(w)
  await w.createSession('w2-late-version')
  await w.runRound(1, 'read the files', 120_000)

  await w.until(() => w.toolLatePushes.length === 1)
  expect(await w.toolLatePushes[0]).toHaveProperty('ok')
  expect(await w.lastOutcome()).toBe('completed')
}, 180_000)
