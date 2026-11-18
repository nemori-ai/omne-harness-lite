import { describe, expect, it } from 'vitest'
import {
  createNotificationsAuthor,
  notificationsCommandNames,
  notificationsContract,
} from '@omne-harness/notification-tools'
import { writeJsonText } from '@omne-harness/json-text'
import { commandMenu } from '@omne-harness/tool-contract'
import { commandGuide, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { author, caller, domain, json } from './world.ts'

const DOMAIN = [
  'send',
  'sent',
  'inbox',
  'read',
  'done',
  'dismiss',
  'restore',
  'sources',
  'subscriptions',
  'subscribe',
  'unsubscribe',
]

describe('the Notifications declaration', () => {
  it('is one wrapped declaration: help and the eleven commands', () => {
    const { definition } = author()
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.encoding).toBe('wrapped')
    expect(definition.commands.map(item => item.name)).toEqual(['help', ...DOMAIN])
    expect(notificationsCommandNames).toEqual(['help', ...DOMAIN])
  })

  it('gives each command one menu line whose signature comes from its parameters', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const menu = commandMenu(definition).split('\n')
    expect(menu[0]).toContain('{"command": <name>, "params": {…fields}}')
    const line = (name: string) => menu.find(item => item.startsWith(`${name} `))
    expect(line('send')).toMatch(/^send \{id, title, body\?, locator\?, replace\?, renotify\?\} - /)
    expect(line('sent')).toMatch(/^sent \{id\} - /)
    expect(line('inbox')).toMatch(/^inbox \{filter\?=unresolved\|all, after\?, limit\?\} - /)
    for (const name of ['read', 'done', 'dismiss', 'restore'])
      expect(line(name)).toMatch(new RegExp(`^${name} \\{source, event\\} - `))
    expect(line('subscribe')).toMatch(
      /^subscribe \{source, type, level=off\|weak\|strong, scope\?, note\?, term\?\} - /,
    )
    expect(line('unsubscribe')).toMatch(/^unsubscribe \{source, type, scope\?\} - /)
    for (const name of ['sources', 'subscriptions'])
      expect(line(name)).toMatch(new RegExp(`^${name} \\{\\} - `))
    expect(menu.filter(item => DOMAIN.some(name => item.startsWith(`${name} `)))).toHaveLength(11)
  })

  it('has no field through which a model could say who posts, from where, or how deep', () => {
    const fields = (name: 'send' | 'sent') =>
      Object.keys(JSON.parse(writeJsonText(notificationsContract(name).schema)).properties)
    expect(fields('send')).toEqual(['id', 'title', 'body', 'locator', 'replace', 'renotify'])
    expect(fields('sent')).toEqual(['id'])
  })

  it('answers help with the menu, and help of one command with its usage and schema', async () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const a = caller(domain())
    const whole = await a.run('help', {})
    expect(whole).toEqual({
      ok: { kind: 'completed', value: `done Notifications help\n${commandGuide(definition)}` },
    })
    const one = await a.run('help', { name: 'subscribe' })
    expect(one).toEqual({
      ok: {
        kind: 'completed',
        value: `done Notifications help subscribe\n${commandGuide(definition, 'subscribe')}`,
      },
    })
    expect(commandGuide(definition, 'subscribe')).toContain('"level"')
    expect(commandGuide(definition)).toContain('You act as yourself')
    expect(await a.failure('help', { name: 'nope' })).toMatchObject({ kind: 'invalid' })
  })

  it('takes only resultMaxBytes, at least 64, and holds every result to it', () => {
    for (const construction of [
      {},
      { resultMaxBytes: 63 },
      { resultMaxBytes: '64' },
      { resultMaxBytes: 64, more: 1 },
      [],
    ])
      expect(createNotificationsAuthor(json(construction))).toHaveProperty('failure')
    const { registration } = author(64)
    const operation = registration.operations[0]![1]
    if (operation.author.kind !== 'ordinary') throw new Error('ordinary')
    const check = (value: unknown) =>
      operation.author.output.check({ arguments: null as never, value } as never)
    expect(check('x'.repeat(64))).toEqual({ ok: 'x'.repeat(64) })
    expect(check('x'.repeat(65))).toHaveProperty('failure')
    expect(check('字'.repeat(22))).toHaveProperty('failure')
    expect(check(5)).toHaveProperty('failure')
  })
})

describe('a call the declaration does not allow', () => {
  it('fails on a command that is not one, before any service is asked', async () => {
    const d = domain()
    const answer = await caller(d).run('publish', {})
    expect(answer).toHaveProperty('failure')
    expect(d.authority.asked()).toEqual([])
  })

  it.each([
    ['send', { id: 'p1', title: 'T', source: 'demo.things' }, 'source'],
    ['send', { id: 'p1', title: 'T', origin: { emitter: { kind: 'person' }, depth: 0 } }, 'origin'],
    ['send', { id: 'p1', title: 'T', depth: 0 }, 'depth'],
    ['send', { id: 'p1', title: 'T', emitter: 'a2' }, 'emitter'],
    ['send', { id: 'p1', title: 'T', subject: 'a2' }, 'subject'],
    ['send', { id: 'p1', title: 'T', named: [{ kind: 'agent', ref: 'a2' }] }, 'named'],
    ['inbox', { recipient: { kind: 'person' } }, 'recipient'],
    [
      'subscribe',
      { source: 'demo.things', type: 'changed', level: 'weak', recipient: { kind: 'person' } },
      'recipient',
    ],
    [
      'subscribe',
      { source: 'demo.things', type: 'changed', level: 'weak', basis: { kind: 'owner' } },
      'basis',
    ],
  ])(
    '%s with a field it does not have is invalid and names the field',
    async (command, params, field) => {
      const d = domain()
      const failure = await caller(d).failure(command, params)
      expect(failure.kind).toBe('invalid')
      expect(failure.reason).toContain(field)
      expect(d.authority.asked()).toEqual([])
      expect(d.store.commits()).toBe(0)
    },
  )

  it.each([
    ['send', { title: 'T' }],
    ['send', { id: 'has space', title: 'T' }],
    ['send', { id: 'p1', title: '' }],
    ['inbox', { limit: 51 }],
    ['inbox', { filter: 'mine' }],
    ['read', { source: 'demo.things' }],
    ['subscribe', { source: 'demo.things', type: 'changed', level: 'loud' }],
    [
      'subscribe',
      {
        source: 'demo.things',
        type: 'changed',
        level: 'weak',
        term: { kind: 'until', at: 'tomorrow' },
      },
    ],
  ])('%s with a value outside its schema is invalid', async (command, params) => {
    const d = domain()
    expect(await caller(d).failure(command, params)).toMatchObject({ kind: 'invalid' })
    expect(d.authority.asked()).toEqual([])
  })
})
