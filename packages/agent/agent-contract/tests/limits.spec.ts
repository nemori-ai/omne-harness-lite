// The limits of the input of a judgment (SPEC, "定义与扩展声明"): the declaration limits that
// `judgeAgentDefinition` and `judgeLoopExtensions` apply, and the wider limits that
// `judgeExtensionOutput` applies to the output of an extension.
//
// A function is the probe. The copy that a judgment takes of its input refuses a function as
// `executable`, but a limit that is exceeded before the function is reached refuses the input as
// `malformed`. So a function placed right after the value that sits on a limit shows whether the copy
// stopped at the limit or went on past it, with a different reason that no later check can restore.
import { describe, expect, it } from 'vitest'
import {
  judgeAgentDefinition,
  judgeExtensionOutput,
  judgeLoopExtensions,
  type ExtensionOutputJudgeInput,
  type Subject,
} from '@omne-harness/agent-contract'

const probe = () => undefined

const definition = (extra: Record<string, unknown>) => ({
  category: 'AgentDefinition',
  name: 'coding',
  references: [],
  attributes: [],
  ...extra,
})

const extension = {
  name: 'format',
  position: 'before_model_call',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: 'format' },
}

const executable = { kind: 'refused', reason: 'executable' }
const malformed = { kind: 'refused', reason: 'malformed' }

/** A chain of `wrappers` objects around the leaf. The leaf sits `wrappers` levels below the value. */
function nested(wrappers: number, leaf: unknown): unknown {
  let value = leaf
  for (let level = 0; level < wrappers; level += 1) value = { k: value }
  return value
}

describe('the declaration limits of a definition', () => {
  it('accepts a string of exactly 10000 units and refuses one of 10001 as malformed', async () => {
    expect(await judgeAgentDefinition(definition({ name: 'a'.repeat(10_000) }))).toMatchObject({
      kind: 'accepted',
    })
    expect(await judgeAgentDefinition(definition({ name: 'a'.repeat(10_001) }))).toEqual(malformed)
  })

  it('stops at a string of 10001 units before it reaches what follows, and goes past one of 10000', async () => {
    expect(
      await judgeAgentDefinition(definition({ extra: 'a'.repeat(10_000), run: probe })),
    ).toEqual(executable)
    expect(
      await judgeAgentDefinition(definition({ extra: 'a'.repeat(10_001), run: probe })),
    ).toEqual(malformed)
  })

  it('stops at a value deeper than 20 levels and goes past a value on level 20', async () => {
    expect(await judgeAgentDefinition(definition({ extra: nested(19, probe) }))).toEqual(executable)
    expect(await judgeAgentDefinition(definition({ extra: nested(20, probe) }))).toEqual(malformed)
  })

  it('stops at the 201st JSON value and goes past the 200th', async () => {
    // The root, `category`, `name`, `references` and `attributes` are 5 values, the array is the 6th.
    const nodeAt = (position: number) =>
      definition({ extra: [...Array<number>(position - 7).fill(0), probe] })
    expect(await judgeAgentDefinition(nodeAt(200))).toEqual(executable)
    expect(await judgeAgentDefinition(nodeAt(201))).toEqual(malformed)
  })

  it('stops at an object of 81 members and goes past one of 80', async () => {
    const members = (count: number) =>
      Object.fromEntries([
        ...Array.from({ length: count - 1 }, (_, index) => [`k${index}`, 0] as const),
        ['run', probe] as const,
      ])
    expect(await judgeAgentDefinition(definition({ extra: members(80) }))).toEqual(executable)
    expect(await judgeAgentDefinition(definition({ extra: members(81) }))).toEqual(malformed)
  })

  it('refuses a number that has no JSON text before it reaches what follows', async () => {
    for (const number of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        await judgeAgentDefinition(definition({ extra: number, run: probe })),
        String(number),
      ).toEqual(malformed)
    }
    expect(await judgeAgentDefinition(definition({ extra: 1.5e308, run: probe }))).toEqual(
      executable,
    )
  })

  it('refuses a definition whose own text is longer than 100000 bytes although every value fits', async () => {
    // Four strings of 9000 three-byte characters are 108000 bytes. The copy counts units, not bytes.
    const wide = '中'.repeat(9000)
    const refused = await judgeAgentDefinition(
      definition({
        name: wide,
        version: wide,
        references: [],
        attributes: [],
        extra: [wide, wide],
      }),
    )
    expect(refused).toEqual(malformed)
    const fits = await judgeAgentDefinition(definition({ name: wide, version: wide }))
    expect(fits).toMatchObject({ kind: 'accepted' })
  })
})

describe('the declaration limits of an extension batch', () => {
  const item = (extra: Record<string, unknown> = {}) => ({ ...extension, ...extra })

  it('reports the batch member that holds a value over a limit, and 0 for a limit of the whole text', async () => {
    const ok = item()
    expect(await judgeLoopExtensions([ok, ok, item({ extra: 'a'.repeat(10_001) })])).toEqual({
      ...malformed,
      index: 2,
    })
    expect(await judgeLoopExtensions([ok, ok, item({ extra: nested(20, 0) })])).toEqual({
      ...malformed,
      index: 2,
    })
    const wide = Object.fromEntries(Array.from({ length: 81 }, (_, index) => [`k${index}`, 0]))
    expect(await judgeLoopExtensions([ok, ok, item({ extra: wide })])).toEqual({
      ...malformed,
      index: 2,
    })
    // The 201st value makes the whole text too large: the index is 0 and not the member's.
    expect(
      await judgeLoopExtensions([ok, ok, item({ extra: [...Array<number>(190).fill(0), probe] })]),
    ).toEqual({ ...malformed, index: 0 })
  })

  it('reports the batch member whose 21st container is empty, as for a deeper one', async () => {
    // The batch, the member and 18 objects are 20 containers, so the empty array opens level 21.
    // The copy counts a container as it opens, as the reread of the whole text does, so the member
    // is named and the index is not 0.
    const ok = item()
    expect(await judgeLoopExtensions([ok, item({ extra: nested(18, []) })])).toEqual({
      ...malformed,
      index: 1,
    })
    expect(await judgeLoopExtensions([ok, item({ needs: nested(18, {}) })])).toEqual({
      ...malformed,
      index: 1,
    })
    // The copy stops at that container before it reaches the function, and goes past level 20.
    expect(await judgeLoopExtensions([ok, item({ extra: nested(18, []), run: probe })])).toEqual({
      ...malformed,
      index: 1,
    })
    expect(await judgeLoopExtensions([ok, item({ extra: nested(17, []), run: probe })])).toEqual({
      ...executable,
      index: 1,
    })
  })

  it('stops at a reference to the batch member itself and names the member', async () => {
    // 79 members and the reference are 80 members, so only the cycle is wrong. A copy that went on
    // around the cycle would run out of values first and report index 0.
    const cyclic: Record<string, unknown> = {}
    for (let index = 0; index < 79; index += 1) cyclic[`k${index}`] = 0
    cyclic['self'] = cyclic
    const ok = item()
    expect(await judgeLoopExtensions([ok, ok, cyclic])).toEqual({ ...malformed, index: 2 })
  })

  it('refuses a definition that contains itself as malformed', async () => {
    const cyclic: Record<string, unknown> = definition({})
    cyclic['self'] = cyclic
    expect(await judgeAgentDefinition(cyclic)).toEqual(malformed)
  })
})

describe('the limits of the output of an extension', () => {
  const base: ExtensionOutputJudgeInput = {
    position: 'before_action',
    dimension: null,
    purpose: null,
    power: 'rewrite',
    trigger: null,
    subject: {} as Subject,
    output: undefined,
  }

  /** A rewrite that hands back the subject unchanged, so that only the limits can refuse it. */
  function rewriteOf(members: Record<string, unknown>) {
    return judgeExtensionOutput({
      ...base,
      subject: members as unknown as Subject,
      output: { kind: 'rewrite', subject: members },
    })
  }

  it('accepts a value on level 64 and refuses one on level 65', () => {
    // The output is level 0 and its subject is level 1, so `n` is level 2 and its leaf level 2 + wrappers.
    expect(rewriteOf({ n: nested(62, 0) })).toMatchObject({ kind: 'accepted' })
    expect(rewriteOf({ n: nested(63, 0) })).toEqual({ kind: 'refused', reason: 'malformed' })
  })

  it('accepts a subject of 10000 members and refuses one of 10001', () => {
    const members = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, 0]))
    expect(rewriteOf(members(10_000))).toMatchObject({ kind: 'accepted' })
    expect(rewriteOf(members(10_001))).toEqual({ kind: 'refused', reason: 'malformed' })
  })

  it('accepts a string of 10000000 units and refuses one of 10000001', () => {
    expect(rewriteOf({ text: 'a'.repeat(10_000_000) })).toMatchObject({ kind: 'accepted' })
    expect(rewriteOf({ text: 'a'.repeat(10_000_001) })).toEqual({
      kind: 'refused',
      reason: 'malformed',
    })
  })

  it('accepts 1000000 JSON values and refuses 1000001', () => {
    // The output, `kind`, `subject` and the array are 4 values.
    const values = (count: number) => ({ list: Array<number>(count - 4).fill(0) })
    expect(rewriteOf(values(1_000_000))).toMatchObject({ kind: 'accepted' })
    expect(rewriteOf(values(1_000_001))).toEqual({ kind: 'refused', reason: 'malformed' })
  })
})
