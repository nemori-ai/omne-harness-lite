import { describe, expect, it } from 'vitest'
import { dispatchReportWait } from '@omne-harness/dispatch-tool'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { commandMenu } from '@omne-harness/tool-contract'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  commandArguments,
  commandGuide,
  deriveDefinition,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  agentsCommandNames,
  agentsContract,
  agentsToolModule,
  createAgentsAuthor,
} from '../src/index.ts'

const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 262_144,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 65_536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

function author(maximum = 65_536) {
  const created = createAgentsAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const registration = read
  const definition = deriveDefinition(
    { asset: { name: 'Agents', adoption: agentsToolModule.executor }, requiredCapabilities: [] },
    created.ok.facts,
  )
  function decode(command: string, params: unknown, intent?: string) {
    const operation = registration.operations.find(([name]) => name === command)?.[1]
    const text = JSON.stringify({ command, ...(intent === undefined ? {} : { intent }), params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in cut) return cut
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    return operation.author.parameters.parse(cut.ok)
  }
  return { created: created.ok, definition, registration, decode }
}

const DOMAIN = ['targets', 'dispatch', 'show', 'withdraw', 'report', 'message', 'list']
const ID = `dsp_${'1'.repeat(64)}`

describe('the Agents declaration', () => {
  it('is one wrapped declaration: help and the seven commands', () => {
    const { definition } = author()
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.encoding).toBe('wrapped')
    expect(definition.commands.map(item => item.name)).toEqual(['help', ...DOMAIN])
    expect(agentsCommandNames).toEqual(['help', ...DOMAIN])
    expect(definition.backgroundAllowed).toBe(true)
    expect(
      definition.commands.filter(item => item.background !== undefined).map(item => item.name),
    ).toEqual(['dispatch'])
    expect(definition.commands.find(item => item.name === 'dispatch')?.background).toEqual({
      unless: [],
      start: 'launch',
    })
  })

  it('needs an intent on a dispatch, which runs in the background, and on no other command', () => {
    const { decode } = author()
    const params = { mode: 'delegate', agent: 'coding', instruction: 'do it' }
    expect(decode('dispatch', params)).toHaveProperty('failure')
    expect(decode('dispatch', params, 'look into the flaky test')).toEqual({
      ok: { command: 'dispatch', params },
    })
    expect(decode('show', { dispatch: ID })).toHaveProperty('ok')
  })

  it('gives each command one menu line whose signature comes from its parameters', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const menu = commandMenu(definition).split('\n')
    const line = (name: string) => menu.find(item => item.startsWith(`${name} `))
    expect(line('dispatch')).toMatch(
      /^dispatch \{mode=spawn\|delegate\|handoff, agent, instruction, expectation\?\} - /,
    )
    expect(line('message')).toMatch(/^message \{to, text, id\?\} - /)
    expect(line('report')).toMatch(/^report \{text\} - /)
    for (const name of ['show', 'withdraw'])
      expect(line(name)).toMatch(new RegExp(`^${name} \\{dispatch\\} - `))
    expect(line('targets')).toMatch(/^targets \{\} - /)
    expect(line('list')).toMatch(
      /^list \{relation\?=.*attendance\?=attended\|unattended, definition\?, dispatch\?=.*archived\?, cursor\?, limit\?\} - /,
    )
  })

  it('has no field through which a model could say which session dispatches, reports or sends', () => {
    const fields = (name: (typeof agentsCommandNames)[number]) =>
      Object.keys(JSON.parse(writeJsonText(agentsContract(name).schema)).properties ?? {})
    expect(fields('dispatch')).toEqual(['mode', 'agent', 'instruction', 'expectation'])
    expect(fields('report')).toEqual(['text'])
    expect(fields('message')).toEqual(['to', 'text', 'id'])
    expect(fields('withdraw')).toEqual(['dispatch'])
  })

  it('offers report only where work was dispatched, and no other command under a condition', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const conditions = Object.fromEntries(
      definition.commands.map(item => [
        item.name,
        (item as { conditions?: readonly string[] }).conditions ?? [],
      ]),
    )
    expect(conditions).toEqual({
      help: [],
      targets: [],
      dispatch: [],
      show: [],
      withdraw: [],
      report: ['dispatched'],
      message: [],
      list: [],
    })
  })

  it('declares four gates, all automatic by default, and puts each command behind one', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    expect((definition.gates ?? []).map(gate => [gate.id, gate.default])).toEqual([
      ['read', 'auto'],
      ['dispatch', 'auto'],
      ['message', 'auto'],
      ['report', 'auto'],
    ])
    const gates = Object.fromEntries(
      definition.commands.map(item => [item.name, item.release?.gate]),
    )
    expect(gates).toEqual({
      help: 'read',
      targets: 'read',
      show: 'read',
      list: 'read',
      dispatch: 'dispatch',
      withdraw: 'dispatch',
      message: 'message',
      report: 'report',
    })
  })

  it('runs dispatch on a checkpoint that waits for the report, and every other command as one call', () => {
    for (const [name, operation] of author().registration.operations) {
      if (operation.author.kind !== 'ordinary') throw new Error('ordinary')
      if (name === 'dispatch') {
        expect(operation.author.waits).toEqual([dispatchReportWait])
        expect(operation.segments, name).not.toBeNull()
      } else {
        expect(operation.author.waits, name).toEqual([])
        expect(operation.segments, name).toBeNull()
      }
    }
  })

  it('parses the params of a command and refuses a field the command does not have', () => {
    const { decode } = author()
    expect(
      decode('dispatch', { mode: 'delegate', agent: 'coding', instruction: 'do it' }, 'do it'),
    ).toEqual({
      ok: {
        command: 'dispatch',
        params: { mode: 'delegate', agent: 'coding', instruction: 'do it' },
      },
    })
    expect(decode('show', { dispatch: ID })).toEqual({
      ok: { command: 'show', params: { dispatch: ID } },
    })
    for (const [command, params] of [
      ['dispatch', { mode: 'delegate', agent: 'coding', instruction: 'do it', session: 'x' }],
      ['dispatch', { mode: 'fork', agent: 'coding', instruction: 'do it' }],
      ['dispatch', { mode: 'delegate', agent: 'coding' }],
      ['show', { dispatch: 'dsp_1' }],
      ['report', { text: '' }],
      ['message', { to: 'x'.repeat(64), text: 'hi', id: 'has space' }],
      ['list', { limit: 51 }],
      ['list', { relation: 'cousin' }],
    ] as const)
      expect(
        decode(command, params, command === 'dispatch' ? 'the intent' : undefined),
        JSON.stringify(params),
      ).toMatchObject({
        failure: { kind: 'invalid' },
      })
  })

  it('answers help of one command with its usage and schema, and keeps the rules in the guide', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(commandGuide(definition, 'dispatch')).toContain('"instruction"')
    const guide = commandGuide(definition)
    for (const part of ['delegate', 'spawn', 'handoff', 'reminder', 'unknown'])
      expect(guide).toContain(part)
  })

  it('takes only resultMaxBytes, at least 64, and holds every result to it', () => {
    for (const construction of [
      {},
      { resultMaxBytes: 63 },
      { resultMaxBytes: '64' },
      { resultMaxBytes: 64, more: 1 },
      [],
    ])
      expect(createAgentsAuthor(json(construction))).toEqual({
        failure: { field: 'construction', reason: 'Agents takes only resultMaxBytes, at least 64' },
      })
    const operation = author(64).registration.operations[0]![1]
    if (operation.author.kind !== 'ordinary') throw new Error('ordinary')
    const check = (value: unknown) =>
      operation.author.output.check({ arguments: null as never, value } as never)
    expect(check('x'.repeat(64))).toEqual({ ok: 'x'.repeat(64) })
    expect(check('x'.repeat(65))).toHaveProperty('failure')
    expect(check(5)).toHaveProperty('failure')
  })
})
