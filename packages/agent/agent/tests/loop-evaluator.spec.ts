// The pure evaluator of #510 (C1): what it decides at E4 and I8, that it answers `unsupported`
// instead of guessing outside the normal path, and, over many seeded `LoopFacts`, that the same
// facts give the same `Next`, that it never changes its input, and that every step it takes has a
// row in the transition table. The evaluator is reached through the root entry; the table and the
// module graph are read from the source (tests/README.md).
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import { decodeStepId, type LoopFacts, type Next } from '@omne-harness/agent-contract'
import { LOOP_NODES, successor, type LoopNode } from '../src/loop/nodes.ts'
import { adoption, failure, ok } from './journal-support.ts'
import {
  cancelControl,
  conditions,
  inputBatch,
  loopFacts,
  pendingCall,
  responsibility,
  unresolvedProducer,
} from './loop-support.ts'
import { describeImport, memberPath, walkModules } from './module-graph.ts'

const unsupported = { kind: 'unsupported' }

describe('initial', () => {
  it('starts a checkpoint at E3 with the definition and step and every facet empty', () => {
    const step = ok(decodeStepId('step-0'))
    const checkpoint = ok(agentEvaluator.initial({ definition: adoption('definition'), step }))
    expect(checkpoint).toMatchObject({
      definition: adoption('definition'),
      step,
      position: 'E3',
      calls: [],
      passages: [],
      batch: null,
      inputBatch: null,
      requestPreparation: null,
      compaction: null,
      adoptedContext: null,
      guard: null,
      completedPassages: [],
      priorConditions: null,
    })
  })

  it('refuses a definition that is not an adoption', () => {
    const step = ok(decodeStepId('step-0'))
    const definition = { ...adoption('definition'), digest: '' }
    expect(failure(agentEvaluator.initial({ definition, step }))).toEqual({
      kind: 'invalid',
      field: 'definition',
      reason: 'empty',
    })
  })
})

describe('next at the decision segments E4 and I8', () => {
  it('E4 after the execution-start passage opens the first iteration at I0', () => {
    expect(ok(agentEvaluator.next(loopFacts('E4', { batch: inputBatch(1) })))).toEqual({
      kind: 'take-inputs',
      position: 'I0',
    })
  })

  it('I8 with nothing pending and completion to evaluate proposes completion', () => {
    expect(
      ok(agentEvaluator.next(loopFacts('I8', { consumption: [responsibility('processed')] }))),
    ).toEqual({ kind: 'try-finish', conclusion: { kind: 'complete' }, failure: null })
  })

  it('I8 with an input within the watermark opens a new iteration', () => {
    expect(ok(agentEvaluator.next(loopFacts('I8', { batch: inputBatch(1) })))).toEqual({
      kind: 'take-inputs',
      position: 'I0',
    })
  })

  it('I8 under a continue directive opens a new iteration on an empty batch', () => {
    expect(
      ok(agentEvaluator.next(loopFacts('I8', { conditions: conditions('continue') }))),
    ).toEqual({ kind: 'take-inputs', position: 'I0' })
  })

  it('an ended or superseded advancement stops, whatever the position', () => {
    const at = (kind: 'ended' | 'superseded') =>
      loopFacts('I8', { advancement: { kind, source: adoptionEvidence() } })
    expect(ok(agentEvaluator.next(at('ended')))).toEqual({ kind: 'stop', reason: 'terminal' })
    expect(ok(agentEvaluator.next(at('superseded')))).toEqual({
      kind: 'stop',
      reason: 'superseded',
    })
  })
})

describe('next answers unsupported outside the normal path, never a guessed step', () => {
  const cases: readonly (readonly [string, LoopFacts])[] = [
    [
      'a stopping advancement',
      loopFacts('I8', { advancement: { kind: 'stopping', source: adoptionEvidence() } }),
    ],
    ['a control', loopFacts('I8', { controls: [cancelControl] })],
    [
      'an open call at I8',
      loopFacts('I8', { checkpoint: { ...loopFacts('I8').checkpoint, calls: [pendingCall] } }),
    ],
    ['a producer at I8', loopFacts('I8', { producers: [unresolvedProducer] })],
    ['an owed result at I8', loopFacts('I8', { consumption: [responsibility('owed')] })],
    ['the continuation point I1', loopFacts('I1')],
    ['the passage position E3', loopFacts('E3')],
  ]
  it.each(cases)('%s', (_, facts) => {
    expect(failure(agentEvaluator.next(facts))).toEqual(unsupported)
  })
})

describe('codec', () => {
  it('encode keeps position and adoptions and writes the checkpoint as a JSON tree', () => {
    const { checkpoint } = loopFacts('I8')
    const encoded = agentEvaluator.encode(checkpoint)
    expect(encoded).toMatchObject({
      position: 'I8',
      definition: checkpoint.definition,
      schema: checkpoint.schema,
    })
    expect(encoded.value.kind).toBe('object')
  })

  it('encode writes strings, booleans, finite numbers and null, and leaves out absent members', () => {
    const { checkpoint } = loopFacts('I8')
    // The checkpoint is data only; a member of another type is the test's input to the encoder.
    const value = { ...checkpoint, guard: { flag: true, count: 1.5, absent: undefined } }
    const encoded = agentEvaluator.encode(value as unknown as typeof checkpoint)
    const entries = encoded.value.kind === 'object' ? encoded.value.entries : []
    expect(entries.find(entry => entry.key === 'guard')?.value).toEqual({
      kind: 'object',
      entries: [
        { key: 'flag', value: { kind: 'boolean', value: true } },
        { key: 'count', value: { kind: 'number', lexeme: '1.5' } },
      ],
    })
    expect(entries.find(entry => entry.key === 'batch')?.value).toEqual({ kind: 'null' })
    expect(entries.find(entry => entry.key === 'calls')?.value).toEqual({
      kind: 'array',
      items: [],
    })
  })

  it.each([
    ['a non-finite number', Number.POSITIVE_INFINITY],
    ['a function', () => undefined],
  ])('encode throws on %s instead of writing a lossy value', (_, member) => {
    const { checkpoint } = loopFacts('I8')
    const value = { ...checkpoint, guard: { member } }
    expect(() => agentEvaluator.encode(value as unknown as typeof checkpoint)).toThrow(TypeError)
  })

  it('stage-temporary (#502 stage 5): decode takes no continuation as a checkpoint yet', () => {
    const encoded = agentEvaluator.encode(loopFacts('I8').checkpoint)
    expect(failure(agentEvaluator.decode(encoded))).toEqual(unsupported)
  })
})

function adoptionEvidence() {
  const { owner, name, revision, digest } = adoption('advancement')
  return { owner, record: name, revision, digest }
}

// ---------------------------------------------------------------------------------------------
// Seeded property test, as packages/tool/tool/tests/json-tree-wait.spec.ts builds its trees

/** Deterministic pseudo-random numbers, so that failing facts can be rebuilt from their seed. */
function randoms(seed: number): (below: number) => number {
  let state = seed >>> 0
  return below => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32) * below)
  }
}

function pick<T>(random: (below: number) => number, values: readonly T[]): T {
  const value = values[random(values.length)]
  if (value === undefined) throw new Error('pick from an empty list')
  return value
}

/** Positions of the node table, weighted towards the two decision segments, and two non-nodes. */
const POSITIONS: readonly string[] = [...LOOP_NODES, 'E4', 'E4', 'I8', 'I8', 'I8', 'Z9', '']

function generatedFacts(random: (below: number) => number): LoopFacts {
  const base = loopFacts(pick(random, POSITIONS))
  return {
    ...base,
    advancement: {
      kind: pick(random, ['current', 'current', 'current', 'stopping', 'ended', 'superseded']),
      source: adoptionEvidence(),
    },
    checkpoint: { ...base.checkpoint, calls: random(4) === 0 ? [pendingCall] : [] },
    conditions: conditions(pick(random, ['evaluate-completion', 'continue'])),
    batch: inputBatch(random(3)),
    producers: random(4) === 0 ? [unresolvedProducer] : [],
    consumption: Array.from({ length: random(3) }, () =>
      responsibility(pick(random, ['owed', 'custody', 'processed'])),
    ),
    controls: random(5) === 0 ? [cancelControl] : [],
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const member of Object.values(value)) deepFreeze(member)
  }
  return value
}

describe('C1 property: next is a pure function whose steps the table can take', () => {
  it('for 500 seeded facts: same facts give the same Next, the input is unchanged, and every step has a row', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 500; seed += 1) {
      const facts = generatedFacts(randoms(seed))
      const copy = structuredClone(facts)
      const first = agentEvaluator.next(deepFreeze(facts))
      expect(agentEvaluator.next(copy), `seed ${seed}`).toEqual(first)
      expect(agentEvaluator.next(facts), `seed ${seed}`).toEqual(first)
      expect(facts, `seed ${seed}`).toEqual(copy)
      if ('failure' in first) {
        seen.add('unsupported')
        continue
      }
      const next: Next = first.ok
      seen.add(next.kind)
      if (next.kind === 'stop') {
        expect(['ended', 'superseded'], `seed ${seed}`).toContain(facts.advancement.kind)
        continue
      }
      // A step is taken only at a decision segment, and the table has a row for it there.
      const position = facts.checkpoint.position as LoopNode
      expect(['E4', 'I0', 'I8'], `seed ${seed}`).toContain(position)
      expect(successor(position === 'I0' ? 'E4' : position, next.kind), `seed ${seed}`).toBeTruthy()
      if (next.kind === 'try-finish') {
        // Completion is proposed only with no input taken, nothing owed and completion to evaluate.
        expect(facts.batch.ordered, `seed ${seed}`).toEqual([])
        expect(facts.conditions.progression.kind, `seed ${seed}`).toBe('evaluate-completion')
        expect(facts.checkpoint.calls, `seed ${seed}`).toEqual([])
        expect(facts.producers, `seed ${seed}`).toEqual([])
      }
    }
    // The seeds reach every answer of this card.
    expect([...seen].sort()).toEqual(['stop', 'take-inputs', 'try-finish', 'unsupported'])
  })
})

describe('the evaluator module is pure by its imports', () => {
  it('its own modules import no coordinator, testing entry or Node module', () => {
    const graph = walkModules(memberPath('src/loop/evaluator.ts'), 'source')
    const own = [...graph.files].filter(file => file.startsWith(memberPath('src')))
    expect(own.sort()).toEqual(
      [memberPath('src/loop/evaluator.ts'), memberPath('src/loop/nodes.ts')].sort(),
    )
    expect(
      graph.imports
        .filter(edge => edge.from.startsWith(memberPath('src')))
        .filter(
          edge =>
            edge.specifier.startsWith('node:') ||
            edge.specifier.includes('testing') ||
            edge.specifier.includes('coordinator'),
        )
        .map(describeImport),
    ).toEqual([])
  })
})
