import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { canvasCommandNames, canvasContract, createCanvasAuthor } from '@omne-harness/canvas-tools'
import { commandMenu } from '@omne-harness/tool-contract'
import { commandGuide, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { author, caller, domain, json, media, personOf, TENANT } from './world.ts'

const DOMAIN = [
  'look',
  'away',
  'kinds',
  'place',
  'arrange',
  'take',
  'pile',
  'scatter',
  'lock',
  'unlock',
]

const commandsOf = (definition: ReturnType<typeof author>['definition']) => {
  if (definition.kind !== 'commands') throw new Error('commands')
  return definition
}

describe('the Canvas declaration', () => {
  it('is one wrapped declaration: help and the ten commands', () => {
    const definition = commandsOf(author().definition)
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    expect(definition.encoding).toBe('wrapped')
    expect(definition.commands.map(item => item.name)).toEqual(['help', ...DOMAIN])
    expect(canvasCommandNames).toEqual(['help', ...DOMAIN])
  })

  it('puts look under read, the writes under arrange and lock under lock, which is denied by default', () => {
    const definition = commandsOf(author().definition)
    expect(definition.gates).toEqual([
      { id: 'read', title: '看', default: 'auto' },
      { id: 'arrange', title: '摆', default: 'auto' },
      { id: 'lock', title: '锁', default: 'deny' },
    ])
    const under = (gate: string) =>
      definition.commands.filter(item => item.release?.gate === gate).map(item => item.name)
    expect(under('read')).toEqual(['help', 'look', 'away', 'kinds'])
    expect(under('arrange')).toEqual(['place', 'arrange', 'take', 'pile', 'scatter'])
    expect(under('lock')).toEqual(['lock', 'unlock'])
  })

  it('gives each command one menu line whose signature comes from its parameters', () => {
    const menu = commandMenu(commandsOf(author().definition)).split('\n')
    expect(menu[0]).toContain('{"command": <name>, "params": {…fields}}')
    const line = (name: string) => menu.find(item => item.startsWith(`${name} `))
    expect(line('place')).toMatch(/^place \{reference, at\?, near\?, size\?\} - /)
    expect(line('arrange')).toMatch(/^arrange \{items\?, piles\?\} - /)
    expect(line('away')).toMatch(/^away \{limit\?, before\?\} - /)
    expect(line('pile')).toMatch(/^pile \{pile, items, at\?\} - /)
    expect(line('scatter')).toMatch(/^scatter \{pile\} - /)
    for (const name of ['take', 'lock', 'unlock'])
      expect(line(name)).toMatch(new RegExp(`^${name} \\{items\\} - `))
    for (const name of ['look', 'kinds'])
      expect(line(name)).toMatch(new RegExp(`^${name} \\{\\} - `))
  })

  it('has no field through which a model could say who moved, for which tenant, in which session or on which canvas', () => {
    for (const name of DOMAIN) {
      const fields = Object.keys(
        JSON.parse(writeJsonText(canvasContract(name as never).schema)).properties ?? {},
      )
      for (const forbidden of ['by', 'tenant', 'session', 'canvas', 'locked'])
        expect([name, fields.includes(forbidden)]).toEqual([name, false])
    }
  })

  it('answers help with the menu and the guide, which says how to make a canvas app in three steps', async () => {
    const definition = commandsOf(author().definition)
    const whole = await caller(domain().canvas).run('help', {})
    expect(whole).toEqual({ ok: `done Canvas help\n${commandGuide(definition)}` })
    const one = await caller(domain().canvas).run('help', { name: 'place' })
    expect(one).toEqual({ ok: `done Canvas help place\n${commandGuide(definition, 'place')}` })
    const guide = commandGuide(definition)
    expect(guide).toContain('"point":"canvas.app-render","key":"clock","module":"clock.js"')
    expect(guide).toContain('OmneExtensions publish, category plugin')
    expect(guide).toContain('reference {"kind":"canvas.app","ref":"clock"}')
    expect(guide).toContain('A person locks and unlocks')
  })

  it('is the same declaration whatever it is built with, and takes only resultMaxBytes, at least 64', () => {
    expect(author(64).definition).toEqual(author(1_048_576).definition)
    for (const construction of [{}, { resultMaxBytes: 63 }, { resultMaxBytes: 64, more: 1 }, []])
      expect(createCanvasAuthor(json(construction))).toHaveProperty('failure')
    const { registration } = author(64)
    const operation = registration.operations[0]![1]
    if (operation.author.kind !== 'ordinary') throw new Error('ordinary')
    const check = (value: unknown) =>
      operation.author.output.check({ arguments: null as never, value } as never)
    expect(check('x'.repeat(64))).toEqual({ ok: 'x'.repeat(64) })
    expect(check('x'.repeat(65))).toHaveProperty('failure')
  })
})

describe('a call the declaration does not allow', () => {
  it.each([
    ['place', { reference: media('a'), by: { kind: 'human' } }, 'by'],
    ['place', { reference: media('a'), tenant: 'another' }, 'tenant'],
    ['place', { reference: media('a'), session: 's2' }, 'session'],
    ['place', { reference: media('a'), canvas: 'main' }, 'canvas'],
    ['take', { items: ['i1'], by: { kind: 'agent', session: 's2' } }, 'by'],
    ['unlock', { items: ['i1'], locked: true }, 'locked'],
  ])(
    '%s with a field it does not have is refused when decoded, naming %s',
    async (command, params, field) => {
      const d = domain()
      const failure = await caller(d.canvas).failure(command, params)
      expect(failure.kind).toBe('invalid')
      expect(failure.reason).toContain(field)
      expect(d.authority.asked()).toEqual([])
      const look = await d.canvas.look(personOf(TENANT), { canvas: 'main' })
      expect(look).toMatchObject({ kind: 'done', value: { items: [], revision: 0 } })
    },
  )

  it('fails on a command that is not one, before the canvas is asked', async () => {
    const d = domain()
    expect(await caller(d.canvas).run('move', {})).toHaveProperty('failure')
    expect(d.authority.asked()).toEqual([])
  })
})
