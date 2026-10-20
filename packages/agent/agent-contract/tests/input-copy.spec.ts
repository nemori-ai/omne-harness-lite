// The copy that a judgment takes of its input refuses what is not plain JSON data: an array or an
// object of another prototype, a member that is not a string key, a member that reflection lists
// but cannot describe, a member that holds a function, and a Proxy whose trap throws or that is
// revoked. Each is refused without reading the input again and without running an accessor of the
// caller. Only the traps of a Proxy run, and an exception from a trap does not leave the judgment.
import { describe, expect, it } from 'vitest'
import {
  judgeAgentDefinition,
  judgeExtensionOutput,
  judgeLoopExtensions,
  type Subject,
} from '@omne-harness/agent-contract'

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

const extension = (extra: Record<string, unknown> = {}) => ({
  name: 'e',
  position: 'before_action',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: 'f' },
  ...extra,
})

const fault = (trap: string) => () => {
  throw new Error(`the ${trap} trap failed`)
}

/** Fresh Proxies that make reflection throw: two revoked ones and one throwing trap of each read. */
function failingProxies(): readonly object[] {
  const revokedObject = Proxy.revocable({}, {})
  revokedObject.revoke()
  const revokedArray = Proxy.revocable([], {})
  revokedArray.revoke()
  return [
    revokedObject.proxy,
    revokedArray.proxy,
    new Proxy({ a: 1 }, { ownKeys: fault('ownKeys') }),
    new Proxy({ a: 1 }, { getPrototypeOf: fault('getPrototypeOf') }),
    new Proxy({ a: 1 }, { getOwnPropertyDescriptor: fault('getOwnPropertyDescriptor') }),
    new Proxy([1], { get: fault('get') }),
  ]
}

/*
 * Step 3 refuses each output below before step 7 reads the subject, so the subject only has to
 * satisfy the type of the input.
 */
const unreadSubject = {} as Subject

const outputAt = (output: unknown) => ({
  position: 'before_action' as const,
  dimension: null,
  purpose: null,
  power: 'veto' as const,
  trigger: null,
  subject: unreadSubject,
  output,
})

describe('a Proxy whose trap throws, or a revoked Proxy', () => {
  it('is malformed in a declaration judgment, which does not throw', async () => {
    for (const proxy of failingProxies()) {
      expect(await judgeAgentDefinition(proxy)).toEqual(malformed)
      expect(await judgeAgentDefinition(definition({ extra: proxy }))).toEqual(malformed)
      expect(await judgeLoopExtensions(proxy)).toEqual({ ...malformed, index: 0 })
      expect(await judgeLoopExtensions([extension(), proxy])).toEqual({ ...malformed, index: 1 })
      expect(await judgeLoopExtensions([extension({ extra: proxy })])).toEqual({
        ...malformed,
        index: 0,
      })
    }
  })

  it('is malformed in an output judgment, which does not throw', () => {
    for (const proxy of failingProxies()) {
      expect(judgeExtensionOutput(outputAt(proxy))).toEqual(malformed)
      expect(judgeExtensionOutput(outputAt({ kind: 'rewrite', subject: proxy }))).toEqual(malformed)
    }
  })
})
