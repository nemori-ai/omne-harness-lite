import { describe, expect, it } from 'vitest'
import { digestBytes } from '@omne-harness/assets'
import { ALICE, BUNDLE, PLACED, bound, directoryOf, id, world, type World } from './world.ts'

const PILL = { category: 'bundle', name: 'pill-send', dir: 'plugins/pill-send' }
const lines = (...body: string[]) => body.join('\n')

async function holding(w: World, ...names: string[]) {
  const s = bound(w)
  for (const name of names)
    await s.text('publish', { id: `make-${name}`, category: 'note', name, data: { text: name } })
  return s
}

describe('categories', () => {
  it('lists the categories registered now, each as its owner wrote it, and how one is made', async () => {
    expect(await bound(world()).text('categories')).toBe(
      lines(
        'done OmneExtensions categories',
        'bundle   from a directory   包 — 一组成员。',
        'kit      not through here   套件 — 随部署安装。',
        'note     from a body        笔记 — 一段短文。',
        '3 categories now.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('a category registered while running is one more line, with the tool unchanged', async () => {
    const w = world()
    const s = bound(w)
    const { layout: _directory, ...contract } = BUNDLE.contract
    const withdraw = w.categories.contribute({
      ...BUNDLE,
      contract: { ...contract, category: 'theme' },
      display: { title: '主题', summary: '一组颜色。' },
      point: 'themes.items',
    })
    const text = await s.text('categories')
    expect(text).toContain('\ntheme    from a body        主题 — 一组颜色。\n')
    expect(text).toContain('\n4 categories now.\n')
    withdraw()
    expect(await s.text('categories')).toContain('\n3 categories now.\n')
  })

  it('has no revision line when the revision cannot be read', async () => {
    const text = await bound(world({ revision: null })).text('categories')
    expect(text.split('\n').at(-1)).toBe('3 categories now.')
  })
})

describe('publish', () => {
  it('from a workspace directory: the receipt, then what is in effect now', async () => {
    expect(await bound(world()).text('publish', { id: 'p1', ...PILL })).toBe(
      lines(
        'done OmneExtensions publish',
        '{"id":"p1","category":"bundle","name":"pill-send","version":"sha256:v1","changed":true,"enabled":true,"recalled":false}',
        'in effect from now. Clients: 1 connected. OmneExtensions show says whether it loaded.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('from a body: the body is what the category judges', async () => {
    const w = world({ placement: { of: async () => ({ ...PLACED, clients: null }) } })
    const params = { id: 'n1', category: 'note', name: 'a', data: { text: 'hi' } }
    expect(await bound(w).text('publish', params)).toBe(
      lines(
        'done OmneExtensions publish',
        '{"id":"n1","category":"note","name":"a","version":"sha256:v1","changed":true,"enabled":true,"recalled":false}',
        'in effect from now.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('the same id sent again is recalled: nothing changes, and it says so', async () => {
    const s = bound(world())
    await s.text('publish', { id: 'p1', ...PILL })
    expect(await s.text('publish', { id: 'p1', ...PILL })).toBe(
      lines(
        'done OmneExtensions publish',
        '{"id":"p1","category":"bundle","name":"pill-send","version":"sha256:v1","changed":false,"enabled":true,"recalled":true}',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('the same id with another input is a conflict that says to use a new id', async () => {
    const s = bound(world())
    await s.text('publish', { id: 'p1', ...PILL })
    const failure = await s.failure('publish', { id: 'p1', ...PILL, name: 'other' })
    expect(failure).toEqual({
      kind: 'conflict',
      reason: 'the id "p1" was used for another input; use a new id. result p1 says what it did.',
    })
  })

  it('a category that is not made through here says so', async () => {
    const failure = await bound(world()).failure('publish', {
      id: 'k1',
      category: 'kit',
      name: 'k',
      data: { text: 'x' },
    })
    expect(failure.reason).toBe(
      'category kit is not made through here; nothing was changed. categories says how each is made.',
    )
  })

  it('a category that is not there now: the receipt names the categories that are', async () => {
    const failure = await bound(world()).failure('publish', {
      id: 'w1',
      category: 'workflow',
      name: 'x',
      dir: 'plugins/pill-send',
    })
    expect(failure).toEqual({
      kind: 'invalid',
      reason: 'there is no category "workflow" now. Categories now: bundle, kit, note.',
    })
  })

  it.each([
    [
      'the body',
      { id: 'n1', category: 'note', name: 'a', data: { title: 'no text' } },
      'category note says: a note needs a text',
    ],
    [
      'the directory',
      { id: 'b1', category: 'bundle', name: 'broken', dir: 'plugins/broken' },
      'bundle.json: client.members[0].point "shell.token" is not a point now. For how a bundle is written: help with name publish and category bundle.',
    ],
  ])(
    'a refusal of the category over %s is carried as the category wrote it',
    async (_, params, reason) => {
      const w = world()
      expect(await bound(w).failure('publish', params)).toEqual({ kind: 'invalid', reason })
      expect(w.holdings.size).toBe(0)
    },
  )

  it.each([
    [
      'a body into a directory category',
      { category: 'bundle', name: 'b', data: { text: 'x' } },
      'category bundle is made from a directory: write it in the workspace and give dir.',
    ],
    [
      'a directory into a body category',
      { category: 'note', name: 'n', dir: 'plugins/pill-send' },
      'category note is made from a body: give data, not dir.',
    ],
    [
      'neither',
      { category: 'note', name: 'n' },
      'give dir or data, one of them: what is published.',
    ],
    [
      'both',
      { category: 'note', name: 'n', dir: 'plugins/pill-send', data: {} },
      'give dir or data, one of them: what is published.',
    ],
    [
      'a directory that is not there',
      { category: 'bundle', name: 'b', dir: 'plugins/none' },
      'dir "plugins/none" is not a directory in this workspace; nothing was changed.',
    ],
  ])('%s is invalid', async (_, params, reason) => {
    expect(await bound(world()).failure('publish', { id: 'x1', ...params })).toEqual({
      kind: 'invalid',
      reason,
    })
  })

  it('a workspace that cannot be read is unavailable, and nothing was published', async () => {
    const w = world()
    const failure = await bound(w).failure('publish', { id: 'f1', ...PILL, dir: 'plugins/far' })
    expect(failure).toEqual({
      kind: 'unavailable',
      operation: 'OmneExtensions.publish',
      reason: 'the workspace cannot be read now; nothing was changed',
    })
    expect(w.writes()).toEqual([])
  })

  it.each(['unknown', 'throws'] as const)(
    'a publish the services answer %s is a failure that says to send the same id again or ask result',
    async next => {
      const w = world()
      w.script.next = next
      const failure = await bound(w).failure('publish', { id: 'u1', ...PILL })
      expect(failure).toEqual({
        kind: 'unknown',
        operation: 'OmneExtensions.publish',
        reason:
          'it is not known whether this took effect; send the same command again with the same id, or ask result: what took effect is recalled, not done twice',
      })
    },
  )
})

describe('enable, disable and remove', () => {
  it('disable changes it, and says what comes back', async () => {
    const s = await holding(world(), 'a')
    expect(await s.text('disable', { id: 'd1', category: 'note', name: 'a' })).toBe(
      lines(
        'done OmneExtensions disable',
        '{"id":"d1","category":"note","name":"a","enabled":false,"changed":true,"recalled":false}',
        'no longer in effect. What it had replaced is back.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('a disable of what is disabled already changes nothing; its id sent again is recalled', async () => {
    const s = await holding(world(), 'a')
    await s.text('disable', { id: 'd1', category: 'note', name: 'a' })
    expect(await s.text('disable', { id: 'd2', category: 'note', name: 'a' })).toBe(
      lines(
        'done OmneExtensions disable',
        '{"id":"d2","category":"note","name":"a","enabled":false,"changed":false,"recalled":false}',
        'tree rev 7c1f.41',
      ),
    )
    expect(await s.text('disable', { id: 'd1', category: 'note', name: 'a' })).toContain(
      '{"id":"d1","category":"note","name":"a","enabled":false,"changed":false,"recalled":true}',
    )
    expect((await s.failure('enable', { id: 'd1', category: 'note', name: 'a' })).kind).toBe(
      'conflict',
    )
  })

  it('enable and remove answer in the same form', async () => {
    const s = await holding(world(), 'a')
    await s.text('disable', { id: 'd1', category: 'note', name: 'a' })
    expect(await s.text('enable', { id: 'e1', category: 'note', name: 'a' })).toBe(
      lines(
        'done OmneExtensions enable',
        '{"id":"e1","category":"note","name":"a","enabled":true,"changed":true,"recalled":false}',
        'in effect from now.',
        'tree rev 7c1f.41',
      ),
    )
    expect(await s.text('remove', { id: 'r1', category: 'note', name: 'a' })).toBe(
      lines(
        'done OmneExtensions remove',
        '{"id":"r1","category":"note","name":"a","changed":true,"recalled":false}',
        'removed; no longer in effect.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it.each(['enable', 'disable', 'remove'])('%s of a name not held says so', async command => {
    const w = world()
    const s = await holding(w, 'a')
    expect(await s.failure(command, { id: 'x1', category: 'note', name: 'b' })).toEqual({
      kind: 'invalid',
      reason: 'note b is not held by this tenant. list note shows what is held.',
    })
    expect(w.writes().map(call => call.method)).toEqual(['publish'])
  })

  it('a disable whose result is not known is a failure, and result recalls what it did', async () => {
    const w = world()
    const s = await holding(w, 'a')
    w.script.next = 'unknown'
    expect((await s.failure('disable', { id: 'd1', category: 'note', name: 'a' })).kind).toBe(
      'unknown',
    )
    expect(await s.text('result', { id: 'd1' })).toContain(
      '{"id":"d1","command":"disable","category":"note","name":"a","enabled":false,"changed":true,"recalled":true}',
    )
  })

  it('a change that lost a race is a conflict that says to read again', async () => {
    const w = world()
    const s = await holding(w, 'a')
    w.script.next = 'conflict'
    expect(await s.failure('remove', { id: 'r1', category: 'note', name: 'a' })).toEqual({
      kind: 'conflict',
      reason: 'note a changed while this ran; read show and send again with a new id.',
    })
  })
})

describe('result', () => {
  it('recalls a publish and a disable by their ids, and says when nothing was done under an id', async () => {
    const s = bound(world())
    await s.text('publish', { id: 'p1', ...PILL })
    await s.text('disable', { id: 'd1', category: 'bundle', name: 'pill-send' })
    expect(await s.text('result', { id: 'p1' })).toBe(
      lines(
        'done OmneExtensions result',
        '{"id":"p1","command":"publish","category":"bundle","name":"pill-send","version":"sha256:v1","changed":true,"recalled":true}',
        'tree rev 7c1f.41',
      ),
    )
    expect(await s.text('result', { id: 'd1' })).toContain(
      '{"id":"d1","command":"disable","category":"bundle","name":"pill-send","enabled":false,"changed":true,"recalled":true}',
    )
    expect(await s.text('result', { id: 'never' })).toBe(
      lines(
        'done OmneExtensions result',
        'nothing was done under the id "never" for this tenant.',
        'tree rev 7c1f.41',
      ),
    )
  })
})

describe('list', () => {
  it('each held one with its version and whether it is enabled, then how many', async () => {
    const s = await holding(world(), 'a', 'b', 'c')
    await s.text('disable', { id: 'd1', category: 'note', name: 'b' })
    expect(await s.text('list', { category: 'note' })).toBe(
      lines(
        'done OmneExtensions list',
        'a   sha256:v1   enabled',
        'b   sha256:v2   disabled',
        'c   sha256:v3   enabled',
        '3 held.',
        'tree rev 7c1f.41',
      ),
    )
    expect(await s.text('list', { category: 'note', limit: 2 })).toContain(
      '\nb   sha256:v2   disabled\n2 shown; more after them: give after="b".\n',
    )
    expect(await s.text('list', { category: 'note', after: 'b' })).toContain(
      '\nc   sha256:v3   enabled\n1 held.\n',
    )
  })

  it('a category not there now names the ones that are', async () => {
    expect(await bound(world()).failure('list', { category: 'workflow' })).toEqual({
      kind: 'invalid',
      reason: 'there is no category "workflow" now. Categories now: bundle, kit, note.',
    })
  })
})

describe('impact', () => {
  const CHANGES = {
    kind: 'changes',
    lines: [
      {
        mark: '+',
        of: null,
        point: 'shell.part-style',
        key: 'session.composer.send',
        says: '→ in effect; shadows built-in',
      },
    ],
    loads: 'loads on: client. Server: nothing to load.',
    advice: null,
  } as const

  it('of a directory not yet published: what would appear, and nothing else', async () => {
    const w = world({ impact: { of: async () => CHANGES } })
    const asked: unknown[] = []
    w.impact = { of: async input => (asked.push(input), CHANGES) }
    expect(await bound(w).text('impact', { category: 'bundle', dir: 'plugins/pill-send' })).toBe(
      lines(
        'done OmneExtensions impact',
        'bundle pill-send (not published), publish:',
        '  + shell.part-style / session.composer.send   → in effect; shadows built-in',
        'nothing else changes.',
        'loads on: client. Server: nothing to load.',
        'tree rev 7c1f.41',
      ),
    )
    expect(asked).toMatchObject([
      {
        tenant: 'tenant-a',
        capability: id('bundle', 'pill-send'),
        change: 'publish',
        content: { kind: 'directory' },
      },
    ])
    expect(w.writes()).toEqual([])
  })

  it.each(['publish', 'enable', 'disable', 'remove'] as const)(
    'of a held one, %s: conflicts and changes of state, and the advice',
    async change => {
      const w = world()
      const s = bound(w)
      await s.text('publish', { id: 'p1', ...PILL })
      const asked: { change: string; content?: unknown }[] = []
      w.impact = {
        async of(input) {
          asked.push(input)
          return {
            kind: 'changes',
            lines: [
              {
                mark: '!',
                of: null,
                point: 'shell.part-style',
                key: 'session.composer.send',
                says: '→ conflict with bundle round-buttons (same tenant).',
              },
              {
                mark: '~',
                of: 'round-buttons',
                point: 'shell.part-style',
                key: 'session.composer.send',
                says: 'in effect → conflict',
              },
            ],
            loads: null,
            advice: 'Disable round-buttons first, or leave this member out.',
          }
        },
      }
      const params = change === 'publish' ? PILL : { category: 'bundle', name: 'pill-send', change }
      expect(await s.text('impact', params)).toBe(
        lines(
          'done OmneExtensions impact',
          `bundle pill-send (published), ${change}:`,
          '  ! shell.part-style / session.composer.send   → conflict with bundle round-buttons (same tenant).',
          '  ~ round-buttons: shell.part-style / session.composer.send   in effect → conflict',
          'Disable round-buttons first, or leave this member out.',
          'tree rev 7c1f.41',
        ),
      )
      expect(asked.map(input => [input.change, input.content === undefined])).toEqual([
        [change, change !== 'publish'],
      ])
    },
  )

  it('a port that cannot answer makes the impact a failure', async () => {
    const w = world({
      impact: { of: async () => ({ kind: 'unavailable', reason: 'no client is connected' }) },
    })
    expect(
      await bound(w).failure('impact', { category: 'bundle', dir: 'plugins/pill-send' }),
    ).toEqual({
      kind: 'unavailable',
      operation: 'OmneExtensions.impact',
      reason:
        'the impact cannot be read now: no client is connected. For how a bundle is written: help with name publish and category bundle.',
    })
  })

  it('a publish the category refuses says the reason as the category wrote it, then where its layout is said', async () => {
    const s = bound(world())
    const refused = await s.failure('publish', {
      id: 'b9',
      category: 'bundle',
      name: 'broken',
      dir: 'plugins/broken',
    })
    expect(refused.kind).toBe('invalid')
    expect(refused.reason).toMatch(
      /\. For how a bundle is written: help with name publish and category bundle\.$/u,
    )
  })

  it('does not point to a layout for a held one, nor for a category whose owner gives none', async () => {
    const w = world({
      impact: { of: async () => ({ kind: 'unavailable', reason: 'not now' }) },
    })
    const s = bound(w)
    await s.text('publish', { id: 'n1', category: 'note', name: 'a', data: { text: 'x' } })
    const asked = { category: 'note', name: 'a', change: 'disable' }
    expect((await s.failure('impact', asked)).reason).toBe('the impact cannot be read now: not now')
  })

  it.each([
    [{ category: 'note' }, 'give dir for a directory not yet published, or name for a held one.'],
    [{ category: 'note', name: 'a' }, 'give dir: the directory that would be published.'],
    [
      { category: 'bundle', dir: 'plugins/pill-send', change: 'remove' },
      'dir goes with publish; to ask about remove, give the name of a held one.',
    ],
    [
      { category: 'note', name: 'b', change: 'disable' },
      'note b is not held by this tenant. list note shows what is held.',
    ],
  ])('%j is invalid', async (params, reason) => {
    expect(await bound(world()).failure('impact', params)).toEqual({ kind: 'invalid', reason })
  })
})

describe('show', () => {
  async function shown(placed: World['placement']) {
    const w = world({ placement: placed })
    const s = bound(w)
    w.placement = { of: async () => PLACED }
    await s.text('publish', { id: 'p1', ...PILL })
    w.placement = placed
    return s.text('show', { category: 'bundle', name: 'pill-send' })
  }
  const HEAD = [
    'done OmneExtensions show',
    'bundle pill-send   sha256:v1   enabled   held by this tenant',
    'pill-send 的简介。',
  ]

  it('what it places, how each connected client loaded it, and its files', async () => {
    expect(await shown({ of: async () => PLACED })).toBe(
      lines(
        ...HEAD,
        'places:',
        '  shell.part-style / session.composer.send   [in effect]   shadows built-in',
        'clients:',
        '  desktop, connected   loaded',
        'source: this held version, 2 files (11 bytes): bundle.json, a.js',
        'to change it: export it to a directory, edit there, publish from that directory.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('no client connected is said; no client tree at all is not shown', async () => {
    expect(await shown({ of: async () => ({ ...PLACED, clients: [] }) })).toContain(
      '\nclients:\n  none connected\nsource:',
    )
    const none = await shown({
      of: async () => ({
        ...PLACED,
        clients: null,
        advice: 'Fix the file and publish again, or disable it.',
      }),
    })
    expect(none).not.toContain('clients:')
    expect(none).toContain(
      'shadows built-in\nFix the file and publish again, or disable it.\nsource:',
    )
  })

  it('a placement that cannot be read says so on its line, and the rest still shows', async () => {
    expect(
      await shown({ of: async () => ({ kind: 'unavailable', reason: 'the trees are not read' }) }),
    ).toBe(
      lines(
        ...HEAD,
        'places: cannot be read now: the trees are not read',
        'source: this held version, 2 files (11 bytes): bundle.json, a.js',
        'to change it: export it to a directory, edit there, publish from that directory.',
        'tree rev 7c1f.41',
      ),
    )
  })

  async function shownNote(w: World, data: unknown) {
    const s = bound(w)
    await s.text('publish', { id: 'p1', category: 'note', name: 'n', data })
    const text = await s.text('show', { category: 'note', name: 'n' })
    return text.slice(text.indexOf('\nsource:') + 1)
  }

  it('a body short enough is printed as its source, with how to change it', async () => {
    expect(await shownNote(world(), { text: 'hi' })).toBe(
      lines(
        'source: this held version, a body of 13 bytes:',
        '{"text":"hi"}',
        'to change it: publish a new body as data.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('a body too long to print says so and points to export', async () => {
    expect(await shownNote(world(), { text: 'x'.repeat(5000) })).toBe(
      lines(
        'source: this held version, a body of 5011 bytes, too long to print here.',
        'to read or change it: export it to a directory.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it('one installed with the deployment says it cannot be changed in place, before how to change it', async () => {
    const w = world()
    w.official.add('note/n')
    const said = await shownNote(w, { text: 'hi' })
    expect(said).toContain(
      '{"text":"hi"}\nit is installed with the deployment and cannot be changed in place.\nto change it: publish a new body as data.\n',
    )
  })

  it('a name not held says so', async () => {
    expect((await bound(world()).failure('show', { category: 'note', name: 'a' })).reason).toBe(
      'note a is not held by this tenant. list note shows what is held.',
    )
  })
})

describe('the acting tenant', () => {
  it('every service call carries the tenant and principal of the call, never a value from the model', async () => {
    const w = world()
    const s = bound(w)
    await s.text('publish', { id: 'p1', ...PILL })
    await s.text('disable', { id: 'd1', category: 'bundle', name: 'pill-send' })
    await s.text('enable', { id: 'e1', category: 'bundle', name: 'pill-send' })
    await s.text('remove', { id: 'r1', category: 'bundle', name: 'pill-send' })
    await s.text('list', { category: 'bundle' })
    await s.text('result', { id: 'p1' })
    expect(w.writes().map(call => call.method)).toEqual([
      'publish',
      'setEnabled',
      'setEnabled',
      'remove',
    ])
    for (const call of w.calls)
      expect([call.tenant, call.principal]).toEqual([ALICE.tenant, ALICE.principal])
  })
})

describe('when the assets cannot be had', () => {
  const CALLS: readonly [string, object][] = [
    ['categories', {}],
    ['list', { category: 'note' }],
    ['show', { category: 'note', name: 'a' }],
    ['export', { category: 'note', name: 'a', dir: 'work/a' }],
    ['impact', { category: 'bundle', dir: 'plugins/pill-send' }],
    ['publish', { id: 'p1', ...PILL }],
    ['enable', { id: 'e1', category: 'note', name: 'a' }],
    ['disable', { id: 'd1', category: 'note', name: 'a' }],
    ['remove', { id: 'r1', category: 'note', name: 'a' }],
    ['result', { id: 'p1' }],
    ['help', { name: 'publish', category: 'note' }],
  ]

  it.each(['absent', 'throws'] as const)(
    'faces %s: every command fails, and nothing is written',
    async faces => {
      const w = world({ faces })
      const s = bound(w)
      for (const [command, params] of CALLS)
        expect(await s.failure(command, params)).toEqual({
          kind: 'unavailable',
          operation: `OmneExtensions.${command}`,
          reason: 'the asset services cannot answer now; nothing was changed',
        })
      expect(w.calls).toEqual([])
    },
  )
})

describe('export', () => {
  const EXPORT = { category: 'bundle', name: 'pill-send', dir: 'work/pill' }
  async function held(w: World = world()) {
    const s = bound(w)
    await s.text('publish', { id: 'p1', ...PILL })
    return s
  }

  it('writes the held files into a new directory, names them, and says what to do next', async () => {
    const w = world()
    const s = await held(w)
    expect(await s.text('export', EXPORT)).toBe(
      lines(
        'done OmneExtensions export bundle pill-send',
        'sha256:v1   wrote 2 files (11 bytes) to work/pill',
        'files: bundle.json, a.js',
        'Edit them there, then: impact with dir work/pill, then publish from it.',
        'tree rev 7c1f.41',
      ),
    )
    expect(w.placeAsked.map(asked => asked.dir)).toEqual(['work/pill'])
    expect(w.writes().map(call => call.method)).toEqual(['publish'])
  })

  it('a data one is written as body.json: its JSON text and one newline', async () => {
    const w = world()
    const s = bound(w)
    await s.text('publish', { id: 'p1', category: 'note', name: 'n', data: { text: 'hi' } })
    expect(await s.text('export', { category: 'note', name: 'n', dir: 'work/n' })).toBe(
      lines(
        'done OmneExtensions export note n',
        'sha256:v1   wrote 1 file (14 bytes) to work/n',
        'files: body.json',
        'Edit body.json there, then publish its content as data.',
        'tree rev 7c1f.41',
      ),
    )
    const from = w.placeAsked[0]?.from
    const manifest = await from?.manifest()
    if (manifest === undefined || !('ok' in manifest)) throw new Error('manifest')
    const text = '{"text":"hi"}\n'
    const digest = digestBytes(new TextEncoder().encode(text))
    expect(manifest.ok.entries).toEqual([{ path: 'body.json', bytes: 14, digest }])
    const opened = await from?.open('body.json', digest)
    if (opened === undefined || !('ok' in opened)) throw new Error('open')
    expect(new TextDecoder().decode(opened.ok)).toBe(text)
  })

  it('names twenty files at most, then how many more', async () => {
    const w = world()
    const s = await held(w)
    const many = Object.fromEntries(Array.from({ length: 22 }, (_, n) => [`f${n}.js`, 'x']))
    w.filesOver.answer = async () => ({
      kind: 'files',
      version: 'sha256:v1',
      from: directoryOf(many),
    })
    const text = await s.text('export', EXPORT)
    const names = Array.from({ length: 20 }, (_, n) => `f${n}.js`).join(', ')
    expect(text).toContain(`\nfiles: ${names}, and 2 more\n`)
    expect(text).toContain('wrote 22 files (22 bytes)')
  })

  it('a directory that holds exactly this version already: nothing was written, and it says so', async () => {
    const w = world({ place: async () => ({ kind: 'same' }) })
    const s = await held(w)
    expect(await s.text('export', EXPORT)).toBe(
      lines(
        'done OmneExtensions export bundle pill-send',
        'work/pill already holds exactly version sha256:v1; nothing was written.',
        'tree rev 7c1f.41',
      ),
    )
  })

  it.each([
    [[], 0, 'a.js'],
    [['notes.md'], 3, 'a.js, notes.md and 3 more'],
  ])(
    'a directory with other content is a conflict that names where it differs',
    async (more, count, named) => {
      const paths = ['a.js', ...more]
      const w = world({ place: async () => ({ kind: 'differs', paths, more: count }) })
      const s = await held(w)
      expect(await s.failure('export', EXPORT)).toEqual({
        kind: 'conflict',
        reason: `work/pill is not empty and differs from the held version in: ${named}. Nothing was written. Give a directory that does not exist yet; or, if that directory is the newer work, ask impact with it and publish it.`,
      })
    },
  )

  it('a path that is no place for a directory in the workspace is invalid', async () => {
    const s = await held(world({ place: async () => ({ kind: 'absent' }) }))
    expect(await s.failure('export', EXPORT)).toEqual({
      kind: 'invalid',
      reason:
        'dir "work/pill" is not a place for a directory in this workspace: give a relative path inside it; nothing was written.',
    })
  })

  it.each([
    ['answers unavailable', async () => ({ kind: 'unavailable' as const })],
    [
      'throws',
      async (): Promise<never> => {
        throw new Error('the disk went away')
      },
    ],
  ])('a workspace that %s: unavailable, nothing was written', async (_, place) => {
    const s = await held(world({ place }))
    expect(await s.failure('export', EXPORT)).toEqual({
      kind: 'unavailable',
      operation: 'OmneExtensions.export',
      reason: 'the workspace cannot be written now; nothing was written',
    })
  })

  it('held files whose list cannot be read: unavailable, and nothing is placed', async () => {
    const w = world()
    const s = await held(w)
    w.filesOver.answer = async () => ({
      kind: 'files',
      version: 'sha256:v1',
      from: {
        manifest: async () => ({ failure: 'unavailable' }),
        open: async () => ({ failure: 'unavailable' }),
      },
    })
    expect(await s.failure('export', EXPORT)).toEqual({
      kind: 'unavailable',
      operation: 'OmneExtensions.export',
      reason: 'the held files cannot be read now; nothing was written',
    })
    expect(w.placeAsked).toEqual([])
  })

  it('a name not held says so, and nothing is placed', async () => {
    const w = world()
    expect(await bound(w).failure('export', { category: 'note', name: 'a', dir: 'w' })).toEqual({
      kind: 'invalid',
      reason: 'note a is not held by this tenant. list note shows what is held.',
    })
    expect(w.placeAsked).toEqual([])
  })

  it('a category not there now names the ones that are', async () => {
    expect(
      (await bound(world()).failure('export', { category: 'plugin', name: 'a', dir: 'w' })).reason,
    ).toBe('there is no category "plugin" now. Categories now: bundle, kit, note.')
  })

  it.each([
    ['denied', async () => ({ kind: 'denied' as const }), 'unsupported'],
    ['unavailable', async () => ({ kind: 'unavailable' as const }), 'unavailable'],
    [
      'a throw',
      async (): Promise<never> => {
        throw new Error('read failed')
      },
      'unavailable',
    ],
  ])('files that answer %s fail as the other reads do', async (_, answer, kind) => {
    const w = world()
    w.filesOver.answer = answer
    expect((await bound(w).failure('export', EXPORT)).kind).toBe(kind)
    expect(w.placeAsked).toEqual([])
  })
})
