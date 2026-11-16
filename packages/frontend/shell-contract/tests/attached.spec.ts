import { describe, expect, it } from 'vitest'
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
        ctx.shell.contribute('attached', item('late', 'a', 2))
        ctx.shell.contribute('attached', item('other', 'b', 0))
        ctx.shell.contribute('attached', item('early', 'a', 1))
      },
    })
    expect(shell.attached('a', 's1')).toEqual(['early', 'late'])
    expect(received).toEqual({
      early: { scope: undefined, subject: 's1' },
      late: { scope: undefined, subject: 's1' },
    })
  })

  it('renders nothing when no item has the anchor', async () => {
    const { shell } = await startShell()
    expect(shell.attached('a', 's1')).toEqual([])
  })
})
