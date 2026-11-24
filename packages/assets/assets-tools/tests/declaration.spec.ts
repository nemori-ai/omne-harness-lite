import { describe, expect, it } from 'vitest'
import { createExtensionsAuthor } from '@omne-harness/assets-tools'
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
import { author, bound, json, world } from './world.ts'

/** The declaration as the design wrote it, word for word; the return line of each command is mechanical. */
const PURPOSE =
  "Manage what extends this system for the acting tenant, in every category the system has now: publish one from a directory or a body, ask what it would change, see whether it is in effect, enable, disable, remove. Write the files in a directory first, then publish here; the app's own files are not edited."
const MENU = [
  'Call with {"command": <name>, "params": {…fields}}. In signatures, ? marks an optional field and a|b lists the allowed values.',
  'help {name?=help|categories|list|show|export|impact|publish|enable|disable|remove|result, category?} - Read command usage. With publish and a category: the layout that category asks for.',
  'categories {} - List the categories that exist now, each with a line from its owner on what it is and how one is made: from a directory, from a body, or not through this tool.',
  'list {category, after?, limit?} - List what the tenant holds in one category: name, version, enabled.',
  'show {category, name} - Read one held extension: version, enabled, origin, summary, what it places and whether each is in effect, with the reason when it is not.',
  'export {category, name, dir} - Write the files of a held extension into a directory, so they can be edited and published again. Changes nothing that is held.',
  'impact {category, dir?, name?, change?=publish|enable|disable|remove} - What would change if this were done: which contributions would appear, go away, or stop being in effect. Changes nothing. Give dir for a directory not yet published, or name for a held one.',
  'publish {id, category, name, dir?, data?} - Publish a new version and hold it. A new holding is enabled, so it takes effect at once; a held one that follows the latest moves to the new version at once.',
  'enable {id, category, name} - Enable a held extension. It takes effect at once.',
  'disable {id, category, name} - Disable a held extension and keep it. It stops taking effect at once; what it had replaced comes back.',
  'remove {id, category, name} - Remove the holding.',
  'result {id} - Recall what the publish, enable, disable or remove with this id did.',
]
const GUIDE = [
  'Give every publish, enable, disable and remove an id of your own. After a failure that says unknown, send the same command with the same id, or ask result: what took effect is recalled, not done twice.',
  'Categories come and go while the system runs. They are not listed in this text; categories reads what exists now.',
  'Ask impact before you publish: a new holding is enabled when it is made, so publishing takes effect at once.',
  'To change an extension that is already held: export it to a directory, edit the files there, ask impact with that directory, then publish from it. The held version is the source; the directory is your working copy.',
  'dir is a path from the working directory of this session, or an absolute path. It reaches as far as the file tools of this call do.',
  'You act for the acting tenant: what you publish is held by this tenant and changes only what this tenant sees.',
  'A failure starts with its reason, then says what to do.',
].join('\n\n')
const RETURNS =
  ' Returns string (@omne-harness/assets-tools/text@1). Model body: text. Program data: none.'

describe('the OmneExtensions declaration', () => {
  it('is one wrapped declaration whose purpose, menu and rules are the designed text', () => {
    const { definition } = author()
    expect(judgeToolDefinition(definition)).toHaveProperty('ok')
    if (definition.kind !== 'commands') throw new Error('commands')
    expect(definition.name).toBe('OmneExtensions')
    expect(definition.encoding).toBe('wrapped')
    expect(definition.description).toBe(PURPOSE)
    const menu = commandMenu(definition).split('\n')
    expect(menu[0]).toBe(MENU[0])
    expect(menu.slice(1)).toEqual(MENU.slice(1).map(line => `${line}${RETURNS}`))
    expect(definition.guide).toBe(GUIDE)
  })

  it('names no category: what exists is read at each call', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const said = [definition.description, commandMenu(definition), definition.guide].join('\n')
    for (const name of ['plugin', 'skill', 'converter', 'model-provider', 'note', 'bundle', 'kit'])
      expect(said).not.toMatch(new RegExp(`\\b${name}\\b`))
  })

  it('reads with one gate, writes into the workspace with another and changes with a third, all released without asking', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const gates = Object.fromEntries(
      definition.commands.map(command => [command.name, command.release?.gate]),
    )
    expect(gates).toEqual({
      help: 'read',
      categories: 'read',
      list: 'read',
      show: 'read',
      impact: 'read',
      result: 'read',
      export: 'export',
      publish: 'change',
      enable: 'change',
      disable: 'change',
      remove: 'change',
    })
    expect(definition.gates).toEqual([
      { id: 'read', title: '查看', default: 'auto' },
      { id: 'change', title: '改动', default: 'auto' },
      { id: 'export', title: '取到工作区', default: 'auto' },
    ])
  })

  it('answers help with the menu and the rules, and help of one command with its usage', async () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const s = bound(world())
    expect(await s.text('help')).toBe(
      `done OmneExtensions help\n${commandGuide(definition)}\ntree rev 7c1f.41`,
    )
    expect(await s.text('help', { name: 'show' })).toBe(
      `done OmneExtensions help show\n${commandGuide(definition, 'show')}\ntree rev 7c1f.41`,
    )
  })

  it('help of publish with a category adds how that category is made, as its owner says', async () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const s = bound(world())
    expect(await s.text('help', { name: 'publish', category: 'bundle' })).toBe(
      [
        'done OmneExtensions help publish',
        commandGuide(definition, 'publish'),
        'category bundle: from a directory. a directory with bundle.json on top',
        'bundle.json, whole:',
        '{"members":[]}',
        'tree rev 7c1f.41',
      ].join('\n'),
    )
    expect(await s.text('help', { name: 'publish', category: 'kit' })).toContain(
      '\ncategory kit: not through here.\n',
    )
    const failure = await s.failure('help', { name: 'publish', category: 'workflow' })
    expect(failure.reason).toBe(
      'there is no category "workflow" now. Categories now: bundle, kit, note.',
    )
  })

  it('takes only resultMaxBytes, at least 64', () => {
    for (const construction of [{}, { resultMaxBytes: 63 }, { resultMaxBytes: 64, more: 1 }, []])
      expect(createExtensionsAuthor(json(construction))).toHaveProperty('failure')
    expect(createExtensionsAuthor(json({ resultMaxBytes: 64 }))).toHaveProperty('ok')
  })
})

describe('a call the declaration does not allow', () => {
  it('an unknown command is refused with the menu and the rules', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    const call = decodeCommandCallText(definition, JSON.stringify({ command: 'install' }))
    if (!('failure' in call)) throw new Error('refused')
    const text = describeCommandCallRejection(definition, call.failure)
    expect(text.split('\n').slice(0, 3)).toEqual([
      'OmneExtensions: there is no command "install".',
      MENU[0],
      `${MENU[1]}${RETURNS}`,
    ])
    expect(text).toContain('categories reads what exists now')
  })

  it.each([
    ['list', {}, 'category'],
    ['list', { category: 'note', limit: 0 }, 'limit'],
    ['show', { category: 'note' }, 'name'],
    ['impact', { category: 'note', change: 'install' }, 'change'],
    ['publish', { category: 'note', name: 'a' }, 'id'],
    ['publish', { id: 'p', category: 'note', name: 'a', tenant: 'tenant-b' }, 'tenant'],
    ['disable', { id: 'd', category: 'note' }, 'name'],
    ['result', {}, 'id'],
  ])('%s with %j is invalid and names the field', async (command, params, field) => {
    const failure = await bound(world()).failure(command, params)
    expect(failure.kind).toBe('invalid')
    expect(failure.reason).toContain(field)
  })

  it('the binding refuses a call that names another command, with the usage of the admitted one', () => {
    const { definition } = author()
    const text = JSON.stringify({
      command: 'remove',
      params: { id: 'r', category: 'c', name: 'n' },
    })
    const cut = commandArguments(definition, 'disable', {
      original: text,
      effective: text,
      complete: true,
    })
    if (!('failure' in cut)) throw new Error('refused')
    if (definition.kind !== 'commands') throw new Error('commands')
    const said = describeCommandArgumentsRejection(definition, 'disable', cut.failure.reason)
    expect(said).toMatch(
      /^OmneExtensions disable: the call names "remove" but "disable" was admitted\./,
    )
    expect(said).toContain(
      'Usage: OmneExtensions {"command": "disable", "params": {id, category, name}}',
    )
  })
})
