import { describe, expect, it } from 'vitest'
import { declare } from '@omne-harness/dynamis'
import type { ClientTree } from '@omne-harness/plugin-tools'
import {
  SKILLS,
  contract,
  desktop,
  entry,
  registryOf,
  serverParts,
  sighted,
  type World,
} from './world.ts'

type Point = ClientTree['points'][number]
type Rules = NonNullable<Point['contract']>

const rules = (over: Partial<Rules> = {}): Rules => ({
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of a part',
  gives: 'the token values of the part',
  item: { kind: 'data', fields: [{ name: 'data', kind: 'record' }] },
  resolve: 'most-specific',
  binding: 'run',
  onError: 'the part keeps its own values',
  version: 1,
  revision: 3,
  example: null,
  ...over,
})

const TOKENS: Point = {
  name: 'shell.tokens',
  summary: 'The tokens put on a part.',
  contract: rules({
    keyFrom: 'shell.parts',
    item: { kind: 'data', fields: [{ name: 'tokens', kind: 'object' }] },
    example: '{"point":"shell.tokens","key":"shell.app","data":{"--accent":"#1f8f4e"}}',
  }),
  dataKeys: [
    { name: '--surface', now: '#ffffff' },
    { name: '--accent', now: '#3366ff' },
    { name: '--radius', now: null },
  ],
}
const STYLE: Point = {
  name: 'shell.part-style',
  summary: 'The style of a part.',
  contract: rules({
    keyFrom: 'shell.parts',
    item: { kind: 'data', fields: [{ name: 'style', kind: 'object' }] },
    example: '{"point":"shell.part-style","key":"x","data":{"base":{"color":"red"}}}',
  }),
}
const RENDER: Point = {
  name: 'shell.part-render',
  summary: 'How a part is drawn.',
  contract: rules({
    keyFrom: 'shell.parts',
    item: { kind: 'pure', fields: [{ name: 'render', kind: 'function' }] },
    example: [
      '{"point":"shell.part-render","key":"x","module":"send.js","export":"draw"}',
      'send.js: export const draw = host => host.default',
    ].join('\n'),
  }),
}

const shell = (over: Partial<ClientTree> = {}): ClientTree =>
  desktop({
    points: [TOKENS, STYLE, RENDER, ...desktop().points],
    parts: [
      ...desktop().parts,
      {
        name: 'shell.app',
        label: '整个应用',
        summary: '应用的全部界面。',
        depths: ['tokens', 'style', 'render'],
        within: null,
      },
    ],
    ...over,
  })

const world = (over: Partial<World> = {}): World => ({
  server: registryOf(...serverParts()),
  clients: [shell()],
  scope: ['t1'],
  ...over,
})

describe('show a point: both trees in one form', () => {
  it('a client point with rules: the rules, the example to copy, the names its data may use', async () => {
    expect(await sighted(world()).text('show', { name: 'shell.tokens' })).toBe(
      [
        'done OmneExtensionPoints show',
        'shell.tokens   point, client   v1.3',
        'The tokens put on a part.',
        'key: the name of a part',
        'keys from: shell.parts',
        'holds: one per key; among several, the most specific scope wins; two at the same scope are a conflict',
        'may change: while running',
        'a member gives: data. fields: tokens (object)',
        'the host gives it: the token values of the part',
        'when it throws: the part keeps its own values',
        'a member, to copy:',
        '  {"point":"shell.tokens","key":"shell.app","data":{"--accent":"#1f8f4e"}}',
        'names its data may use (3), with the value now:',
        '  --accent    #3366ff',
        '  --radius',
        '  --surface   #ffffff',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it('every line of a longer example is indented two', async () => {
    const text = await sighted(world()).text('show', { name: 'shell.part-render' })
    expect(text).toContain(
      'a member, to copy:\n  {"point":"shell.part-render","key":"x","module":"send.js","export":"draw"}\n  send.js: export const draw = host => host.default\ntree rev',
    )
    expect(text).not.toContain('now:')
  })

  it('more than 200 names: the first 200, then how many more', async () => {
    const many = Array.from({ length: 203 }, (_, at) => ({
      name: `--n${String(at).padStart(3, '0')}`,
      now: null,
    }))
    const text = await sighted(
      world({ clients: [shell({ points: [{ ...TOKENS, dataKeys: many }] })] }),
    ).text('show', { name: 'shell.tokens' })
    const lines = text.split('\n')
    expect(lines).toContain('names its data may use (203), with the value now:')
    expect(lines).toContain('  --n199')
    expect(lines).not.toContain('  --n200')
    expect(lines.at(-2)).toBe('  and 3 more')
  })

  it('a server point with an example shows it to copy, before now', async () => {
    const server = registryOf(...serverParts(), [
      'weekly',
      [declare(contract('reports.sections', { example: '{"key":"sales"}\nsecond line' }))],
    ])
    const text = await sighted(world({ server })).text('show', { name: 'reports.sections' })
    expect(text).toContain(
      'when it throws: the answer is unavailable\na member, to copy:\n  {"key":"sales"}\n  second line\nnow:\n',
    )
  })
})

describe('show a part: a member to copy for each depth', () => {
  it('takes the example of the point of each depth, with its key set to the part', async () => {
    expect(await sighted(world()).text('show', { name: 'shell.app' })).toBe(
      [
        'done OmneExtensionPoints show',
        'shell.app   part, client   整个应用',
        '应用的全部界面。',
        'depths, shallow first:',
        '  tokens   data   member: {"point":"shell.tokens","key":"shell.app","data":{"--accent":"#1f8f4e"}}',
        '    names: OmneExtensionPoints show shell.tokens lists the 3 token names and their values now.',
        '  style    data   member: {"point":"shell.part-style","key":"shell.app","data":{"base":{"color":"red"}}}',
        '  render   code   member: {"point":"shell.part-render","key":"shell.app","module":"send.js","export":"draw"}',
        '    send.js: export const draw = host => host.default',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it.each([
    ['not JSON', 'member: shell.tokens / x'],
    ['not an object', '["shell.tokens"]'],
    ['without a key', '{"point":"shell.tokens","data":{}}'],
  ])(
    'an example whose first line is %s falls back to naming the point and where to read it',
    async (_why, example) => {
      const { dataKeys: _listed, ...named } = TOKENS
      const point = { ...named, contract: { ...named.contract, example } as Rules }
      const text = await sighted(world({ clients: [shell({ points: [point] })] })).text('show', {
        name: 'shell.app',
      })
      expect(text).toContain(
        '  tokens   data   member: {"point":"shell.tokens","key":"shell.app"}: OmneExtensionPoints show shell.tokens says what a member gives',
      )
      expect(text).not.toContain('names:')
    },
  )
})

describe('find', () => {
  it('reads Chinese as pairs of adjacent characters', async () => {
    const text = await sighted(world()).text('find', { query: '整个界面', side: 'client' })
    expect(text).toContain('shell.app   part   整个应用 — 应用的全部界面。')
  })

  it('a single Chinese character still matches as a substring', async () => {
    const text = await sighted(world()).text('find', { query: '钮', side: 'client' })
    expect(text).toContain('session.composer.send')
  })

  it('searches the rules of a point: key, gives, example and the names of its data', async () => {
    const s = sighted(world())
    expect(await s.text('find', { query: 'accent' })).toContain('shell.tokens')
    expect(await s.text('find', { query: 'directory', side: 'server' })).toContain('skill.skills')
  })

  it('nothing found points at walking the tree', async () => {
    expect(await sighted(world()).text('find', { query: 'zebra 斑马' })).toBe(
      [
        'done OmneExtensionPoints find',
        'nothing matches "zebra 斑马".',
        'Walk the tree instead: tree with depth 1 lists the hosts; then tree with under set to one of them.',
        'tree rev 7c1f.0',
      ].join('\n'),
    )
  })

  it('more than limit names the hosts of the rest', async () => {
    const lines = (await sighted(world()).text('find', { query: 'the', limit: 1 })).split('\n')
    expect(lines.slice(1, -1)).toHaveLength(2)
    expect(lines.at(-2)).toMatch(/^\d+ more match\. Narrow the words, or walk the tree under: /u)
    expect(lines.at(-2)).toContain('under: session, shell, skill, tool.')
  })
})

describe('tree', () => {
  it('a server point carries its summary in the form of a client point', async () => {
    const text = await sighted(world()).text('tree', { side: 'server', under: 'skill' })
    expect(text.split('\n').slice(1, -1)).toEqual([
      'server',
      '  skill',
      '    skill.skills   point   The skills each layer holds.   [keyed-one, v1.2]',
      '      pdf-tools',
      '        pdf#1  [effective, this tenant]',
    ])
  })

  it('a node cut by depth says how many are inside it', async () => {
    const client = await sighted(world()).text('tree', { side: 'client', depth: 1 })
    expect(client).toContain('\n  session   (4 inside)\n')
    expect(client).toContain('\n  shell   (4 inside)\n')
    const server = await sighted(world()).text('tree', { side: 'server', depth: 2 })
    expect(server).toMatch(
      /\n {4}skill\.skills +point {3}The skills each layer holds\. +\[keyed-one, v1\.2\] {3}\(2 inside\)\n/u,
    )
    expect(server).toContain('[list]   (1 inside)')
    const leaf = await sighted(world()).text('tree', {
      side: 'client',
      under: 'session.composer',
      depth: 1,
    })
    expect(leaf).toContain('session.composer.send   part   发送按钮   tokens style render\n')
  })
})

describe('scopes are named, never printed raw', () => {
  const TENANT = ['tenant', '{"organization":"o1","account":"a1"}']
  const scoped = (): World =>
    world({
      scope: TENANT,
      server: registryOf(
        ...serverParts(),
        ['mine', [entry(SKILLS, 'mine', { scope: TENANT })]],
        ['wide', [entry(SKILLS, 'wide', { scope: ['tenant'] })]],
      ),
    })

  it('in tree and show', async () => {
    const s = sighted(scoped())
    const tree = await s.text('tree', { side: 'server' })
    const show = await s.text('show', { name: SKILLS })
    for (const text of [tree, show]) expect(text).not.toContain('organization')
    expect(tree).toContain('mine#1  [effective, this tenant]')
    expect(tree).toContain('wide#1  [effective, another scope]')
    expect(tree).toContain('Shell  [effective, shell#1, deployment]')
    expect(show).toContain('  skill.skills「mine」   mine#1 this tenant   [in effect]')
    expect(show).toContain('  skill.skills「wide」   wide#1 another scope   [in effect]')
  })

  it('in changes', async () => {
    const w = scoped()
    const s = sighted(w)
    s.revisions.record(registryOf(...serverParts()))
    s.revisions.record(w.server as never)
    const text = await s.text('changes', { since: '7c1f.1' })
    expect(text).not.toContain('organization')
    expect(text).toContain('mine#1 this tenant')
  })
})

describe('guide', () => {
  it('says to copy the member show gives', async () => {
    expect(await sighted(world()).text('help')).toContain(
      'show gives a member to copy for each place. Copy it and change the values; do not invent field names.',
    )
  })
})
