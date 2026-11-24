import { describe, expect, it } from 'vitest'
import type { FixedToolRequest, ToolTerminal } from '@omne-harness/tool-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { LocalToolBindingRegistry } from '../src/bindings.ts'
import { createLocalArgumentsCheck, programAnswerOf } from '../src/program-calls.ts'
import type { ProgramArrival } from '../src/program-receiver.ts'
import { evidence, request } from './coordinator-values.ts'

const base = request()
const program = {
  kind: 'json',
  contract: base.availability.definition.adoption,
  schema: { id: 'value', revision: '1', digest: 'sha256:value' },
  definition: {
    schema: { kind: 'object', entries: [] },
    vocabulary: base.availability.definition.adoption,
    descriptions: [],
  },
  maxBytes: 1024,
  external: true,
} as const

function target(withData: boolean): FixedToolRequest {
  const definition = base.availability.definition
  if (definition.kind !== 'function') throw new Error('function')
  return {
    ...base,
    availability: {
      ...base.availability,
      definition: {
        ...definition,
        programmable: true,
        program: { kind: 'open', unless: [] },
        returns: withData ? { ...definition.returns, program } : definition.returns,
      },
    },
  } as FixedToolRequest
}
const arrival = (terminal: ToolTerminal, over: Partial<ProgramArrival> = {}): ProgramArrival => ({
  result: 'v1' as ProgramArrival['result'],
  terminal,
  effect: { kind: 'unknown', diagnostic: 'not reported' },
  data: { kind: 'none' },
  ...over,
})
const value = { kind: 'string', value: 'the value' } as const
const withValue = {
  data: { kind: 'json', contract: program.contract, schema: program.schema, value },
} as const

describe('what a program gets for a retained result', () => {
  it('a completed call of a command with program data gives the value and says where it came from', () => {
    expect(programAnswerOf(target(true), arrival({ kind: 'completed' }, withValue))).toEqual({
      kind: 'value',
      value,
      external: true,
    })
  })

  it('a completed call of a command without program data gives null', () => {
    expect(programAnswerOf(target(false), arrival({ kind: 'completed' }))).toEqual({
      kind: 'value',
      value: null,
      external: false,
    })
  })

  it('a completed call that gave no value where one is declared is a failure whose effect is not known', () => {
    expect(programAnswerOf(target(true), arrival({ kind: 'completed' }))).toEqual({
      kind: 'failure',
      failure: {
        kind: 'failed',
        effect: 'unknown',
        message: 'The call completed and gave a program no value.',
      },
    })
  })

  it.each([
    [{ kind: 'failed', cause: 'arguments', diagnostic: 'bad' }, 'invalid'],
    [{ kind: 'failed', cause: 'executor', diagnostic: 'threw' }, 'failed'],
    [{ kind: 'failed', cause: 'runtime-lost', diagnostic: 'lost' }, 'failed'],
    [{ kind: 'unavailable', reason: 'gone' }, 'unavailable'],
    [{ kind: 'interrupted', cause: { kind: 'foreground-limit' } }, 'interrupted'],
    [{ kind: 'no-response', wait: 'w1', reason: 'nobody answered' }, 'no-response'],
  ] as const)('the terminal %j is the failure %s, with a value never read', (terminal, kind) => {
    const answer = programAnswerOf(target(true), arrival(terminal as ToolTerminal, withValue))
    expect(answer).toMatchObject({ kind: 'failure', failure: { kind } })
  })

  it.each([
    [{ kind: 'not-started' }, 'none'],
    [{ kind: 'not-occurred', evidence: evidence('fence') }, 'none'],
    [{ kind: 'occurred', evidence: evidence('receipt') }, 'occurred'],
    [{ kind: 'unknown', diagnostic: 'lost contact' }, 'unknown'],
  ] as const)('the effect %j is reported as %s', (effect, expected) => {
    const failed = { kind: 'failed', cause: 'executor', diagnostic: 'threw' } as const
    expect(programAnswerOf(target(true), arrival(failed, { effect }))).toMatchObject({
      failure: { effect: expected },
    })
  })
})

describe('what a program gets, by the command it called', () => {
  it('reads the declaration of the command that was called, not of its neighbour', () => {
    const definition = base.availability.definition
    if (definition.kind !== 'function') throw new Error('function')
    const { kind: _kind, parameters, returns, ...metadata } = definition
    const declared = { kind: 'declared', value: parameters } as const
    const open = { kind: 'open', unless: [] } as const
    const commands = {
      ...metadata,
      kind: 'commands',
      encoding: 'wrapped',
      programmable: true,
      commands: [
        {
          name: 'read',
          summary: 'r',
          parameters: declared,
          returns: { ...returns, program },
          program: open,
        },
        { name: 'write', summary: 'w', parameters: declared, returns, program: open },
      ],
    }
    const called = (command: string) =>
      ({
        ...base,
        command,
        availability: { ...base.availability, definition: commands },
      }) as unknown as FixedToolRequest
    const completed = arrival({ kind: 'completed' }, withValue)
    expect(programAnswerOf(called('read'), completed)).toMatchObject({ kind: 'value', value })
    expect(programAnswerOf(called('write'), completed)).toEqual({
      kind: 'value',
      value: null,
      external: false,
    })
  })

  it('says what interrupted the call', () => {
    const stopped = { kind: 'interrupted', cause: { kind: 'foreground-limit' } } as const
    expect(programAnswerOf(target(true), arrival(stopped))).toMatchObject({
      failure: { kind: 'interrupted', message: 'interrupted: foreground-limit' },
    })
  })
})

describe('checking arguments before a position is registered', () => {
  type Registry = LocalToolBindingRegistry<unknown, unknown, never>
  const access = { principal: 'alice', tenant: base.consumer as never }
  const withRegistry = (peek: Registry['peek'] | null) =>
    createLocalArgumentsCheck(() => (peek === null ? undefined : ({ peek } as Registry)))

  it.each([
    ['no registry', withRegistry(null), base],
    [
      'a registry that cannot give the author',
      withRegistry(() => fail({ kind: 'unavailable', diagnostic: 'gone' })),
      base,
    ],
    [
      'an author that has no such command',
      withRegistry(() => succeed({ implementation: {} } as never)),
      base,
    ],
    [
      'a tool that is known to be unavailable',
      withRegistry(() => {
        throw new Error('not asked')
      }),
      {
        ...base,
        availability: { kind: 'known-unavailable', reason: 'gone' },
      } as unknown as FixedToolRequest,
    ],
  ] as const)('%s answers unavailable, never valid', async (_, check, request) => {
    expect(await check(access, request)).toEqual({ kind: 'unavailable' })
  })
})
