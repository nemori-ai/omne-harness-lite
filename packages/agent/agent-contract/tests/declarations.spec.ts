// The shape of what `judgeAgentDefinition` and `judgeLoopExtensions` return and the corners of the
// text rules that they apply. The accepted value is plain data, so these tests compare it with
// `toStrictEqual`: a member that holds `undefined`, or a member that is missing, is a defect, and
// `toEqual` would not see it.
import { describe, expect, it } from 'vitest'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent-contract'

const definition = (extra: Record<string, unknown> = {}) => ({
  category: 'AgentDefinition',
  name: 'coding',
  references: [],
  attributes: [],
  ...extra,
})

const builtin = { kind: 'builtin', builtinName: 'format' }
const command = {
  kind: 'command',
  host: 'codex',
  dialect: 'claude-hooks',
  event: 'PreToolUse',
  command: './check.sh',
}

const extension = (extra: Record<string, unknown> = {}) => ({
  name: 'e',
  position: 'before_action',
  power: 'veto',
  implementation: builtin,
  ...extra,
})

describe('the value of an accepted definition', () => {
  it('keeps every attribute item, in the order given, and nothing else', async () => {
    const judged = await judgeAgentDefinition(
      definition({
        attributes: [{ item: 'model' }, { item: 'first_token_wait_limit' }],
      }),
    )
    expect(judged).toStrictEqual({
      kind: 'accepted',
      value: {
        category: 'AgentDefinition',
        name: 'coding',
        version: { kind: 'then-legal-winner' },
        references: [],
        attributes: [{ item: 'model' }, { item: 'first_token_wait_limit' }],
      },
    })
  })

  it('carries `resident` only for a reference that stated it', async () => {
    const judged = await judgeAgentDefinition(
      definition({
        references: [
          { capability: { category: 'Tool', name: 'plain' } },
          { capability: { category: 'Tool', name: 'pinned' }, resident: false },
          { capability: { category: 'Tool', name: 'kept' }, resident: true },
        ],
      }),
    )
    expect(judged).toStrictEqual({
      kind: 'accepted',
      value: {
        category: 'AgentDefinition',
        name: 'coding',
        version: { kind: 'then-legal-winner' },
        references: [
          { capability: { category: 'Tool', name: 'plain' } },
          { capability: { category: 'Tool', name: 'pinned' }, resident: false },
          { capability: { category: 'Tool', name: 'kept' }, resident: true },
        ],
        attributes: [],
      },
    })
  })

  it('refuses the same attribute item twice as malformed, not as an unknown attribute', async () => {
    expect(
      await judgeAgentDefinition(
        definition({ attributes: [{ item: 'model' }, { item: 'model' }] }),
      ),
    ).toStrictEqual({ kind: 'refused', reason: 'malformed' })
  })

  it('names an unknown attribute item whichever attribute holds it', async () => {
    expect(
      await judgeAgentDefinition(
        definition({ attributes: [{ item: 'model' }, { item: 'persona' }] }),
      ),
    ).toStrictEqual({ kind: 'refused', reason: 'unknown-attribute' })
    expect(
      await judgeAgentDefinition(
        definition({ attributes: [{ item: 'persona' }, { item: 'model' }] }),
      ),
    ).toStrictEqual({ kind: 'refused', reason: 'unknown-attribute' })
  })
})

describe('the value of an accepted extension declaration', () => {
  it('keeps a command implementation without `matcher` and `timeout` free of both members', async () => {
    const judged = await judgeLoopExtensions([extension({ implementation: command })])
    expect(judged).toStrictEqual({
      kind: 'accepted',
      value: [extension({ implementation: command })],
    })
    if (judged.kind !== 'accepted') throw new Error('refused')
    expect(Object.keys(judged.value[0]?.implementation ?? {})).toEqual([
      'kind',
      'host',
      'dialect',
      'event',
      'command',
    ])
  })

  it('keeps `matcher` and `timeout` when each is given alone', async () => {
    const matcher = { ...command, matcher: 'Bash' }
    const timeout = { ...command, timeout: 'PT30S' }
    expect(await judgeLoopExtensions([extension({ implementation: matcher })])).toStrictEqual({
      kind: 'accepted',
      value: [extension({ implementation: matcher })],
    })
    expect(await judgeLoopExtensions([extension({ implementation: timeout })])).toStrictEqual({
      kind: 'accepted',
      value: [extension({ implementation: timeout })],
    })
  })

  it('accepts both endings and both scopes of a dimension, and returns them unchanged', async () => {
    for (const [position, dimension] of [
      ['after_model_call', { ending: 'complete_reply' }],
      ['after_model_call', { ending: 'failure' }],
      ['after_action', { scope: 'each' }],
      ['after_action', { scope: 'batch' }],
    ] as const) {
      expect(
        await judgeLoopExtensions([extension({ position, power: 'observe', dimension })]),
        JSON.stringify(dimension),
      ).toStrictEqual({
        kind: 'accepted',
        value: [extension({ position, power: 'observe', dimension })],
      })
    }
  })
})

describe('a dimension that is not an object', () => {
  const dimensions: readonly unknown[] = [null, [], 'ending', 1]

  it('is malformed at a position that takes one, whatever the value is', async () => {
    for (const dimension of dimensions) {
      for (const position of ['after_model_call', 'after_action']) {
        expect(
          await judgeLoopExtensions([extension({ position, power: 'observe', dimension })]),
          `${position} ${JSON.stringify(dimension)}`,
        ).toStrictEqual({ kind: 'refused', reason: 'malformed', index: 0 })
      }
    }
  })

  it('is not allowed at a position that takes none, whatever the value is', async () => {
    for (const dimension of dimensions) {
      expect(
        await judgeLoopExtensions([extension({ dimension })]),
        JSON.stringify(dimension),
      ).toStrictEqual({ kind: 'refused', reason: 'dimension-not-allowed', index: 0 })
    }
  })
})

describe('the text of a timeout', () => {
  const timeoutOf = (timeout: unknown) =>
    judgeLoopExtensions([extension({ implementation: { ...command, timeout } })])

  it('accepts a number of any length in every field of the duration', async () => {
    for (const timeout of [
      'P10Y',
      'P12M',
      'P10W',
      'P10D',
      'P10Y12M10W10D',
      'PT10H',
      'PT12M',
      'PT10S',
      'PT10H12M10S',
      'PT0.25S',
      'PT1.125S',
      'P10Y12M10W10DT10H12M10.125S',
    ]) {
      expect(await timeoutOf(timeout), timeout).toMatchObject({ kind: 'accepted' })
    }
  })

  it('refuses a text that has something before or after the duration', async () => {
    for (const timeout of ['xP1D', ' P1D', 'P1D ', 'P1Dx', 'P1D\n', 'P1.5D', 'PT1.S', 'PT.5S']) {
      expect(await timeoutOf(timeout), JSON.stringify(timeout)).toStrictEqual({
        kind: 'refused',
        reason: 'malformed',
        index: 0,
      })
    }
  })
})
