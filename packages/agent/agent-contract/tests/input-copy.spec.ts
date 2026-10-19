// The copy that a judgment takes of its input refuses what is not plain JSON data: an array or an
// object of another prototype, a member that is not a string key, a member that reflection lists
// but cannot describe, and a member that holds a function. Each is refused without reading the
// input again and without running any code of the caller.
import { describe, expect, it } from 'vitest'
import { judgeAgentDefinition, judgeLoopExtensions } from '@omne-harness/agent-contract'

const definition = (extra: Record<string, unknown> = {}) => ({
  category: 'AgentDefinition',
  name: 'coding',
  references: [],
  attributes: [],
  ...extra,
})

const malformed = { kind: 'refused', reason: 'malformed' }
const executable = { kind: 'refused', reason: 'executable' }

describe('an array that is not a plain array', () => {
  it('is malformed when its prototype is not Array.prototype', async () => {
    class Listing extends Array<unknown> {}
    for (const references of [Object.setPrototypeOf([], null), new Listing()]) {
      expect(await judgeAgentDefinition(definition({ references }))).toEqual(malformed)
    }
  })

  it('is malformed when it carries a member that is not an index', async () => {
    const named = Object.assign([], { label: 'x' })
    const symbol = Object.assign([], { [Symbol('label')]: 'x' })
    const past = Object.defineProperty([], '3', { value: 1, enumerable: true })
    for (const references of [named, symbol, past]) {
      expect(await judgeAgentDefinition(definition({ references }))).toEqual(malformed)
    }
  })

  it('is executable when the member that is not an index is a function or an accessor', async () => {
    const method = Object.assign([], { run: () => undefined })
    const accessor = Object.defineProperty([], 'run', { get: () => 1, enumerable: true })
    for (const references of [method, accessor]) {
      expect(await judgeAgentDefinition(definition({ references }))).toEqual(executable)
    }
  })
})

describe('an object that is not a plain object', () => {
  it('is malformed when its prototype is not Object.prototype or null', async () => {
    class Holder {}
    expect(await judgeAgentDefinition(definition({ extra: new Holder() }))).toEqual(malformed)
    expect(await judgeAgentDefinition(definition({ extra: new Date(0) }))).toEqual(malformed)
    expect(await judgeAgentDefinition(definition({ extra: new Map() }))).toEqual(malformed)
  })

  it('is malformed when it has a symbol key, and executable when that key holds a function', async () => {
    expect(await judgeAgentDefinition(definition({ extra: { [Symbol('k')]: 1 } }))).toEqual(
      malformed,
    )
    expect(
      await judgeAgentDefinition(definition({ extra: { [Symbol('k')]: () => undefined } })),
    ).toEqual(executable)
  })

  it('is malformed when reflection lists a key that it cannot describe', async () => {
    const listed = new Proxy(
      {},
      { ownKeys: () => ['ghost'], getOwnPropertyDescriptor: () => undefined },
    )
    expect(await judgeAgentDefinition(definition({ extra: listed }))).toEqual(malformed)
    expect(
      await judgeLoopExtensions([
        {
          name: 'e',
          position: 'before_action',
          power: 'observe',
          implementation: { kind: 'builtin', builtinName: 'f' },
          extra: listed,
        },
      ]),
    ).toEqual({ ...malformed, index: 0 })
  })
})
