// The three ports that the first host does not provide (D-07). Every method of every port answers
// a named `unavailable` that says which operation was asked, and neither throws nor succeeds.
// The tables below list each method once and are checked against the port types, so a method added
// to a port fails the type check here until it is listed.
import { describe, expect, it } from 'vitest'
import type {
  ToolChildren,
  ToolDecisionBridge,
  ToolResourceResponses,
} from '@omne-harness/tool-contract/provider'
import { createAbsentToolPorts } from '@omne-harness/tool-host-local'

type Methods<T> = { readonly [K in keyof T]-?: true }

const METHODS = {
  toolDecisions: {
    inspectOperation: true,
    ensure: true,
    inspect: true,
    invalidate: true,
    resolve: true,
  } satisfies Methods<ToolDecisionBridge<string>>,
  toolResourceResponses: {
    inspectOperation: true,
    ensure: true,
    inspect: true,
    expire: true,
    invalidate: true,
    resolve: true,
  } satisfies Methods<ToolResourceResponses<string>>,
  toolChildren: {
    reserve: true,
    admitted: true,
    retain: true,
    list: true,
    close: true,
    closure: true,
    confirmBarrier: true,
    finish: true,
  } satisfies Methods<ToolChildren<string>>,
}

type Port = (input: unknown) => Promise<unknown>

describe('D-07 the absent ports', () => {
  const ports = createAbsentToolPorts<string>()

  it('provides exactly the three named ports', () => {
    expect(Object.keys(ports).sort()).toEqual(Object.keys(METHODS).sort())
  })

  for (const [name, methods] of Object.entries(METHODS)) {
    const port = ports[name as keyof typeof ports] as unknown as Record<string, Port>

    it(`${name} has exactly the methods of its port`, () => {
      expect(Object.keys(port).sort()).toEqual(Object.keys(methods).sort())
    })

    it.each(Object.keys(methods))(`${name}.%s answers a named unavailable`, async method => {
      const answer = await port[method]!({})
      expect(answer).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: name,
          diagnostic: `${name}.${method} is not provided by this host`,
        },
      })
    })
  }

  it('a call does not throw even when the input is not an object', async () => {
    const children = ports.toolChildren as unknown as Record<string, Port>
    for (const input of [undefined, null, 7])
      expect(await children['reserve']!(input)).toHaveProperty('failure.kind', 'unavailable')
  })
})
