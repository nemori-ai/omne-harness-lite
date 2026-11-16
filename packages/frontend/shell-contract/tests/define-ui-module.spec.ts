import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, render, startShell } from './reference-shell.ts'

class Notes extends Service {
  readonly label = 'notes'
  constructor(ctx: Context) {
    super(ctx, 'notes')
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notes: Notes
  }
}

const notesUi = defineUiModule<{ notes: Notes }>({
  name: 'notes-ui',
  inject: ['notes'],
  apply(shell, { notes }) {
    shell.contribute('pages', { id: 'notes', title: notes.label, order: 0, render })
  },
})

describe('defineUiModule', () => {
  it('loads when the service it needs appears and unloads, with what it placed, when it goes', async () => {
    const { root, shell } = await startShell()
    await root.plugin(notesUi)
    expect(shell.items('pages')).toEqual([])
    const provider = root.plugin(Notes)
    await provider
    expect(shell.items('pages').map(item => item.title)).toEqual(['notes'])
    await provider.dispose()
    expect(shell.items('pages')).toEqual([])
    await root.plugin(Notes)
    expect(shell.items('pages').map(item => item.id)).toEqual(['notes'])
  })

  it('does not load without the shell', async () => {
    const root = new Context()
    await root.plugin(Notes)
    let applied = false
    await root.plugin(
      defineUiModule({
        name: 'x',
        inject: [],
        apply() {
          applied = true
        },
      }),
    )
    expect(applied).toBe(false)
  })

  it('unloads with the shell, and loads again when a shell returns', async () => {
    const { root, shell, host } = await startShell()
    await root.plugin(Notes)
    await root.plugin(notesUi)
    expect(shell.items('pages')).toHaveLength(1)
    await host.dispose()
    expect(shell.items('pages')).toEqual([])
    await root.plugin(ReferenceShell)
    const next = root.shell as unknown as ReferenceShell
    expect(next.items('pages').map(item => item.id)).toEqual(['notes'])
  })

  it('reaches services that are provided by name', async () => {
    const { root } = await startShell()
    let seen: unknown
    root.reflect.provide('protocol:x/v1', 'client')
    await root.plugin(
      defineUiModule({
        name: 'reads',
        inject: ['protocol:x/v1'],
        apply(_shell, services) {
          seen = services['protocol:x/v1']
        },
      }),
    )
    expect(seen).toBe('client')
  })
})
