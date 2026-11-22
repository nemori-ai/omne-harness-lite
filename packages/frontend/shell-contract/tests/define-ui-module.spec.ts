import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, render, startShell } from './reference-shell.ts'

const notesUi = defineUiModule({
  name: 'notes-ui',
  needs: {},
  apply(shell) {
    shell.contribute('pages', { id: 'notes', title: 'notes', order: 0, icon: 'topics', render })
  },
})

describe('defineUiModule', () => {
  it('does not load without the shell', async () => {
    const root = new Context()
    let applied = false
    await root.plugin(
      defineUiModule({
        name: 'x',
        needs: {},
        apply() {
          applied = true
        },
      }),
    )
    expect(applied).toBe(false)
  })

  it('unloads with the shell, and loads again when a shell returns', async () => {
    const { root, shell, host } = await startShell()
    await root.plugin(notesUi)
    expect(shell.items('pages')).toHaveLength(1)
    await host.dispose()
    expect(shell.items('pages')).toEqual([])
    await root.plugin(ReferenceShell)
    for (let round = 0; round < 8; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
    const next = root.shell as unknown as ReferenceShell
    expect(next.items('pages').map(item => item.id)).toEqual(['notes'])
  })
})
