import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import {
  isToolSourcePrefix,
  judgeToolSourceListing,
  type ToolSourceEntry,
} from '@omne-harness/tool-contract/provider'
import { adoption, metadata, parameters, structuredReturns } from './tool-values.ts'

function definition(name: string): ToolDefinition {
  return {
    ...metadata(),
    name,
    kind: 'commands',
    encoding: 'wrapped',
    commands: [
      {
        name: 'query',
        summary: 'Query the source.',
        parameters: { kind: 'declared', value: parameters() },
        returns: structuredReturns,
      },
    ],
  }
}

function entry(name: string, over: Partial<ToolSourceEntry> = {}): ToolSourceEntry {
  return {
    capability: { category: 'probe', name: name.replace('probe__', '') },
    definition: definition(name),
    executor: adoption('probe-executor'),
    availability: { kind: 'available' },
    ...over,
  }
}

const breach = (listing: Parameters<typeof judgeToolSourceListing>[1], prefix = 'probe__') => {
  const judged = judgeToolSourceListing(prefix, listing)
  return 'failure' in judged ? judged.failure : undefined
}

describe('the prefix of a tool entry source', () => {
  it.each(['mcp__', 'probe__', 'a1__'])('%s is a prefix', prefix => {
    expect(isToolSourcePrefix(prefix)).toBe(true)
  })

  it.each(['', 'mcp', 'mcp_', 'Mcp__', '__', 'mcp__x', '1a__', 'a-b__'])(
    '%s is no prefix',
    prefix => {
      expect(isToolSourcePrefix(prefix)).toBe(false)
    },
  )
})

describe('the listing of a tool entry source', () => {
  it('stands when every name is under the prefix and every definition is lawful', () => {
    const listing = {
      entries: [
        entry('probe__alpha'),
        entry('probe__beta', {
          availability: { kind: 'known-unavailable', reason: 'no connection' },
        }),
      ],
      withheld: [{ name: 'probe__gamma', reason: 'never listed' }],
    }
    expect(judgeToolSourceListing('probe__', listing)).toEqual({ ok: listing })
    expect(judgeToolSourceListing('probe__', { entries: [], withheld: [] })).toMatchObject({
      ok: {},
    })
  })

  it.each([
    [
      'an entry outside the prefix',
      { entries: [entry('other__alpha')], withheld: [] },
      'name-outside-prefix',
    ],
    [
      'a withheld name outside the prefix',
      { entries: [], withheld: [{ name: 'Shell', reason: 'x' }] },
      'name-outside-prefix',
    ],
    [
      'two entries of one name',
      { entries: [entry('probe__a'), entry('probe__a')], withheld: [] },
      'duplicate-name',
    ],
    [
      'a withheld name that is also an entry',
      { entries: [entry('probe__a')], withheld: [{ name: 'probe__a', reason: 'x' }] },
      'duplicate-name',
    ],
    [
      'a definition that is not lawful',
      {
        entries: [
          entry('probe__a', { definition: { ...definition('probe__a'), description: ' ' } }),
        ],
        withheld: [],
      },
      'definition',
    ],
    [
      'a capability without a name',
      {
        entries: [entry('probe__a', { capability: { category: 'probe', name: '' } })],
        withheld: [],
      },
      'capability',
    ],
  ])('is a breach for %s', (_name, listing, reason) => {
    expect(breach(listing)).toMatchObject({ reason })
  })

  it('is a breach for returns that are not a tool result, and for parameters the executor owns', () => {
    const ordinary = definition('probe__a')
    if (ordinary.kind !== 'commands') throw new Error('fixture')
    const [command] = ordinary.commands
    const returns = { ...structuredReturns, kind: 'ordinary', value: { kind: 'encoded-value' } }
    expect(
      breach({
        entries: [
          entry('probe__a', {
            definition: { ...ordinary, commands: [{ ...command!, returns }] } as never,
          }),
        ],
        withheld: [],
      }),
    ).toBeDefined()
    expect(
      breach({
        entries: [
          entry('probe__a', {
            definition: {
              ...ordinary,
              commands: [{ ...command!, parameters: { kind: 'executor-owned' } }],
            },
          }),
        ],
        withheld: [],
      }),
    ).toEqual({ name: 'probe__a', reason: 'executor-owned-parameters' })
  })

  it('is a breach when the prefix itself is not one', () => {
    expect(breach({ entries: [], withheld: [] }, 'probe')).toEqual({
      name: 'probe',
      reason: 'prefix',
    })
  })
})
