import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  defineKeyedPoint,
  definePoint,
  type AttachedEntry,
  type AttachedLayout,
  type PointCodec,
  type PointProps,
} from '@omne-harness/shell-contract'
import { startShell } from './reference-shell.ts'

type Session = Readonly<{ session: string }>

const sessionCodec: PointCodec<Session> = {
  encode: value => value.session,
  decode: text => (text.startsWith('ses_') ? { session: text } : undefined),
}

function entriesOf(show: (layout: AttachedLayout) => ReactNode): readonly AttachedEntry[] {
  let seen: readonly AttachedEntry[] | undefined
  show(entries => {
    seen = entries
    return null
  })
  if (seen === undefined) throw new Error('the layout was not called')
  return seen
}

const nodesOf = (show: (layout: AttachedLayout) => ReactNode): readonly ReactNode[] =>
  entriesOf(show).map(entry => entry.node)

describe('definePoint', () => {
  it('hands each item the decoded subject and the tenant, and the host the id, the label and the node', async () => {
    const { root, shell } = await startShell()
    const side = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    side.declare(shell)
    const received: PointProps<Session>[] = []
    await root.plugin({
      name: 'contributor',
      inject: ['shell'],
      apply(ctx: Context) {
        side.contribute(ctx.shell, {
          id: 'status',
          order: 2,
          label: '状态',
          render: props => {
            received.push(props)
            return `status of ${props.subject.session}`
          },
        })
        side.contribute(ctx.shell, { id: 'plain', order: 1, render: () => 'plain' })
      },
    })
    expect(entriesOf(layout => side.slot(shell, { session: 'ses_1' }, layout))).toEqual([
      { id: 'plain', label: undefined, node: 'plain' },
      { id: 'status', label: '状态', node: 'status of ses_1' },
    ])
    expect(received).toEqual([{ scope: undefined, subject: { session: 'ses_1' } }])
  })

  it('returns what the layout returns', async () => {
    const { shell } = await startShell()
    const side = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    side.declare(shell)
    expect(side.slot(shell, { session: 'ses_1' }, entries => `${entries.length} items`)).toBe(
      '0 items',
    )
  })

  it('keeps its name as the anchor, so an item placed straight into the attached slot shows too', async () => {
    const { root, shell } = await startShell()
    const dock = definePoint<Session>({ name: 'session.dock', subject: sessionCodec })
    dock.declare(shell)
    await root.plugin({
      name: 'direct',
      inject: ['shell'],
      apply(ctx: Context) {
        ctx.shell.contribute('attached', {
          id: 'direct',
          order: 0,
          anchor: 'session.dock',
          render: props => `raw ${props.subject}`,
        })
      },
    })
    expect(dock.name).toBe('session.dock')
    expect(entriesOf(layout => dock.slot(shell, { session: 'ses_1' }, layout))).toEqual([
      { id: 'direct', label: undefined, node: 'raw ses_1' },
    ])
  })

  it('draws nothing for an item when the text does not decode, and does not throw', async () => {
    const { root, shell } = await startShell()
    const side = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    side.declare(shell)
    let rendered = 0
    await root.plugin({
      name: 'contributor',
      inject: ['shell'],
      apply(ctx: Context) {
        side.contribute(ctx.shell, {
          id: 'status',
          order: 0,
          render: () => {
            rendered += 1
            return 'status'
          },
        })
      },
    })
    expect(entriesOf(layout => shell.arranged('session.side', 'not-a-session', layout))).toEqual([
      { id: 'status', label: undefined, node: null },
    ])
    expect(rendered).toBe(0)
  })

  it('takes the item down when the scope of the contributor unloads', async () => {
    const { root, shell } = await startShell()
    const side = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    side.declare(shell)
    const contributor = root.plugin({
      name: 'contributor',
      inject: ['shell'],
      apply(ctx: Context) {
        side.contribute(ctx.shell, { id: 'status', order: 0, render: () => 'status' })
      },
    })
    await contributor
    expect(nodesOf(layout => side.slot(shell, { session: 'ses_1' }, layout))).toEqual(['status'])
    await contributor.dispose()
    expect(nodesOf(layout => side.slot(shell, { session: 'ses_1' }, layout))).toEqual([])
  })

  it('lets two points hold the same item id', async () => {
    const { root, shell } = await startShell()
    const side = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    side.declare(shell)
    const dock = definePoint<Session>({ name: 'session.dock', subject: sessionCodec })
    dock.declare(shell)
    await root.plugin({
      name: 'contributor',
      inject: ['shell'],
      apply(ctx: Context) {
        side.contribute(ctx.shell, { id: 'status', order: 0, render: () => 'side' })
        dock.contribute(ctx.shell, { id: 'status', order: 0, render: () => 'dock' })
      },
    })
    expect(nodesOf(layout => side.slot(shell, { session: 'ses_1' }, layout))).toEqual(['side'])
    expect(nodesOf(layout => dock.slot(shell, { session: 'ses_1' }, layout))).toEqual(['dock'])
  })
})

type Holding = Readonly<{ category: string; name: string }>

const holdingCodec: PointCodec<Holding> = {
  encode: value => JSON.stringify([value.category, value.name]),
  decode: text => {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string'
      ? { category: parsed[0], name: parsed[1] }
      : undefined
  },
}

describe('defineKeyedPoint', () => {
  it('shows an item only under the key it was placed for', async () => {
    const { root, shell } = await startShell()
    const holding = defineKeyedPoint<Holding>({ name: 'assets.holding', subject: holdingCodec })
    holding.declare(shell)
    await root.plugin({
      name: 'mcp-ui',
      inject: ['shell'],
      apply(ctx: Context) {
        holding.contribute(ctx.shell, 'mcp', {
          id: 'status',
          order: 0,
          label: '状态',
          render: props => `${props.subject.category}/${props.subject.name}`,
        })
      },
    })
    expect(
      entriesOf(layout => holding.slot(shell, 'mcp', { category: 'mcp', name: 'github' }, layout)),
    ).toEqual([{ id: 'status', label: '状态', node: 'mcp/github' }])
    expect(
      entriesOf(layout => holding.slot(shell, 'skill', { category: 'skill', name: 'pdf' }, layout)),
    ).toEqual([])
  })

  it('accepts an item for a key before any host shows that key', async () => {
    const { root, shell } = await startShell()
    const holding = defineKeyedPoint<Holding>({ name: 'assets.holding', subject: holdingCodec })
    holding.declare(shell)
    await root.plugin({
      name: 'early',
      inject: ['shell'],
      apply(ctx: Context) {
        holding.contribute(ctx.shell, 'later', { id: 'early', order: 0, render: () => 'early' })
      },
    })
    expect(shell.items('attached').map(item => item.anchor)).toEqual(['assets.holding:later'])
    expect(
      nodesOf(layout => holding.slot(shell, 'later', { category: 'later', name: 'x' }, layout)),
    ).toEqual(['early'])
  })

  it('lets two keys hold the same item id and refuses a repeated id of one module under one key', async () => {
    const { root, shell } = await startShell()
    const holding = defineKeyedPoint<Holding>({ name: 'assets.holding', subject: holdingCodec })
    holding.declare(shell)
    const error = await new Promise<unknown>(resolve => {
      root.plugin({
        name: 'two-keys',
        inject: ['shell'],
        apply(ctx: Context) {
          holding.contribute(ctx.shell, 'mcp', { id: 'status', order: 0, render: () => 'mcp' })
          holding.contribute(ctx.shell, 'skill', { id: 'status', order: 0, render: () => 'skill' })
          try {
            holding.contribute(ctx.shell, 'mcp', { id: 'status', order: 9, render: () => 'again' })
          } catch (caught) {
            resolve(caught)
          }
        },
      })
    })
    expect(error).toMatchObject({ slot: 'attached', id: 'status', reason: 'duplicate' })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(shell.items('attached').map(item => item.anchor)).toEqual([
      'assets.holding:mcp',
      'assets.holding:skill',
    ])
  })

  it('answers a conflict when another module repeats an id under one key; the other keys stay', async () => {
    const { root, shell } = await startShell()
    const holding = defineKeyedPoint<Holding>({ name: 'assets.holding', subject: holdingCodec })
    holding.declare(shell)
    const put = (name: string, key: string) =>
      root.plugin({
        name,
        inject: ['shell'],
        apply(ctx: Context) {
          holding.contribute(ctx.shell, key, { id: 'status', order: 0, render: () => name })
        },
      })
    await put('first', 'mcp')
    await put('second', 'skill')
    await put('third', 'mcp')
    expect(shell.items('attached').map(item => item.anchor)).toEqual(['assets.holding:skill'])
    expect(shell.conflicts('attached')).toEqual([
      { slot: 'attached', anchor: 'assets.holding:mcp', id: 'status', by: ['first', 'third'] },
    ])
  })

  it('carries its contract: a keyed point holds a list for each key, a plain one a list', () => {
    const plain = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    const keyed = defineKeyedPoint<Holding>({
      name: 'assets.holding',
      subject: holdingCodec,
      summary: 'What a holding shows beside itself.',
      key: 'the category of the holding',
    })
    expect(plain.contract).toMatchObject({
      name: 'session.side',
      tree: 'client',
      arity: 'list',
      key: 'none',
      binding: 'run',
      summary: 'The point session.side.',
    })
    expect(keyed.contract).toMatchObject({
      name: 'assets.holding',
      arity: 'keyed-list',
      key: 'the category of the holding',
      item: { kind: 'pure', fields: { render: 'function' } },
      summary: 'What a holding shows beside itself.',
    })
  })

  it('throws when one module declares the same point twice', async () => {
    const { root } = await startShell()
    const side = definePoint<Session>({ name: 'session.side', subject: sessionCodec })
    const error = await new Promise<unknown>(resolve => {
      root.plugin({
        name: 'host',
        inject: ['shell'],
        apply(ctx: Context) {
          side.declare(ctx.shell)
          try {
            side.declare(ctx.shell)
          } catch (caught) {
            resolve(caught)
          }
        },
      })
    })
    expect(error).toMatchObject({ slot: 'attached', id: 'session.side', reason: 'duplicate' })
  })
})
