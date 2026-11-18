// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  decodeExecutionRecordOpen,
  decodeExecutionRecordOpenItems,
  type ExecutionItemKey,
} from '@omne-harness/session-storage-sql/participants'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'
import { SESSION, TENANT, textOf } from './world.ts'

const ROUNDS = 60

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

type Counts = Record<string, number>

// The open items the store holds for the session, counted by family over its executions.
async function openItemsOf(storage: SqlStorage): Promise<Counts> {
  const domain = {
    scope: { kind: 'tenant' as const, tenant: textOf(TENANT) },
    transactionDomain: 'dom_0',
  }
  let request = 0
  const read = async (handler: string, input: Record<string, unknown>) => {
    request += 1
    const result = await storage.read({
      domain,
      handler,
      protocol: EXECUTION_RECORD_PROTOCOL,
      requestKey: `c8b-open-items-${String(request)}-${String(Math.random())}`,
      input: { tenant: textOf(TENANT), session: SESSION, ...input } as never,
    })
    if (result.kind !== 'read') throw new Error(`${handler}: ${result.kind}`)
    return result.output
  }
  const open = decodeExecutionRecordOpen(await read(EXECUTION_RECORD_HANDLERS.openExecutions, {}))
  if (open?.kind !== 'open') throw new Error('the open executions do not decode')
  const counts: Counts = {}
  for (const { execution } of open.executions) {
    let after: ExecutionItemKey | null = null
    for (;;) {
      const page = decodeExecutionRecordOpenItems(
        await read(EXECUTION_RECORD_HANDLERS.openItems, { execution, after }),
      )
      if (page?.kind !== 'open') throw new Error('the open items do not decode')
      for (const item of page.items) counts[item.family] = (counts[item.family] ?? 0) + 1
      if (page.next === null) break
      after = page.next
    }
  }
  return counts
}

// The count once the store has stopped moving: the model reply of the step is held meanwhile, so
// what still lands is only what the steps before it left to interpret.
async function settledItemsOf(storage: SqlStorage): Promise<Counts> {
  let last = JSON.stringify(await openItemsOf(storage))
  for (let same = 0; same < 3;) {
    await new Promise(resolve => setTimeout(resolve, 50))
    const next = JSON.stringify(await openItemsOf(storage))
    same = next === last ? same + 1 : 0
    last = next
  }
  return JSON.parse(last) as Counts
}

type Scenario = Readonly<{
  // The steps the open items are counted at: three prefixes of one Run.
  tiers: readonly [number, number, number]
  // Whether the tool call of a step moves to the background, and at which step it ends.
  background: (index: number) => number | null
}>

async function tiersOf(name: string, scenario: Scenario): Promise<Counts[]> {
  let storage: SqlStorage | null = null
  const counted = new Map<number, Counts>()
  const reached = new Map<number, PromiseWithResolvers<void>>()
  const step = (index: number) => {
    const known = reached.get(index) ?? Promise.withResolvers<void>()
    reached.set(index, known)
    return known
  }
  const w = await openW2World({
    model: admission => {
      const { index } = admission
      step(index).resolve()
      const tier = scenario.tiers.includes(index) && storage !== null
      const hold = tier
        ? settledItemsOf(storage!).then(counts => void counted.set(index, counts))
        : undefined
      return index < ROUNDS
        ? {
            parts: [toolCallBlock(`tc-${String(index)}`)],
            reason: 'tool-suggestions',
            ...(hold === undefined ? {} : { hold }),
          }
        : {
            parts: [replyText('done', 'every file read')],
            reason: 'stop',
            ...(hold === undefined ? {} : { hold }),
          }
    },
    tool: index => {
      const content = [replyText(`tool-${String(index)}`, `the content of file ${String(index)}`)]
      const ends = scenario.background(index)
      return ends === null ? { content } : { content, background: true, hold: step(ends).promise }
    },
    defaultDelayMs: 0,
    earlier: 'session',
    reception: 'routed',
    maxRunSteps: 1000,
    wrapStorage: inner => {
      storage = inner
      return inner
    },
  })
  worlds.push(w)
  await w.createSession(name)
  await w.runRound(1, `read the ${String(ROUNDS)} files one by one`, 900_000)
  expect(await w.lastOutcome()).toBe('completed')
  const tiers = scenario.tiers.map(tier => counted.get(tier))
  expect(tiers.every(item => item !== undefined)).toBe(true)
  return tiers as Counts[]
}

describe('the store holds the open work of a long Run only', () => {
  it('holds as many open items of every family at step 60 as at step 10 of one Run', async () => {
    const scenario = { tiers: [10, 30, 60], background: () => null } as const
    const [first, ...rest] = await tiersOf('c8b-open-items', scenario)
    for (const later of rest) expect(later).toEqual(first)
  }, 1_200_000)

  // Counted where the Run stands the same way to its background calls: every tier is a third step.
  it('holds as many when every third call moves to the background and ends two steps later', async () => {
    const [first, ...rest] = await tiersOf('c8b-open-items-background', {
      tiers: [12, 30, 60],
      background: index => (index % 3 === 0 && index + 2 < ROUNDS ? index + 2 : null),
    })
    for (const later of rest) expect(later).toEqual(first)
  }, 1_200_000)
})
