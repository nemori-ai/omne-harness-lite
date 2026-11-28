import type { Context } from '@deepseek-ai/cordis'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fiberOf, type Member } from '@omne-harness/plugin-protocol'
import { installOn, type Code, type Listed } from '@omne-harness/plugin-ui'
import {
  RENDER_POINT,
  TOKENS_POINT,
  createToastStore,
  definePart,
  defineRenderPoint,
  tenantScope,
  type ToastBoard,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import {
  connectionPlugin,
  type LoginState,
  type LoginStateSource,
} from '@omne-harness/client-assembly/cordis'
import { accessProtocol } from '@omne-harness/public-contract'
import type { Transport } from '@omne-harness/sdk/core'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

class Framed extends ReferenceShell {
  readonly toastStore = createToastStore({
    visible: 2,
    durationMs: 1000,
    schedule: () => () => undefined,
  })

  private readonly watching = new Set<(scope: string | undefined) => void>()
  override readonly scope = {
    get: () => this.tenant,
    set: (scope: string | undefined) => {
      this.tenant = scope
      for (const listener of this.watching) listener(scope)
    },
    subscribe: (listener: (scope: string | undefined) => void) => {
      this.watching.add(listener)
      return () => void this.watching.delete(listener)
    },
  }

  constructor(ctx: Context) {
    super(ctx)
    this.tenant = ALICE
  }

  protected override toasts(): ToastBoard {
    return this.toastStore
  }
}

const send = definePart<{ label: string }>({
  name: 'notes.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['render'],
})
const card = defineRenderPoint<{ title: string }>({
  title: 'test',
  name: 'notes.card',
  key: 'the kind of a note',
  summary: 'How a note of one kind is drawn.',
})

type Given = Readonly<{
  React: typeof React
  ui: Readonly<{ Badge: (props: { text: string }) => React.ReactNode }>
  shell: Readonly<Record<string, unknown>>
}>

const ui = { Badge: ({ text }: { text: string }) => React.createElement('b', null, text) }

async function world(files: Readonly<Record<string, unknown>> = {}, more: Partial<Code> = {}) {
  const started = await startShellOf(Framed)
  let inside: ShellService | undefined
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      send.declare(ctx.shell)
      card.declare(ctx.shell)
    },
  })
  await started.root.plugin({
    name: 'loader',
    inject: ['shell'],
    apply(ctx: Context) {
      inside = ctx.shell
    },
  })
  const shell = inside!
  const loaded: string[] = []
  const code: Code = {
    given: { React, ui },
    load: async (name, version, path) => {
      loaded.push(`${name}@${version}/${path}`)
      if (!(path in files)) throw new Error(`Failed to fetch dynamically imported module: ${path}`)
      const file = files[path]
      if (file instanceof Error) throw file
      return file
    },
    ...more,
  }
  const install = (listed: Listed, given: Code | undefined = code) =>
    installOn(shell, listed, tenantScope(ALICE), given)
  const sendDrawn = (label = '发送'): string =>
    renderToStaticMarkup(
      shell.drawn(send.name, () => React.createElement('i', null, 'built in'), { label }),
    )
  const cardDrawn = (kind: string, title: string): string =>
    renderToStaticMarkup(
      card.draw(shell, kind, { title }, () => React.createElement('i', null, 'generic')),
    )
  const placed = (): string[] =>
    started.shell
      .registry()
      .placed.filter(each => each.instance.fiber.startsWith('plugin:'))
      .map(each => `${each.point} ${each.key}`)
  return { ...started, shell, loaded, install, sendDrawn, cardDrawn, placed }
}

const sendCode: Member = {
  point: RENDER_POINT,
  key: 'notes.send',
  module: 'send.js',
  export: 'send',
}
const cardCode: Member = {
  point: 'notes.card',
  key: 'todo',
  module: 'cards/todo.js',
  export: 'todo',
}
const brand = (...members: Member[]): Listed => ({ name: 'brand', version: 'v1', members })

/** A drawing whose own component keeps state: it draws only with the React the host handed over. */
const counting = ({ React: R, ui: kit }: Given) => {
  function Counter({ label }: { label: string }): React.ReactNode {
    const [count] = R.useState(3)
    return R.createElement(
      'span',
      null,
      label,
      ' ',
      R.createElement(kit.Badge, { text: String(count) }),
    )
  }
  return ({ props }: { props: { label: string } }) => R.createElement(Counter, props)
}

async function failure(
  listed: Listed,
  files: Readonly<Record<string, unknown>>,
  code?: 'none',
): Promise<string> {
  const t = await world(files)
  const outcome = await (code === 'none'
    ? installOn(t.shell, listed, tenantScope(ALICE))
    : t.install(listed))
  expect(t.placed()).toEqual([])
  expect(t.sendDrawn()).toBe('<i>built in</i>')
  if (outcome.kind !== 'failed') throw new Error(`it was ${outcome.kind}`)
  return outcome.reason
}

describe('a member that is code', () => {
  it('is loaded from its file, called once with what the host hands over, and its drawing put on the point', async () => {
    const calls: Given[] = []
    const t = await world({
      'send.js': {
        send: (given: Given) => {
          calls.push(given)
          return counting(given)
        },
      },
    })
    const outcome = await t.install(brand(sendCode))
    expect(outcome.kind).toBe('installed')
    expect(t.loaded).toEqual(['brand@v1/send.js'])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.React).toBe(React)
    expect(calls[0]?.ui).toBe(ui)
    expect(Object.isFrozen(calls[0])).toBe(true)
    expect(t.sendDrawn('发出去')).toBe('<span>发出去 <b>3</b></span>')
    expect(t.placed()).toEqual([`${RENDER_POINT} notes.send`])
    if (outcome.kind === 'installed') await outcome.remove()
    expect(t.sendDrawn()).toBe('<i>built in</i>')
  })

  it('draws on a point that picks a drawing by key, and only on the key it names', async () => {
    const t = await world({
      'cards/todo.js': {
        todo:
          ({ React: R }: Given) =>
          ({ subject }: { subject: { title: string } }) =>
            R.createElement('h3', null, subject.title),
      },
    })
    await t.install(brand(cardCode))
    expect(t.cardDrawn('todo', '买菜')).toBe('<h3>买菜</h3>')
    expect(t.cardDrawn('memo', '买菜')).toBe('<i>generic</i>')
  })

  it('is handed a shell that puts nothing: it can go to a page, say something, and read who is signed in', async () => {
    let handed: Given['shell'] | undefined
    const t = await world({
      'send.js': {
        send: (given: Given) => {
          handed = given.shell
          return () => null
        },
      },
    })
    const outcome = await t.install(brand(sendCode))
    expect(Object.keys(handed ?? {}).sort()).toEqual(['navigate', 'scope', 'toast'])
    expect(Object.isFrozen(handed)).toBe(true)
    const guest = handed as unknown as Pick<ShellService, 'navigate' | 'toast' | 'scope'>
    guest.navigate('notes')
    expect((t.shell as unknown as ReferenceShell).navigated).toEqual(['notes'])
    expect(guest.scope.get()).toBe(ALICE)
    const seen: (string | undefined)[] = []
    const unwatch = guest.scope.subscribe(scope => seen.push(scope))
    t.shell.scope.set(undefined)
    unwatch()
    t.shell.scope.set(ALICE)
    expect(seen).toEqual([undefined])
    guest.toast({ id: 'copied', tone: 'info', title: '已复制' })
    const shown = (): string[] =>
      (t.shell as unknown as Framed).toastStore.shown().map(each => each.toast.id)
    expect(shown()).toEqual(['copied'])
    if (outcome.kind === 'installed') await outcome.remove()
    expect(shown()).toEqual([])
  })

  it('loads the file of each member once it knows every member can be put, and data and code go on together', async () => {
    const t = await world({ 'send.js': { send: () => () => null } })
    const accent: Member = { point: TOKENS_POINT, key: 'shell.app', data: ['not a record'] }
    const outcome = await t.install(brand(sendCode, accent))
    expect(outcome).toMatchObject({ kind: 'failed' })
    expect(t.loaded).toEqual([])
  })

  it.each([
    [
      'its file cannot be fetched',
      {},
      'member 1 (shell.part-render notes.send): send.js could not be loaded: Failed to fetch dynamically imported module: send.js',
    ],
    [
      'its file throws while it is loaded',
      { 'send.js': new Error('boom at the top') },
      'member 1 (shell.part-render notes.send): send.js could not be loaded: boom at the top',
    ],
    [
      'its file has no such export',
      { 'send.js': { other: () => () => null } },
      'member 1 (shell.part-render notes.send): send.js exports no function named send',
    ],
    [
      'its file gives nothing',
      { 'send.js': null },
      'member 1 (shell.part-render notes.send): send.js exports no function named send',
    ],
    [
      'its export is not a function',
      { 'send.js': { send: 'a text' } },
      'member 1 (shell.part-render notes.send): send.js exports no function named send',
    ],
    [
      'its export throws when it is called',
      {
        'send.js': {
          send: () => {
            throw new Error('no window here')
          },
        },
      },
      'member 1 (shell.part-render notes.send): send threw: no window here',
    ],
    [
      'its export gives something that is not a drawing',
      { 'send.js': { send: () => ({ render: 'later' }) } },
      'member 1 (shell.part-render notes.send): the item lacks render (function)',
    ],
  ] as const)('fails the whole plugin when %s', async (_name, files, reason) => {
    const other = { 'cards/todo.js': { todo: () => () => null } }
    expect(await failure(brand(sendCode, cardCode), { ...other, ...files })).toBe(reason)
  })

  it.each([
    ['a point that takes data', { ...sendCode, point: TOKENS_POINT, key: 'shell.app' }],
  ] as const)('fails before any file is loaded when it names %s', async (_name, member) => {
    const t = await world({ 'send.js': { send: () => () => null } })
    const outcome = await t.install(brand(member))
    expect(outcome).toEqual({
      kind: 'failed',
      reason: `member 1 (${member.point} ${member.key}): the point takes data; this member gives code`,
    })
    expect(t.loaded).toEqual([])
  })

  it('waits, before any file is loaded, when it names a point that is not declared', async () => {
    const t = await world({ 'send.js': { send: () => () => null } })
    expect(await t.install(brand({ ...sendCode, point: 'notes.nowhere' }))).toEqual({
      kind: 'waiting',
      lacks: [{ kind: 'point', name: 'notes.nowhere' }],
    })
    expect(t.loaded).toEqual([])
  })

  it('fails when it writes a rank: a point that takes a drawing holds one item for a key', async () => {
    const t = await world({ 'send.js': { send: () => () => null } })
    expect(await t.install(brand({ ...sendCode, rank: 2 }))).toEqual({
      kind: 'failed',
      reason:
        'member 1 (shell.part-render notes.send): the point holds one item for a key, so a member writes no id and no rank',
    })
    expect(t.loaded).toEqual([])
  })

  it('fails as a whole when the part does not open a drawing, and says what the shell said', async () => {
    const closed = definePart({
      name: 'notes.title',
      label: '标题',
      summary: '这一页的名字',
      depths: ['style'],
    })
    const t = await world({ 'send.js': { send: () => () => null } })
    await t.root.plugin({
      name: 'notes-ui',
      inject: ['shell'],
      apply: (ctx: Context) => closed.declare(ctx.shell),
    })
    const outcome = await t.install(brand({ ...sendCode, key: 'notes.title' }))
    expect(outcome).toEqual({
      kind: 'failed',
      reason: `${RENDER_POINT} notes.title: the part notes.title does not open render`,
    })
    expect(t.placed()).toEqual([])
  })

  it('is loaded all the same when its drawing throws as it draws: that place falls back, and the rest of the plugin stands', async () => {
    const t = await world({
      'send.js': {
        send: () => () => {
          throw new Error('drawn badly')
        },
      },
      'cards/todo.js': {
        todo:
          ({ React: R }: Given) =>
          ({ subject }: { subject: { title: string } }) =>
            R.createElement('h3', null, subject.title),
      },
    })
    const outcome = await t.install(brand(sendCode, cardCode))
    expect(outcome.kind).toBe('installed')
    expect(t.sendDrawn()).toBe('<i>built in</i>')
    expect(t.cardDrawn('todo', '买菜')).toBe('<h3>买菜</h3>')
  })

  it('is not loaded by an application that loads no code', async () => {
    expect(await failure(brand(sendCode), {}, 'none')).toBe(
      'member 1 (shell.part-render notes.send): this application loads no code',
    )
  })
})

describe('the source a member of code is put with', () => {
  const files = {
    'send.js': { send: () => () => null },
    'cards/todo.js': { todo: () => () => null },
  }
  const range = { points: [card.name], parts: [send.name] }
  const place = (name: string, version: string): string => `/bridge/plugins/${name}/${version}/`

  it('is the module under the files of this version, the export it names, and the files', async () => {
    const t = await world(files, { files: place })
    expect((await t.install(brand(sendCode, cardCode))).kind).toBe('installed')
    const at = '/bridge/plugins/brand/v1/'
    expect(t.shell.projection(range)).toMatchObject({
      drawings: [
        {
          point: RENDER_POINT,
          key: 'notes.send',
          source: { module: `${at}send.js`, export: 'send', files: at },
        },
        {
          point: 'notes.card',
          key: 'todo',
          source: { module: `${at}cards/todo.js`, export: 'todo', files: at },
        },
      ],
      unreachable: [],
    })
  })

  it('is not given where the application gives no place for the files: the drawing counts here and reaches no other surface', async () => {
    const t = await world(files)
    expect((await t.install(brand(sendCode, cardCode))).kind).toBe('installed')
    const by = [fiberOf('brand', 'v1')]
    expect(t.shell.projection(range)).toMatchObject({
      drawings: [],
      unreachable: [
        { point: RENDER_POINT, key: 'notes.send', by },
        { point: 'notes.card', key: 'todo', by },
      ],
    })
  })
})

type Tree = Parameters<typeof accessProtocol.operations.scoped.outcomes.succeeded.write>[0]
type Told = Tree['protocols'][number]['contract']

const LIMITS = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

function treeOf(value: unknown): Told {
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  const entries = Object.entries(value as object).map(([key, each]) => ({
    key,
    value: treeOf(each),
  }))
  return { kind: 'object', entries }
}

const WEATHER = {
  name: 'weather',
  major: 1,
  operations: {
    look: {
      effect: 'read',
      limit: 'small',
      body: { kind: 'object', fields: {} },
      result: { kind: 'text' },
    },
  },
}

/** A connection whose login a test signs in: `scoped` then tells the tenant's protocol, and a call of it answers. */
async function connected(root: Context) {
  let state: LoginState = 'signed-out'
  const listeners = new Set<(state: LoginState) => void>()
  const login: LoginStateSource = {
    state: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const scoped = { protocols: [{ name: 'weather', major: 1, contract: treeOf(WEATHER) }] }
  const written = accessProtocol.operations.scoped.outcomes.succeeded.write(scoped, LIMITS)
  if (!written.ok) throw new Error('an answer outside access/v1')
  const transport: Transport = {
    call: async request =>
      request.operation === 'scoped'
        ? { kind: 'answered', outcome: 'succeeded', body: written.value }
        : { kind: 'answered', outcome: 'succeeded', body: { kind: 'string', value: 'sunny' } },
    async *observe(request) {
      yield* []
      await new Promise(resolve => request.signal.addEventListener('abort', resolve))
      return { kind: 'aborted' }
    },
  }
  await root.plugin(connectionPlugin({ transport, login }))
  return {
    async signIn() {
      state = 'signed-in'
      for (const listener of Array.from(listeners)) listener(state)
      for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setImmediate(resolve))
    },
  }
}

type Port = Readonly<Record<string, (body: unknown) => Promise<unknown>>>

describe('the ports the code of a plugin is handed on the client', () => {
  it('a protocol in needs is a client always there: unavailable before the protocol is, through once the login reads it', async () => {
    const handed: Readonly<{ ports: Readonly<Record<string, Port>> }>[] = []
    const t = await world({
      'send.js': {
        send: (given: Given & { ports: Readonly<Record<string, Port>> }) => {
          handed.push(given)
          return counting(given)
        },
      },
    })
    const link = await connected(t.root)
    const outcome = await t.install({ ...brand(sendCode), needs: ['weather/v1'] })
    expect(outcome.kind).toBe('installed')
    const ports = handed[0]!.ports
    expect(Object.keys(ports)).toEqual(['weather/v1'])
    expect(Object.isFrozen(ports)).toBe(true)
    expect(await ports['weather/v1']!['look']!({})).toEqual({ outcome: 'unavailable' })
    await link.signIn()
    expect(await ports['weather/v1']!['look']!({})).toEqual({ outcome: 'succeeded', body: 'sunny' })
  })

  it('a plugin that names in needs anything but a protocol fails, and nothing of it is loaded', async () => {
    const t = await world({ 'send.js': { send: counting } })
    const outcome = await t.install({ ...brand(sendCode), needs: ['net.fetch'] })
    expect(outcome).toEqual({
      kind: 'failed',
      reason: 'needs net.fetch: this side lends only protocols, each <name>/v<major>',
    })
    expect(t.loaded).toEqual([])
  })
})
