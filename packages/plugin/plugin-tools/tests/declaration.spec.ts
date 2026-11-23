import { describe, expect, it } from 'vitest'
import { createExtensionPointsAuthor } from '@omne-harness/plugin-tools'
import {
  commandMenu,
  decodeCommandCallText,
  describeCommandCallRejection,
} from '@omne-harness/tool-contract'
import {
  commandArguments,
  commandGuide,
  describeCommandArgumentsRejection,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import { author, desktop, json, registryOf, serverParts, sighted } from './world.ts'

/** The declaration as the design wrote it, word for word; the return line of each command is mechanical. */
const PURPOSE =
  'See where this system can be extended: the named places in its interface and behaviour that accept contributions, what each one accepts, and what is placed there now. Look here before changing how the app itself looks or works. Reads only.'
const MENU = [
  'Call with {"command": <name>, "params": {…fields}}. In signatures, ? marks an optional field and a|b lists the allowed values.',
  'help {name?=help|tree|find|show|changes} - Read command usage.',
  'tree {side?=server|client, under?, depth?} - Show hosts, points, keys and what is placed on them, as an indented tree. Start here when you do not know a name.',
  'find {query, side?=server|client, limit?} - Find points and interface parts by the words a person would use ("send button", "chat background"). Returns names to pass to show.',
  'show {name} - Read one point or one interface part in full: its rules, what a contribution must give, what the host gives it, and what is placed there now.',
  'changes {since?} - What appeared, went away or changed state since a tree revision: points, categories, contributions. Every result ends with the current revision.',
]
const GUIDE = [
  'A point is named <host>.<name>. An interface part is named <host>.<area>.<part>. A part opens up to three depths, from shallow to deep: tokens (data), style (data), render (code). Use the shallowest that does the job.',
  'Points come and go while the system runs: an installed extension can declare new ones. Names are not fixed in this text; tree and find read what exists now.',
  'Nothing here changes anything. To add or change something, write the files in the workspace with Files and publish them with OmneExtensions.',
  'You see what the acting tenant may see. A client is listed only while it is connected.',
  'A failure starts with its reason, then says what to do.',
].join('\n\n')
const RETURNS =
  ' Returns string (@omne-harness/plugin-tools/text@1). Model body: text. Program data: none.'

describe('the OmneExtensionPoints declaration', () => {
  it('is one wrapped declaration whose purpose, menu and rules are the designed text', () => {
    const { definition } = author()
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.name).toBe('OmneExtensionPoints')
    expect(definition.encoding).toBe('wrapped')
    expect(definition.description).toBe(PURPOSE)
    const menu = commandMenu(definition).split('\n')
    expect(menu[0]).toBe(MENU[0])
    expect(menu.slice(1)).toEqual(MENU.slice(1).map(line => `${line}${RETURNS}`))
    expect(definition.guide).toBe(GUIDE)
  })

  it('names no point, part or host: what exists is read at each call', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const said = [definition.description, commandMenu(definition), definition.guide].join('\n')
    for (const name of ['skill.skills', 'shell.tokens', 'session.', 'dynamis.points', 'plugin.'])
      expect(said).not.toContain(name)
  })

  it('answers help with the menu and the rules, and help of one command with its usage', async () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const s = sighted({ server: registryOf(...serverParts()), clients: [desktop()], scope: [] })
    expect(await s.text('help')).toBe(
      `done OmneExtensionPoints help\n${commandGuide(definition)}\ntree rev 7c1f.0`,
    )
    expect(await s.text('help', { name: 'show' })).toBe(
      `done OmneExtensionPoints help show\n${commandGuide(definition, 'show')}\ntree rev 7c1f.0`,
    )
  })

  it('takes only resultMaxBytes, at least 64', () => {
    for (const construction of [{}, { resultMaxBytes: 63 }, { resultMaxBytes: 64, more: 1 }, []])
      expect(createExtensionPointsAuthor(json(construction))).toHaveProperty('failure')
    expect(createExtensionPointsAuthor(json({ resultMaxBytes: 64 }))).toHaveProperty('ok')
  })
})

describe('a call the declaration does not allow', () => {
  it('an unknown command is refused with the menu and the rules', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const call = decodeCommandCallText(definition, JSON.stringify({ command: 'search' }))
    if (!('failure' in call)) throw new Error('refused')
    const text = describeCommandCallRejection(definition, call.failure)
    expect(text.split('\n').slice(0, 3)).toEqual([
      'OmneExtensionPoints: there is no command "search".',
      MENU[0],
      `${MENU[1]}${RETURNS}`,
    ])
    expect(text).toContain('Names are not fixed in this text')
  })

  it.each([
    ['find', {}, 'query'],
    ['find', { query: 'x', limit: 0 }, 'limit'],
    ['tree', { side: 'browser' }, 'side'],
    ['tree', { depth: 0 }, 'depth'],
    ['show', {}, 'name'],
    ['show', { name: 'x', point: 'y' }, 'point'],
    ['changes', { since: '' }, 'since'],
  ])('%s with %j is invalid and names the field', async (command, params, field) => {
    const s = sighted({ server: registryOf(), clients: [], scope: [] })
    const failure = await s.failure(command, params)
    expect(failure.kind).toBe('invalid')
    expect(failure.reason).toContain(field)
  })

  it('the binding refuses a call that names another command, with the usage of the admitted one', () => {
    const { definition } = author()
    const text = JSON.stringify({ command: 'show', params: { name: 'x' } })
    const cut = commandArguments(definition, 'find', {
      original: text,
      effective: text,
      complete: true,
    })
    if (!('failure' in cut)) throw new Error('refused')
    if (definition.kind !== 'commands') throw new Error('commands')
    const said = describeCommandArgumentsRejection(definition, 'find', cut.failure.reason)
    expect(said).toMatch(
      /^OmneExtensionPoints find: the call names "show" but "find" was admitted\./,
    )
    expect(said).toContain(
      'Usage: OmneExtensionPoints {"command": "find", "params": {query, side?=server|client, limit?}}',
    )
  })
})
