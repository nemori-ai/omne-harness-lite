import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ToolSourceCall } from '@omne-harness/tool-contract/provider'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  GUEST_TOOL_GATE,
  guestEntrySource,
  guestToolExecutor,
  type GuestEntryContext,
} from '../src/guest-entry-source.ts'

const SHAPE = {
  resultContract: describedAdoption({ owner: 'test', name: 'tool-result', revision: '1' }),
}
const LIMITS = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 64,
  maxStringLength: 4096,
  maxNumberLength: 32,
} as const

const json = (value: unknown): JsonValue => {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new Error('not json')
  return read.value
}

/** The loader's side: who the ports were opened for, and when they were closed. */
function host(log: string[]): GuestEntryContext {
  return {
    key: 'weather__',
    plugin: 'weather',
    bind(principal) {
      log.push(`open ${String(principal)}`)
      return { ports: { web: { fetch: () => 'sunny' } }, close: () => log.push('close') }
    },
  }
}

const call = (name: string, args: unknown): ToolSourceCall<string> =>
  ({
    principal: 'alice-principal',
    tenant: 'alice' as never,
    name,
    command: 'run',
    declared: null,
    arguments: json(args),
    invocation: 'call-1' as never,
    program: false,
    signal: new AbortController().signal,
  }) as ToolSourceCall<string>

const forecast = {
  summary: 'Tells the weather of a city.',
  params: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  effect: 'read',
}

describe('the form a plugin writes its tools in (TL-77)', () => {
  it('makes each tool an entry named prefix and tool, of the plugin, with the gate, no program calls and no background fixed by the form', async () => {
    const source = guestEntrySource<string>(
      {
        tools: {
          forecast: { ...forecast, run: () => 'sunny', gate: 'auto', programmable: true },
          remember: { ...forecast, effect: 'write', run: () => null },
        },
      },
      host([]),
      SHAPE,
    )
    expect(source.prefix).toBe('weather__')
    const listed = await source.list({ principal: 'p', tenant: 't' as never })
    if (!('ok' in listed)) throw new Error('not listed')
    expect(listed.ok.withheld).toEqual([])
    const [first, second] = listed.ok.entries
    expect(listed.ok.entries.map(entry => entry.definition.name)).toEqual([
      'weather__forecast',
      'weather__remember',
    ])
    expect(first?.capability).toEqual({ category: 'plugin', name: 'weather' })
    expect(first?.executor).toEqual(guestToolExecutor)
    expect(first?.availability).toEqual({ kind: 'available' })
    for (const entry of [first, second]) {
      const definition = entry?.definition
      if (definition?.kind !== 'commands') throw new Error('not a command tool')
      expect(definition.gates).toEqual([GUEST_TOOL_GATE])
      expect(GUEST_TOOL_GATE.default).toBe('ask')
      expect(definition.programmable).toBeUndefined()
      expect(definition.backgroundAllowed).toBe(false)
      expect(
        definition.commands.map(command => [command.name, command.release, command.readOnly]),
      ).toEqual([['run', { gate: 'invoke' }, undefined]])
      expect(definition.commands[0]?.returns).toMatchObject({ program: { kind: 'none' } })
    }
    expect(source.select({ principal: 'p', tenant: 't' as never }, 'weather__forecast')).toBe(first)
    expect(
      source.select({ principal: 'p', tenant: 't' as never }, 'weather__nothing'),
    ).toBeUndefined()
  })

  it('hands the function the parsed arguments and the ports opened as the caller, never the principal; the ports close when it returns', async () => {
    const log: string[] = []
    const seen: unknown[] = []
    const source = guestEntrySource<string>(
      {
        tools: {
          forecast: {
            ...forecast,
            run: async (input: unknown, given: Readonly<Record<string, unknown>>) => {
              seen.push(input, Object.keys(given))
              log.push('run')
              return { city: (input as { city: string }).city, sky: 'sunny' }
            },
          },
        },
      },
      host(log),
      SHAPE,
    )
    const result = await source.execute(call('weather__forecast', { city: 'Oslo' }))
    expect(seen).toEqual([{ city: 'Oslo' }, ['ports']])
    expect(log).toEqual(['open alice-principal', 'run', 'close'])
    expect(result.content).toMatchObject([
      { kind: 'text', text: 'done weather__forecast\n{"city":"Oslo","sky":"sunny"}' },
    ])
  })

  it('answers a read whose function threw with its failure, and leaves a write whose function threw unknown; neither runs again, and the ports close', async () => {
    const log: string[] = []
    let runs = 0
    const boom = () => {
      runs += 1
      throw new Error('no network')
    }
    const source = guestEntrySource<string>(
      {
        tools: {
          forecast: { ...forecast, run: boom },
          remember: { ...forecast, effect: 'write', run: boom },
        },
      },
      host(log),
      SHAPE,
    )
    const failed = await source.execute(call('weather__forecast', { city: 'Oslo' }))
    expect(failed.content).toMatchObject([
      { kind: 'text', text: 'weather__forecast failed: no network' },
    ])
    await expect(source.execute(call('weather__remember', { city: 'Oslo' }))).rejects.toThrow(
      /weather__remember threw: no network\. Whether it changed anything is not known/u,
    )
    expect(runs).toBe(2)
    expect(log.filter(line => line === 'close')).toHaveLength(2)
  })

  it('refuses what is not the form, with the reason', () => {
    const refused =
      (made: unknown, key = 'weather__') =>
      () =>
        guestEntrySource<string>(made, { ...host([]), key }, SHAPE)
    expect(refused({ tools: { forecast: { ...forecast, run: () => 1 } } }, 'weather')).toThrow(
      /not a prefix/u,
    )
    expect(refused({ tools: {} })).toThrow(/at least one tool/u)
    expect(refused({})).toThrow(/at least one tool/u)
    expect(refused({ tools: { Forecast: { ...forecast, run: () => 1 } } })).toThrow(/tool name/u)
    expect(refused({ tools: { forecast: { ...forecast, summary: '', run: () => 1 } } })).toThrow(
      /summary/u,
    )
    expect(
      refused({ tools: { forecast: { ...forecast, params: { type: 'string' }, run: () => 1 } } }),
    ).toThrow(/JSON Schema of an object/u)
    expect(
      refused({ tools: { forecast: { ...forecast, effect: 'delete', run: () => 1 } } }),
    ).toThrow(/read or write/u)
    expect(refused({ tools: { forecast } })).toThrow(/run is a function/u)
  })
})
