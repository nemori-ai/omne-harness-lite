import { describe, expect, it } from 'vitest'
import {
  admitCall,
  finishCall,
  generationFell,
  noGenerations,
  prepareGeneration,
  promoteGeneration,
  standbyFailed,
  stateOfGeneration,
  type Generations,
  type GenerationState,
} from '../src/index.ts'

function must<T extends { kind: string }, K extends T['kind']>(
  step: T,
  kind: K,
): Extract<T, { kind: K }> {
  if (step.kind !== kind) throw new Error(`expected ${kind}: ${JSON.stringify(step)}`)
  return step as Extract<T, { kind: K }>
}
const prepared = (from: Generations = noGenerations) => must(prepareGeneration(from), 'prepared')
const promoted = (from: Generations) => must(promoteGeneration(from), 'promoted').generations
const admitted = (from: Generations) => must(admitCall(from), 'admitted')

/** One row brought to where its generation `1` is in each state of the table. */
const AT: Readonly<Record<GenerationState, () => Generations>> = {
  absent: () => noGenerations,
  standby: () => prepared().generations,
  serving: () => promoted(prepared().generations),
  retiring: () => {
    const held = admitted(promoted(prepared().generations)).generations
    return promoted(prepared(held).generations)
  },
  retired: () => promoted(prepared(promoted(prepared().generations)).generations),
  failed: () => must(standbyFailed(prepared().generations), 'failed').generations,
}

describe('一代的全化表：每个状态下每个操作都有答复', () => {
  it('六个状态各到得了', () => {
    for (const [state, at] of Object.entries(AT)) expect(stateOfGeneration(at(), 1)).toBe(state)
  })

  it('一开始什么都没有；不是发过的代数一律答没有这一代', () => {
    expect(noGenerations).toEqual({
      issued: 0,
      standby: null,
      serving: null,
      retiring: [],
      failed: [],
      held: {},
    })
    const two = prepared(AT.serving()).generations
    for (const generation of [0, -1, 1.5, 3])
      expect(stateOfGeneration(two, generation)).toBe('absent')
  })

  it('第一代进入服务：没有谁被换下，也没有谁撤完；一次调用做完之后名下不留零', () => {
    const first = must(promoteGeneration(AT.standby()), 'promoted')
    expect(first.drained).toEqual([])
    const call = admitted(first.generations)
    expect(call.generations.held).toEqual({ 1: 1 })
    expect(must(finishCall(call.generations, 1), 'finished').generations.held).toEqual({})
  })

  it('备：只有没有一代备着时成立；代数只增不重用', () => {
    expect(prepareGeneration(AT.absent())).toMatchObject({ kind: 'prepared', generation: 1 })
    expect(prepareGeneration(AT.standby())).toEqual({ kind: 'refused', reason: 'standby-exists' })
    expect(prepareGeneration(AT.serving())).toMatchObject({ kind: 'prepared', generation: 2 })
    expect(prepareGeneration(AT.retiring())).toMatchObject({ kind: 'prepared', generation: 3 })
    expect(prepareGeneration(AT.retired())).toMatchObject({ kind: 'prepared', generation: 3 })
    expect(prepareGeneration(AT.failed())).toMatchObject({ kind: 'prepared', generation: 2 })
  })

  it('启动成了，换：备着的进入服务，原来在服务的同一步变成正在撤下', () => {
    expect(promoteGeneration(AT.absent())).toEqual({ kind: 'refused', reason: 'no-standby' })
    expect(promoteGeneration(AT.serving())).toEqual({ kind: 'refused', reason: 'no-standby' })
    const first = must(promoteGeneration(AT.standby()), 'promoted')
    expect([first.serving, first.superseded]).toEqual([1, null])
    const held = admitted(AT.serving()).generations
    const second = must(promoteGeneration(prepared(held).generations), 'promoted')
    expect([second.serving, second.superseded]).toEqual([2, 1])
    expect(stateOfGeneration(second.generations, 1)).toBe('retiring')
    expect(stateOfGeneration(second.generations, 2)).toBe('serving')
  })

  it('换的时候旧的一代名下没有在途的：它直接撤完', () => {
    const next = must(promoteGeneration(prepared(AT.serving()).generations), 'promoted')
    expect(stateOfGeneration(next.generations, 1)).toBe('retired')
    expect(next.drained).toEqual([1])
  })

  it('启动抛错：备着的起不来，在服务的那一代不动', () => {
    expect(standbyFailed(AT.absent())).toEqual({ kind: 'refused', reason: 'no-standby' })
    const before = prepared(AT.serving()).generations
    const after = must(standbyFailed(before), 'failed')
    expect(after.generation).toBe(2)
    expect(stateOfGeneration(after.generations, 1)).toBe('serving')
    expect(stateOfGeneration(after.generations, 2)).toBe('failed')
    expect(prepareGeneration(after.generations)).toMatchObject({ kind: 'prepared', generation: 3 })
  })

  it('受理一次调用：钉在在服务的那一代上；没有在服务的就答不可用', () => {
    for (const state of ['absent', 'standby', 'failed'] as const)
      expect(admitCall(AT[state]())).toEqual({ kind: 'unavailable' })
    expect(admitCall(AT.serving())).toMatchObject({ kind: 'admitted', generation: 1 })
    // A retiring generation takes nothing new: the call goes to the one that serves.
    expect(admitCall(AT.retiring())).toMatchObject({ kind: 'admitted', generation: 2 })
  })

  it('一次调用做完：放开；正在撤下的那一代名下没有在途的了，就撤完', () => {
    const held = admitted(AT.serving()).generations
    expect(finishCall(held, 1)).toMatchObject({ kind: 'finished', drained: false })
    const done = must(finishCall(AT.retiring(), 1), 'finished')
    expect(done.drained).toBe(true)
    expect(stateOfGeneration(done.generations, 1)).toBe('retired')
    // Two calls held: the first to finish does not drain it.
    const two = promoted(
      prepared(admitted(admitted(AT.serving()).generations).generations).generations,
    )
    const one = must(finishCall(two, 1), 'finished')
    expect(one.drained).toBe(false)
    expect(must(finishCall(one.generations, 1), 'finished').drained).toBe(true)
  })

  it('名下没有在途调用的一代再说做完：幂等，什么都不改', () => {
    for (const state of ['absent', 'standby', 'serving', 'retired', 'failed'] as const)
      expect(finishCall(AT[state](), 1)).toEqual({ kind: 'nothing-held' })
  })

  it('这一代自己倒了：备着的起不来；正在撤下的把在途的记成未知并撤完；在服务的没有人服务了', () => {
    expect(generationFell(AT.standby(), 1)).toMatchObject({ kind: 'fell', unknown: 0 })
    expect(stateOfGeneration(must(generationFell(AT.standby(), 1), 'fell').generations, 1)).toBe(
      'failed',
    )
    const retiring = must(generationFell(AT.retiring(), 1), 'fell')
    expect(retiring.unknown).toBe(1)
    expect(stateOfGeneration(retiring.generations, 1)).toBe('retired')
    expect(stateOfGeneration(retiring.generations, 2)).toBe('serving')
    const serving = must(generationFell(admitted(AT.serving()).generations, 1), 'fell')
    expect(serving.unknown).toBe(1)
    expect(admitCall(serving.generations)).toEqual({ kind: 'unavailable' })
    for (const state of ['absent', 'retired', 'failed'] as const)
      expect(generationFell(AT[state](), 1)).toEqual({ kind: 'nothing-there' })
  })
})

describe('AS-13、AS-14：一次调用只在一代上；一步换代没有空白', () => {
  it('随机的操作序列', () => {
    let seed = 13
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const sequences = new Set<string>()
    for (let run = 0; run < 2000; run += 1) {
      let generations = noGenerations
      const held = new Map<number, number>()
      let everServed = false
      const trace: string[] = []
      for (let turn = 0; turn < 30; turn += 1) {
        const pick = Math.floor(next() * 6)
        const before = generations
        if (pick === 0) {
          const step = prepareGeneration(generations)
          if (step.kind === 'prepared') generations = step.generations
          trace.push(`p${step.kind[0]}`)
        } else if (pick === 1) {
          const step = promoteGeneration(generations)
          if (step.kind === 'promoted') {
            generations = step.generations
            everServed = true
          }
          trace.push(`s${step.kind[0]}`)
        } else if (pick === 2) {
          const step = standbyFailed(generations)
          if (step.kind === 'failed') generations = step.generations
          trace.push(`f${step.kind[0]}`)
        } else if (pick <= 4) {
          const step = admitCall(generations)
          if (step.kind === 'admitted') {
            generations = step.generations
            // Only the serving generation takes a call.
            expect(stateOfGeneration(before, step.generation)).toBe('serving')
            held.set(step.generation, (held.get(step.generation) ?? 0) + 1)
          }
          trace.push(`a${step.kind[0]}`)
        } else {
          const open = [...held].filter(([, count]) => count > 0)
          const chosen = open[Math.floor(next() * open.length)]
          if (chosen !== undefined) {
            const step = must(finishCall(generations, chosen[0]), 'finished')
            generations = step.generations
            held.set(chosen[0], chosen[1] - 1)
            trace.push(`d${String(chosen[0])}`)
          }
        }
        // No gap: once a generation served, one serves at every later moment (nothing falls in this run).
        if (everServed) expect(generations.serving).not.toBeNull()
        // No orphan: a generation with calls held is serving or retiring, never retired.
        for (const [generation, count] of held)
          if (count > 0)
            expect(['serving', 'retiring']).toContain(stateOfGeneration(generations, generation))
      }
      sequences.add(trace.join(''))
    }
    console.log(`generation property: ${String(sequences.size)} distinct sequences of 2000`)
    expect(sequences.size).toBeGreaterThan(1800)
  })
})
