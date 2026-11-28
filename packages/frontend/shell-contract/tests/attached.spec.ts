import { describe, expect, it } from 'vitest'
import { declare, type Contract } from '@omne-harness/dynamis'
import type { AttachedProps } from '@omne-harness/shell-contract'
import { startShell } from './reference-shell.ts'

describe('the shell service attached', () => {
  it('renders only the items whose anchor equals the given name, with the subject and the tenant', async () => {
    const { root, shell } = await startShell()
    const received: Record<string, AttachedProps> = {}
    const item = (id: string, anchor: string, order: number) => ({
      id,
      order,
      anchor,
      render: (props: AttachedProps) => {
        received[id] = props
        return id
      },
    })
    await root.plugin({
      name: 'a',
      inject: ['shell'],
      apply(ctx) {
        ctx.shell.contribute('attached', item('late', 'test.a', 2))
        ctx.shell.contribute('attached', item('other', 'test.b', 0))
        ctx.shell.contribute('attached', item('early', 'test.a', 1))
      },
    })
    expect(shell.attached('test.a', 's1')).toEqual(['early', 'late'])
    expect(received).toEqual({
      early: { scope: undefined, subject: 's1' },
      late: { scope: undefined, subject: 's1' },
    })
  })

  it('a point on the tree that holds no render function is not a place to attach to: its items are not listed', async () => {
    const { root, shell } = await startShell()
    const data: Contract = {
      title: 'test',
      name: 'wire.things',
      tree: 'client',
      arity: 'keyed-one',
      keyFrom: null,
      key: 'the name of a thing',
      gives: 'a thing',
      item: { kind: 'pure', fields: { thing: 'object' } },
      resolve: 'conflict',
      binding: 'run',
      onError: 'nothing is called',
      version: 1,
      revision: 1,
      keys: 'private',
      conformance: null,
      summary: 'Things another member keeps on this tree.',
    }
    await root.plugin({
      name: 'wire',
      inject: ['dynamis'],
      apply(ctx) {
        ctx.dynamis.put([
          declare(data),
          {
            point: 'wire.things',
            key: 'one',
            id: '',
            scope: [],
            rank: 0,
            digest: 'one',
            item: { thing: {} },
          },
        ])
      },
    })
    expect(shell.items('attached')).toEqual([])
    expect(shell.conflicts('attached')).toEqual([])
  })

  it('renders nothing when no item has the anchor', async () => {
    const { shell } = await startShell()
    expect(shell.attached('test.a', 's1')).toEqual([])
  })
})

describe('the shell service arranged', () => {
  it('hands the layout each item of the anchor in the order of attached, with its id, label and node', async () => {
    const { root, shell } = await startShell()
    await root.plugin({
      name: 'a',
      inject: ['shell'],
      apply(ctx) {
        ctx.shell.contribute('attached', {
          id: 'late',
          order: 2,
          anchor: 'test.a',
          label: '晚',
          render: props => `late ${props.subject}`,
        })
        ctx.shell.contribute('attached', {
          id: 'other',
          order: 0,
          anchor: 'test.b',
          render: () => 'x',
        })
        ctx.shell.contribute('attached', {
          id: 'early',
          order: 1,
          anchor: 'test.a',
          render: props => `early ${props.subject}`,
        })
      },
    })
    const seen: unknown[] = []
    const result = shell.arranged('test.a', 's1', entries => {
      seen.push(entries)
      return 'laid out'
    })
    expect(result).toBe('laid out')
    expect(seen).toEqual([
      [
        { id: 'early', label: undefined, node: 'early s1' },
        { id: 'late', label: '晚', node: 'late s1' },
      ],
    ])
    expect(shell.attached('test.a', 's1')).toEqual(['early s1', 'late s1'])
  })

  it('hands the layout an empty list when no item has the anchor', async () => {
    const { shell } = await startShell()
    const seen: unknown[] = []
    shell.arranged('test.a', 's1', entries => {
      seen.push(entries)
      return null
    })
    expect(seen).toEqual([[]])
  })
})
