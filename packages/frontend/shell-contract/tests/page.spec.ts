import { describe, expect, it } from 'vitest'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { ReferenceShell, startShell } from './reference-shell.ts'

/** A shell that shows pages: the one on show is whatever the test puts in front. */
class PagedShell extends ReferenceShell {
  private shown: string | undefined = 'conversation'
  private readonly listeners = new Set<(page: string | undefined) => void>()

  show(page: string | undefined): void {
    this.shown = page
    for (const listener of this.listeners) listener(page)
  }

  override get page(): ShellService['page'] {
    return {
      get: () => this.shown,
      subscribe: listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
    }
  }
}

describe('the page on show (shell.page)', () => {
  it('a shell that shows no pages answers no page, and a subscription that never fires', async () => {
    const { shell } = await startShell()
    const seen: (string | undefined)[] = []
    const stop = shell.page.subscribe(page => seen.push(page))
    expect(shell.page.get()).toBeUndefined()
    stop()
    expect(seen).toEqual([])
  })

  it('a UI module reads the page on show through the service and follows it, without a way to change it', async () => {
    const { Context } = await import('@deepseek-ai/cordis')
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(PagedShell)
    const host = root.shell as unknown as PagedShell
    const seen: (string | undefined)[] = []
    let read: string | undefined = 'none'
    await root.plugin(
      defineUiModule({
        name: 'reader-ui',
        inject: [],
        apply(shell) {
          read = shell.page.get()
          shell.page.subscribe(page => seen.push(page))
          expect(Object.keys(shell.page).sort()).toEqual(['get', 'subscribe'])
        },
      }),
    )
    expect(read).toBe('conversation')
    host.show('history-search')
    host.show(undefined)
    expect(seen).toEqual(['history-search', undefined])
  })
})
