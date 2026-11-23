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

  it('a module that throws while it starts is named, puts nothing, and leaves the others up', async () => {
    const { root, shell } = await startShell()
    const warned: string[] = []
    root.logger.warn = (text: string) => void warned.push(text)
    let told = 0
    shell.watchAdoptions(() => {
      told += 1
    })
    const broken = defineUiModule({
      name: 'broken-ui',
      needs: {},
      apply(inner) {
        inner.contribute('pages', { id: 'half', title: 'half', order: 1, icon: 'topics', render })
        throw new Error('this module is broken on purpose')
      },
    })
    expect(shell.fallen()).toEqual([])
    const fiber = root.plugin(broken)
    await fiber
    await root.plugin(notesUi)
    for (let round = 0; round < 4; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
    expect(shell.fallen()).toEqual(['broken-ui'])
    expect(shell.items('pages').map(item => item.id)).toEqual(['notes'])
    expect(warned).toContain('shell: the module broken-ui threw while it started')
    expect(told).toBeGreaterThan(0)
    await fiber.dispose()
    for (let round = 0; round < 4; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
    expect(shell.fallen()).toEqual([])
  })

  it('a module that starts is not named', async () => {
    const { root, shell } = await startShell()
    await root.plugin(notesUi)
    expect(shell.fallen()).toEqual([])
  })
})
