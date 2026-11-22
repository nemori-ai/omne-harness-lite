import { describe, expect, it } from 'vitest'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { render, startShell } from './reference-shell.ts'

describe('a UI module provides a service on the client tree', () => {
  it('a module that provides nothing is written as before, with two parameters', async () => {
    const { root, shell } = await startShell()
    await root.plugin(
      defineUiModule({
        name: 'plain',
        needs: {},
        apply(shell) {
          shell.contribute('pages', {
            id: 'plain',
            title: 'plain',
            order: 0,
            icon: 'topics',
            render,
          })
        },
      }),
    )
    expect(shell.items('pages').map(item => item.id)).toEqual(['plain'])
  })
})
