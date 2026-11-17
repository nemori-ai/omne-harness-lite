// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentJournal, ExecutionSnapshot } from '@omne-harness/agent-contract'
import { replyText, toolCallBlock, openW2World, type W2World } from './w2-world.ts'

const ROUNDS = 60
const TIERS = [5, 20, 60] as const

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

type Held = Readonly<{ results: number; effects: number; handoffs: number; bytes: number }>

const heldOf = (snapshot: ExecutionSnapshot): Held => ({
  results: snapshot.results.length,
  effects: snapshot.effects.length,
  handoffs: snapshot.handoffs.length,
  bytes: Buffer.byteLength(
    JSON.stringify([snapshot.results, snapshot.effects, snapshot.handoffs]),
    'utf8',
  ),
})

const larger = (left: Held | undefined, right: Held): Held =>
  left === undefined
    ? right
    : {
        results: Math.max(left.results, right.results),
        effects: Math.max(left.effects, right.effects),
        handoffs: Math.max(left.handoffs, right.handoffs),
        bytes: Math.max(left.bytes, right.bytes),
      }

function observed<P>(journal: AgentJournal<P>, seen: (snapshot: ExecutionSnapshot) => void) {
  const load: AgentJournal<P>['load'] = async input => {
    const answer = await journal.load(input)
    if ('ok' in answer) seen(answer.ok)
    return answer
  }
  return new Proxy(journal, {
    get(target, member) {
      if (member === 'load') return load
      const value: unknown = Reflect.get(target, member, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

describe('the snapshot the Agent loads holds its open work only', () => {
  it('holds as many results, effects and handoffs at step 60 as at step 5 of one Run', async () => {
    let round = 0
    const largest = new Map<number, Held>()
    const w = await openW2World({
      model: admission => {
        round = admission.index + 1
        return admission.index < ROUNDS
          ? { parts: [toolCallBlock(`tc-${admission.index}`)], reason: 'tool-suggestions' }
          : { parts: [replyText('done', 'every file read')], reason: 'stop' }
      },
      tool: index => ({ content: [replyText(`tool-${index}`, `the content of file ${index}`)] }),
      defaultDelayMs: 20,
      earlier: 'session',
      receptionTargets: 'journal',
      maxRunSteps: 1000,
      wrapAgentDependencies: dependencies => ({
        ...dependencies,
        journal: observed(dependencies.journal, snapshot => {
          const finishing = snapshot.state.kind === 'settling' || snapshot.state.kind === 'ended'
          if (!finishing) largest.set(round, larger(largest.get(round), heldOf(snapshot)))
        }),
      }),
    })
    worlds.push(w)
    await w.createSession('c8b-open-snapshot')
    await w.runRound(1, `read the ${ROUNDS} files one by one`, 900_000)

    expect(await w.lastOutcome()).toBe('completed')
    const tiers = TIERS.map(tier => largest.get(tier))
    expect(tiers.every(item => item !== undefined)).toBe(true)
    const [first, ...rest] = tiers as Held[]
    for (const later of rest) {
      expect({ ...later, bytes: 0 }).toEqual({ ...first!, bytes: 0 })
      expect(later.bytes).toBeLessThanOrEqual(first!.bytes + 2048)
    }
  }, 1_200_000)
})
