import { describe, expect, it } from 'vitest'
import { ReferenceShell, render, startShellOf } from '@omne-harness/shell-contract/testing'

/** A shell whose navigate is the contract's and whose face is the contract's own: what it did is written down in order. */
class TurningShell extends ReferenceShell {
  on: 'front' | 'back' = 'front'
  readonly did: string[] = []

  protected override turn(): void {
    this.on = this.on === 'front' ? 'back' : 'front'
    this.did.push(`turned to the ${this.on}`)
  }

  override navigate(pageId: string, subject?: string): void {
    this.bringUp(pageId, subject, (id, about) =>
      this.did.push(about === undefined ? `showed ${id}` : `showed ${id} on ${about}`),
    )
  }
}

/** The same shell, telling which face is on show. */
class FacedShell extends TurningShell {
  protected override face(): 'front' | 'back' {
    return this.on
  }
}

async function withPages<S extends TurningShell>(shell: typeof TurningShell): Promise<S> {
  const started = await startShellOf(shell)
  await started.root.plugin({
    name: 'pages',
    inject: ['shell'],
    apply: ctx => {
      ctx.shell.contribute('pages', { id: 'chat', title: 'chat', order: 0, icon: 'topics', render })
      ctx.shell.contribute('pages', {
        id: 'notes',
        title: 'notes',
        order: 1,
        icon: 'topics',
        render,
      })
    },
  })
  return started.shell as S
}

describe('navigate and the two faces', () => {
  it('on the back, turns to the front first and then brings the page up', async () => {
    const shell = await withPages<FacedShell>(FacedShell)
    shell.on = 'back'
    shell.navigate('notes', 'n-1')
    expect(shell.did).toEqual(['turned to the front', 'showed notes on n-1'])
    expect(shell.on).toBe('front')
  })

  it('on the front, brings the page up without turning', async () => {
    const shell = await withPages<FacedShell>(FacedShell)
    shell.navigate('chat')
    expect(shell.did).toEqual(['showed chat'])
    expect(shell.on).toBe('front')
  })

  it('for a page that is not there, does nothing and does not turn', async () => {
    const shell = await withPages<FacedShell>(FacedShell)
    shell.on = 'back'
    shell.navigate('gone')
    expect(shell.did).toEqual([])
    expect(shell.on).toBe('back')
  })

  it('on a shell that does not tell its face, the front is on show and navigate never turns', async () => {
    const shell = await withPages<TurningShell>(TurningShell)
    shell.on = 'back'
    shell.navigate('notes')
    expect(shell.did).toEqual(['showed notes'])
  })
})
